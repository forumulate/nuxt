/**
 * @forumulate/nuxt/server — a content library in a Nuxt app's server routes:
 * draft-aware reads, the revalidate receiver and the preview routes.
 *
 *   // server/utils/cms.ts
 *   export const cms = createContent({ library: 'lib_…', key: process.env.FORUMULATE_KEY! });
 *   // server/api/page/[...path].get.ts
 *   export default defineEventHandler((event) => cms.from(event).resolveRoute(`/${getRouterParam(event, 'path') ?? ''}`));
 *   // server/api/revalidate.post.ts
 *   export default defineEventHandler(createRevalidateHandler({ secret: process.env.FORUMULATE_WEBHOOK_SECRET! }));
 *   // server/api/preview.post.ts
 *   export default defineEventHandler(createPreviewRoute({ library: 'lib_…' }));
 *   // server/api/exit-preview.post.ts
 *   export default defineEventHandler(createExitPreviewRoute());
 *
 * The handlers return a web `Response`, which h3 sends as-is. This file does
 * not import h3: Nuxt 3 runs h3 v1 (a Node `req` on `event.node`) and h3 v2
 * hands a web `Request` on `event.req`, and depending on either would pin the
 * module to one of them. `toWebRequest` reads whichever the event has.
 *
 * Nitro has no tag-aware data cache, so published answers are held in the
 * shared in-process `TagCache` from @forumulate/embed and the receiver drops
 * the tags a publish names. The rules (signature, relative paths, cookie
 * attributes) are in `@forumulate/embed/content/server`.
 */
import {
  createServerContent,
  defaultTagCache,
  handleExitPreview,
  handlePreview,
  handleRevalidate,
  type PreviewRouteOptions,
  type RevalidateOptions,
  type RevalidateResult,
  type ServerContent,
  type ServerContentOptions,
  type TagCache,
} from '@forumulate/embed/content/server';
import type { ContentClient } from '@forumulate/embed/content';

interface NodeRequestLike extends AsyncIterable<unknown> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** The parts of an h3 event (v1 or v2) these helpers read. */
export interface H3EventLike {
  /** h3 v2: the web request itself. */
  req?: Request | unknown;
  /** h3 v1 with a web adapter. */
  web?: { request?: Request };
  /** h3 v1 on Node. */
  node?: { req: NodeRequestLike };
}

function nodeHeaders(raw: NodeRequestLike['headers']): Headers {
  const headers = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) for (const one of v) headers.append(k, one);
    else if (v !== undefined) headers.set(k, v);
  }
  return headers;
}

/** The event's request as a web `Request`. The body is read only for methods that carry one. */
export async function toWebRequest(event: H3EventLike): Promise<Request> {
  if (event.req instanceof Request) return event.req;
  if (event.web?.request) return event.web.request;
  const req = event.node?.req;
  if (!req) throw new Error('[forumulate] not an h3 event: no web request and no Node request');
  const headers = nodeHeaders(req.headers);
  const method = (req.method ?? 'GET').toUpperCase();
  // The URL only feeds query parsing (`?path=` on exit), so the host need not
  // be trusted; it only has to make the URL parse.
  const url = new URL(req.url ?? '/', `http://${headers.get('host') ?? 'localhost'}`);
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : (chunk as Uint8Array));
    body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) {
      body.set(c, at);
      at += c.length;
    }
  }
  return new Request(url, { method, headers, body });
}

/** The event's `Cookie` header, without reading its body. */
export function cookieHeader(event: H3EventLike): string | null {
  if (event.req instanceof Request) return event.req.headers.get('cookie');
  if (event.web?.request) return event.web.request.headers.get('cookie');
  const raw = event.node?.req.headers.cookie;
  return Array.isArray(raw) ? raw.join('; ') : (raw ?? null);
}

export interface NuxtContent extends ServerContent {
  /** The client for this request: drafts when it carries a preview cookie. */
  from(event: H3EventLike): ContentClient;
}

export function createContent(opts: ServerContentOptions): NuxtContent {
  const content = createServerContent(opts);
  return { ...content, from: (event) => content.forRequest(cookieHeader(event)) };
}

export interface NuxtRevalidateOptions extends RevalidateOptions {
  /** The cache to invalidate. Default: the shared one `createContent` uses. */
  cache?: TagCache;
  /** Called after the cache is invalidated — purge a CDN by `Cache-Tag`, clear Nitro storage, fan out. */
  onRevalidate?: (result: RevalidateResult) => void | Promise<void>;
}

type Handler = (event: H3EventLike) => Promise<Response>;

/** An event handler that verifies a `content.*` webhook and drops its tags from the cache. */
export function createRevalidateHandler(opts: NuxtRevalidateOptions): Handler {
  if (!opts?.secret) throw new Error('[forumulate] createRevalidateHandler needs a `secret`');
  const { cache = defaultTagCache, onRevalidate, ...verify } = opts;
  return async (event) =>
    handleRevalidate(await toWebRequest(event), {
      ...verify,
      async revalidate(result) {
        cache.invalidate(result.tags);
        await onRevalidate?.(result);
      },
    });
}

/** The handler the studio's Preview button POSTs to (token → httpOnly cookie → redirect). */
export function createPreviewRoute(opts: PreviewRouteOptions = {}): Handler {
  return async (event) => handlePreview(await toWebRequest(event), opts);
}

/** Leaves preview (POST, from a form button): clears the cookie, redirects to the posted `path` (relative) or `/`. */
export function createExitPreviewRoute(opts: { cookieName?: string } = {}): Handler {
  return async (event) => handleExitPreview(await toWebRequest(event), opts);
}

export {
  ForumulateError,
  contentTags,
  createContentClient,
  imageSrcSet,
  imageUrl,
  stegaClean,
  type ContentClient,
  type Entry,
  type EntryList,
  type ListOptions,
  type Media,
  type PageInfo,
  type ReadOptions,
  type RouteResolution,
  type Where,
} from '@forumulate/embed/content';
export { createTagCache, defaultTagCache, safeRelativePath, type TagCache } from '@forumulate/embed/content/server';

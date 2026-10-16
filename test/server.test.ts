import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createContent,
  createExitPreviewRoute,
  createPreviewRoute,
  createRevalidateHandler,
  createTagCache,
} from '../src/server.js';

/** An h3 v2 event: the web request on `event.req`. (v1 Node events: see node-event.test.ts.) */
const ctx = (req: Request) => ({ req });
const calls: { url: string; init: RequestInit }[] = [];
let title = 'v1';
const fetchMock = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input);
  calls.push({ url, init });
  if (url.includes('/preview/exchange')) return Response.json({ credential: 'pcred' });
  return Response.json(
    { data: [{ id: 'e1', type: 'post', fields: { title } }], page: { limit: 10, hasMore: false, nextCursor: null } },
    { headers: { 'cache-tag': 'fm:type:lib_1:post' } },
  );
}) as typeof fetch;

const secret = 'whsec_adapter';
function signed(payload: unknown, ts = Math.floor(Date.now() / 1000), key = secret) {
  const body = JSON.stringify(payload);
  const sig = `v1,sha256=${createHmac('sha256', key).update(`${ts}.${body}`).digest('hex')}`;
  return new Request('https://site.example/api/revalidate', {
    method: 'POST',
    headers: { 'x-forumulate-signature': sig, 'x-forumulate-timestamp': String(ts) },
    body,
  });
}
const publish = { event: 'content.entry.published', data: { tags: ['fm:type:lib_1:post'], affectedTags: [] } };
const page = (cookie?: string) => new Request('https://site.example/blog', { headers: cookie ? { cookie } : {} });

beforeEach(() => {
  calls.length = 0;
  title = 'v1';
});

describe('createContent', () => {
  it('reads published content with the delivery key, drafts with the preview cookie', async () => {
    const cms = createContent({ library: 'lib_1', key: 'cfd_live', fetch: fetchMock, cache: false });
    await cms.from(ctx(page())).getEntries('post');
    await cms.from(ctx(page('fm_preview=pcred'))).getEntries('post');
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe('Bearer cfd_live');
    expect(new URL(calls[0]!.url).searchParams.has('draft')).toBe(false);
    expect(new Headers(calls[1]!.init.headers).get('authorization')).toBe('Bearer pcred');
    expect(new URL(calls[1]!.url).searchParams.get('draft')).toBe('true');
  });
});

describe('createRevalidateHandler', () => {
  it('needs a secret', () => {
    expect(() => createRevalidateHandler({ secret: '' })).toThrow(/secret/);
  });

  it('drops the published tags on a good signature, and only then', async () => {
    const cache = createTagCache();
    const cms = createContent({ library: 'lib_1', key: 'k', fetch: fetchMock, cache });
    const onRevalidate = vi.fn();
    const handler = createRevalidateHandler({ secret, cache, onRevalidate });
    await cms.published.getEntries('post');
    title = 'v2';

    expect((await handler(ctx(signed(publish, undefined, 'wrong')))).status).toBe(401);
    expect((await handler(ctx(signed(publish, Math.floor(Date.now() / 1000) - 900)))).status).toBe(401);
    expect((await cms.published.getEntries('post')).data[0]!.fields.title).toBe('v1');
    expect(onRevalidate).not.toHaveBeenCalled();

    const ok = await handler(ctx(signed(publish)));
    expect(ok.status).toBe(200);
    expect(onRevalidate).toHaveBeenCalledOnce();
    expect((await cms.published.getEntries('post')).data[0]!.fields.title).toBe('v2');
  });
});

describe('preview routes', () => {
  const post = (fields: Record<string, string>) =>
    new Request('https://site.example/api/preview', { method: 'POST', body: new URLSearchParams(fields) });

  it('sets the partitioned httpOnly cookie and redirects to the relative path', async () => {
    const res = await createPreviewRoute({ fetch: fetchMock })(ctx(post({ token: 't', path: '/pricing' })));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/pricing');
    expect(res.headers.get('set-cookie')).toBe('fm_preview=pcred; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=None; Partitioned');
  });

  it.each(['https://evil.com', '//evil.com', '/\\evil.com'])('refuses the open redirect %s', async (path) => {
    const res = await createPreviewRoute({ fetch: fetchMock })(ctx(post({ token: 't', path })));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('exit clears the partitioned cookie, POST only, relative paths only', async () => {
    const res = await createExitPreviewRoute()(ctx(post({ path: '/blog' })));
    expect(res.headers.get('location')).toBe('/blog');
    expect(res.headers.get('set-cookie')).toMatch(/^fm_preview=; Path=\/; Max-Age=0;.*HttpOnly; Secure; SameSite=None; Partitioned$/);
    expect((await createExitPreviewRoute()(ctx(post({ path: '//evil.com' })))).status).toBe(400);
    expect((await createExitPreviewRoute()(ctx(new Request('https://site.example/api/exit?path=/blog')))).status).toBe(405);
  });
});

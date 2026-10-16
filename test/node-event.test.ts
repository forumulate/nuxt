import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cookieHeader, createContent, createRevalidateHandler, createTagCache, toWebRequest } from '../src/server.js';

/** An h3 v1 event on Node: an IncomingMessage-like `req` that streams its body. */
function nodeEvent(o: { method?: string; url?: string; headers?: Record<string, string | string[]>; body?: string }) {
  const chunks = o.body ? [Buffer.from(o.body.slice(0, 5)), o.body.slice(5)] : [];
  return {
    node: {
      req: {
        method: o.method ?? 'GET',
        url: o.url ?? '/',
        headers: { host: 'site.example', ...o.headers },
        async *[Symbol.asyncIterator]() {
          yield* chunks;
        },
      },
    },
  };
}

describe('h3 v1 (Node) events', () => {
  it('turn into a web Request with headers, query and body', async () => {
    const req = await toWebRequest(
      nodeEvent({ method: 'POST', url: '/api/x?path=/a', headers: { 'x-multi': ['1', '2'] }, body: 'hello world' }),
    );
    expect(req.method).toBe('POST');
    expect(new URL(req.url).searchParams.get('path')).toBe('/a');
    expect(req.headers.get('x-multi')).toBe('1, 2');
    expect(await req.text()).toBe('hello world');
  });

  it('expose the cookie without reading the body', () => {
    expect(cookieHeader(nodeEvent({ headers: { cookie: 'fm_preview=c' } }))).toBe('fm_preview=c');
    expect(cookieHeader({ web: { request: new Request('https://x', { headers: { cookie: 'a=1' } }) } })).toBe('a=1');
  });

  it('refuse a non-event', async () => {
    await expect(toWebRequest({})).rejects.toThrow(/h3 event/);
  });

  it('drive the draft switch and a signed revalidate end to end', async () => {
    const seen: string[] = [];
    const fetchMock = (async (_: RequestInfo | URL, init: RequestInit = {}) => {
      seen.push(new Headers(init.headers).get('authorization') ?? '');
      return Response.json({ id: 'e', type: 'post', fields: {} });
    }) as typeof fetch;
    const cms = createContent({ library: 'lib', key: 'cfd', fetch: fetchMock, cache: false });
    await cms.from(nodeEvent({ headers: { cookie: 'fm_preview=pc' } })).getEntry('post', 'a');
    expect(seen).toEqual(['Bearer pc']);

    const secret = 's3cret';
    const body = JSON.stringify({ event: 'content.entry.published', data: { tags: ['fm:type:sp:post'] } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = `v1,sha256=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
    const res = await createRevalidateHandler({ secret, cache: createTagCache() })(
      nodeEvent({ method: 'POST', headers: { 'x-forumulate-signature': sig, 'x-forumulate-timestamp': String(ts) }, body }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).tags).toEqual(['fm:type:sp:post']);
  });
});

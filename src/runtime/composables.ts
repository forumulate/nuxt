import { useAsyncData, useRuntimeConfig } from '#imports';
import { createClient, type ClientOptions, type ForumulateClient } from '@forumulate/embed';

/**
 * SSR-friendly content: runs on the server during render, is serialized into
 * the payload, and is not fetched again on hydration.
 *
 *   const { data: post } = await useForumulateAsync('post:hello', (c) => c.getPost('hello'))
 */
export function useForumulateAsync<T>(
  key: string,
  load: (client: ForumulateClient) => Promise<T>,
  opts: Partial<ClientOptions> = {},
) {
  const config = (useRuntimeConfig().public.forumulate ?? {}) as Partial<ClientOptions>;
  const client = createClient({
    ...config,
    ...opts,
    org: opts.org ?? config.org ?? '',
    space: opts.space ?? config.space ?? '',
  });
  return useAsyncData<T>(`forumulate:${client.org}:${client.space}:${key}`, () => load(client));
}

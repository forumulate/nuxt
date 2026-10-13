# @forumulate/nuxt

The Forumulate module for Nuxt 3 and 4: the
[`@forumulate/vue`](https://www.npmjs.com/package/@forumulate/vue) components
registered globally, its composables auto-imported, and `useForumulateAsync`
for content fetched during SSR.

## Install

```sh
npm install @forumulate/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@forumulate/nuxt'],
  forumulate: { org: 'acme', space: 'blog', theme: 'auto' },
});
```

Every option is public runtime config, so it can be overridden per
environment: `NUXT_PUBLIC_FORUMULATE_ORG`, `NUXT_PUBLIC_FORUMULATE_SPACE`,
`NUXT_PUBLIC_FORUMULATE_API_BASE`.

## Components

No imports needed:

```vue
<template>
  <article>…</article>
  <ForumulateComments />
  <ForumulateChangelog space="changelog" />
</template>
```

`ForumulateComments`, `ForumulateWidget`, `ForumulateSearch`,
`ForumulateChangelog`, `ForumulateFeed` — see the @forumulate/vue README for
their props. Set `components: false` to skip global registration.

## Content (SSR)

```vue
<script setup lang="ts">
const route = useRoute();
const { data: post } = await useForumulateAsync(`post:${route.params.slug}`, (c) =>
  c.getPost(String(route.params.slug)),
);
const { data: markdown } = await useForumulateAsync('post-md', (c) => c.getPostMarkdown('hello'));
</script>

<template>
  <h1>{{ post?.title }}</h1>
</template>
```

`useForumulateAsync(key, (client) => …)` runs on the server, rides the
payload, and is not fetched again on hydration. The client-side composables
are auto-imported with a `Forumulate` prefix: `useForumulatePage`,
`useForumulatePosts`, `useForumulateTopics`, `useForumulateSearch`, ….

## License

MIT

---

## About this repository

This repository is a public mirror, refreshed on each Forumulate release
(one commit per release). Pull requests are welcome; accepted changes are
applied upstream and arrive here with the next release.

- API reference: https://forumulate.com/reference
- Guides: https://forumulate.com/guides
- Community and support: https://forumulate.com/community
- Source: https://github.com/forumulate/nuxt

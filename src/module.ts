/**
 * `modules: ['@forumulate/nuxt']` + `forumulate: { org, space }` in
 * nuxt.config, and every page can use `<ForumulateComments />` and the content
 * composables with no imports.
 *
 * The components and client-side composables are @forumulate/vue's — this
 * module only wires them into Nuxt: config into public runtime config (so it is
 * overridable per environment with NUXT_PUBLIC_FORUMULATE_ORG, ...), a plugin
 * that provides it to the Vue app, global components, auto-imports, and
 * `useForumulateAsync` for SSR data through `useAsyncData`.
 */
import { addComponent, addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { Theme } from '@forumulate/embed';

export interface ModuleOptions {
  /** Organization id or slug. */
  org?: string;
  /** Default space id or slug. */
  space?: string;
  /** API origin including `/api`. Default `https://forumulate.com/api`. */
  apiBase?: string;
  theme?: Theme;
  locale?: string;
  accent?: string;
  /** Register the components globally. Default true. */
  components?: boolean;
}

const COMPONENTS = [
  'ForumulateComments',
  'ForumulateWidget',
  'ForumulateSearch',
  'ForumulateChangelog',
  'ForumulateFeed',
];

/** @forumulate/vue composables, auto-imported under unambiguous names. */
const VUE_COMPOSABLES: [string, string][] = [
  ['useForumulateClient', 'useForumulateClient'],
  ['usePage', 'useForumulatePage'],
  ['usePages', 'useForumulatePages'],
  ['usePosts', 'useForumulatePosts'],
  ['usePost', 'useForumulatePost'],
  ['useTopics', 'useForumulateTopics'],
  ['useTopic', 'useForumulateTopic'],
  ['useReleases', 'useForumulateReleases'],
  ['useSearch', 'useForumulateSearch'],
];

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@forumulate/nuxt',
    configKey: 'forumulate',
    compatibility: { nuxt: '>=3.13.0' },
  },
  defaults: {
    components: true,
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);
    const { components, ...config } = options;
    const pub = nuxt.options.runtimeConfig.public as Record<string, unknown>;
    pub.forumulate = { ...config, ...((pub.forumulate as object | undefined) ?? {}) };

    // The runtime files import `#imports`, which only exists inside the app
    // build — so Nuxt has to transpile them rather than treat them as a dep.
    const runtime = resolve('./runtime');
    nuxt.options.build.transpile.push(runtime);
    addPlugin(resolve('./runtime/plugin'));

    if (components !== false) {
      for (const name of COMPONENTS) {
        addComponent({ name, export: name, filePath: '@forumulate/vue' });
      }
    }
    addImports([
      ...VUE_COMPOSABLES.map(([name, as]) => ({ name, as, from: '@forumulate/vue' })),
      { name: 'useForumulateAsync', from: resolve('./runtime/composables') },
    ]);
  },
});

import { defineNuxtPlugin, useRuntimeConfig } from '#imports';
import { ForumulatePlugin, type ForumulateDefaults } from '@forumulate/vue';

/** Provides the module's config to every Forumulate component and composable. */
export default defineNuxtPlugin((nuxtApp) => {
  const config = (useRuntimeConfig().public.forumulate ?? {}) as ForumulateDefaults;
  nuxtApp.vueApp.use(ForumulatePlugin, config);
});

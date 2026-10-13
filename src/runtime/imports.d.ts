/**
 * The slice of Nuxt's virtual `#imports` the runtime files use. Only for this
 * package's own typecheck — inside an app, Nuxt generates the real module and
 * its types, and these declarations are not shipped.
 */
declare module '#imports' {
  import type { App } from 'vue';
  import type { Ref } from 'vue';

  interface NuxtAppLike {
    vueApp: App;
  }
  export function defineNuxtPlugin(setup: (nuxtApp: NuxtAppLike) => void | Promise<void>): unknown;
  export function useRuntimeConfig(): { public: Record<string, unknown> };
  export function useAsyncData<T>(
    key: string,
    handler: () => Promise<T>,
  ): Promise<{ data: Ref<T | null>; error: Ref<unknown>; pending: Ref<boolean>; refresh: () => Promise<void> }>;
}

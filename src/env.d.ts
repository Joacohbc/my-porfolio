/// <reference path="../.astro/types.d.ts" />
interface ImportMetaEnv {
    readonly TURNSTILE_SITE_KEY: string;
    readonly TURNSTILE_SECRET_TOKEN: string;
    readonly TURNSTILE_VISIBLE_SECRET_TOKEN: string;
    readonly TURNSTILE_VISIBLE_SITE_KEY: string;
    readonly EMAIL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
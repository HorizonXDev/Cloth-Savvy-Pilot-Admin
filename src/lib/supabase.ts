// lib/supabase.ts — browser Supabase Auth client for the admin console.
//
// SECURITY MODEL: the anon key is PUBLIC BY DESIGN (the pilot schema grants
// `anon` zero table privileges), so this client can do nothing but
// authenticate against GoTrue. It NEVER queries tables — every admin read and
// write goes through the admin_* Edge Functions, which verify this session's
// JWT against the server-side admin_users allow-list.
//
// Persistence is sessionStorage, not localStorage: closing the tab ends the
// browser copy of the refresh token. The server-side allow-list is what
// actually grants access, so losing the token is an inconvenience, never a
// security boundary.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54421";
const SUPABASE_ANON_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** sessionStorage adapter with the shape supabase-js expects. */
const sessionStore = {
    getItem: (key: string): string | null =>
        typeof window === "undefined" ? null : window.sessionStorage.getItem(key),
    setItem: (key: string, value: string): void => {
        if (typeof window !== "undefined") window.sessionStorage.setItem(key, value);
    },
    removeItem: (key: string): void => {
        if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
    },
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
    if (!client) {
        if (!SUPABASE_ANON_KEY) {
            throw new Error(
                "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — copy .env.example to .env.local",
            );
        }
        client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false,
                storage: sessionStore,
            },
        });
    }
    return client;
}

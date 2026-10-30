// lib/api.ts — the single HTTP client for the admin functions.
//
// Auth: a Supabase Auth session (email + password) obtained on the login
// screen. Every call attaches its access token as a bearer; the server
// verifies the JWT and checks the admin_users allow-list, so a token from a
// non-admin account is refused with 403. The session lives in sessionStorage
// only (see lib/supabase.ts). Errors come back in the pilot envelope
// {error:{code,message,request_id}} and are surfaced as ApiError so pages
// can show a precise, honest message.
//
// Every call is also written to the live log (lib/log.ts): request line with
// body size, response line with status + duration + request id, or a
// classified network failure — so the floating console always shows what the
// app is doing and exactly where a call died.

import { formatBytes, formatMs, log } from "@/lib/log";
import { supabase } from "@/lib/supabase";

const FUNCTIONS_URL: string =
    process.env.NEXT_PUBLIC_FUNCTIONS_URL ?? "http://127.0.0.1:54431/functions/v1";

export function functionsUrl(): string {
    return FUNCTIONS_URL.replace(/\/+$/, "");
}

/** Current access token, or null when there is no session. Refreshes it
 * automatically (supabase-js) when it is close to expiry. */
export async function getToken(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    try {
        const { data, error } = await supabase().auth.getSession();
        if (error || !data.session) return null;
        return data.session.access_token;
    } catch (e) {
        log("auth", `session lookup failed: ${e instanceof Error ? e.message : "unknown"}`, "warn");
        return null;
    }
}

export async function hasSession(): Promise<boolean> {
    return (await getToken()) !== null;
}

export async function clearToken(): Promise<void> {
    try {
        await supabase().auth.signOut();
        log("auth", "signed out — Supabase session cleared");
    } catch (e) {
        log("auth", `sign-out failed: ${e instanceof Error ? e.message : "unknown"}`, "warn");
    }
}

export class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly requestId: string | null;

    constructor(status: number, code: string, message: string, requestId: string | null) {
        super(message);
        this.status = status;
        this.code = code;
        this.requestId = requestId;
    }
}

interface AdminFetchOpts {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
}

/** Map a request path to a human stage tag so the log reads like a story
 * (export → merge → search) instead of a list of URLs. */
function stageOf(path: string): string {
    const q = path.indexOf("?");
    if (q >= 0) {
        const op = new URLSearchParams(path.slice(q + 1)).get("op");
        if (op === "embeddings_merge") return "merge";
        if (op === "embed_export") return "export";
        if (op) return op;
    }
    const seg = path.replace(/^\//, "").split("/")[0];
    return seg || "net";
}

/** Call an admin function path (e.g. "/admin_tenants?..."). Returns parsed
 * JSON or throws ApiError (any non-2xx, including network failures). */
export async function adminFetch<T = Record<string, unknown>>(
    path: string,
    opts: AdminFetchOpts = {},
): Promise<T> {
    const stage = stageOf(path);
    const method = opts.method ?? "GET";
    const token = await getToken();
    if (!token) {
        log("auth", "no admin session — sign in first", "warn");
        throw new ApiError(401, "no_token", "not signed in — sign in with your admin account", null);
    }
    const bodyText = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const size = bodyText === undefined ? "" : ` ${formatBytes(bodyText.length)}`;
    const t0 = performance.now();
    log(stage, `→ ${method} ${path}${size}`);
    let res: Response;
    try {
        res = await fetch(`${functionsUrl()}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(bodyText !== undefined ? { "Content-Type": "application/json" } : {}),
                ...opts.headers,
            },
            body: bodyText,
        });
    } catch (e) {
        const took = formatMs(performance.now() - t0);
        const why = e instanceof Error ? e.message : "network error";
        log(
            stage,
            `✗ ${method} ${path} — no response after ${took} (${why}). ` +
                `The request never completed: functions URL unreachable, ` +
                `ORIGIN not in the CORS allowlist, or the function died before replying. ` +
                `Check Supabase → Logs → Edge Functions for this moment.`,
            "error",
        );
        throw new ApiError(0, "network", `cannot reach ${functionsUrl()} (${why})`, null);
    }
    const elapsed = performance.now() - t0;
    const text = await res.text();
    let parsed: unknown = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = null;
    }
    if (!res.ok) {
        const env = (parsed as { error?: { code?: string; message?: string; request_id?: string } } | null)?.error;
        const reqId = env?.request_id ?? res.headers.get("X-Request-Id");
        log(
            stage,
            `← HTTP ${res.status} after ${formatMs(elapsed)} — ${env?.message ?? "request failed"}` +
                (env?.code ? ` [${env.code}]` : "") +
                (reqId ? ` (request ${reqId.slice(0, 8)})` : ""),
            "error",
        );
        throw new ApiError(
            res.status,
            env?.code ?? `http_${res.status}`,
            env?.message ?? `request failed with HTTP ${res.status}`,
            reqId,
        );
    }
    const rid = (parsed as { request_id?: string } | null)?.request_id;
    log(
        stage,
        `← ${res.status} after ${formatMs(elapsed)}${rid ? ` (request ${rid.slice(0, 8)})` : ""}`,
        "ok",
    );
    return parsed as T;
}

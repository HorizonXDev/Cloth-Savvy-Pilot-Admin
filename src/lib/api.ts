// lib/api.ts — the single HTTP client for the admin functions.
//
// Auth: the ADMIN_TOKEN entered on the login screen lives ONLY in
// localStorage (never in env, never on the server). Every call attaches it
// as a bearer token. Errors come back in the pilot envelope
// {error:{code,message,request_id}} and are surfaced as ApiError so pages
// can show a precise, honest message.

const FUNCTIONS_URL: string =
    process.env.NEXT_PUBLIC_FUNCTIONS_URL ?? "http://127.0.0.1:54431/functions/v1";

const TOKEN_KEY = "pilot_admin_token";

export function functionsUrl(): string {
    return FUNCTIONS_URL.replace(/\/+$/, "");
}

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
    window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
    window.localStorage.removeItem(TOKEN_KEY);
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
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    headers?: Record<string, string>;
}

/** Call an admin function path (e.g. "/admin_tenants?..."). Returns parsed
 * JSON or throws ApiError (any non-2xx, including network failures). */
export async function adminFetch<T = Record<string, unknown>>(
    path: string,
    opts: AdminFetchOpts = {},
): Promise<T> {
    const token = getToken();
    if (!token) {
        throw new ApiError(401, "no_token", "not signed in — enter the admin token", null);
    }
    let res: Response;
    try {
        res = await fetch(`${functionsUrl()}${path}`, {
            method: opts.method ?? "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
                ...opts.headers,
            },
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
    } catch (e) {
        throw new ApiError(
            0,
            "network",
            `cannot reach ${functionsUrl()} (${e instanceof Error ? e.message : "network error"})`,
            null,
        );
    }
    const text = await res.text();
    let parsed: unknown = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = null;
    }
    if (!res.ok) {
        const env = (parsed as { error?: { code?: string; message?: string; request_id?: string } } | null)?.error;
        throw new ApiError(
            res.status,
            env?.code ?? `http_${res.status}`,
            env?.message ?? `request failed with HTTP ${res.status}`,
            env?.request_id ?? res.headers.get("X-Request-Id"),
        );
    }
    return parsed as T;
}

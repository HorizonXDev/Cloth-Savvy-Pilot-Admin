"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { functionsUrl, setToken } from "@/lib/api";

export default function LoginPage() {
    const router = useRouter();
    const [token, setTokenInput] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!token.trim()) {
            setError("paste the ADMIN_TOKEN secret value");
            return;
        }
        setBusy(true);
        setError(null);
        setToken(token.trim());
        // Verify the token against a real admin call before believing it.
        try {
            const res = await fetch(`${functionsUrl()}/admin_tenants`, {
                headers: { Authorization: `Bearer ${token.trim()}` },
            });
            if (res.status === 401 || res.status === 500) {
                const body = (await res.json().catch(() => null)) as
                    | { error?: { message?: string } }
                    | null;
                setError(body?.error?.message ?? "token rejected");
                localStorage.removeItem("pilot_admin_token");
                setBusy(false);
                return;
            }
            router.replace("/tenants");
        } catch (e) {
            setError(
                `cannot reach ${functionsUrl()} — is the harness / functions serve running? ` +
                    `(${e instanceof Error ? e.message : "network error"})`,
            );
            localStorage.removeItem("pilot_admin_token");
            setBusy(false);
        }
    }

    return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
            <h1 className="mb-1 text-2xl font-semibold">Pilot dashboard</h1>
            <p className="mb-6 text-sm text-slate-500">
                Single-owner admin. Paste the <code className="rounded bg-slate-200 px-1">ADMIN_TOKEN</code>{" "}
                secret (Supabase → Project Settings → Secrets). It stays in this browser only.
            </p>
            <form onSubmit={submit} className="flex flex-col gap-3">
                <input
                    type="password"
                    value={token}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="ADMIN_TOKEN"
                    autoFocus
                    className="rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                />
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                    {busy ? "Checking…" : "Enter dashboard"}
                </button>
                {error && (
                    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </p>
                )}
            </form>
            <p className="mt-6 break-all text-xs text-slate-400">target: {functionsUrl()}</p>
        </main>
    );
}

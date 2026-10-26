"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { functionsUrl, setToken } from "@/lib/api";
import { Button, Field, Notice } from "@/components/ui";

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
        <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-10 px-5 py-12 lg:flex-row lg:items-center lg:gap-16">
            {/* brand panel */}
            <section className="flex-1">
                <p className="eyebrow mb-4">Cloth Savvy · Pilot</p>
                <h1 className="display text-4xl leading-tight sm:text-5xl">
                    The owner console for
                    <span className="text-gold"> the whole platform</span>.
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
                    Tenants, API keys, catalogues and usage — one admin token, one browser, never
                    on a tenant&apos;s portal. Everything you do here is audited; nothing you do
                    here can be reached with a tenant session.
                </p>
                <ul className="mt-6 flex flex-wrap gap-2 text-xs text-muted">
                    {["create & suspend tenants", "issue / revoke keys", "run the catalog pipeline", "drop a tenant"].map(
                        (t) => (
                            <li key={t} className="rounded-full border border-line px-3 py-1">
                                {t}
                            </li>
                        ),
                    )}
                </ul>
            </section>

            {/* sign-in card */}
            <section className="card w-full max-w-md card-pad">
                <h2 className="display mb-1 text-2xl">Sign in</h2>
                <p className="mb-6 text-sm text-muted">
                    Paste the <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-xs text-gold">ADMIN_TOKEN</code>{" "}
                    secret (Supabase → Project Settings → Secrets). It stays in this browser only.
                </p>

                <form onSubmit={submit} className="flex flex-col gap-4">
                    <Field label="Admin token" hint="Stored in localStorage on this device — never in the URL, never on a server.">
                        <input
                            type="password"
                            value={token}
                            onChange={(e) => setTokenInput(e.target.value)}
                            placeholder="ADMIN_TOKEN"
                            autoFocus
                            className="input font-mono"
                        />
                    </Field>

                    <Button type="submit" variant="primary" busy={busy} className="w-full py-2.5">
                        {busy ? "Checking…" : "Enter console"}
                    </Button>

                    {error && <Notice tone="error">{error}</Notice>}
                </form>

                <p className="mt-6 break-all text-[11px] text-muted/70">
                    target: <span className="font-mono">{functionsUrl()}</span>
                </p>
            </section>
        </main>
    );
}

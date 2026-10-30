"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { functionsUrl } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button, Field, Notice } from "@/components/ui";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim() || !password) {
            setError("enter your admin email and password");
            return;
        }
        setBusy(true);
        setError(null);

        const { data, error: signInError } = await supabase().auth.signInWithPassword({
            email: email.trim(),
            password,
        });
        if (signInError || !data.session) {
            setError(signInError?.message ?? "sign-in failed");
            setBusy(false);
            return;
        }

        // Signed in is not the same as allowed: the server checks admin_users.
        try {
            const res = await fetch(`${functionsUrl()}/admin_tenants`, {
                headers: { Authorization: `Bearer ${data.session.access_token}` },
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as
                    | { error?: { message?: string } }
                    | null;
                await supabase().auth.signOut();
                setError(
                    res.status === 403
                        ? `${body?.error?.message ?? "not an admin"} — ask the owner to add ${email.trim()} to admin_users`
                        : body?.error?.message ?? `rejected with HTTP ${res.status}`,
                );
                setBusy(false);
                return;
            }
            router.replace("/tenants");
        } catch (err) {
            setError(
                `cannot reach ${functionsUrl()} — is the functions endpoint up? ` +
                    `(${err instanceof Error ? err.message : "network error"})`,
            );
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
                    Tenants, API keys, catalogues and usage — one admin account, one browser, never
                    on a tenant&apos;s portal. Every mutating action is written to{" "}
                    <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-xs text-gold">
                        admin_audit
                    </code>
                    ; nothing you do here can be reached with a tenant session.
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
                    Use your admin account (Supabase Auth). Access is granted only while your
                    user id is listed in{" "}
                    <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-xs text-gold">
                        admin_users
                    </code>
                    .
                </p>

                <form onSubmit={submit} className="flex flex-col gap-4">
                    <Field label="Email">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="owner@clothsavvy.com"
                            autoComplete="username"
                            autoFocus
                            className="input"
                        />
                    </Field>

                    <Field label="Password" hint="The session is kept in sessionStorage — closing the tab signs you out.">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="input"
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

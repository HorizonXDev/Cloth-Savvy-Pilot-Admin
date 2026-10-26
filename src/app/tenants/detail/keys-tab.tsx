"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, adminFetch } from "@/lib/api";
import type { ApiKeyRow, Tenant } from "@/lib/types";

export default function KeysTab({ tenant }: { tenant: Tenant }) {
    const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [environment, setEnvironment] = useState<"live" | "sandbox">("sandbox");
    const [label, setLabel] = useState("");
    const [busy, setBusy] = useState(false);
    const [issued, setIssued] = useState<string | null>(null); // plaintext, ONCE
    const [copied, setCopied] = useState(false);

    const load = useCallback(() => {
        adminFetch<{ keys: ApiKeyRow[] }>(`/admin_keys?tenant_id=${tenant.id}`)
            .then((d) => setKeys(d.keys))
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, [tenant.id]);

    useEffect(() => {
        load();
    }, [load]);

    async function issue(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const d = await adminFetch<{ plaintext: string }>("/admin_keys", {
                method: "POST",
                body: { tenant_id: tenant.id, environment, ...(label ? { label } : {}) },
            });
            setIssued(d.plaintext);
            setCopied(false);
            setLabel("");
            load();
        } catch (e) {
            setError(e instanceof ApiError ? `${e.message}${e.requestId ? ` — ${e.requestId}` : ""}` : String(e));
        } finally {
            setBusy(false);
        }
    }

    async function revoke(id: string) {
        if (!confirm("Revoke this key? Calls with it will 401 immediately.")) return;
        setBusy(true);
        try {
            await adminFetch("/admin_keys", { method: "PATCH", body: { tenant_id: tenant.id, key_id: id } });
            load();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="grid max-w-4xl gap-5">
            {issued && (
                <div className="rounded border border-warn/40 bg-warn/10 p-4">
                    <p className="mb-2 text-sm font-medium text-warn">
                        New API key — shown exactly once. Copy it now; it is gone when you close this.
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 break-all rounded bg-panel px-2 py-2 text-sm">{issued}</code>
                        <button
                            onClick={async () => {
                                await navigator.clipboard.writeText(issued);
                                setCopied(true);
                            }}
                            className="rounded bg-gold text-bg px-3 py-2 text-sm text-bg hover:bg-[#c99b5a]"
                        >
                            {copied ? "copied ✓" : "copy"}
                        </button>
                        <button
                            onClick={() => setIssued(null)}
                            className="rounded border border-warn/50 px-3 py-2 text-sm text-warn hover:bg-warn/15"
                        >
                            I stored it — close
                        </button>
                    </div>
                </div>
            )}

            <section className="rounded border border-line bg-panel p-4">
                <h2 className="mb-3 font-medium">Issue a key</h2>
                <form onSubmit={issue} className="flex flex-wrap items-end gap-3">
                    <label className="text-sm">
                        environment
                        <select
                            value={environment}
                            onChange={(e) => setEnvironment(e.target.value as "live" | "sandbox")}
                            className="mt-1 block rounded border border-line px-2 py-1.5 text-sm"
                        >
                            <option value="sandbox">sandbox (sk_test_)</option>
                            <option value="live">live (sk_live_)</option>
                        </select>
                    </label>
                    <label className="text-sm">
                        label
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="shopify-prod"
                            maxLength={100}
                            className="mt-1 block rounded border border-line px-2 py-1.5 text-sm"
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={busy}
                        className="rounded bg-gold text-bg px-3 py-1.5 text-sm font-medium text-bg hover:bg-[#c99b5a] disabled:opacity-50"
                    >
                        {busy ? "Issuing…" : "Issue key"}
                    </button>
                </form>
            </section>

            {error && (
                <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <section className="rounded border border-line bg-panel">
                <h2 className="border-b border-line px-4 py-3 font-medium">Keys</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-line text-left text-xs uppercase text-muted">
                                <th className="px-4 py-2">Prefix</th>
                                <th className="px-4 py-2">Env</th>
                                <th className="px-4 py-2">Label</th>
                                <th className="px-4 py-2">Last used</th>
                                <th className="px-4 py-2">Status</th>
                                <th className="px-4 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {keys === null && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-4 text-muted/70">
                                        loading…
                                    </td>
                                </tr>
                            )}
                            {keys?.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-muted/70">
                                        no keys issued yet
                                    </td>
                                </tr>
                            )}
                            {keys?.map((k) => (
                                <tr key={k.id} className="border-b border-line">
                                    <td className="px-4 py-2 font-mono text-xs">{k.key_prefix ?? "—"}</td>
                                    <td className="px-4 py-2 text-xs">{k.environment}</td>
                                    <td className="px-4 py-2 text-xs">{k.label ?? "—"}</td>
                                    <td className="px-4 py-2 text-xs text-muted">
                                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}
                                    </td>
                                    <td className="px-4 py-2">
                                        {k.revoked_at ? (
                                            <span className="rounded-full bg-panel/10 px-2 py-0.5 text-xs text-ink/75">
                                                revoked
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs text-ok">
                                                active
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        {!k.revoked_at && (
                                            <button
                                                onClick={() => revoke(k.id)}
                                                disabled={busy}
                                                className="rounded border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                                            >
                                                Revoke
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

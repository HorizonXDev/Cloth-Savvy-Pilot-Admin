"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, adminFetch, clearToken, getToken } from "@/lib/api";
import type { Tenant } from "@/lib/types";

export default function TenantsPage() {
    const router = useRouter();
    const [tenants, setTenants] = useState<Tenant[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [slug, setSlug] = useState("");
    const [name, setName] = useState("");
    const [website, setWebsite] = useState("");
    const [creating, setCreating] = useState(false);

    const load = useCallback(() => {
        adminFetch<{ tenants: Tenant[] }>("/admin_tenants")
            .then((d) => setTenants(d.tenants))
            .catch((e) => {
                if (e instanceof ApiError && e.status === 401) {
                    clearToken();
                    router.replace("/login");
                } else {
                    setError(e instanceof Error ? e.message : String(e));
                }
            });
    }, [router]);

    useEffect(() => {
        if (!getToken()) {
            router.replace("/login");
            return;
        }
        load();
    }, [load, router]);

    async function create(e: React.FormEvent) {
        e.preventDefault();
        setCreating(true);
        setError(null);
        try {
            const d = await adminFetch<{ tenant: Tenant }>("/admin_tenants", {
                method: "POST",
                body: { slug, name, ...(website ? { website_url: website } : {}) },
            });
            setShowCreate(false);
            setSlug("");
            setName("");
            setWebsite("");
            router.push(`/tenants/detail?id=${d.tenant.id}`);
        } catch (e) {
            setError(e instanceof ApiError ? `${e.message}${e.requestId ? ` (${e.requestId})` : ""}` : String(e));
        } finally {
            setCreating(false);
        }
    }

    return (
        <main className="mx-auto max-w-5xl p-6">
            <nav className="mb-4 flex gap-4 text-sm">
                <Link href="/health" className="text-blue-600 hover:underline">
                    Health
                </Link>
                <button
                    onClick={() => {
                        clearToken();
                        router.replace("/login");
                    }}
                    className="ml-auto text-slate-500 hover:underline"
                >
                    sign out
                </button>
            </nav>

            <div className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold">Tenants</h1>
                <button
                    onClick={() => setShowCreate((v) => !v)}
                    className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                >
                    {showCreate ? "Cancel" : "+ New tenant"}
                </button>
            </div>

            {error && (
                <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </p>
            )}

            {showCreate && (
                <form onSubmit={create} className="mb-5 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-3">
                    <label className="text-sm">
                        slug *
                        <input
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="acme_fashion"
                            required
                            pattern="[a-z0-9_]{1,40}"
                            title="lowercase letters, digits, underscores (max 40)"
                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
                        />
                    </label>
                    <label className="text-sm">
                        name *
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Acme Fashion"
                            required
                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                    </label>
                    <label className="text-sm">
                        website
                        <input
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="https://acme.example"
                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={creating}
                        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 sm:col-span-3 sm:justify-self-start"
                    >
                        {creating ? "Creating…" : "Create tenant"}
                    </button>
                </form>
            )}

            {tenants === null && !error && <p className="text-sm text-slate-500">loading…</p>}
            {tenants && (
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                                <th className="px-3 py-2">Tenant</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Model</th>
                                <th className="px-3 py-2">Occasions</th>
                                <th className="px-3 py-2">Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tenants.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                                        no tenants yet — create the first one
                                    </td>
                                </tr>
                            )}
                            {tenants.map((t) => (
                                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="px-3 py-2">
                                        <Link href={`/tenants/detail?id=${t.id}`} className="font-medium text-blue-600 hover:underline">
                                            {t.name}
                                        </Link>
                                        <span className="ml-2 font-mono text-xs text-slate-400">{t.slug}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs ${
                                                t.status === "active"
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-amber-100 text-amber-800"
                                            }`}
                                        >
                                            {t.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs">{t.embedding_model}</td>
                                    <td className="px-3 py-2">{Object.keys(t.settings?.combos ?? {}).length}</td>
                                    <td className="px-3 py-2 text-xs text-slate-500">
                                        {new Date(t.created_at).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
}

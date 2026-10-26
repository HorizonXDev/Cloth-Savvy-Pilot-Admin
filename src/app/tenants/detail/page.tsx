"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, adminFetch, clearToken, getToken } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import SettingsTab from "./settings-tab";
import KeysTab from "./keys-tab";
import UsageTab from "./usage-tab";
import CatalogTab from "./catalog-tab";
import UsersTab from "./users-tab";

const TABS = ["settings", "keys", "usage", "catalog", "users"] as const;
type Tab = (typeof TABS)[number];

// Static export (output: "export") cannot prerender /tenants/[id] — tenants are
// runtime data — so the id travels in the query string instead:
//   /tenants/detail?id=<uuid>. useSearchParams needs a Suspense boundary.
export default function TenantDetailPage() {
    return (
        <Suspense
            fallback={<main className="mx-auto max-w-6xl p-6 text-sm text-slate-500">loading…</main>}
        >
            <TenantDetail />
        </Suspense>
    );
}

function TenantDetail() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const id = searchParams.get("id") ?? "";
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("settings");

    const load = useCallback(() => {
        adminFetch<{ tenants: Tenant[] }>("/admin_tenants")
            .then((d) => {
                const t = d.tenants.find((x) => x.id === id) ?? null;
                if (!t) setError("tenant not found");
                setTenant(t);
            })
            .catch((e) => {
                if (e instanceof ApiError && e.status === 401) {
                    clearToken();
                    router.replace("/login");
                } else {
                    setError(e instanceof Error ? e.message : String(e));
                }
            });
    }, [id, router]);

    useEffect(() => {
        if (!getToken()) {
            router.replace("/login");
            return;
        }
        load();
    }, [load, router]);

    return (
        <main className="mx-auto max-w-6xl p-6">
            <nav className="mb-4 flex gap-4 text-sm">
                <Link href="/tenants" className="text-blue-600 hover:underline">
                    ← Tenants
                </Link>
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

            {error && (
                <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            {!tenant && !error && <p className="text-sm text-slate-500">loading…</p>}
            {tenant && (
                <>
                    <div className="mb-4 flex flex-wrap items-baseline gap-3">
                        <h1 className="text-xl font-semibold">{tenant.name}</h1>
                        <span className="font-mono text-sm text-slate-400">{tenant.slug}</span>
                        <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                                tenant.status === "active"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-amber-100 text-amber-800"
                            }`}
                        >
                            {tenant.status}
                        </span>
                        <span className="font-mono text-xs text-slate-400">{tenant.embedding_model}</span>
                        <span className="ml-auto font-mono text-xs text-slate-400">{tenant.id}</span>
                    </div>

                    <div className="mb-4 flex gap-1 border-b border-slate-200">
                        {TABS.map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize ${
                                    tab === t
                                        ? "border-slate-900 font-medium text-slate-900"
                                        : "border-transparent text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    {tab === "settings" && <SettingsTab tenant={tenant} onUpdated={load} />}
                    {tab === "keys" && <KeysTab tenant={tenant} />}
                    {tab === "usage" && <UsageTab tenant={tenant} />}
                    {tab === "catalog" && <CatalogTab tenant={tenant} />}
                    {tab === "users" && <UsersTab tenant={tenant} />}
                </>
            )}
        </main>
    );
}

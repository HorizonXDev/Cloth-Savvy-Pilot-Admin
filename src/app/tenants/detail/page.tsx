"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, adminFetch, clearToken, hasSession } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import SettingsTab from "./settings-tab";
import KeysTab from "./keys-tab";
import UsageTab from "./usage-tab";
import CatalogTab from "./catalog-tab";
import UsersTab from "./users-tab";
import DeleteTenant from "./delete-tenant";
import { Badge, Loading, Notice } from "@/components/ui";

const TABS = ["settings", "keys", "usage", "catalog", "users"] as const;
type Tab = (typeof TABS)[number];

export default function TenantDetailPage() {
    // The tenant id rides in the query string (`/tenants/detail?id=<uuid>`),
    // because `output: "export"` cannot prerender a dynamic segment — and
    // useSearchParams must sit under a Suspense boundary to build.
    return (
        <Suspense fallback={<div className="py-6 text-sm text-muted">loading…</div>}>
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
                    void clearToken();
                    router.replace("/login");
                } else {
                    setError(e instanceof Error ? e.message : String(e));
                }
            });
    }, [id, router]);

    useEffect(() => {
        let cancelled = false;
        hasSession().then((ok) => {
            if (cancelled) return;
            if (!ok) {
                router.replace("/login");
                return;
            }
            load();
        });
        return () => {
            cancelled = true;
        };
    }, [load, router]);

    return (
        <main>
            <nav className="mb-4 flex items-center gap-3 text-sm">
                <Link href="/tenants" className="text-gold hover:underline">
                    ← Tenants
                </Link>
                <span className="text-muted/50">/</span>
                <span className="text-muted">{tenant?.name ?? "…"}</span>
            </nav>

            {error && (
                <div className="mb-4">
                    <Notice tone="error">{error}</Notice>
                </div>
            )}
            {!tenant && !error && <Loading label="Loading tenant…" />}

            {tenant && (
                <>
                    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
                        <div>
                            <p className="eyebrow mb-1">Tenant</p>
                            <h1 className="display text-3xl sm:text-4xl">{tenant.name}</h1>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                                <span className="mono text-muted">{tenant.slug}</span>
                                <Badge tone={tenant.status === "active" ? "ok" : "warn"}>
                                    {tenant.status}
                                </Badge>
                                <span className="mono text-xs text-muted">{tenant.embedding_model}</span>
                                <span className="text-xs text-muted/70">{tenant.id}</span>
                            </div>
                        </div>
                        <DeleteTenant tenant={tenant} onSuspended={load} />
                    </header>

                    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
                        {TABS.map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`-mb-px border-b-2 px-4 py-2.5 text-sm capitalize transition-colors ${
                                    tab === t
                                        ? "border-gold font-medium text-gold"
                                        : "border-transparent text-muted hover:text-ink"
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

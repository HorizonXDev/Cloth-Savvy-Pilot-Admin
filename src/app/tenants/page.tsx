"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, adminFetch, clearToken, getToken } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import { Badge, Button, Card, Empty, Field, Loading, Notice, PageTitle, TableWrap } from "@/components/ui";

export default function TenantsPage() {
    const router = useRouter();
    const [tenants, setTenants] = useState<Tenant[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [slug, setSlug] = useState("");
    const [name, setName] = useState("");
    const [website, setWebsite] = useState("");
    const [creating, setCreating] = useState(false);
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<"" | "active" | "suspended">("");

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

    // Client-side filter: with the pilot's tenant counts this beats a round
    // trip, and it stays instant while you type a slug fragment.
    const visible = useMemo(() => {
        if (!tenants) return [];
        const q = query.trim().toLowerCase();
        return tenants.filter((t) => {
            if (status && t.status !== status) return false;
            if (!q) return true;
            return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
        });
    }, [tenants, query, status]);

    const counts = useMemo(() => {
        const all = tenants?.length ?? 0;
        const active = tenants?.filter((t) => t.status === "active").length ?? 0;
        return { all, active, suspended: all - active };
    }, [tenants]);

    return (
        <>
            <PageTitle
                eyebrow="Platform"
                title="Tenants"
                actions={
                    <Button variant="primary" onClick={() => setShowCreate((v) => !v)}>
                        {showCreate ? "Cancel" : "+ New tenant"}
                    </Button>
                }
            />

            {error && (
                <div className="mb-4">
                    <Notice tone="error">{error}</Notice>
                </div>
            )}

            {showCreate && (
                <Card title="Create a tenant" className="mb-6">
                    <form onSubmit={create} className="grid gap-4 sm:grid-cols-3">
                        <Field label="slug *" hint="lowercase, digits, underscores · max 40">
                            <input
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="acme_fashion"
                                required
                                pattern="[a-z0-9_]{1,40}"
                                title="lowercase letters, digits, underscores (max 40)"
                                className="input font-mono"
                            />
                        </Field>
                        <Field label="name *">
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Acme Fashion"
                                required
                                className="input"
                            />
                        </Field>
                        <Field label="website" hint="optional">
                            <input
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                placeholder="https://acme.example"
                                className="input"
                            />
                        </Field>
                        <div className="sm:col-span-3">
                            <Button type="submit" variant="primary" busy={creating}>
                                {creating ? "Creating…" : "Create tenant"}
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            {/* filter bar */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="search name or slug…"
                    className="input max-w-xs"
                    aria-label="Search tenants"
                />
                <div className="flex gap-1 rounded-full border border-line p-1">
                    {([["", `all ${counts.all}`], ["active", `active ${counts.active}`], ["suspended", `suspended ${counts.suspended}`]] as const).map(
                        ([value, label]) => (
                            <button
                                key={value || "all"}
                                onClick={() => setStatus(value as "" | "active" | "suspended")}
                                className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
                                    status === value
                                        ? "bg-gold text-bg"
                                        : "text-muted hover:text-ink"
                                }`}
                            >
                                {label}
                            </button>
                        ),
                    )}
                </div>
            </div>

            {tenants === null && !error && <Loading label="Loading tenants…" />}

            {tenants !== null && tenants.length === 0 && (
                <Empty
                    title="No tenants yet"
                    hint="A tenant is one brand on the platform: it owns its own catalogue, API keys and portal logins. Create the first one to get a key issued and start metering calls."
                    action={
                        <Button variant="primary" onClick={() => setShowCreate(true)}>
                            Create the first tenant
                        </Button>
                    }
                />
            )}

            {tenants !== null && tenants.length > 0 && visible.length === 0 && (
                <Empty
                    title="No tenant matches that"
                    hint={`Nothing found for “${query}”${status ? ` with status ${status}` : ""}.`}
                    action={
                        <Button
                            onClick={() => {
                                setQuery("");
                                setStatus("");
                            }}
                        >
                            Clear filters
                        </Button>
                    }
                />
            )}

            {visible.length > 0 && (
                <TableWrap>
                    <thead>
                        <tr>
                            <th>Tenant</th>
                            <th>Status</th>
                            <th>Model</th>
                            <th>Occasions</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((t) => (
                            <tr key={t.id}>
                                <td>
                                    <Link
                                        href={`/tenants/detail?id=${t.id}`}
                                        className="font-medium text-gold hover:underline"
                                    >
                                        {t.name}
                                    </Link>
                                    <span className="mono ml-2 text-xs text-muted">{t.slug}</span>
                                </td>
                                <td>
                                    <Badge tone={t.status === "active" ? "ok" : "warn"}>{t.status}</Badge>
                                </td>
                                <td className="mono text-xs text-muted">{t.embedding_model}</td>
                                <td>{Object.keys(t.settings?.combos ?? {}).length}</td>
                                <td className="text-xs text-muted">
                                    {new Date(t.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </TableWrap>
            )}
        </>
    );
}

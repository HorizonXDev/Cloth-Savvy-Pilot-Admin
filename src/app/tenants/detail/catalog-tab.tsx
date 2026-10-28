"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, adminFetch } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { Badge, Button } from "@/components/ui";
import EmbeddingsPanel from "./embeddings-panel";
import type { IngestionRun, ProductRow, SearchHit, Tenant } from "@/lib/types";

const SECTIONS = [
    "top", "bottom", "dress", "saree", "blouse", "dupatta", "outerwear",
    "footwear", "bag", "jewellery", "accessory",
];
/** One row of catalog_staging, as admin_catalog ?op=staging returns it. */
interface StagingRow {
    id: string;
    external_id: string;
    payload: { title?: string; section?: string } | null;
    status: "pending" | "merged" | "failed";
    error: string | null;
    source_file: string | null;
    created_at: string;
}

export default function CatalogTab({ tenant }: { tenant: Tenant }) {
    // ---- product browser state
    const [products, setProducts] = useState<ProductRow[] | null>(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [pageSize] = useState(25);
    const [q, setQ] = useState("");
    const [sectionFilter, setSectionFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [error, setError] = useState<string | null>(null);

    // ---- search preview state
    const [sq, setSq] = useState("");
    const [sSection, setSSection] = useState("");
    const [hits, setHits] = useState<SearchHit[] | null>(null);
    const [searching, setSearching] = useState(false);

    // ---- import queue (rows the TENANT uploaded, waiting for the pipeline)
    const [staging, setStaging] = useState<StagingRow[] | null>(null);
    const [stagingTotal, setStagingTotal] = useState(0);
    const [exportMsg, setExportMsg] = useState<string | null>(null);

    // ---- runs
    const [runs, setRuns] = useState<IngestionRun[] | null>(null);

    const loadProducts = useCallback(() => {
        const params = new URLSearchParams({ op: "products", tenant_id: tenant.id });
        if (q.trim()) params.set("q", q.trim());
        if (sectionFilter) params.set("section", sectionFilter);
        if (statusFilter) params.set("status", statusFilter);
        params.set("page", String(page));
        params.set("page_size", String(pageSize));
        adminFetch<{ products: ProductRow[]; total: number }>(`/admin_catalog?${params}`)
            .then((d) => {
                setProducts(d.products);
                setTotal(d.total);
                setError(null);
            })
            .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    }, [tenant.id, q, sectionFilter, statusFilter, page, pageSize]);

    const loadRuns = useCallback(() => {
        adminFetch<{ runs: IngestionRun[] }>(`/admin_catalog?op=runs&tenant_id=${tenant.id}`)
            .then((d) => setRuns(d.runs))
            .catch(() => setRuns([]));
    }, [tenant.id]);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);
    useEffect(() => {
        loadRuns();
    }, [loadRuns]);

    async function search(e: React.FormEvent) {
        e.preventDefault();
        if (!sq.trim()) return;
        setSearching(true);
        setHits(null);
        try {
            const d = await adminFetch<{ items: SearchHit[] }>("/admin_catalog", {
                method: "POST",
                body: {
                    op: "search",
                    tenant_id: tenant.id,
                    query: sq.trim(),
                    ...(sSection ? { section: sSection } : {}),
                },
            });
            setHits(d.items);
        } catch (e) {
            setError(e instanceof ApiError ? `${e.message}${e.requestId ? ` — ${e.requestId}` : ""}` : String(e));
        } finally {
            setSearching(false);
        }
    }

    async function setStatus(product: ProductRow, status: "active" | "archived") {
        try {
            await adminFetch("/admin_catalog", {
                method: "POST",
                body: { op: "set_status", tenant_id: tenant.id, product_ids: [product.id], status },
            });
            loadProducts();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }

    const loadStaging = useCallback(() => {
        adminFetch<{ rows: StagingRow[]; total: number }>(
            `/admin_catalog?op=staging&tenant_id=${tenant.id}&limit=200`,
        )
            .then((d) => {
                setStaging(d.rows);
                setStagingTotal(d.total);
            })
            .catch(() => setStaging([])); // older backend: show empty, never break the tab
    }, [tenant.id]);

    useEffect(() => {
        loadStaging();
    }, [loadStaging]);

    /** Export the WHOLE catalogue by paging through it — an export that
     * silently stops at the first page would be worse than none. */
    async function exportProducts() {
        setExportMsg("collecting…");
        try {
            const headers = [
                "external_id", "title", "section", "category", "gender", "colors",
                "price", "in_stock", "status", "product_url", "image_url", "updated_at",
            ];
            const rows: unknown[][] = [];
            let page = 0;
            let fetched = 0;
            let grand = 1;
            do {
                const d = await adminFetch<{ products: ProductRow[]; total: number }>(
                    `/admin_catalog?op=products&tenant_id=${tenant.id}&page=${page}&page_size=100`,
                );
                grand = d.total;
                for (const p of d.products) {
                    rows.push([
                        p.external_id, p.title, p.section, p.category ?? "", p.gender ?? "",
                        (p.colors ?? []).join("; "), p.price ?? "", p.in_stock, p.status,
                        p.product_url ?? "", p.image_url ?? "", p.updated_at,
                    ]);
                }
                fetched += d.products.length;
                page += 1;
                if (d.products.length === 0) break;
            } while (fetched < grand && page < 200);

            downloadCsv(`products-${tenant.slug}`, headers, rows);
            setExportMsg(`exported ${rows.length} of ${grand} product(s)`);
        } catch (e) {
            setExportMsg(`export failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            window.setTimeout(() => setExportMsg(null), 4000);
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="grid gap-6">
            {error && (
                <p className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
            )}

            {/* ------------------------------------------------ search preview */}
            <section className="rounded border border-line bg-panel p-4">
                <h2 className="mb-1 font-medium">Search preview</h2>
                <p className="mb-3 text-xs text-muted">
                    exactly what a tenant&apos;s API callers would get for this query (real encoder, real RPC).
                </p>
                <form onSubmit={search} className="flex flex-wrap gap-2">
                    <input
                        value={sq}
                        onChange={(e) => setSq(e.target.value)}
                        placeholder="blue cotton kurta"
                        className="min-w-64 flex-1 rounded border border-line px-2 py-1.5 text-sm"
                    />
                    <select
                        value={sSection}
                        onChange={(e) => setSSection(e.target.value)}
                        className="rounded border border-line px-2 py-1.5 text-sm"
                    >
                        <option value="">any section</option>
                        {SECTIONS.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                    <button
                        type="submit"
                        disabled={searching}
                        className="rounded bg-gold text-bg px-3 py-1.5 text-sm text-bg hover:bg-[#c99b5a] disabled:opacity-50"
                    >
                        {searching ? "Searching…" : "Search"}
                    </button>
                </form>
                {hits !== null && (
                    <div className="mt-3 grid gap-2">
                        {hits.length === 0 && <p className="text-sm text-muted/70">no match (honest empty, not an error)</p>}
                        {hits.map((h) => (
                            <div
                                key={h.product.external_id}
                                className="flex items-center gap-3 rounded border border-line px-3 py-2 text-sm"
                            >
                                <span className="font-mono text-xs text-muted/70">{h.product.external_id}</span>
                                <span className="flex-1">{h.product.title}</span>
                                <span className="text-xs text-muted">{h.section}</span>
                                <span className="rounded bg-gold/10 px-2 py-0.5 text-xs text-gold">
                                    sim {(h.similarity ?? 0).toFixed(3)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ------------------------------------------ import queue (staging) */}
            <section className="rounded border border-line bg-panel">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <h2 className="font-medium">Import queue</h2>
                    <span className="text-xs text-muted">
                        uploaded by the tenant in their portal · merged by the owner&apos;s pipeline
                    </span>
                </div>
                <div className="px-4 py-3 text-xs text-muted">
                    Uploads do not touch search. A row sits <strong>pending</strong> until{" "}
                    <code>Step 1</code> below exports the id → url table for your image pipeline,
                    and <code>Step 2</code> applies the vectors it produces. Rows sit pending until
                    then — nothing reaches search before a vector arrives.
                    {stagingTotal > 0 && ` ${stagingTotal} row(s) in the queue (showing up to 200).`}
                </div>
                {staging === null ? (
                    <p className="px-4 pb-4 text-sm text-muted">loading…</p>
                ) : staging.length === 0 ? (
                    <p className="px-4 pb-6 text-sm text-muted">
                        Nothing queued — no CSV has been uploaded for this tenant yet.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-t border-line text-left text-xs uppercase text-muted">
                                    <th className="px-4 py-2">SKU</th>
                                    <th className="px-4 py-2">Title</th>
                                    <th className="px-4 py-2">Section</th>
                                    <th className="px-4 py-2">Status</th>
                                    <th className="px-4 py-2">Queued</th>
                                    <th className="px-4 py-2">Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staging.map((s) => (
                                    <tr key={s.id} className="border-b border-line">
                                        <td className="px-4 py-2 font-mono text-xs">{s.external_id}</td>
                                        <td className="max-w-56 truncate px-4 py-2">
                                            {s.payload?.title ?? <span className="text-muted/70">—</span>}
                                        </td>
                                        <td className="px-4 py-2 text-xs">{s.payload?.section ?? "—"}</td>
                                        <td className="px-4 py-2">
                                            <Badge
                                                tone={
                                                    s.status === "merged"
                                                        ? "ok"
                                                        : s.status === "failed"
                                                          ? "danger"
                                                          : "warn"
                                                }
                                            >
                                                {s.status}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-muted">
                                            {new Date(s.created_at).toLocaleString()}
                                        </td>
                                        <td className="max-w-64 truncate px-4 py-2 text-xs text-danger">
                                            {s.error ?? ""}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* ------------------------------------------------ embedding job */}
            <section className="grid gap-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="display text-xl">Embeddings</h2>
                    <span className="text-xs text-muted">
                        image vectors only — title / colour / section are filters, never vectors
                    </span>
                </div>
                <EmbeddingsPanel
                    tenant={tenant}
                    onMerged={() => {
                        loadProducts();
                        loadRuns();
                        loadStaging();
                    }}
                />
            </section>

            {/* ------------------------------------------------ run history */}
            <section className="rounded border border-line bg-panel">
                <h2 className="border-b border-line px-4 py-3 font-medium">Import runs</h2>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase text-muted">
                            <th className="px-4 py-2">Started</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Rows</th>
                            <th className="px-4 py-2">Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {runs?.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-4 text-muted/70">
                                    no imports yet
                                </td>
                            </tr>
                        )}
                        {runs?.map((r) => (
                            <tr key={r.id} className="border-t border-line">
                                <td className="px-4 py-2 text-xs">{new Date(r.started_at).toLocaleString()}</td>
                                <td className="px-4 py-2 text-xs">{r.status}</td>
                                <td className="px-4 py-2 text-xs">
                                    {r.rows_ok} ok / {r.rows_failed} failed / {r.rows_total} total
                                </td>
                                <td className="max-w-56 truncate px-4 py-2 text-xs text-muted">{r.notes ?? ""}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {/* ------------------------------------------------ product browser */}
            <section className="rounded border border-line bg-panel">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                    <h2 className="mr-2 font-medium">Products ({total})</h2>
                    {exportMsg && <span className="text-xs text-ok">{exportMsg}</span>}
                    <Button size="sm" onClick={exportProducts} disabled={total === 0}>
                        Export CSV
                    </Button>
                    <input
                        value={q}
                        onChange={(e) => {
                            setQ(e.target.value);
                            setPage(0);
                        }}
                        placeholder="search title…"
                        className="w-40 rounded border border-line px-2 py-1 text-sm"
                    />
                    <select
                        value={sectionFilter}
                        onChange={(e) => {
                            setSectionFilter(e.target.value);
                            setPage(0);
                        }}
                        className="rounded border border-line px-2 py-1 text-sm"
                    >
                        <option value="">all sections</option>
                        {SECTIONS.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(0);
                        }}
                        className="rounded border border-line px-2 py-1 text-sm"
                    >
                        <option value="">all statuses</option>
                        <option value="active">active</option>
                        <option value="archived">archived</option>
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-line text-left text-xs uppercase text-muted">
                                <th className="px-4 py-2">SKU</th>
                                <th className="px-4 py-2">Title</th>
                                <th className="px-4 py-2">Section</th>
                                <th className="px-4 py-2">Price</th>
                                <th className="px-4 py-2">Status</th>
                                <th className="px-4 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {products === null && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-4 text-muted/70">
                                        loading…
                                    </td>
                                </tr>
                            )}
                            {products?.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-muted/70">
                                        no products yet — the tenant's catalogue is empty
                                    </td>
                                </tr>
                            )}
                            {products?.map((p) => (
                                <tr key={p.id} className="border-b border-line">
                                    <td className="px-4 py-2 font-mono text-xs">{p.external_id}</td>
                                    <td className="px-4 py-2">
                                        {p.title}
                                        {p.colors && p.colors.length > 0 && (
                                            <span className="ml-2 text-xs text-muted/70">{p.colors.join(", ")}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-xs">{p.section}</td>
                                    <td className="px-4 py-2 text-xs">{p.price === null ? "—" : Number(p.price)}</td>
                                    <td className="px-4 py-2">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs ${
                                                p.status === "active"
                                                    ? "bg-ok/15 text-ok"
                                                    : "bg-panel/10 text-ink/75"
                                            }`}
                                        >
                                            {p.status}
                                        </span>
                                        {p.needs_reembed && (
                                            <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs text-warn">
                                                needs new vector
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <button
                                            onClick={() => setStatus(p, p.status === "active" ? "archived" : "active")}
                                            className="rounded border border-line px-2 py-1 text-xs hover:bg-panel/5"
                                        >
                                            {p.status === "active" ? "Archive" : "Restore"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm">
                        <button
                            disabled={page === 0}
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            className="disabled:opacity-40"
                        >
                            ← prev
                        </button>
                        <span className="text-xs text-muted">
                            page {page + 1} / {totalPages}
                        </span>
                        <button
                            disabled={page + 1 >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                            className="disabled:opacity-40"
                        >
                            next →
                        </button>
                    </div>
                )}
            </section>
        </div>
    );
}

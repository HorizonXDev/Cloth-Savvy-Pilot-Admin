"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, adminFetch } from "@/lib/api";
import { parseCsv } from "@/lib/csv";
import type { IngestionRun, ProductRow, SearchHit, Tenant } from "@/lib/types";

const SECTIONS = [
    "top", "bottom", "dress", "saree", "blouse", "dupatta", "outerwear",
    "footwear", "bag", "jewellery", "accessory",
];
const BATCH = 50;

interface ImportState {
    phase: "idle" | "running" | "done" | "error";
    runId: string | null;
    processed: number;
    total: number;
    ok: number;
    failed: Array<{ external_id: string | null; reason: string }>;
    error: string | null;
}

const IDLE: ImportState = {
    phase: "idle", runId: null, processed: 0, total: 0, ok: 0, failed: [], error: null,
};

/** Map a parsed CSV row to an API import row using auto-detected headers. */
function toImportRow(headers: string[], cells: string[]): Record<string, unknown> | null {
    const get = (name: string): string | undefined => {
        const i = headers.indexOf(name);
        const v = i >= 0 ? cells[i]?.trim() : undefined;
        return v === "" ? undefined : v;
    };
    const external_id = get("external_id") ?? get("sku") ?? get("id");
    const title = get("title") ?? get("name");
    const section = get("section");
    if (!external_id || !title || !section) return null;
    const row: Record<string, unknown> = { external_id, title, section };
    const category = get("category");
    if (category) row.category = category;
    const gender = get("gender");
    if (gender) row.gender = gender;
    const colors = get("colors");
    if (colors) row.colors = colors.split(/[;|]/).map((c) => c.trim()).filter(Boolean);
    const price = get("price");
    if (price && Number.isFinite(Number(price))) row.price = Number(price);
    const inStock = get("in_stock");
    if (inStock !== undefined) row.in_stock = ["true", "1", "yes", "y"].includes(inStock.toLowerCase());
    const product_url = get("product_url") ?? get("url");
    if (product_url) row.product_url = product_url;
    const image_url = get("image_url") ?? get("image");
    if (image_url) row.image_url = image_url;
    return row;
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

    // ---- import state
    const [imp, setImp] = useState<ImportState>(IDLE);
    const [pendingRows, setPendingRows] = useState<Record<string, unknown>[] | null>(null);
    const [fileName, setFileName] = useState("");

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

    function onFile(file: File) {
        setFileName(file.name);
        setError(null);
        file.text().then((text) => {
            const { headers, rows } = parseCsv(text);
            const needed = ["title", "section"];
            const hasId = ["external_id", "sku", "id"].some((h) => headers.includes(h));
            const missing = needed.filter((h) => !headers.includes(h));
            if (!hasId || missing.length > 0) {
                setPendingRows(null);
                setError(
                    `CSV needs external_id (or sku), title and section columns` +
                        (missing.length ? ` — missing: ${missing.join(", ")}` : ""),
                );
                return;
            }
            const mapped: Record<string, unknown>[] = [];
            const bad: string[] = [];
            rows.forEach((cells, i) => {
                const row = toImportRow(headers, cells);
                if (row) mapped.push(row);
                else if (cells.some((c) => c.trim() !== "")) bad.push(String(i + 2));
            });
            if (bad.length > 0) {
                setError(`row(s) ${bad.slice(0, 10).join(", ")} lack external_id/title/section — they will be counted as failed`);
            }
            setPendingRows(mapped);
            setImp(IDLE);
        });
    }

    async function runImport() {
        if (!pendingRows || pendingRows.length === 0) return;
        setImp({ ...IDLE, phase: "running", total: pendingRows.length });
        try {
            const start = await adminFetch<{ run: IngestionRun }>("/admin_catalog", {
                method: "POST",
                body: { op: "import_start", tenant_id: tenant.id, rows_total: pendingRows.length, notes: fileName },
            });
            const runId = start.run.id;
            let ok = 0;
            const failed: ImportState["failed"] = [];
            let processed = 0;

            for (let i = 0; i < pendingRows.length; i += BATCH) {
                const chunk = pendingRows.slice(i, i + BATCH);
                let attempt = 0;
                for (;;) {
                    try {
                        const d = await adminFetch<{ batch: { ok: number }; failed: ImportState["failed"] }>(
                            "/admin_catalog",
                            {
                                method: "POST",
                                body: { op: "import_batch", tenant_id: tenant.id, run_id: runId, rows: chunk },
                            },
                        );
                        ok += d.batch.ok;
                        failed.push(...d.failed);
                        break;
                    } catch (e) {
                        // encoder 503 / network blip: retry the batch twice, then stop
                        attempt++;
                        if (attempt > 2 || (e instanceof ApiError && e.status === 400)) {
                            if (e instanceof ApiError && e.status === 400) {
                                failed.push({ external_id: null, reason: e.message });
                            } else {
                                failed.push({
                                    external_id: null,
                                    reason: `batch ${i / BATCH + 1} failed after retries: ${
                                        e instanceof Error ? e.message : String(e)
                                    }`,
                                });
                            }
                            break;
                        }
                        await new Promise((r) => setTimeout(r, 2500));
                    }
                }
                processed += chunk.length;
                setImp((s) => ({ ...s, runId, processed, ok, failed: [...failed] }));
            }

            await adminFetch("/admin_catalog", {
                method: "POST",
                body: {
                    op: "import_finish",
                    tenant_id: tenant.id,
                    run_id: runId,
                    status: failed.length === 0 ? "done" : "done",
                },
            });
            setImp((s) => ({ ...s, phase: "done", runId, processed, total: pendingRows.length, ok, failed }));
            setPendingRows(null);
            loadProducts();
            loadRuns();
        } catch (e) {
            setImp((s) => ({
                ...s,
                phase: "error",
                error: e instanceof ApiError ? `${e.message}${e.requestId ? ` — ${e.requestId}` : ""}` : String(e),
            }));
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="grid gap-6">
            {error && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            {/* ------------------------------------------------ search preview */}
            <section className="rounded border border-slate-200 bg-white p-4">
                <h2 className="mb-1 font-medium">Search preview</h2>
                <p className="mb-3 text-xs text-slate-500">
                    exactly what a tenant&apos;s API callers would get for this query (real encoder, real RPC).
                </p>
                <form onSubmit={search} className="flex flex-wrap gap-2">
                    <input
                        value={sq}
                        onChange={(e) => setSq(e.target.value)}
                        placeholder="blue cotton kurta"
                        className="min-w-64 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <select
                        value={sSection}
                        onChange={(e) => setSSection(e.target.value)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
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
                        className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                        {searching ? "Searching…" : "Search"}
                    </button>
                </form>
                {hits !== null && (
                    <div className="mt-3 grid gap-2">
                        {hits.length === 0 && <p className="text-sm text-slate-400">no match (honest empty, not an error)</p>}
                        {hits.map((h) => (
                            <div
                                key={h.product.external_id}
                                className="flex items-center gap-3 rounded border border-slate-100 px-3 py-2 text-sm"
                            >
                                <span className="font-mono text-xs text-slate-400">{h.product.external_id}</span>
                                <span className="flex-1">{h.product.title}</span>
                                <span className="text-xs text-slate-500">{h.section}</span>
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                    sim {(h.similarity ?? 0).toFixed(3)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ------------------------------------------------ import wizard */}
            <section className="rounded border border-slate-200 bg-white p-4">
                <h2 className="mb-1 font-medium">Import catalog (CSV)</h2>
                <p className="mb-3 text-xs text-slate-500">
                    columns: <code>external_id</code> (or sku), <code>title</code>, <code>section</code> required —
                    optional: category, gender, colors (semicolon-separated), price, in_stock, product_url, image_url.
                    Text embeddings are created server-side with the tenant&apos;s model.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onFile(f);
                        }}
                        className="text-sm"
                    />
                    {pendingRows && (
                        <>
                            <span className="text-sm text-slate-600">
                                {fileName}: {pendingRows.length} rows ready
                            </span>
                            <button
                                onClick={runImport}
                                disabled={imp.phase === "running"}
                                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                            >
                                {imp.phase === "running"
                                    ? `importing ${imp.processed}/${imp.total}…`
                                    : "Start import"}
                            </button>
                        </>
                    )}
                    {imp.phase !== "idle" && (
                        <button onClick={() => setImp(IDLE)} className="text-xs text-slate-400 hover:underline">
                            reset
                        </button>
                    )}
                </div>

                {imp.phase === "running" && (
                    <div className="mt-3">
                        <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
                            <div
                                className="h-2 bg-blue-500 transition-all"
                                style={{ width: `${(imp.processed / Math.max(1, imp.total)) * 100}%` }}
                            />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                            {imp.ok} inserted, {imp.failed.length} failed — do not close this tab
                        </p>
                    </div>
                )}
                {imp.phase === "done" && (
                    <p className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800">
                        import finished: {imp.ok} inserted, {imp.failed.length} failed
                        {imp.failed.length > 0 && " — see run history notes for details"}
                    </p>
                )}
                {imp.phase === "error" && (
                    <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">import failed: {imp.error}</p>
                )}
                {imp.failed.length > 0 && (
                    <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-red-700">
                        {imp.failed.map((f, i) => (
                            <li key={i}>
                                {f.external_id ?? "(row)"}: {f.reason}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* ------------------------------------------------ run history */}
            <section className="rounded border border-slate-200 bg-white">
                <h2 className="border-b border-slate-200 px-4 py-3 font-medium">Import runs</h2>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase text-slate-500">
                            <th className="px-4 py-2">Started</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Rows</th>
                            <th className="px-4 py-2">Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {runs?.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-4 text-slate-400">
                                    no imports yet
                                </td>
                            </tr>
                        )}
                        {runs?.map((r) => (
                            <tr key={r.id} className="border-t border-slate-100">
                                <td className="px-4 py-2 text-xs">{new Date(r.started_at).toLocaleString()}</td>
                                <td className="px-4 py-2 text-xs">{r.status}</td>
                                <td className="px-4 py-2 text-xs">
                                    {r.rows_ok} ok / {r.rows_failed} failed / {r.rows_total} total
                                </td>
                                <td className="max-w-56 truncate px-4 py-2 text-xs text-slate-500">{r.notes ?? ""}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {/* ------------------------------------------------ product browser */}
            <section className="rounded border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
                    <h2 className="mr-2 font-medium">Products ({total})</h2>
                    <input
                        value={q}
                        onChange={(e) => {
                            setQ(e.target.value);
                            setPage(0);
                        }}
                        placeholder="search title…"
                        className="w-40 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <select
                        value={sectionFilter}
                        onChange={(e) => {
                            setSectionFilter(e.target.value);
                            setPage(0);
                        }}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
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
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                        <option value="">all statuses</option>
                        <option value="active">active</option>
                        <option value="archived">archived</option>
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
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
                                    <td colSpan={6} className="px-4 py-4 text-slate-400">
                                        loading…
                                    </td>
                                </tr>
                            )}
                            {products?.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                                        no products — import a CSV above
                                    </td>
                                </tr>
                            )}
                            {products?.map((p) => (
                                <tr key={p.id} className="border-b border-slate-100">
                                    <td className="px-4 py-2 font-mono text-xs">{p.external_id}</td>
                                    <td className="px-4 py-2">
                                        {p.title}
                                        {p.colors && p.colors.length > 0 && (
                                            <span className="ml-2 text-xs text-slate-400">{p.colors.join(", ")}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-xs">{p.section}</td>
                                    <td className="px-4 py-2 text-xs">{p.price === null ? "—" : Number(p.price)}</td>
                                    <td className="px-4 py-2">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs ${
                                                p.status === "active"
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-slate-200 text-slate-600"
                                            }`}
                                        >
                                            {p.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <button
                                            onClick={() => setStatus(p, p.status === "active" ? "archived" : "active")}
                                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
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
                    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm">
                        <button
                            disabled={page === 0}
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            className="disabled:opacity-40"
                        >
                            ← prev
                        </button>
                        <span className="text-xs text-slate-500">
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

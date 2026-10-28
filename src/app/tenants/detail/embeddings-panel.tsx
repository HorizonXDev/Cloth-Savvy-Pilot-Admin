"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { chunk, parseEmbeddingsFile, VECTOR_DIM, type VectorParse } from "@/lib/embeddings";
import type { Tenant } from "@/lib/types";
import { Badge, Button, Card, Notice } from "@/components/ui";

interface ExportRow {
    external_id: string;
    image_url: string | null;
    title: string | null;
    section: string | null;
    reason: string;
}

interface MergeOutcome {
    merged: string[];
    skipped: Array<{ external_id: string | null; reason: string }>;
}

/**
 * The owner's half of the catalog pipeline, in two moves:
 *
 *   1. DOWNLOAD  — every row that still needs an IMAGE vector (queued uploads
 *      + products whose image changed) as an id -> url table.
 *   2. UPLOAD    — the vectors your FashionCLIP run produced, applied by id:
 *      queued rows become live products, flagged products get a fresh vector.
 *
 * Text never becomes a vector anywhere in this flow — the file is images only.
 */
export default function EmbeddingsPanel({
    tenant,
    onMerged,
}: {
    tenant: Tenant;
    onMerged: () => void;
}) {
    const [exportRows, setExportRows] = useState<ExportRow[] | null>(null);
    const [exportMsg, setExportMsg] = useState<string | null>(null);
    const [exportBusy, setExportBusy] = useState(false);

    const [fileName, setFileName] = useState("");
    const [parsed, setParsed] = useState<VectorParse | null>(null);
    const [merging, setMerging] = useState(false);
    const [progress, setProgress] = useState({ sent: 0, total: 0 });
    const [outcome, setOutcome] = useState<MergeOutcome | null>(null);
    const [error, setError] = useState<string | null>(null);

    /** Page through embed_export until the whole candidate set is in memory
     *  (the endpoint windows at 500; the loop stops on total, or at a hard
     *  ceiling so a runaway value cannot hang the tab). */
    const loadExport = useCallback(() => {
        setExportBusy(true);
        (async () => {
            const all: ExportRow[] = [];
            let offset = 0;
            let total = Number.POSITIVE_INFINITY;
            try {
                do {
                    const d = await adminFetch<{ rows: ExportRow[]; total: number }>(
                        `/admin_catalog?op=embed_export&tenant_id=${tenant.id}&limit=500&offset=${offset}`,
                    );
                    all.push(...d.rows);
                    total = d.total;
                    offset += 500;
                } while (all.length < total && offset < 50000);
                setExportRows(all);
            } catch (e) {
                setExportRows([]);
                setError(e instanceof Error ? e.message : String(e));
            } finally {
                setExportBusy(false);
            }
        })();
    }, [tenant.id]);

    useEffect(() => {
        loadExport();
    }, [loadExport]);

    const noUrl = (exportRows ?? []).filter((r) => !r.image_url);

    function downloadTable() {
        if (!exportRows) return;
        const usable = exportRows.filter((r) => r.image_url);
        downloadCsv(
            `embeddings-input-${tenant.slug}`,
            ["external_id", "image_url", "title", "section", "reason"],
            usable.map((r) => [r.external_id, r.image_url, r.title ?? "", r.section ?? "", r.reason]),
        );
        setExportMsg(
            `downloaded ${usable.length} row(s)` +
                (noUrl.length > 0
                    ? ` — ${noUrl.length} row(s) with no image_url were left out: ${
                          noUrl.slice(0, 12).map((r) => r.external_id).join(", ")}${noUrl.length > 12 ? "…" : ""}`
                    : ""),
        );
    }

    function onFile(file: File) {
        setFileName(file.name);
        setOutcome(null);
        setError(null);
        file.text().then((text) => setParsed(parseEmbeddingsFile(text)));
    }

    async function merge() {
        if (!parsed || parsed.rows.length === 0) return;
        setMerging(true);
        setError(null);
        setOutcome(null);
        const merged: string[] = [];
        const skipped: MergeOutcome["skipped"] = [];
        // 64 rows ≈ 0.6 MB per request (512 floats × ~12 KB worst case) — the
        // server's merge cap is 8 MB, but smaller chunks also stay under any
        // platform ingress limit and make progress visible per batch.
        const batches = chunk(parsed.rows, 64);
        setProgress({ sent: 0, total: parsed.rows.length });
        try {
            for (const batch of batches) {
                const d = await adminFetch<MergeOutcome>("/admin_catalog", {
                    method: "POST",
                    body: {
                        op: "embeddings_merge",
                        tenant_id: tenant.id,
                        rows: batch,
                        source: batches.length > 1 ? `${fileName} (${merged.length + 1}+…)` : fileName,
                    },
                });
                merged.push(...d.merged);
                skipped.push(...d.skipped);
                setProgress((p) => ({ sent: Math.min(p.total, p.sent + batch.length), total: p.total }));
            }
            setOutcome({ merged, skipped });
            onMerged();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setMerging(false);
        }
    }

    return (
        <div className="grid gap-6">
            {/* ---------------------------------------------------- 1 · export */}
            <Card
                title="Step 1 — download the id → url table"
                actions={
                    <Button
                        size="sm"
                        variant="primary"
                        busy={exportBusy}
                        disabled={!exportRows || exportRows.length === 0}
                        onClick={downloadTable}
                    >
                        Download CSV
                    </Button>
                }
            >
                <p className="mb-3 text-sm text-muted">
                    Everything that still needs an <strong>image</strong> vector: queued uploads plus
                    live products whose image changed. Feed{" "}
                    <code className="mono">external_id, image_url</code> to your FashionCLIP run.
                </p>
                {exportRows === null ? (
                    <p className="text-sm text-muted">loading…</p>
                ) : exportRows.length === 0 ? (
                    <Notice tone="ok">
                        Nothing to embed — every queued row has a vector and no image has changed.
                    </Notice>
                ) : (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <Badge tone="warn">{exportRows.length} waiting</Badge>
                        <Badge tone={noUrl.length > 0 ? "danger" : "plain"}>
                            {noUrl.length} without image_url
                        </Badge>
                        <span className="text-xs text-muted">
                            {noUrl.length > 0
                                ? `those rows stay queued until the tenant fixes them: ${noUrl
                                      .slice(0, 8)
                                      .map((r) => r.external_id)
                                      .join(", ")}${noUrl.length > 8 ? "…" : ""}`
                                : "every row has a usable image URL"}
                        </span>
                        {exportMsg && <span className="text-xs text-ok">{exportMsg}</span>}
                    </div>
                )}
            </Card>

            {/* ----------------------------------------------------- 2 · merge */}
            <Card title="Step 2 — upload the generated vectors">
                <p className="mb-3 text-sm text-muted">
                    CSV or JSON, matched by <code className="mono">external_id</code> — every vector
                    must be {VECTOR_DIM} finite numbers (the contract is documented in{" "}
                    <code className="mono">src/lib/embeddings.ts</code>). Re-uploading the same file
                    is safe: rows are upserted, never duplicated.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                    <input
                        type="file"
                        accept=".csv,.json,text/csv,application/json"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onFile(f);
                        }}
                        className="text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-sunken file:px-3 file:py-1.5 file:text-sm file:text-ink"
                    />
                    {parsed && (
                        <span className="text-sm text-muted">
                            {fileName}: {parsed.rows.length} usable ({parsed.format.toUpperCase()})
                        </span>
                    )}
                </div>

                {error && (
                    <div className="mt-3">
                        <Notice tone="error">{error}</Notice>
                    </div>
                )}

                {parsed && (
                    <div className="mt-4 grid gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <Badge tone={parsed.rows.length > 0 ? "ok" : "danger"}>
                                {parsed.rows.length} ready
                            </Badge>
                            {parsed.errors.length > 0 && (
                                <Badge tone="warn">{parsed.errors.length} problems</Badge>
                            )}
                            {parsed.duplicates.length > 0 && (
                                <Badge tone="warn">{parsed.duplicates.length} duplicate ids</Badge>
                            )}
                            <Button
                                variant="primary"
                                size="sm"
                                busy={merging}
                                disabled={parsed.rows.length === 0}
                                onClick={merge}
                            >
                                {merging
                                    ? `merging ${progress.sent}/${progress.total}…`
                                    : `Merge ${parsed.rows.length} vector(s) into the catalog`}
                            </Button>
                        </div>

                        {parsed.errors.length > 0 && (
                            <ul className="max-h-40 overflow-y-auto rounded-xl border border-line bg-sunken/60 p-3 text-xs text-danger">
                                {parsed.errors.slice(0, 50).map((e, i) => (
                                    <li key={i}>
                                        line {e.line}: {e.reason}
                                    </li>
                                ))}
                                {parsed.errors.length > 50 && (
                                    <li>…and {parsed.errors.length - 50} more</li>
                                )}
                            </ul>
                        )}

                        {merging && (
                            <div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-sunken">
                                    <div
                                        className="h-full rounded-full bg-gold transition-all"
                                        style={{
                                            width: `${
                                                progress.total === 0
                                                    ? 0
                                                    : Math.round((progress.sent / progress.total) * 100)
                                            }%`,
                                        }}
                                    />
                                </div>
                                <p className="mt-1 text-xs text-muted">
                                    do not close this tab — each batch is applied by id
                                </p>
                            </div>
                        )}

                        {outcome && (
                            <Notice tone={outcome.skipped.length === 0 ? "ok" : "error"}>
                                {outcome.merged.length} row(s) merged into the catalog
                                {outcome.skipped.length > 0
                                    ? `, ${outcome.skipped.length} skipped — see below.`
                                    : ". Search can use them now."}
                            </Notice>
                        )}

                        {outcome && outcome.skipped.length > 0 && (
                            <ul className="max-h-40 overflow-y-auto text-xs text-danger">
                                {outcome.skipped.slice(0, 50).map((s, i) => (
                                    <li key={i}>
                                        {s.external_id ?? "(row)"}: {s.reason}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
}

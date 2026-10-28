// lib/embeddings.ts — THE FILE CONTRACT between your Colab run and this
// dashboard. Parses the generated embeddings file and rejects anything the
// database would reject, in the browser, before a single row is touched.
//
//   Accepted formats (auto-detected, UTF-8, header case-insensitive):
//
//   CSV  — two columns matter, names are matched against aliases:
//          id column   : external_id | id | sku
//          vec column  : embedding | embeddings | vector | vectors | embedding_json
//          the vector cell may be either a JSON array  [0.01, -0.02, ...]
//          or plain numbers separated by spaces/commas  0.01 -0.02 ...
//          rows:  external_id,embedding
//                 1,"[0.01,0.02,...]"
//
//   JSON — any of:
//          [{"external_id":"1","embedding":[...]}, ...]
//          {"1":[...], "2":[...]}                 (id -> vector map)
//
//   Every vector must be exactly VECTOR_DIM (512) finite numbers — the same
//   dimension as products.embedding (p_embedding_dim) and the encoder output.
//   Bad rows are collected as errors with their line number; nothing is
//   silently dropped, and you see the whole report before uploading.
//
//   Ordering does NOT matter: rows are matched to queued catalog rows (and
//   to products flagged needs_reembed) by external_id, server-side.

import { parseCsv } from "./csv";

export const VECTOR_DIM = 512;

export interface VectorRow {
    external_id: string;
    embedding: number[];
}

export interface VectorParseError {
    /** 1-based line in the source file (header counts as line 1). */
    line: number;
    reason: string;
}

export interface VectorParse {
    rows: VectorRow[];
    errors: VectorParseError[];
    /** ids that appear more than once (last one wins — reported anyway). */
    duplicates: string[];
    /** how many rows had a vector of the wrong length / unparseable cells */
    badVectors: number;
    format: "csv" | "json";
}

const ID_HEADERS = ["external_id", "id", "sku"];
const VEC_HEADERS = ["embedding", "embeddings", "vector", "vectors", "embedding_json"];

/** "…[1,2,3]…" / "1 2 3" / "1,2,3" -> [1,2,3]; null when any token is not a
 *  finite number. */
function toVector(cell: string): number[] | null {
    const cleaned = cell.trim().replace(/^\[|\]$/g, "");
    if (cleaned === "") return null;
    const parts = cleaned.split(/[\s,;]+/).filter((p) => p !== "");
    const out: number[] = [];
    for (const p of parts) {
        const n = Number(p);
        if (!Number.isFinite(n)) return null;
        out.push(n);
    }
    return out;
}

function pushRow(
    acc: VectorParse,
    seen: Set<string>,
    line: number,
    externalId: string,
    vector: number[] | null,
): void {
    if (!externalId) {
        acc.errors.push({ line, reason: "empty external_id" });
        return;
    }
    if (vector === null) {
        acc.badVectors++;
        acc.errors.push({ line, reason: `id ${externalId}: embedding cell is not a list of numbers` });
        return;
    }
    if (vector.length !== VECTOR_DIM) {
        acc.badVectors++;
        acc.errors.push({
            line,
            reason: `id ${externalId}: ${vector.length} numbers, expected ${VECTOR_DIM}`,
        });
        return;
    }
    if (seen.has(externalId)) acc.duplicates.push(externalId);
    seen.add(externalId);
    acc.rows.push({ external_id: externalId, embedding: vector });
}

/** Parse the file the pipeline produced. Never throws: the report always
 *  comes back with rows + errors so the UI can show what will be uploaded. */
export function parseEmbeddingsFile(text: string): VectorParse {
    const acc: VectorParse = { rows: [], errors: [], duplicates: [], badVectors: 0, format: "csv" };
    const seen = new Set<string>();
    const trimmed = text.trim();

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        acc.format = "json";
        let data: unknown;
        try {
            data = JSON.parse(trimmed);
        } catch (e) {
            acc.errors.push({ line: 1, reason: `not valid JSON: ${e instanceof Error ? e.message : String(e)}` });
            return acc;
        }

        if (Array.isArray(data)) {
            data.forEach((item, i) => {
                const rec = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
                const id = ["external_id", "id", "sku"]
                    .map((k) => rec[k])
                    .find((v) => typeof v === "string" && v.trim() !== "");
                const vec = rec.embedding ?? rec.vector ?? rec.embeddings;
                if (typeof id !== "string") {
                    acc.errors.push({ line: i + 1, reason: "no external_id/id/sku field" });
                    return;
                }
                pushRow(acc, seen, i + 1, id.trim(), Array.isArray(vec) ? (vec as number[]).map(Number) : null);
            });
        } else if (typeof data === "object" && data !== null) {
            Object.entries(data as Record<string, unknown>).forEach(([id, vec], i) => {
                pushRow(acc, seen, i + 1, id, Array.isArray(vec) ? (vec as number[]).map(Number) : null);
            });
        } else {
            acc.errors.push({ line: 1, reason: "JSON must be an array of rows or an id -> vector object" });
        }
        return acc;
    }

    const { headers, rows } = parseCsv(trimmed);
    const idIdx = ID_HEADERS.map((h) => headers.indexOf(h)).find((i) => i >= 0);
    const vecIdx = VEC_HEADERS.map((h) => headers.indexOf(h)).find((i) => i >= 0);
    if (idIdx === undefined || vecIdx === undefined) {
        acc.errors.push({
            line: 1,
            reason:
                `CSV needs an id column (${ID_HEADERS.join("/")})` +
                (idIdx === undefined ? "" : "") +
                (vecIdx === undefined
                    ? ` and an embedding column (${VEC_HEADERS.join("/")}) — found: ${headers.join(", ") || "no header"}`
                    : ""),
        });
        return acc;
    }

    rows.forEach((cells, i) => {
        const id = (cells[idIdx] ?? "").trim();
        const vecCell = cells[vecIdx] ?? "";
        if (!cells.some((c) => c.trim() !== "")) return; // blank line: ignored, not an error
        pushRow(acc, seen, i + 2, id, toVector(vecCell));
    });
    return acc;
}

/** Split into server-sized batches (this UI sends 64 per merge call —
 *  ~0.6 MB, comfortably under the server's 8 MB body cap and any ingress limit). */
export function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

// lib/csv.ts — minimal RFC-4180-ish CSV parser for the import wizard.
// Handles quoted fields, escaped quotes (""), commas and CRLF/newlines.
// The first non-empty row is treated as the header.

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    const pushField = () => {
        row.push(field);
        field = "";
    };
    const pushRow = () => {
        pushField();
        if (!(row.length === 1 && row[0] === "")) rows.push(row);
        row = [];
    };

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            pushField();
        } else if (c === "\n") {
            pushRow();
        } else if (c === "\r") {
            // ignore; \r\n collapses via the \n branch
        } else {
            field += c;
        }
    }
    if (field !== "" || row.length > 0) pushRow();

    const headerRow = rows.shift() ?? [];
    const headers = headerRow.map((h) => h.trim().toLowerCase());
    return { headers, rows };
}

/* ============================== writing CSV =============================== */
// Export helpers for the dashboard's own tables (usage report, product list).
// RFC-4180 quoting: a cell containing a comma, quote or newline is quoted, and
// a literal quote is doubled. A UTF-8 BOM is prepended so Excel opens Indian
// product names in Devanagari instead of question marks.

export function csvCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    const s = Array.isArray(value) ? value.join("; ") : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
    const lines = [headers.map(csvCell).join(",")];
    for (const row of rows) lines.push(row.map(csvCell).join(","));
    return lines.join("\r\n") + "\r\n";
}

/** Build the file and hand it to the browser. Static export friendly: no
 * server, no dependency, nothing leaves the page. */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
    const blob = new Blob(["\uFEFF" + toCsv(headers, rows)], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

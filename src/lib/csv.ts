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

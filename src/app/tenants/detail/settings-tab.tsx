"use client";

import { useState } from "react";
import { ApiError, adminFetch } from "@/lib/api";
import type { Tenant, TenantSettings } from "@/lib/types";

interface Props {
    tenant: Tenant;
    onUpdated: () => void;
}

interface ComboRow {
    occasion: string;
    sections: string; // comma-separated, edited as text
}

function rowsFromSettings(s: TenantSettings): ComboRow[] {
    return Object.entries(s.combos ?? {}).map(([occasion, sections]) => ({
        occasion,
        sections: sections.join(", "),
    }));
}

export default function SettingsTab({ tenant, onUpdated }: Props) {
    const [name, setName] = useState(tenant.name);
    const [website, setWebsite] = useState(tenant.website_url ?? "");
    const [currency, setCurrency] = useState(tenant.settings.currency ?? "");
    const [minSim, setMinSim] = useState(String(tenant.settings.min_similarity));
    const [limit, setLimit] = useState(String(tenant.settings.default_limit));
    const [rate, setRate] = useState(String(tenant.settings.rate_limit_per_min));
    const [combos, setCombos] = useState<ComboRow[]>(rowsFromSettings(tenant.settings));
    const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const [busy, setBusy] = useState(false);

    function setRow(i: number, patch: Partial<ComboRow>) {
        setCombos((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    }

    async function save(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const combosObj: Record<string, string[]> = {};
        for (const row of combos) {
            const occasion = row.occasion.trim().toLowerCase().replace(/[\s-]+/g, "_");
            if (!occasion) continue;
            combosObj[occasion] = row.sections
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean);
        }
        try {
            await adminFetch("/admin_tenants", {
                method: "PATCH",
                body: {
                    id: tenant.id,
                    name,
                    website_url: website === "" ? null : website,
                    settings: {
                        ...(currency ? { currency } : {}),
                        min_similarity: Number(minSim),
                        default_limit: Number(limit),
                        rate_limit_per_min: Number(rate),
                        combos: combosObj,
                    },
                },
            });
            setMsg({ kind: "ok", text: "saved" });
            onUpdated();
        } catch (e) {
            setMsg({
                kind: "err",
                text: e instanceof ApiError ? `${e.message}${e.requestId ? ` — ${e.requestId}` : ""}` : String(e),
            });
        } finally {
            setBusy(false);
        }
    }

    async function toggleStatus() {
        setBusy(true);
        setMsg(null);
        try {
            await adminFetch("/admin_tenants", {
                method: "PATCH",
                body: { id: tenant.id, status: tenant.status === "active" ? "suspended" : "active" },
            });
            setMsg({ kind: "ok", text: tenant.status === "active" ? "tenant suspended" : "tenant reactivated" });
            onUpdated();
        } catch (e) {
            setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={save} className="grid max-w-3xl gap-5">
            <section className="rounded border border-line bg-panel p-4">
                <h2 className="mb-3 font-medium">Profile</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                        name
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
                        />
                    </label>
                    <label className="text-sm">
                        website
                        <input
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="https://…"
                            className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
                        />
                    </label>
                </div>
                <div className="mt-3 flex items-center gap-3 text-sm">
                    <span>
                        status: <strong>{tenant.status}</strong>
                    </span>
                    <button
                        type="button"
                        onClick={toggleStatus}
                        disabled={busy}
                        className="rounded border border-line px-2 py-1 text-xs hover:bg-panel/5 disabled:opacity-50"
                    >
                        {tenant.status === "active" ? "Suspend tenant" : "Reactivate tenant"}
                    </button>
                    <span className="text-xs text-muted/70">suspended tenants get 403 on every API call</span>
                </div>
            </section>

            <section className="rounded border border-line bg-panel p-4">
                <h2 className="mb-3 font-medium">API defaults</h2>
                <div className="grid gap-3 sm:grid-cols-4">
                    <label className="text-sm">
                        currency
                        <input
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            placeholder="INR"
                            maxLength={8}
                            className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
                        />
                    </label>
                    <label className="text-sm">
                        min_similarity (0–1)
                        <input
                            value={minSim}
                            onChange={(e) => setMinSim(e.target.value)}
                            inputMode="decimal"
                            className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
                        />
                    </label>
                    <label className="text-sm">
                        default_limit (1–50)
                        <input
                            value={limit}
                            onChange={(e) => setLimit(e.target.value)}
                            inputMode="numeric"
                            className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
                        />
                    </label>
                    <label className="text-sm">
                        rate_limit_per_min
                        <input
                            value={rate}
                            onChange={(e) => setRate(e.target.value)}
                            inputMode="numeric"
                            className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
                        />
                    </label>
                </div>
            </section>

            <section className="rounded border border-line bg-panel p-4">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-medium">Combo recipes</h2>
                    <button
                        type="button"
                        onClick={() => setCombos((rows) => [...rows, { occasion: "", sections: "" }])}
                        className="rounded border border-line px-2 py-1 text-xs hover:bg-panel/5"
                    >
                        + occasion
                    </button>
                </div>
                <p className="mb-3 text-xs text-muted">
                    occasion → ordered sections. Valid sections: top, bottom, dress, saree, blouse, dupatta,
                    outerwear, footwear, bag, jewellery, accessory. The server rejects invalid recipes.
                </p>
                <div className="grid gap-2">
                    {combos.map((row, i) => (
                        <div key={i} className="flex gap-2">
                            <input
                                value={row.occasion}
                                onChange={(e) => setRow(i, { occasion: e.target.value })}
                                placeholder="office"
                                className="w-40 rounded border border-line px-2 py-1.5 font-mono text-sm"
                            />
                            <input
                                value={row.sections}
                                onChange={(e) => setRow(i, { sections: e.target.value })}
                                placeholder="top, bottom, accessory"
                                className="flex-1 rounded border border-line px-2 py-1.5 font-mono text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setCombos((rows) => rows.filter((_, idx) => idx !== i))}
                                className="rounded border border-line px-2 text-xs text-muted hover:bg-panel/5"
                                aria-label="remove recipe"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    {combos.length === 0 && <p className="text-sm text-muted/70">no recipes — add one</p>}
                </div>
            </section>

            <div className="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded bg-gold text-bg px-4 py-2 text-sm font-medium text-bg hover:bg-[#c99b5a] disabled:opacity-50"
                >
                    {busy ? "Saving…" : "Save changes"}
                </button>
                {msg && (
                    <span className={`text-sm ${msg.kind === "ok" ? "text-ok" : "text-danger"}`}>
                        {msg.text}
                    </span>
                )}
            </div>
        </form>
    );
}

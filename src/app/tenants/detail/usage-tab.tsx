"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, adminFetch } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { Tenant, UsageReport } from "@/lib/types";
import {
    Button,
    Card,
    ColumnChart,
    Empty,
    Loading,
    Notice,
    RankBars,
    Stat,
    TableWrap,
} from "@/components/ui";

const RANGES = [7, 30, 90] as const;

/**
 * Usage for one tenant: a range switch, a daily column chart, and the two
 * tables an owner actually audits — per endpoint (with status-code splits)
 * and per key. Both tables export to CSV so a billing conversation never
 * starts with "can you send me the numbers?".
 */
export default function UsageTab({ tenant }: { tenant: Tenant }) {
    const [days, setDays] = useState<(typeof RANGES)[number]>(30);
    const [data, setData] = useState<UsageReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [exported, setExported] = useState<string | null>(null);

    const load = useCallback(() => {
        adminFetch<UsageReport>(`/admin_usage?tenant_id=${tenant.id}&days=${days}`)
            .then((d) => {
                setData(d);
                setError(null);
            })
            .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    }, [tenant.id, days]);

    useEffect(() => {
        load();
    }, [load]);

    function exportUsage() {
        if (!data) return;
        downloadCsv(
            `usage-${tenant.slug}-${days}d`,
            ["day", "calls"],
            data.by_day.map((d) => [d.day, d.calls]),
        );
        setExported("by-day");
        window.setTimeout(() => setExported(null), 2500);
    }

    function exportEndpoints() {
        if (!data) return;
        downloadCsv(
            `usage-by-endpoint-${tenant.slug}-${days}d`,
            ["endpoint", "calls", "units", "codes"],
            data.by_endpoint.map((e) => [
                e.endpoint,
                e.calls,
                e.units,
                Object.entries(e.codes ?? {})
                    .map(([code, n]) => `${code}:${n}`)
                    .join(" "),
            ]),
        );
        setExported("by-endpoint");
        window.setTimeout(() => setExported(null), 2500);
    }

    if (error) return <Notice tone="error">{error}</Notice>;
    if (!data) return <Loading label="Loading usage…" />;

    const rangeSwitch = (
        <div className="flex gap-1 rounded-full border border-line p-1">
            {RANGES.map((r) => (
                <button
                    key={r}
                    onClick={() => setDays(r)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                        days === r ? "bg-gold text-bg" : "text-muted hover:text-ink"
                    }`}
                >
                    {r}d
                </button>
            ))}
        </div>
    );

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                {rangeSwitch}
                <div className="flex items-center gap-2">
                    {exported && <span className="text-xs text-ok">downloaded {exported}.csv</span>}
                    <Button size="sm" onClick={exportUsage} disabled={data.by_day.length === 0}>
                        Export daily CSV
                    </Button>
                    <Button size="sm" onClick={exportEndpoints} disabled={data.by_endpoint.length === 0}>
                        Export endpoints CSV
                    </Button>
                </div>
            </div>

            {data.truncated && (
                <Notice>
                    This range was truncated server-side — the totals are a floor, not the full picture.
                </Notice>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label={`Calls · ${days}d`} value={data.totals.calls.toLocaleString()} />
                <Stat label="Units metered" value={data.totals.units.toLocaleString()} />
                <Stat label="Endpoints used" value={data.by_endpoint.length} />
                <Stat label="Keys with traffic" value={data.by_key.length} />
            </div>

            <Card title={`Daily calls — last ${days} days`}>
                <ColumnChart
                    data={data.by_day.map((d) => ({
                        label: d.day.slice(5),
                        value: d.calls,
                    }))}
                />
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
                <Card title="By endpoint">
                    {data.by_endpoint.length === 0 ? (
                        <Empty title="No calls yet" hint="Calls appear as soon as this tenant's keys are used against the public API." />
                    ) : (
                        <div className="flex flex-col gap-5">
                            <RankBars
                                data={data.by_endpoint.map((e) => ({ label: e.endpoint, value: e.calls }))}
                            />
                            <TableWrap>
                                <thead>
                                    <tr>
                                        <th>Endpoint</th>
                                        <th>Calls</th>
                                        <th>Units</th>
                                        <th>Codes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.by_endpoint.map((e) => (
                                        <tr key={e.endpoint}>
                                            <td className="mono text-xs">{e.endpoint}</td>
                                            <td>{e.calls.toLocaleString()}</td>
                                            <td>{e.units.toLocaleString()}</td>
                                            <td className="mono text-xs text-muted">
                                                {Object.entries(e.codes ?? {})
                                                    .map(([code, n]) => `${code}:${n}`)
                                                    .join("  ") || "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </TableWrap>
                        </div>
                    )}
                </Card>

                <Card title="By key">
                    {data.by_key.length === 0 ? (
                        <Empty title="No key has been used yet" hint="Issue a key from the Keys tab, then call the API with it." />
                    ) : (
                        <TableWrap>
                            <thead>
                                <tr>
                                    <th>Key</th>
                                    <th>Environment</th>
                                    <th>Calls</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.by_key.map((k) => (
                                    <tr key={k.key_id}>
                                        <td className="mono text-xs">{k.prefix}…</td>
                                        <td>
                                            <span
                                                className={`badge badge-${
                                                    k.environment === "live" ? "ok" : "plain"
                                                }`}
                                            >
                                                {k.environment}
                                            </span>
                                        </td>
                                        <td>{k.calls.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableWrap>
                    )}
                </Card>
            </div>
        </div>
    );
}

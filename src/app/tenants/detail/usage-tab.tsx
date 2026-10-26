"use client";

import { useEffect, useState } from "react";
import { ApiError, adminFetch } from "@/lib/api";
import type { Tenant, UsageReport } from "@/lib/types";

export default function UsageTab({ tenant }: { tenant: Tenant }) {
    const [days, setDays] = useState(7);
    const [data, setData] = useState<UsageReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        adminFetch<UsageReport>(`/admin_usage?tenant_id=${tenant.id}&days=${days}`)
            .then((d) => {
                setData(d);
                setError(null);
            })
            .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    }, [tenant.id, days]);

    const maxDay = Math.max(1, ...(data?.by_day.map((d) => d.calls) ?? [1]));

    return (
        <div className="grid max-w-4xl gap-5">
            <div className="flex items-center gap-3">
                <h2 className="font-medium">Usage</h2>
                <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                >
                    <option value={7}>last 7 days</option>
                    <option value={30}>last 30 days</option>
                    <option value={90}>last 90 days</option>
                </select>
                {data?.truncated && (
                    <span className="text-xs text-amber-700">showing the latest 10,000 events only</span>
                )}
            </div>

            {error && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            {!data && !error && <p className="text-sm text-slate-500">loading…</p>}

            {data && (
                <>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="rounded border border-slate-200 bg-white p-4">
                            <p className="text-xs uppercase text-slate-500">API calls</p>
                            <p className="text-2xl font-semibold">{data.totals.calls}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-4">
                            <p className="text-xs uppercase text-slate-500">Metered units</p>
                            <p className="text-2xl font-semibold">{data.totals.units}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-4">
                            <p className="text-xs uppercase text-slate-500">Keys seen</p>
                            <p className="text-2xl font-semibold">{data.by_key.length}</p>
                        </div>
                    </div>

                    <section className="rounded border border-slate-200 bg-white p-4">
                        <h3 className="mb-3 font-medium">Calls per day</h3>
                        <div className="flex h-28 items-end gap-1">
                            {data.by_day.length === 0 && (
                                <p className="text-sm text-slate-400">no calls in this window</p>
                            )}
                            {data.by_day.map((d) => (
                                <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
                                    <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100">
                                        {d.calls}
                                    </span>
                                    <div
                                        className="w-full rounded-t bg-blue-500"
                                        style={{ height: `${Math.max(4, (d.calls / maxDay) * 80)}px` }}
                                        title={`${d.day}: ${d.calls}`}
                                    />
                                    <span className="text-[9px] text-slate-400">{d.day.slice(5)}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <section className="rounded border border-slate-200 bg-white">
                            <h3 className="border-b border-slate-200 px-4 py-3 font-medium">By endpoint</h3>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase text-slate-500">
                                        <th className="px-4 py-2">Endpoint</th>
                                        <th className="px-4 py-2">Calls</th>
                                        <th className="px-4 py-2">Status codes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.by_endpoint.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-4 text-slate-400">
                                                nothing yet
                                            </td>
                                        </tr>
                                    )}
                                    {data.by_endpoint.map((e) => (
                                        <tr key={e.endpoint} className="border-t border-slate-100">
                                            <td className="px-4 py-2 font-mono text-xs">{e.endpoint}</td>
                                            <td className="px-4 py-2">{e.calls}</td>
                                            <td className="px-4 py-2 font-mono text-xs text-slate-500">
                                                {Object.entries(e.codes)
                                                    .map(([code, n]) => `${code}×${n}`)
                                                    .join("  ")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>

                        <section className="rounded border border-slate-200 bg-white">
                            <h3 className="border-b border-slate-200 px-4 py-3 font-medium">By key</h3>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase text-slate-500">
                                        <th className="px-4 py-2">Key</th>
                                        <th className="px-4 py-2">Env</th>
                                        <th className="px-4 py-2">Calls</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.by_key.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-4 text-slate-400">
                                                nothing yet
                                            </td>
                                        </tr>
                                    )}
                                    {data.by_key.map((k) => (
                                        <tr key={k.key_id} className="border-t border-slate-100">
                                            <td className="px-4 py-2 font-mono text-xs">{k.prefix}</td>
                                            <td className="px-4 py-2 text-xs">{k.environment}</td>
                                            <td className="px-4 py-2">{k.calls}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}

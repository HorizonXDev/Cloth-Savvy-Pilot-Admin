"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, adminFetch, clearToken, getToken } from "@/lib/api";
import type { HealthReport } from "@/lib/types";

function Badge({ status }: { status: string }) {
    const ok = status === "ok";
    return (
        <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
            }`}
        >
            {status}
        </span>
    );
}

export default function HealthPage() {
    const router = useRouter();
    const [data, setData] = useState<HealthReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!getToken()) {
            router.replace("/login");
            return;
        }
        adminFetch<HealthReport>("/admin_catalog?op=health")
            .then(setData)
            .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    }, [router]);

    return (
        <main className="mx-auto max-w-3xl p-6">
            <nav className="mb-4 flex gap-4 text-sm">
                <Link href="/tenants" className="text-blue-600 hover:underline">
                    ← Tenants
                </Link>
                <button
                    onClick={() => {
                        clearToken();
                        router.replace("/login");
                    }}
                    className="ml-auto text-slate-500 hover:underline"
                >
                    sign out
                </button>
            </nav>
            <h1 className="mb-4 text-xl font-semibold">System health</h1>
            {error && <p className="text-sm text-red-700">{error}</p>}
            {!data && !error && <p className="text-sm text-slate-500">loading…</p>}
            {data && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded border border-slate-200 bg-white p-4">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-medium">Overall</span>
                            <Badge status={data.status} />
                        </div>
                        <p className="text-xs text-slate-500">{data.latency_ms} ms</p>
                    </div>
                    <div className="rounded border border-slate-200 bg-white p-4">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-medium">Database</span>
                            <Badge status={data.database.status} />
                        </div>
                        {data.database.detail && (
                            <p className="text-xs text-slate-500">{data.database.detail}</p>
                        )}
                    </div>
                    <div className="rounded border border-slate-200 bg-white p-4">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-medium">Encoder</span>
                            <Badge status={data.encoder.status} />
                        </div>
                        <p className="text-xs text-slate-500">
                            {data.encoder.latency_ms} ms
                            {data.encoder.model ? ` · ${data.encoder.model}` : ""}
                            {data.encoder.revision ? ` · ${data.encoder.revision.slice(0, 12)}` : ""}
                        </p>
                        {data.encoder.detail && (
                            <p className="mt-1 text-xs text-amber-700">{data.encoder.detail}</p>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}

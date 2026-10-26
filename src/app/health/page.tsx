"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, adminFetch } from "@/lib/api";
import type { HealthReport } from "@/lib/types";
import { Badge, Button, Card, Loading, Notice, PageTitle, Stat } from "@/components/ui";

function Dependency({
    name,
    status,
    latency,
    detail,
    extra,
}: {
    name: string;
    status: "ok" | "degraded" | string;
    latency?: number;
    detail?: string;
    extra?: React.ReactNode;
}) {
    const ok = status === "ok";
    return (
        <Card
            title={name}
            actions={<Badge tone={ok ? "ok" : "danger"}>{status}</Badge>}
        >
            <dl className="flex flex-col gap-2 text-sm">
                {latency !== undefined && (
                    <div className="flex justify-between gap-3">
                        <dt className="text-muted">round trip</dt>
                        <dd className="mono">{latency} ms</dd>
                    </div>
                )}
                {detail && (
                    <div className="flex justify-between gap-3">
                        <dt className="text-muted">detail</dt>
                        <dd className="mono text-xs">{detail}</dd>
                    </div>
                )}
                {extra}
            </dl>
        </Card>
    );
}

export default function HealthPage() {
    const [data, setData] = useState<HealthReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [checkedAt, setCheckedAt] = useState<string>("");

    const load = useCallback(() => {
        adminFetch<HealthReport>("/admin_catalog?op=health")
            .then((d) => {
                setData(d);
                setError(null);
                setCheckedAt(new Date().toLocaleTimeString());
            })
            .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <>
            <PageTitle
                eyebrow="Platform"
                title="System health"
                actions={
                    <>
                        <Link href="/tenants" className="btn btn-ghost">
                            ← Tenants
                        </Link>
                        <Button variant="primary" onClick={load}>
                            Re-check
                        </Button>
                    </>
                }
            />

            {error && (
                <div className="mb-4">
                    <Notice tone="error">{error}</Notice>
                </div>
            )}

            {!data && !error && <Loading label="Checking the stack…" />}

            {data && (
                <div className="flex flex-col gap-5">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Stat
                            label="Overall"
                            value={
                                <span className={data.status === "ok" ? "text-ok" : "text-danger"}>
                                    {data.status}
                                </span>
                            }
                            hint={checkedAt ? `checked ${checkedAt}` : undefined}
                        />
                        <Stat label="API round trip" value={`${data.latency_ms} ms`} />
                        <Stat
                            label="Encoder model"
                            value={
                                <span className="mono text-base">
                                    {data.encoder.model ?? "—"}
                                </span>
                            }
                            hint={data.encoder.revision ? `revision ${data.encoder.revision.slice(0, 7)}` : undefined}
                        />
                    </div>

                    <div className="grid gap-5 lg:grid-cols-2">
                        <Dependency
                            name="Database"
                            status={data.database.status}
                            detail={data.database.detail}
                        />
                        <Dependency
                            name="Encoder"
                            status={data.encoder.status}
                            latency={data.encoder.latency_ms}
                            detail={data.encoder.detail}
                        />
                    </div>

                    <Card title="What this page proves">
                        <p className="text-sm leading-relaxed text-muted">
                            Database is a real round trip to the project&apos;s Postgres through the
                            Data API; the encoder check hits the live text-encoder service and reports
                            the model + revision it would embed with — the same string every tenant&apos;s{" "}
                            <span className="mono text-ink">embedding_model</span> is validated against.
                            A <span className="text-danger">degraded</span> encoder means searches and
                            combos will answer <span className="mono text-ink">503 upstream_encoder</span>{" "}
                            rather than quietly returning wrong vectors.
                        </p>
                    </Card>
                </div>
            )}
        </>
    );
}

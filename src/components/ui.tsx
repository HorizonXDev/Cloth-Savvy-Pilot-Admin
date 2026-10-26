// components/ui.tsx — the admin console's shared visual language.
//
// Every page composes these instead of re-deciding spacing, colour or state
// presentation: one card, one button family, one table, one empty state.
// Kept dependency-free (no component library) so both dashboards can carry an
// identical copy — they are separate projects on separate origins by design.

import type { ReactNode } from "react";

/* ---------------------------------- layout --------------------------------- */

export function Card({
    title,
    actions,
    children,
    className = "",
}: {
    title?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={`card card-pad ${className}`}>
            {(title !== undefined || actions !== undefined) && (
                <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    {typeof title === "string" ? (
                        <h2 className="display text-xl">{title}</h2>
                    ) : (
                        title
                    )}
                    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                </header>
            )}
            {children}
        </section>
    );
}

/** Serif page heading with an uppercase eyebrow above it. */
export function PageTitle({
    title,
    eyebrow,
    actions,
}: {
    title: string;
    eyebrow?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
                {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
                <h1 className="display text-3xl leading-tight sm:text-4xl">{title}</h1>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

/* --------------------------------- buttons --------------------------------- */

type BtnVariant = "primary" | "ghost" | "danger";

export function btnClass(variant: BtnVariant = "ghost", size?: "sm"): string {
    const v = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-ghost";
    return `btn ${v}${size === "sm" ? " btn-sm" : ""}`;
}

export function Button({
    variant = "ghost",
    size,
    busy,
    children,
    className = "",
    ...rest
}: {
    variant?: BtnVariant;
    size?: "sm";
    busy?: boolean;
    children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...rest}
            disabled={rest.disabled || busy}
            className={`${btnClass(variant, size)} ${className}`}
        >
            {busy ? "Working…" : children}
        </button>
    );
}

/* ---------------------------------- states --------------------------------- */

export function Badge({
    tone = "plain",
    children,
}: {
    tone?: "ok" | "warn" | "danger" | "plain";
    children: ReactNode;
}) {
    return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({
    tone = "plain",
    children,
}: {
    tone?: "ok" | "error" | "plain";
    children: ReactNode;
}) {
    return <p className={`notice notice-${tone}`}>{children}</p>;
}

export function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <label className="block">
            <span className="label">{label}</span>
            {children}
            {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
        </label>
    );
}

export function Empty({
    title,
    hint,
    action,
}: {
    title: string;
    hint?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 py-12 text-center">
            <div className="text-2xl">✦</div>
            <p className="display text-lg">{title}</p>
            {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
            {action}
        </div>
    );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
    return <p className="py-6 text-sm text-muted">{label}</p>;
}

/* ---------------------------------- stats ---------------------------------- */

export function Stat({
    label,
    value,
    hint,
}: {
    label: string;
    value: ReactNode;
    hint?: string;
}) {
    return (
        <div className="rounded-xl border border-line bg-sunken/60 px-4 py-3">
            <p className="eyebrow">{label}</p>
            <p className="display mt-1 text-2xl">{value}</p>
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
    );
}

/* ---------------------------------- charts --------------------------------- */

export interface BarDatum {
    label: string;
    value: number;
}

/**
 * Column chart in plain CSS — no chart dependency (the dashboards ship as a
 * static export, so a charting library would be a real cost for a bar row).
 * Values are also printed, so the chart never hides the number behind a hover.
 */
export function ColumnChart({
    data,
    height = 132,
    unit = "",
}: {
    data: BarDatum[];
    height?: number;
    unit?: string;
}) {
    if (data.length === 0) {
        return <p className="py-6 text-sm text-muted">No data in this range yet.</p>;
    }
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <div>
            <div className="flex items-end gap-1.5" style={{ height }}>
                {data.map((d) => (
                    <div
                        key={d.label}
                        className="group relative flex-1"
                        title={`${d.label}: ${d.value}${unit}`}
                        style={{ height: "100%" }}
                    >
                        <div className="absolute inset-x-0 bottom-0 flex h-full items-end">
                            <div
                                className="bar-fill w-full transition-all"
                                style={{
                                    height: `${Math.max(3, Math.round((d.value / max) * 100))}%`,
                                    opacity: d.value === 0 ? 0.25 : 1,
                                }}
                            />
                        </div>
                        <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-sunken px-1.5 py-0.5 text-[10px] text-ink group-hover:block">
                            {d.value}
                            {unit}
                        </span>
                    </div>
                ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted">
                <span>{data[0].label}</span>
                {data.length > 1 && <span>{data[data.length - 1].label}</span>}
            </div>
        </div>
    );
}

/** Horizontal ranking bars (endpoints, keys, sections…). */
export function RankBars({ data, unit = "" }: { data: BarDatum[]; unit?: string }) {
    if (data.length === 0) {
        return <p className="py-4 text-sm text-muted">Nothing recorded in this range.</p>;
    }
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <ul className="flex flex-col gap-2.5">
            {data.map((d) => (
                <li key={d.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                        <div className="mb-1 flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm">{d.label}</span>
                            <span className="mono text-xs text-muted">
                                {d.value.toLocaleString()}
                                {unit}
                            </span>
                        </div>
                        <div className="bar-track h-2">
                            <div
                                className="bar-fill"
                                style={{ width: `${Math.max(2, Math.round((d.value / max) * 100))}%` }}
                            />
                        </div>
                    </div>
                    <span className="sr-only">{`${d.value}${unit}`}</span>
                </li>
            ))}
        </ul>
    );
}

/* ---------------------------------- tables --------------------------------- */

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
    return <th className={className}>{children}</th>;
}

export function TableWrap({ children }: { children: ReactNode }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
            <table className="data-table">{children}</table>
        </div>
    );
}

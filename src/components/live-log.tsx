"use client";

// components/live-log.tsx — the floating live console (bottom-right).
// Streams everything pushed to lib/log.ts: every HTTP call (with status,
// duration, request id) plus workflow stage markers, so you can watch the
// app work in real time and see exactly where a failure happened.

import { useEffect, useRef, useState } from "react";
import { clearLogs, formatLogTime, log, useLogEntries, type LogLevel } from "@/lib/log";

const LEVEL_CLASS: Record<LogLevel, string> = {
    info: "text-ink/80",
    ok: "text-ok",
    warn: "text-gold",
    error: "text-danger",
};

export default function LiveLog() {
    const entries = useLogEntries();
    const [open, setOpen] = useState(false);
    const [seen, setSeen] = useState(0);
    const [copied, setCopied] = useState(false);
    const bodyRef = useRef<HTMLDivElement>(null);

    // follow the tail on new lines, unless the user scrolled up to read
    useEffect(() => {
        if (!open) return;
        const el = bodyRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        if (nearBottom) el.scrollTop = el.scrollHeight;
    }, [entries, open]);

    function toggle() {
        setOpen((o) => {
            const next = !o;
            if (next) setSeen(entries.length);
            return next;
        });
    }

    async function copyAll() {
        const text = entries
            .map((e) => `${formatLogTime(e.at)} [${e.stage}] ${e.msg}`)
            .join("\n");
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            log("log", "clipboard write failed — select and copy from the panel", "warn");
        }
    }

    const unread = open ? 0 : entries.length - seen;

    return (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
            {open && (
                <div className="flex h-80 w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-sunken shadow-2xl">
                    <div className="flex items-center justify-between border-b border-line px-3 py-2">
                        <span className="eyebrow">live activity log</span>
                        <div className="flex gap-1">
                            <button onClick={copyAll} className="btn btn-ghost btn-sm">
                                {copied ? "copied" : "copy"}
                            </button>
                            <button onClick={() => clearLogs()} className="btn btn-ghost btn-sm">
                                clear
                            </button>
                            <button onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
                                ✕
                            </button>
                        </div>
                    </div>
                    <div
                        ref={bodyRef}
                        className="mono flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed"
                    >
                        {entries.length === 0 && (
                            <p className="text-muted">
                                nothing yet — every request and workflow stage appears here live
                            </p>
                        )}
                        {entries.map((e) => (
                            <div key={e.id} className="flex gap-2">
                                <span className="shrink-0 text-muted">{formatLogTime(e.at)}</span>
                                <span className="shrink-0 text-gold">{e.stage}</span>
                                <span className={LEVEL_CLASS[e.level]}>{e.msg}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <button
                onClick={toggle}
                className="btn btn-ghost btn-sm relative border border-line bg-sunken"
            >
                live log
                {unread > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-semibold text-bg">
                        {unread > 99 ? "99+" : unread}
                    </span>
                )}
            </button>
        </div>
    );
}

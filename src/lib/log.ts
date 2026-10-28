"use client";

// lib/log.ts — the admin console's live activity log.
//
// Every HTTP call (lib/api.ts instruments itself) and every workflow stage
// (export, parse, merge, …) pushes here; the floating <LiveLog/> console in
// the shell renders the stream in real time, so you always know what the app
// is doing, how long each call took and exactly where a failure happened.
//
// Rules: ring buffer of 500 entries, nothing leaves the browser tab, no
// secrets are ever logged (paths, statuses, timings, request ids only).

import { useSyncExternalStore } from "react";

export type LogLevel = "info" | "ok" | "warn" | "error";

export interface LogEntry {
    id: number;
    at: number; // epoch ms
    level: LogLevel;
    stage: string; // short tag: net, auth, export, parse, merge, tenants, …
    msg: string;
}

const MAX_ENTRIES = 500;
const EMPTY: LogEntry[] = [];

let entries: LogEntry[] = EMPTY;
let seq = 0;
const listeners = new Set<() => void>();

export function log(stage: string, msg: string, level: LogLevel = "info"): void {
    entries = [...entries, { id: ++seq, at: Date.now(), level, stage, msg }].slice(-MAX_ENTRIES);
    listeners.forEach((fn) => fn());
}

export function clearLogs(): void {
    entries = EMPTY;
    listeners.forEach((fn) => fn());
}

export function subscribeLogs(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** React binding: re-renders the console on every log line. */
export function useLogEntries(): LogEntry[] {
    return useSyncExternalStore(subscribeLogs, () => entries, () => EMPTY);
}

/** 14:03:22.481 — millisecond precision, because durations matter. */
export function formatLogTime(at: number): string {
    const d = new Date(at);
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** "1.2 MB" / "843 B" — for request/response sizes in the net log. */
export function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** "1.84 s" / "43 ms" — for call durations in the net log. */
export function formatMs(ms: number): string {
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

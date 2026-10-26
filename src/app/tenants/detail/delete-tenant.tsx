"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, adminFetch } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import { Button, Field, Notice } from "@/components/ui";

/**
 * Permanent tenant deletion, wired to the database's own contract.
 *
 * drop_tenant() (migrations 0007) refuses to run unless the tenant is
 * ALREADY SUSPENDED and the confirm slug matches exactly — isolation test
 * T12 proves both refusals against a live database, and admin test A13 proves
 * the same rules over HTTP. This dialog therefore does two things in order:
 *
 *   1. offers "Suspend first" when the tenant is live (a click that only
 *      flips status — reversible, and it is the same PATCH the settings tab
 *      uses), and
 *   2. demands the slug be typed out, which is what stops a muscle-memory
 *      Enter from destroying a catalogue.
 *
 * The button is never enabled on a technicality: wrong slug, live tenant, or
 * a request already in flight all keep it disabled.
 */
export default function DeleteTenant({
    tenant,
    onSuspended,
}: {
    tenant: Tenant;
    onSuspended: () => void;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

    const suspended = tenant.status === "suspended";
    const slugMatches = confirm.trim() === tenant.slug;

    async function suspendFirst() {
        setBusy(true);
        setMessage(null);
        try {
            await adminFetch("/admin_tenants", {
                method: "PATCH",
                body: { id: tenant.id, status: "suspended" },
            });
            onSuspended();
            setMessage({ tone: "ok", text: "Suspended. API calls now return 403 — you can delete it below." });
        } catch (e) {
            setMessage({
                tone: "error",
                text: e instanceof ApiError ? e.message : String(e),
            });
        } finally {
            setBusy(false);
        }
    }

    async function confirmDelete() {
        if (!slugMatches || !suspended) return;
        setBusy(true);
        setMessage(null);
        try {
            await adminFetch("/admin_tenants", {
                method: "DELETE",
                body: { id: tenant.id, confirm_slug: confirm.trim() },
            });
            router.replace("/tenants");
        } catch (e) {
            setMessage({
                tone: "error",
                text: e instanceof ApiError
                    ? `${e.message}${e.requestId ? ` (${e.requestId})` : ""}`
                    : String(e),
            });
            setBusy(false);
        }
    }

    if (!open) {
        return (
            <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
                Delete tenant
            </Button>
        );
    }

    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${tenant.name}`}
        >
            <div className="card w-full max-w-lg card-pad">
                <p className="eyebrow mb-1">Irreversible</p>
                <h2 className="display mb-3 text-2xl">Delete {tenant.name}</h2>

                <div className="notice notice-error mb-4">
                    <p className="mb-2">This removes, permanently:</p>
                    <ul className="list-inside list-disc space-y-0.5 text-sm">
                        <li>the tenant row and its product partition</li>
                        <li>every product (and its embeddings)</li>
                        <li>all usage events and metering history</li>
                        <li>every API key — live and sandbox</li>
                        <li>portal logins and staged uploads</li>
                        <li>settings, occasions and rate limits</li>
                    </ul>
                    <p className="mt-2 text-sm">There is no undo and no soft-delete afterwards.</p>
                </div>

                {message && (
                    <div className="mb-4">
                        <Notice tone={message.tone}>{message.text}</Notice>
                    </div>
                )}

                {!suspended ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-muted">
                            Step 1 — this tenant is <span className="text-warn">active</span>. It must be
                            suspended first: a live tenant is never dropped by accident.
                        </p>
                        <div className="flex gap-2">
                            <Button variant="primary" busy={busy} onClick={suspendFirst}>
                                Suspend {tenant.slug}
                            </Button>
                            <Button onClick={() => setOpen(false)}>Cancel</Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <Field
                            label={`Step 2 — type “${tenant.slug}” to confirm`}
                            hint="Exactly the slug, no quotes. The database re-checks this independently."
                        >
                            <input
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                placeholder={tenant.slug}
                                autoFocus
                                className="input font-mono"
                                autoComplete="off"
                            />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="danger"
                                busy={busy}
                                disabled={!slugMatches}
                                onClick={confirmDelete}
                            >
                                Permanently delete
                            </Button>
                            <Button onClick={() => setOpen(false)}>Cancel</Button>
                            {!slugMatches && confirm.length > 0 && (
                                <span className="self-center text-xs text-muted">
                                    slug does not match
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

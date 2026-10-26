"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, adminFetch } from "@/lib/api";
import type { Tenant, TenantUser } from "@/lib/types";

interface UserList {
    request_id: string;
    users: TenantUser[];
}

interface InviteResult {
    request_id: string;
    mode: "invite" | "password";
    email: string;
    user_id: string;
    message?: string;
    temporary_password?: string;
    warning?: string;
}

/** Portal-login management for THIS tenant: list, create (invite email or
 *  generated temp password shown once), revoke / reinstate / delete.
 *  These logins only ever grant access to this tenant's own portal. */
export default function UsersTab({ tenant }: { tenant: Tenant }) {
    const [users, setUsers] = useState<TenantUser[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState("");
    const [mode, setMode] = useState<"invite" | "password">("invite");
    const [busy, setBusy] = useState(false);
    const [created, setCreated] = useState<InviteResult | null>(null);

    const load = useCallback(() => {
        adminFetch<UserList>(`/admin_tenant_users?tenant_id=${tenant.id}`)
            .then((d) => {
                setUsers(d.users);
                setError(null);
            })
            .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    }, [tenant.id]);

    useEffect(load, [load]);

    async function invite(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) return;
        setBusy(true);
        setError(null);
        setCreated(null);
        try {
            const res = await adminFetch<InviteResult>("/admin_tenant_users", {
                method: "POST",
                body: { tenant_id: tenant.id, email: email.trim(), mode },
            });
            setCreated(res);
            setEmail("");
            load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    async function action(userId: string, act: "revoke" | "reinstate" | "delete") {
        const confirmations: Record<string, string> = {
            revoke: "Revoke this portal login? They lose access from their next request.",
            reinstate: "Restore this portal login?",
            delete:
                "Delete this portal user permanently (auth account + membership)? This cannot be undone.",
        };
        if (!confirm(confirmations[act])) return;
        setError(null);
        try {
            await adminFetch("/admin_tenant_users", {
                method: "PATCH",
                body: { tenant_id: tenant.id, user_id: userId, action: act },
            });
            load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : String(err));
        }
    }

    return (
        <div className="grid max-w-4xl gap-5">
            <p className="text-sm text-slate-500">
                Portal logins for <span className="font-medium text-slate-700">{tenant.name}</span> — each
                login sees only this tenant&apos;s portal (usage, keys, settings, catalog) and nothing else.
            </p>

            {error && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            {/* Show-once: the temp password lives only in this state. */}
            {created?.temporary_password && (
                <div className="rounded border border-amber-300 bg-amber-50 p-4">
                    <p className="mb-2 text-sm font-medium text-amber-900">
                        Portal login created for {created.email} — copy the temporary password now
                    </p>
                    <code className="block break-all rounded bg-white p-3 font-mono text-sm">
                        {created.temporary_password}
                    </code>
                    <p className="mt-2 text-xs text-amber-800">{created.warning}</p>
                    <button
                        onClick={() => {
                            navigator.clipboard?.writeText(created.temporary_password!).catch(() => {});
                        }}
                        className="mt-3 rounded bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
                    >
                        Copy
                    </button>
                    <button
                        onClick={() => setCreated(null)}
                        className="ml-2 rounded border border-amber-700 px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100"
                    >
                        I saved it — dismiss
                    </button>
                </div>
            )}
            {created?.message && !created.temporary_password && (
                <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                    {created.message} ({created.email})
                </p>
            )}

            <form onSubmit={invite} className="flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-white p-4">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="person@brand.com"
                    required
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "invite" | "password")}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                    <option value="invite">invite email (they set a password)</option>
                    <option value="password">temporary password (shown once)</option>
                </select>
                <button
                    type="submit"
                    disabled={busy}
                    className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                    {busy ? "Creating…" : "Create login"}
                </button>
            </form>

            <section className="rounded border border-slate-200 bg-white">
                <h2 className="border-b border-slate-200 px-4 py-3 font-medium">Portal logins</h2>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase text-slate-500">
                            <th className="px-4 py-2">Email</th>
                            <th className="px-4 py-2">Created</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-4 text-slate-400">
                                    no portal logins yet
                                </td>
                            </tr>
                        )}
                        {users.map((u) => (
                            <tr key={u.user_id} className="border-t border-slate-100">
                                <td className="px-4 py-2">{u.email}</td>
                                <td className="px-4 py-2 text-slate-500">
                                    {new Date(u.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-2">
                                    {u.revoked_at ? (
                                        <span className="text-xs text-red-600">revoked</span>
                                    ) : (
                                        <span className="text-xs text-green-700">active</span>
                                    )}
                                </td>
                                <td className="px-4 py-2 text-right">
                                    <span className="mr-2 inline-flex gap-2">
                                        {u.revoked_at ? (
                                            <button
                                                onClick={() => action(u.user_id, "reinstate")}
                                                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                                            >
                                                Reinstate
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => action(u.user_id, "revoke")}
                                                className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
                                            >
                                                Revoke
                                            </button>
                                        )}
                                        <button
                                            onClick={() => action(u.user_id, "delete")}
                                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                                        >
                                            Delete
                                        </button>
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}

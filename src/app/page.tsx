"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasSession } from "@/lib/api";

export default function Home() {
    const router = useRouter();
    useEffect(() => {
        let cancelled = false;
        hasSession().then((ok) => {
            if (!cancelled) router.replace(ok ? "/tenants" : "/login");
        });
        return () => {
            cancelled = true;
        };
    }, [router]);
    return (
        <main className="mx-auto max-w-3xl p-8 text-sm text-muted">Redirecting…</main>
    );
}

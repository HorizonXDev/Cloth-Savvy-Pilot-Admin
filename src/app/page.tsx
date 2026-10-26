"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

export default function Home() {
    const router = useRouter();
    useEffect(() => {
        router.replace(getToken() ? "/tenants" : "/login");
    }, [router]);
    return (
        <main className="mx-auto max-w-3xl p-8 text-sm text-muted">Redirecting…</main>
    );
}

// lib/types.ts — shapes returned by the admin_* functions (mirrors the
// server responses; fields are the ones the UI actually renders).

export interface TenantSettings {
    currency: string | null;
    min_similarity: number;
    default_limit: number;
    rate_limit_per_min: number;
    combos: Record<string, string[]>;
}

export interface Tenant {
    id: string;
    slug: string;
    name: string;
    website_url: string | null;
    status: "active" | "suspended";
    embedding_model: string;
    embedding_dim: number;
    settings: TenantSettings;
    created_at: string;
}

/** A portal login (tenant_users row) shown in the tenant-users tab. */
export interface TenantUser {
    id: string;
    user_id: string;
    email: string;
    created_at: string;
    created_by: string;
    revoked_at: string | null;
}

export interface ApiKeyRow {
    id: string;
    key_prefix: string | null;
    environment: "live" | "sandbox";
    label: string | null;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
}

export interface ProductRow {
    id: string;
    external_id: string;
    title: string;
    section: string;
    category: string | null;
    gender: string | null;
    colors: string[] | null;
    price: string | number | null;
    in_stock: boolean;
    product_url: string | null;
    image_url: string | null;
    status: "active" | "archived";
    source: string;
    attributes: Record<string, unknown>;
    needs_reembed: boolean;
    created_at: string;
    updated_at: string;
}

export interface IngestionRun {
    id: string;
    status: string;
    rows_total: number;
    rows_ok: number;
    rows_failed: number;
    started_at: string;
    finished_at: string | null;
    notes: string | null;
}

export interface UsageReport {
    days: number;
    from: string;
    totals: { calls: number; units: number };
    by_endpoint: Array<{ endpoint: string; calls: number; units: number; codes: Record<string, number> }>;
    by_key: Array<{ key_id: string; prefix: string; environment: string; calls: number }>;
    by_day: Array<{ day: string; calls: number }>;
    truncated: boolean;
}

export interface HealthReport {
    status: "ok" | "degraded";
    latency_ms: number;
    database: { status: "ok" | "degraded"; detail?: string };
    encoder: {
        status: "ok" | "degraded";
        latency_ms: number;
        model?: string;
        revision?: string;
        detail?: string;
    };
}

export interface SearchHit {
    section: string;
    similarity: number | null;
    product: {
        external_id: string;
        title: string;
        price: number | null;
        image_url: string | null;
        colors: string[];
        in_stock: boolean;
    };
}

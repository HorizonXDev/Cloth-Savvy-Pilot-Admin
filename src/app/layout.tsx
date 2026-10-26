import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Cloth Savvy Pilot — Dashboard",
    description: "Admin dashboard for the pilot B2B API (tenants, keys, catalog, usage)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}

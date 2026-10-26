import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Shell from "@/components/shell";

// Same three families as the marketing site (Cloth-Savvy-Web/layout.tsx), so
// the console reads as the same product rather than a different company.
const display = Cormorant_Garamond({
    variable: "--font-display",
    subsets: ["latin"],
    weight: ["300", "400", "500"],
    display: "swap",
});
const sans = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({
    variable: "--font-mono",
    subsets: ["latin"],
    weight: ["400", "500"],
    display: "swap",
});

export const metadata: Metadata = {
    title: "Cloth Savvy — Admin console",
    description: "Owner console for the Cloth Savvy pilot API (tenants, keys, catalog, usage)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
            <body>
                <Shell>{children}</Shell>
            </body>
        </html>
    );
}

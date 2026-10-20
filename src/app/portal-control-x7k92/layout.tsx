import type { Metadata } from "next";
export const metadata: Metadata = { title: "إدارة eStudy24", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";
export default function ControlLayout({ children }: { children: React.ReactNode }) { return children; }

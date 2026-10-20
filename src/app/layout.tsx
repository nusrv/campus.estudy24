import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "./globals.css";

export const metadata: Metadata = { metadataBase: new URL(process.env.SITE_URL || "https://campus.estudy24.com"), title: { default: "eStudy24 Campus — بوابتك للحياة الجامعية", template: "%s | eStudy24 Campus" }, description: "بوابة الحياة الجامعية من eStudy24: محتوى تعليمي، دليل الجامعات السعودية، وأخبار وبرامج وخدمات لكل جامعة.", openGraph: { siteName: "eStudy24 Campus", locale: "ar_SA", type: "website" } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}

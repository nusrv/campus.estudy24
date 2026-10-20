import type { MetadataRoute } from "next";
import { siteUrl } from "@/server/seo";
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: "*", allow: "/" }, sitemap: new URL("/sitemap.xml", siteUrl()).toString() }; }

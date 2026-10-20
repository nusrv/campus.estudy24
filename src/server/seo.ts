import "server-only";
export function siteUrl() { return new URL(process.env.SITE_URL || "https://campus.estudy24.com"); }
export const siteName = "eStudy24 Campus";

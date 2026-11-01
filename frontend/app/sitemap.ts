import type { MetadataRoute } from "next";

// Required for `output: export` (Cloudflare Pages builds).
export const dynamic = "force-static";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://queueless-web.onrender.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const routes: Array<{ path: string; priority: number; changeFrequency: "hourly" | "weekly" | "monthly" }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/opds", priority: 0.9, changeFrequency: "hourly" },
    { path: "/check-token", priority: 0.8, changeFrequency: "monthly" },
    { path: "/verify", priority: 0.6, changeFrequency: "monthly" },
    { path: "/register", priority: 0.6, changeFrequency: "monthly" },
    { path: "/login/patient", priority: 0.5, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
  ];

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

import type { MetadataRoute } from "next";

// Required for `output: export` (Cloudflare Pages builds).
export const dynamic = "force-static";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://queueless-web-4i0a.onrender.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Patient identity (OTP/token flows) and staff portals should not be
        // indexed; the public transparency pages are the SEO surface.
        disallow: ["/queue/", "/verify", "/register", "/doctor", "/hospital", "/admin", "/login"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

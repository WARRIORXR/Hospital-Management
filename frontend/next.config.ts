import type { NextConfig } from "next";

const isExport = process.env.STATIC_EXPORT === "true" || process.env.CF_PAGES === "1";

// GitHub Pages serves project sites from a subpath (/<repo>/) and only
// resolves directory URLs to their index.html, so the export needs a basePath
// and trailing slashes for every route.
const isGithubPages = process.env.GITHUB_PAGES === "true";
const REPO_NAME = "Hospital-Management";

const nextConfig: NextConfig = {
  ...(isExport ? { output: "export" as const } : {}),
  ...(isGithubPages
    ? { basePath: `/${REPO_NAME}`, trailingSlash: true }
    : {}),
  // The dev docs and .env.local reference the API and app via 127.0.0.1.
  // Without this, Next 16 blocks the /_next/hmr socket as "cross-origin"
  // for that host and React hydration silently dies (pages render their
  // SSR shell but never attach handlers — buttons, forms and fetches are
  // all dead). localhost is implicitly allowed.
  ...(isExport ? {} : { allowedDevOrigins: ["127.0.0.1"] }),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

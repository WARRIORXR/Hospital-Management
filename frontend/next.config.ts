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
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

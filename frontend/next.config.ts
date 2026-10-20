import type { NextConfig } from "next";

const isExport = process.env.STATIC_EXPORT === "true" || process.env.CF_PAGES === "1";

const nextConfig: NextConfig = {
  ...(isExport ? { output: "export" as const } : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

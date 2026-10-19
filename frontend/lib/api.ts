/**
 * Resolves the backend base URL for API requests.
 *
 * 1. Runtime server functions / SSR:
 *    Uses the internal service binding URL injected by Vercel into `process.env.API_URL`
 *    (or fallback `process.env.QUEUELESS_API_URL`).
 *
 * 2. Explicit public environment variable:
 *    Uses `process.env.NEXT_PUBLIC_API_URL` when provided (e.g. for external deployments).
 *
 * 3. Browser runtime on Vercel:
 *    When deployed as multiple services under a single Vercel project, public API traffic
 *    is routed to the backend via `/api`. Client-side calls use `/api` as base URL.
 *
 * 4. Local standalone development fallback:
 *    Falls back to `http://127.0.0.1:8000`.
 */
export function getApiBaseUrl(): string {
  // In server runtime (Vercel Functions / Node.js):
  // Check the bound variable injected by Vercel service binding
  const boundServiceUrl = process.env.API_URL || process.env.QUEUELESS_API_URL;
  if (boundServiceUrl) {
    return boundServiceUrl.trim().replace(/\/+$/, "");
  }

  // Check explicit public API URL (browser or server)
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (publicApiUrl) {
    if (publicApiUrl.startsWith("/")) {
      return publicApiUrl.replace(/\/+$/, "");
    }
    const withProtocol = /^https?:\/\//i.test(publicApiUrl)
      ? publicApiUrl
      : `https://${publicApiUrl}`;
    return withProtocol.replace(/\/+$/, "");
  }

  // In browser runtime on Vercel (same-origin service routing)
  if (typeof window !== "undefined") {
    // If running in local standalone Next.js dev server without Vercel proxy, fallback to local backend port
    if (window.location.hostname === "localhost" && window.location.port === "3000") {
      return "http://127.0.0.1:8000";
    }
    return "/api";
  }

  // Local fallback for SSR/server when binding is not injected
  return "http://127.0.0.1:8000";
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Builds the full target URL for an API endpoint.
 * Ensures compatibility with service bindings and public path prefixes.
 */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // Avoid duplicate /api prefix if base is /api and path already starts with /api
  if (base === "/api" && cleanPath.startsWith("/api/")) {
    return cleanPath;
  }

  // If base is a full absolute URL (e.g. from service binding http://queueless-api... or http://127.0.0.1:8000)
  if (/^https?:\/\//i.test(base)) {
    return new URL(
      cleanPath.replace(/^\//, ""),
      base.endsWith("/") ? base : `${base}/`
    ).toString();
  }

  // Otherwise base is a path prefix like '/api'
  return `${base}${cleanPath}`;
}

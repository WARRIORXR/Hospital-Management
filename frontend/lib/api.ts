const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

const configuredApiHost = configuredApiUrl || "http://127.0.0.1:8000";
const apiUrlWithProtocol = /^https?:\/\//i.test(configuredApiHost)
  ? configuredApiHost
  : `https://${configuredApiHost}`;

export const API_BASE_URL = apiUrlWithProtocol.replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

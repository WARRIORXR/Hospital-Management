import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

async function handleProxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const targetPath = "/" + (path || []).join("/");
  const base = getApiBaseUrl();
  const search = request.nextUrl.search;
  
  // Construct internal destination URL using the service binding or fallback
  const resolvedBase = /^https?:\/\//i.test(base) ? base : "http://127.0.0.1:8000";
  const targetUrl = new URL(
    `${targetPath.replace(/^\//, "")}${search}`,
    resolvedBase.endsWith("/") ? resolvedBase : `${resolvedBase}/`
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("host");

  try {
    const isBodyAllowed = request.method !== "GET" && request.method !== "HEAD";
    const body = isBodyAllowed ? await request.arrayBuffer() : undefined;

    const backendResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: requestHeaders,
      body,
      cache: "no-store",
    });

    const responseHeaders = new Headers(backendResponse.headers);
    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail: `Failed to proxy request to backend service: ${
          error instanceof Error ? error.message : "Service unreachable"
        }`,
      },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const HEAD = handleProxy;
export const OPTIONS = handleProxy;

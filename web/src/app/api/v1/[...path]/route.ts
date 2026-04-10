/**
 * Server-side reverse proxy for all /api/v1/* requests.
 *
 * Why this exists:
 *   Next.js standalone output converts rewrites to external URLs into 307 redirects
 *   instead of transparent proxies. This route handler proxies server-to-server,
 *   so the browser always sees same-origin responses — no CORS, no redirects.
 *
 * API_URL is a runtime env var (not baked at build time).
 * Falls back to NEXT_PUBLIC_API_URL (build-time) if API_URL is absent.
 */

import { NextRequest, NextResponse } from "next/server";

function getApiBase(): string {
  // Prefer runtime var so Railway doesn't need a rebuild to change the API host
  if (process.env.API_URL) {
    return process.env.API_URL.replace(/\/$/, "");
  }
  // Fallback: strip /api/v1 suffix from the baked build-time var
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, "");
  }
  return "http://localhost:3001";
}

// Headers that must NOT be forwarded to the upstream server
const HOP_BY_HOP = new Set(["host", "connection", "transfer-encoding", "keep-alive"]);

async function proxy(req: NextRequest): Promise<NextResponse> {
  const apiBase = getApiBase();
  const { pathname, search } = req.nextUrl;
  const target = `${apiBase}${pathname}${search}`;

  // ── Forward request headers ────────────────────────────────────────────────
  const upstreamHeaders = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      upstreamHeaders.set(key, value);
    }
  });

  // ── Read body once as ArrayBuffer (safe to pass to fetch, avoids Buffer type issues) ──
  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  // ── Call upstream ──────────────────────────────────────────────────────────
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method:   req.method,
      headers:  upstreamHeaders,
      body,
      // Follow any HTTP→HTTPS redirects from the upstream; never forward
      // a 3xx to the browser (that would trigger cross-origin issues).
      redirect: "follow",
    });
  } catch (err) {
    console.error(`[api-proxy] ${req.method} ${target} →`, err);
    return NextResponse.json(
      { error: "upstream_unavailable", detail: String(err) },
      { status: 502 },
    );
  }

  // ── Forward response headers ───────────────────────────────────────────────
  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      resHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status:  upstream.status,
    headers: resHeaders,
  });
}

export const GET    = proxy;
export const POST   = proxy;
export const PATCH  = proxy;
export const PUT    = proxy;
export const DELETE = proxy;

// Allow large file uploads (resume PDFs etc.)
export const config = { api: { bodyParser: false } };

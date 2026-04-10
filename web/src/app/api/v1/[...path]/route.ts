/**
 * Catch-all proxy: forwards /api/v1/* requests to the NestJS backend.
 * Runs server-side — no CORS, no build-time baking of the API URL.
 */

import { NextRequest, NextResponse } from "next/server";

const API_BASE = (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const target = `${API_BASE}${pathname}${search}`;

  // Forward all headers except ones that confuse the upstream server
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!["host", "connection", "transfer-encoding"].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const upstream = await fetch(target, {
    method:  req.method,
    headers,
    body:    body ? Buffer.from(body) : undefined,
  });

  // Forward response headers, drop hop-by-hop headers
  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!["connection", "transfer-encoding", "keep-alive"].includes(key.toLowerCase())) {
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

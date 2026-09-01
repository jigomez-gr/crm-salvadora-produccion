import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CANDIDATE_URLS = [
  process.env.INTERNAL_API_URL,
  process.env.NEXT_PUBLIC_API_URL,
  "http://salvadora:3001",
  "http://ccmfallaviajeasevilla-salvadora-toiagj:3001",
  "http://api:3001",
  "http://172.17.0.1:3001",
  "http://127.0.0.1:3001",
].filter(Boolean) as string[];

let cachedWorkingUrl: string | null = null;

async function forwardRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subpath = path.join("/");
  const search = req.nextUrl.search || "";
  const targetPath = `/api/${subpath}${search}`;

  const method = req.method;
  const headers = new Headers(req.headers);
  headers.delete("host");

  let body: ArrayBuffer | undefined = undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  // Try cached working URL first
  const urlsToTry = cachedWorkingUrl
    ? [cachedWorkingUrl, ...CANDIDATE_URLS.filter((u) => u !== cachedWorkingUrl)]
    : CANDIDATE_URLS;

  let lastError: Error | null = null;

  for (const base of urlsToTry) {
    try {
      const targetUrl = `${base.replace(/\/$/, "")}${targetPath}`;
      const res = await fetch(targetUrl, {
        method,
        headers,
        body,
        redirect: "manual",
        cache: "no-store",
      });

      // If we get a response (even 401, 403, 404, 200), this backend is ALIVE
      cachedWorkingUrl = base;

      const resHeaders = new Headers(res.headers);
      const resBody = await res.arrayBuffer();

      return new NextResponse(resBody, {
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
      });
    } catch (err: any) {
      lastError = err;
      // Try next candidate
    }
  }

  return NextResponse.json(
    {
      error: "Backend Unavailable",
      message: `No se pudo conectar con el backend. Último error: ${lastError?.message || "Conexión rechazada"}`,
      candidatesTried: urlsToTry,
    },
    { status: 503 }
  );
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, ctx);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, ctx);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, ctx);
}
export async function OPTIONS(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, ctx);
}
export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forwardRequest(req, ctx);
}
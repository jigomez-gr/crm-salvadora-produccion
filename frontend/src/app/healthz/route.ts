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

export async function GET(req: NextRequest) {
  for (const base of CANDIDATE_URLS) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/healthz`, { cache: "no-store" });
      const data = await res.json();
      return NextResponse.json({ ...data, backendHost: base });
    } catch {}
  }
  return NextResponse.json({ status: "backend-unreachable", candidatesTried: CANDIDATE_URLS }, { status: 503 });
}
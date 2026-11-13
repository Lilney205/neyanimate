import { NextResponse } from "next/server";
import { deleteCurrentSession, isSameOriginRequest } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  await deleteCurrentSession();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

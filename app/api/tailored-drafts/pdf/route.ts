import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, PRIVATE_HEADERS } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { renderResumePdf } from "@/lib/resume-pdf";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request); if (denied) return denied;
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Invalid draft." }, { status: 400, headers: PRIVATE_HEADERS });
  try {
    const db = await getDb();
    const draft = await db.collection("tailored_drafts").findOne({ _id: id.data as never });
    if (!draft || typeof draft.content?.resume !== "string") return NextResponse.json({ error: "Draft not found." }, { status: 404, headers: PRIVATE_HEADERS });
    const pdf = await renderResumePdf(draft.content.resume);
    return new NextResponse(new Uint8Array(pdf), { headers: { ...PRIVATE_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="resume.pdf"', "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Could not create PDF." }, { status: 500, headers: PRIVATE_HEADERS }); }
}

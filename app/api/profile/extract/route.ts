import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { PRIVATE_HEADERS, requireOwner } from "@/lib/api-auth";

export const runtime = "nodejs";
const limit = 1_000_000;
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS });

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  if (Number(request.headers.get("content-length")) > limit + 100_000) return reply("File is too large. Choose a file under 1 MB.", 413);
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > limit) return reply("Choose a file under 1 MB.", 400);
    const data = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    let text = "";
    if (name.endsWith(".pdf") && data.subarray(0, 5).toString() === "%PDF-") {
      const parser = new PDFParse({ data });
      try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
    } else if (name.endsWith(".docx") && data.subarray(0, 2).toString() === "PK") {
      text = (await mammoth.extractRawText({ buffer: data })).value;
    } else if (name.endsWith(".txt")) {
      text = data.toString("utf8");
    } else return reply("Choose a PDF, DOCX or TXT file.", 400);
    text = text.trim();
    if (!text) return reply("No text found. If this is a scanned PDF, use a text-based file instead.", 422);
    if (text.length > 50000) return reply("The extracted text is too long. Use a shorter CV.", 422);
    return NextResponse.json({ text }, { headers: PRIVATE_HEADERS });
  } catch {
    return reply("Could not read this file. Try another PDF, DOCX or TXT file.", 400);
  }
}

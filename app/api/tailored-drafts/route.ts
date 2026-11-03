import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, PRIVATE_HEADERS } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { generateTailored } from "@/lib/generate-tailored";
import { tailoredContentSchema } from "@/lib/tailored-draft";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_HEADERS });
export const maxDuration = 120;
export async function GET(request: Request) {
  const denied = await requireOwner(request); if (denied) return denied;
  try { const db = await getDb(); const drafts = await db.collection("tailored_drafts").find({}).sort({ createdAt: -1 }).limit(100).toArray(); return json({ drafts }); }
  catch { return json({ error: "Could not load drafts." }, 500); }
}
export async function POST(request: Request) {
  const denied = await requireOwner(request); if (denied) return denied;
  try {
    const input = z.object({ jobId: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(await request.json());
    if (!input.success) return json({ error: "Invalid job." }, 400);
    if (!process.env.GROQ_API_KEY) return json({ error: "Groq is not configured yet." }, 503);
    const db = await getDb();
    const job = await db.collection<{ _id: string; company: string; title: string; description: string }>("discovered_jobs").findOne({ _id: input.data.jobId });
    if (!job || !job.description) return json({ error: "This job needs a description to create a draft." }, 400);
    const profile = await db.collection("career_profiles").findOne({ _id: "owner" as never }, { projection: { _id: 0 } });
    if (!profile || !Object.values(profile).some(value => typeof value === "string" && value.trim())) return json({ error: "Add your career profile first." }, 400);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const counters = db.collection<{ _id: string; count: number }>("tailoring_usage");
    try { await counters.updateOne({ _id: day, count: { $lt: 5 } }, { $inc: { count: 1 } }, { upsert: true }); }
    catch (error) { if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return json({ error: "Daily limit reached (5 drafts). Try tomorrow." }, 429); throw error; }
    const generated = await generateTailored(profile, job);
    const draft = { _id: randomUUID(), jobId: job._id, company: job.company, role: job.title, ...generated, createdAt: Date.now(), updatedAt: Date.now() };
    await db.collection<typeof draft>("tailored_drafts").insertOne(draft);
    return json({ draft }, 201);
  } catch (error) { return json({ error: error instanceof Error && /Groq|draft/.test(error.message) ? error.message : "Could not create draft." }, 500); }
}
export async function PUT(request: Request) {
  const denied = await requireOwner(request); if (denied) return denied;
  try {
    const input = z.object({ id: z.string().uuid(), content: tailoredContentSchema }).strict().safeParse(await request.json());
    if (!input.success) return json({ error: "Check the draft fields." }, 400);
    const db = await getDb(); const result = await db.collection("tailored_drafts").updateOne({ _id: input.data.id as never }, { $set: { content: input.data.content, updatedAt: Date.now() } });
    return result.matchedCount ? json({ ok: true }) : json({ error: "Draft not found." }, 404);
  } catch { return json({ error: "Could not save the draft." }, 500); }
}

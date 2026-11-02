import { NextResponse } from "next/server";
import { z } from "zod";
import { PRIVATE_HEADERS, requireOwner } from "@/lib/api-auth";
import { listJobs, searchJobs } from "@/lib/discovery";
import { getDb } from "@/lib/db";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_HEADERS });
export async function GET(request: Request) { const denied = await requireOwner(request); if (denied) return denied; try { return json({ jobs: await listJobs() }); } catch { return json({ error: "Could not load jobs." }, 500); } }
export async function POST(request: Request) {
  const denied = await requireOwner(request); if (denied) return denied;
  try { const data = z.object({ query: z.string().trim().min(1).max(120), source: z.enum(['freehire', 'jsearch']) }).strict().safeParse(await request.json()); if (!data.success) return json({ error: 'Enter a valid search.' }, 400); return json(await searchJobs(data.data.query, data.data.source)); }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'Search failed.' }, 502); }
}
export async function PATCH(request: Request) {
  const denied = await requireOwner(request); if (denied) return denied;
  try { const data = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(['new', 'saved', 'dismissed']) }).strict().safeParse(await request.json()); if (!data.success) return json({ error: 'Invalid job.' }, 400); const db = await getDb(); const result = await db.collection('discovered_jobs').updateOne({ _id: data.data.id as never }, { $set: { status: data.data.status } }); return result.matchedCount ? json({ ok: true }) : json({ error: 'Job not found.' }, 404); } catch { return json({ error: 'Could not update job.' }, 500); }
}

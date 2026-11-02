import { NextResponse } from "next/server";
import { PRIVATE_HEADERS, requireOwner } from "@/lib/api-auth";
import { getSettings, settingsSchema } from "@/lib/discovery-settings";
import { getDb } from "@/lib/db";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: PRIVATE_HEADERS });
export async function GET(request: Request) {
  const denied = await requireOwner(request); if (denied) return denied;
  try { const db = await getDb(); const lastRun = await db.collection("discovery_runs").find({}).sort({ startedAt: -1 }).limit(1).next(); return json({ settings: await getSettings(), lastRun }); }
  catch { return json({ error: "Could not load search settings." }, 500); }
}
export async function PUT(request: Request) {
  const denied = await requireOwner(request); if (denied) return denied;
  try { const parsed = settingsSchema.safeParse(await request.json()); if (!parsed.success) return json({ error: "Choose a source and up to three searches." }, 400); const db = await getDb(); await db.collection<{ _id: string; settings: typeof parsed.data }>("discovery_settings").updateOne({ _id: "owner" }, { $set: { settings: parsed.data } }, { upsert: true }); return json({ settings: parsed.data }); }
  catch { return json({ error: "Could not save search settings." }, 500); }
}

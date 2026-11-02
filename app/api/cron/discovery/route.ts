import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/discovery-settings";
import { searchJobs } from "@/lib/discovery";

export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await getSettings();
    if (!settings.enabled) return NextResponse.json({ status: "disabled" });
    const db = await getDb();
    const runs = db.collection<{ _id: string; startedAt: number; status: string; results?: { source: string; query: string; found?: number; added?: number; error?: string }[] }>("discovery_runs");
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    try { await runs.insertOne({ _id: day, startedAt: Date.now(), status: "running" }); }
    catch (error) { if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return NextResponse.json({ status: "already started" }); throw error; }
    const results: { source: string; query: string; found?: number; added?: number; error?: string }[] = [];
    for (const query of settings.queries) for (const source of ["freehire", "jsearch"] as const) {
      if (!settings[source]) continue;
      try { results.push({ source, query, ...await searchJobs(query, source) }); }
      catch { results.push({ source, query, error: "Search failed. Check source configuration or try again manually." }); }
      await runs.updateOne({ _id: day }, { $set: { results } });
    }
    await runs.updateOne({ _id: day }, { $set: { status: results.some(r => r.error) ? "completed with errors" : "completed", results } });
    return NextResponse.json({ status: "finished", results });
  } catch { return NextResponse.json({ error: "Discovery run failed." }, { status: 500 }); }
}

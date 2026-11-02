import "server-only";
import { createHash } from "node:crypto";
import { getDb, type ApplicationDocument } from "./db";

export type DiscoveredJob = { _id: string; source: string; title: string; company: string; location: string; url: string; description: string; postedAt: string; discoveredAt: number; status: "new" | "saved" | "dismissed"; applied: boolean };
type ProviderJob = { id: string; source: string; title: string; company: string; location: string; url: string; description: string; postedAt: string };
const str = (v: unknown, max = 1000) => typeof v === "string" ? v.trim().slice(0, max) : "";
function safeUrl(value: unknown) { try { const u = new URL(str(value, 2000)); if (!['http:', 'https:'].includes(u.protocol)) return ""; u.hash = ""; for (const key of [...u.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$)/i.test(key)) u.searchParams.delete(key); u.searchParams.sort(); return u.toString(); } catch { return ""; } }
function canonical(job: ProviderJob) { return job.url || [job.company, job.title, job.location].map(s => s.normalize('NFKC').trim().toLowerCase()).join('|'); }
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }

export async function searchJobs(query: string, source: "freehire" | "jsearch") {
  let url: URL;
  const headers: Record<string, string> = {};
  if (source === "freehire") {
    url = new URL("https://freehire.me/api/v1/agent/jobs/search");
    url.searchParams.set("q", query); url.searchParams.set("q_fields", "title"); url.searchParams.set("limit", "20"); url.searchParams.set("description_format", "text");
  } else {
    if (!process.env.JSEARCH_API_KEY) throw new Error("JSearch is not configured. Add JSEARCH_API_KEY to the server.");
    url = new URL("https://api.openwebninja.com/jsearch/search-v2");
    url.searchParams.set("query", query); url.searchParams.set("country", "in"); url.searchParams.set("date_posted", "week"); headers["x-api-key"] = process.env.JSEARCH_API_KEY;
  }
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${source === "freehire" ? "FreeHire" : "JSearch"} could not complete the search (${response.status}).`);
  const body = await response.json();
  const list = source === 'freehire' ? body.data : body.data?.jobs;
  if (!Array.isArray(list)) throw new Error("The job source returned an unexpected response.");
  const jobs: ProviderJob[] = list.slice(0, 20).flatMap((raw: Record<string, unknown>) => {
    if (!raw || typeof raw !== 'object') return [];
    const job = source === 'freehire' ? { id: str(raw.public_slug), source: 'FreeHire', title: str(raw.title), company: str(raw.company), location: str(raw.location), url: safeUrl(raw.url), description: str(raw.description, 30000), postedAt: str(raw.posted_at, 100) } : { id: str(raw.job_id), source: 'JSearch', title: str(raw.job_title), company: str(raw.employer_name), location: str(raw.job_location), url: safeUrl(raw.job_apply_link) || safeUrl(raw.job_google_link), description: str(raw.job_description, 30000), postedAt: str(raw.job_posted_at_datetime_utc, 100) };
    return job.id && job.title && job.company && job.url ? [job] : [];
  });
  const db = await getDb();
  const collection = db.collection<DiscoveredJob>('discovered_jobs');
  let added = 0;
  for (const job of jobs) {
    const id = digest(canonical(job));
    const result = await collection.updateOne({ _id: id }, { $setOnInsert: { _id: id, source: job.source, title: job.title, company: job.company, location: job.location, url: job.url, description: job.description, postedAt: job.postedAt, discoveredAt: Date.now(), status: 'new', applied: false } }, { upsert: true });
    added += result.upsertedCount;
  }
  return { found: jobs.length, added };
}

export async function listJobs() {
  const db = await getDb();
  const jobs = await db.collection<DiscoveredJob>('discovered_jobs').find({ status: { $ne: 'dismissed' } }).sort({ discoveredAt: -1 }).limit(100).toArray();
  const apps = await db.collection<ApplicationDocument>('applications').find({}, { projection: { company: 1, role: 1, link: 1 } }).toArray();
  return jobs.map(job => ({ ...job, applied: apps.some(app => (safeUrl(app.link) && safeUrl(app.link) === job.url) || (app.company?.trim().toLowerCase() === job.company.toLowerCase() && app.role?.trim().toLowerCase() === job.title.toLowerCase())) }));
}

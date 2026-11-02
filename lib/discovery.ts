import "server-only";
import { createHash } from "node:crypto";
import { getDb, type ApplicationDocument } from "./db";

export type DiscoveredJob = { _id: string; source: string; title: string; company: string; location: string; workMode?: string; country?: string; url: string; description: string; postedAt: string; discoveredAt: number; status: "new" | "saved" | "dismissed"; applied: boolean };
type ProviderJob = { id: string; source: string; title: string; company: string; location: string; workMode: string; country: string; url: string; description: string; postedAt: string };
const str = (v: unknown, max = 1000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const kochi = /\b(kochi|cochin|ernakulam)\b/i;
const allowedRemote = /\b(kochi|cochin|ernakulam|bengaluru|bangalore|thiruvananthapuram|trivandrum)\b/i;
const foreign = /\b(canada|pakistan|philippines|brazil|mexico|united kingdom|usa|united states|australia|singapore)\b/i;
export function matchesLocationPolicy(job: Pick<DiscoveredJob, "location" | "workMode" | "country">) {
  const location = job.location || "";
  const country = (job.country || "").trim();
  if (country && !/^(in|ind|india)$/i.test(country)) return false;
  if (foreign.test(location)) return false;
  const mode = (job.workMode || "").toLowerCase();
  if (/\b(hybrid|onsite|on-site|on site|office)\b/i.test(mode)) return kochi.test(location);
  if (/\bremote\b/i.test(mode)) return allowedRemote.test(location);
  // Older records have no mode metadata: retain only clearly located Kochi jobs.
  if (/\bremote\b/i.test(location)) return allowedRemote.test(location);
  return kochi.test(location);
}
function safeUrl(value: unknown) { try { const u = new URL(str(value, 2000)); if (!['http:', 'https:'].includes(u.protocol)) return ""; u.hash = ""; for (const key of [...u.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$)/i.test(key)) u.searchParams.delete(key); u.searchParams.sort(); return u.toString(); } catch { return ""; } }
function canonical(job: ProviderJob) { return job.url || [job.company, job.title, job.location].map(s => s.normalize('NFKC').trim().toLowerCase()).join('|'); }
function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }

export async function searchJobs(query: string, source: "freehire" | "jsearch", options: { location?: string; remote?: boolean } = {}) {
  let url: URL;
  const headers: Record<string, string> = {};
  if (source === "freehire") {
    url = new URL("https://freehire.me/api/v1/agent/jobs/search");
    url.searchParams.set("q", query); url.searchParams.set("q_fields", "title"); url.searchParams.set("limit", "20"); url.searchParams.set("description_format", "text");
    if (options.remote) { url.searchParams.set("countries", "IN"); url.searchParams.set("work_mode", "remote"); }
    else url.searchParams.set("cities", "Kochi");
  } else {
    if (!process.env.JSEARCH_API_KEY) throw new Error("JSearch is not configured. Add JSEARCH_API_KEY to the server.");
    url = new URL("https://api.openwebninja.com/jsearch/search-v2");
    url.searchParams.set("query", !options.remote ? `${query} in Kochi` : `${query} in India`); if (options.remote) url.searchParams.set("work_from_home", "true"); url.searchParams.set("country", "in"); url.searchParams.set("date_posted", "week"); headers["x-api-key"] = process.env.JSEARCH_API_KEY;
  }
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${source === "freehire" ? "FreeHire" : "JSearch"} could not complete the search (${response.status}).`);
  const body = await response.json();
  const list = source === 'freehire' ? body.data : body.data?.jobs;
  if (!Array.isArray(list)) throw new Error("The job source returned an unexpected response.");
  const jobs: ProviderJob[] = list.slice(0, 20).flatMap((raw: Record<string, unknown>) => {
    if (!raw || typeof raw !== 'object') return [];
    const job = source === 'freehire' ? { id: str(raw.public_slug), source: 'FreeHire', title: str(raw.title), company: str(raw.company), location: str(raw.location), workMode: str(raw.work_mode), country: str(raw.country_code), url: safeUrl(raw.url), description: str(raw.description, 30000), postedAt: str(raw.posted_at, 100) } : { id: str(raw.job_id), source: 'JSearch', title: str(raw.job_title), company: str(raw.employer_name), location: str(raw.job_location) || [str(raw.job_city), str(raw.job_state), str(raw.job_country)].filter(Boolean).join(', '), workMode: raw.job_is_remote === true ? 'remote' : '', country: str(raw.job_country), url: safeUrl(raw.job_apply_link) || safeUrl(raw.job_google_link), description: str(raw.job_description, 30000), postedAt: str(raw.job_posted_at_datetime_utc, 100) };
    if (options.remote && job.workMode.toLowerCase() !== 'remote') return [];
    if (!options.remote && !kochi.test(job.location)) return [];
    return job.id && job.title && job.company && job.url && matchesLocationPolicy(job) ? [job] : [];
  });
  const db = await getDb();
  const collection = db.collection<DiscoveredJob>('discovered_jobs');
  let added = 0;
  for (const job of jobs) {
    const id = digest(canonical(job));
    const result = await collection.updateOne({ _id: id }, { $setOnInsert: { _id: id, source: job.source, title: job.title, company: job.company, location: job.location, workMode: job.workMode, country: job.country, url: job.url, description: job.description, postedAt: job.postedAt, discoveredAt: Date.now(), status: 'new', applied: false } }, { upsert: true });
    added += result.upsertedCount;
  }
  return { found: jobs.length, added };
}

export async function listJobs() {
  const db = await getDb();
  const candidates = await db.collection<DiscoveredJob>('discovered_jobs').find({ status: { $ne: 'dismissed' } }).sort({ discoveredAt: -1 }).toArray();
  const jobs = candidates.filter(matchesLocationPolicy).slice(0, 100);
  const apps = await db.collection<ApplicationDocument>('applications').find({}, { projection: { company: 1, role: 1, link: 1 } }).toArray();
  const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return jobs.map(job => ({ ...job, possibleDuplicate: jobs.some(other => other._id !== job._id && normalize(other.company) === normalize(job.company) && normalize(other.title) === normalize(job.title)), applied: apps.some(app => (safeUrl(app.link) && safeUrl(app.link) === job.url) || (app.company && app.role && normalize(app.company) === normalize(job.company) && normalize(app.role) === normalize(job.title))) }));
}

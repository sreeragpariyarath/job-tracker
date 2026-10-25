import { randomUUID } from "crypto";
import type { Sort } from "mongodb";
import { getApplicationsCollection, type ApplicationDocument } from "./db";
import { normalizeCompany } from "./status";
import { addDays, FOLLOW_DAYS, today } from "./date";
import { SOURCES, STATUSES, WORK_MODES, type App, type ApplicationSort, type Draft, type Status } from "./types";

const TEXT_FIELDS = [
  "company",
  "role",
  "source",
  "location",
  "applied",
  "followUp",
  "contact",
  "phone",
  "link",
  "notes",
  "rejectReason",
  "salary",
  "workMode",
] as const;

const BLANK: Draft = {
  company: "",
  role: "",
  source: "",
  location: "",
  applied: "",
  status: "Applied",
  followUp: "",
  contact: "",
  phone: "",
  link: "",
  notes: "",
  rejectReason: "",
  salary: "",
  workMode: "",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateDate(value: string, field: string, required: boolean) {
  if (!value && !required) return;
  if (!isValidDate(value)) throw new Error(`${field} must use YYYY-MM-DD format`);
}

function validateUrl(value: string) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  } catch {
    throw new Error("link must be a valid HTTP or HTTPS URL");
  }
}

function parse(input: unknown): Partial<Draft> {
  if (typeof input !== "object" || input === null) throw new Error("Invalid request body");
  const src = input as Record<string, unknown>;
  const out: Partial<Draft> = {};
  for (const key of TEXT_FIELDS) {
    if (!(key in src)) continue;
    const v = src[key];
    if (v == null) out[key] = "";
    else if (typeof v === "string") out[key] = v.trim().slice(0, 2000);
    else throw new Error(`${key} must be text`);
  }
  if ("status" in src) {
    const s = src.status;
    if (typeof s !== "string" || !(STATUSES as readonly string[]).includes(s)) throw new Error("Invalid status");
    out.status = s as Status;
  }
  if (out.source && !(SOURCES as readonly string[]).includes(out.source)) throw new Error("Invalid source");
  if (out.workMode && !(WORK_MODES as readonly string[]).includes(out.workMode)) throw new Error("Invalid work mode");
  return out;
}

function finalize(fields: Partial<Draft>, base: Draft): Draft {
  const merged: Draft = { ...base, ...fields };
  if (!merged.company) throw new Error("Company is required");
  validateDate(merged.applied, "applied", true);
  validateDate(merged.followUp, "followUp", false);
  validateUrl(merged.link);
  if (merged.status === "Rejected" && !merged.rejectReason) throw new Error("Reason for rejection is required");
  if (merged.status !== "Rejected") merged.rejectReason = "";
  return merged;
}

export function normalizeApplication(input: unknown): Draft {
  return finalize(parse(input), BLANK);
}

function toApp(doc: ApplicationDocument): App {
  const { _id, salary, workMode, phone, ...rest } = doc;
  return {
    ...rest,
    // Documents created before these fields existed have no stored value.
    salary: salary ?? "",
    workMode: workMode ?? "",
    phone: phone ?? "",
    id: _id,
  };
}

export async function listApplications(): Promise<App[]> {
  const collection = await getApplicationsCollection();
  const docs = await collection.find({}).sort({ applied: -1 }).toArray();
  return docs.map(toApp);
}

type ListOptions = {
  page: number;
  pageSize: number;
  query: string;
  status: string;
  source: string;
  sort: ApplicationSort;
};

type ListResult = {
  items: App[];
  total: number;
};

export type ImportError = { index: number; message: string };
export type ImportSkip = { index: number; reason: string };

export type ImportResult = {
  items: App[];
  createdCount: number;
  skippedCount: number;
  skipped: ImportSkip[];
  errors: ImportError[];
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listApplicationsPage(options: ListOptions): Promise<ListResult> {
  const collection = await getApplicationsCollection();
  const filters: Record<string, unknown>[] = [];
  const query = options.query.trim();
  if (query) {
    const expression = { $regex: escapeRegex(query), $options: "i" };
    filters.push({ $or: [
      { company: expression },
      { role: expression },
      { contact: expression },
      { notes: expression },
      { location: expression },
    ] });
  }
  if (options.status === "Active") filters.push({ status: { $in: ["Applied", "Followed up", "Interview"] } });
  else if (options.status && options.status !== "All") filters.push({ status: options.status });
  if (options.source) filters.push({ source: options.source });

  const filter = filters.length ? { $and: filters } : {};
  const sort: Sort = options.sort === "applied"
    ? { applied: -1, updatedAt: -1 }
    : options.sort === "followUp"
      ? { followUp: 1, updatedAt: -1 }
      : options.sort === "company"
        ? { company: 1, updatedAt: -1 }
        : { updatedAt: -1 };
  const [total, docs] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter).sort(sort).skip((options.page - 1) * options.pageSize).limit(options.pageSize).toArray(),
  ]);
  return { items: docs.map(toApp), total };
}

export async function getApplicationSummary() {
  const collection = await getApplicationsCollection();
  const currentDate = today();
  const [grouped, dueDocs] = await Promise.all([
    collection.aggregate<{ _id: Status; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
    collection.find({
      status: { $in: ["Applied", "Followed up"] },
      $or: [
        { followUp: { $gt: "", $lte: currentDate } },
        { $or: [{ followUp: "" }, { followUp: { $exists: false } }], applied: { $lte: addDays(currentDate, -FOLLOW_DAYS) } },
      ],
    }).toArray(),
  ]);
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>;
  for (const row of grouped) {
    if (row._id in byStatus) byStatus[row._id] = row.count;
  }
  const total = grouped.reduce((sum, row) => sum + row.count, 0);
  const active = byStatus.Applied + byStatus["Followed up"];
  const activeTab = active + byStatus.Interview;
  const due = dueDocs.map(toApp);
  return { total, active, activeTab, byStatus, due };
}

export async function getApplication(id: string): Promise<App | null> {
  const collection = await getApplicationsCollection();
  const doc = await collection.findOne({ _id: id });
  return doc ? toApp(doc) : null;
}

export async function createApplication(input: unknown): Promise<App> {
  const draft = finalize(parse(input), BLANK);
  const now = Date.now();
  const id = randomUUID();
  const collection = await getApplicationsCollection();

  const doc: ApplicationDocument = {
    ...draft,
    _id: id,
    createdAt: now,
    updatedAt: now,
  };

  await collection.insertOne(doc);
  return toApp(doc);
}

export async function importApplications(inputs: unknown[]): Promise<ImportResult> {
  if (inputs.length === 0) throw new Error("Add at least one application to import");
  if (inputs.length > 500) throw new Error("You can import up to 500 applications at a time");

  const collection = await getApplicationsCollection();
  const errors: ImportError[] = [];
  const skipped: ImportSkip[] = [];
  const candidates: { index: number; draft: Draft }[] = [];
  const seen = new Set<string>();

  for (const [index, input] of inputs.entries()) {
    try {
      const draft = finalize(parse(input), BLANK);
      const key = `${normalizeCompany(draft.company)}|${normalizeCompany(draft.role)}|${draft.applied}`;
      if (seen.has(key)) {
        skipped.push({ index, reason: "Duplicate in import data" });
        continue;
      }
      seen.add(key);
      candidates.push({ index, draft });
    } catch (error) {
      errors.push({ index, message: error instanceof Error ? error.message : "Invalid application" });
    }
  }

  const duplicateFilters = candidates.map(({ draft }) => ({
    company: { $regex: `^${escapeRegex(draft.company)}$`, $options: "i" },
    role: { $regex: `^${escapeRegex(draft.role)}$`, $options: "i" },
    applied: draft.applied,
  }));
  const existing = duplicateFilters.length
    ? await collection.find({ $or: duplicateFilters }).project({ company: 1, role: 1, applied: 1 }).toArray()
    : [];
  const existingKeys = new Set(existing.map((item) => `${normalizeCompany(item.company)}|${normalizeCompany(item.role)}|${item.applied}`));
  const documents: ApplicationDocument[] = [];
  const now = Date.now();

  for (const candidate of candidates) {
    const key = `${normalizeCompany(candidate.draft.company)}|${normalizeCompany(candidate.draft.role)}|${candidate.draft.applied}`;
    if (existingKeys.has(key)) {
      skipped.push({ index: candidate.index, reason: "Already exists" });
      continue;
    }
    const document: ApplicationDocument = { ...candidate.draft, _id: randomUUID(), createdAt: now, updatedAt: now };
    documents.push(document);
    existingKeys.add(key);
  }

  if (documents.length > 0) await collection.insertMany(documents, { ordered: true });
  return {
    items: documents.map(toApp),
    createdCount: documents.length,
    skippedCount: skipped.length,
    skipped,
    errors,
  };
}

export async function updateApplication(id: string, input: unknown): Promise<App | null> {
  const current = await getApplication(id);
  if (!current) return null;
  const fields = parse(input);
  const validated = finalize(fields, current);
  // Write only editable fields and guard against concurrent changes.
  const patch: Partial<Draft> = {};
  for (const key of TEXT_FIELDS) {
    if (key in fields) patch[key] = validated[key];
  }
  if (fields.status !== undefined) patch.status = validated.status;
  if (validated.status !== "Rejected") patch.rejectReason = "";
  const collection = await getApplicationsCollection();
  const doc = await collection.findOneAndUpdate(
    { _id: id, updatedAt: current.updatedAt },
    { $set: { ...patch, updatedAt: Math.max(Date.now(), current.updatedAt + 1) } },
    { returnDocument: "after" },
  );
  if (!doc) throw new Error("Application changed while saving. Refresh and try again.");
  return toApp(doc);
}

export async function deleteApplication(id: string): Promise<boolean> {
  const collection = await getApplicationsCollection();
  const res = await collection.deleteOne({ _id: id });
  return res.deletedCount > 0;
}

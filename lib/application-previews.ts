import "server-only";
import { createHash, randomUUID } from "crypto";
import type { ClientSession } from "mongodb";
import { getDb, type ApplicationDocument } from "./db";
import { normalizeApplication } from "./applications";
import type { Draft } from "./types";
import type { McpIdentity } from "./mcp/auth";

export type ApplicationPreview = {
  _id: string; ownerSub: string; clientId: string; draft: Draft;
  createdAt: number; expiresAt: Date; approvedAt?: number; applicationId?: string;
};
const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function duplicateKeys(draft: Pick<Draft, "company" | "role" | "applied" | "link">) {
  const keys = [JSON.stringify([normalized(draft.company), normalized(draft.role), draft.applied])];
  if (draft.link) {
    try {
    const url = new URL(draft.link);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    keys.push(url.toString().replace(/\/$/, ""));
    } catch { /* Legacy records can contain links saved before URL validation. */ }
  }
  return keys.map(key => createHash("sha256").update(key).digest("hex"));
}
async function duplicates(draft: Draft, session?: ClientSession) {
  const db = await getDb();
  // Include legacy records without normalized keys. Never rewrite the personal dataset.
  const docs = await db.collection<ApplicationDocument>("applications").find({}, { session }).toArray();
  const keys = duplicateKeys(draft);
  return docs.filter(doc => duplicateKeys(doc).some(key => keys.includes(key)))
    .map(doc => ({ id: doc._id, company: doc.company, role: doc.role, applied: doc.applied }));
}
export async function previewApplication(input: unknown, identity: McpIdentity) {
  if (identity.clientId === "unknown") throw new Error("OAuth client identity is required.");
  const draft = normalizeApplication(input);
  if (!draft.role) throw new Error("Role is required for MCP creation.");
  if (draft.status !== "Applied") throw new Error("New MCP applications must have Applied status.");
  const db = await getDb();
  const preview: ApplicationPreview = { _id: randomUUID(), ownerSub: identity.sub, clientId: identity.clientId,
    draft, createdAt: Date.now(), expiresAt: new Date(Date.now() + 30 * 60 * 1000) };
  const matches = await duplicates(draft);
  await db.collection<ApplicationPreview>("application_previews").insertOne(preview);
  return { confirmationId: preview._id, application: draft, duplicates: matches, expiresAt: preview.expiresAt.toISOString(),
    approvalUrl: `${process.env.APP_BASE_URL}/mcp/approve/${preview._id}`,
    instructions: "Open the approval URL in your browser, sign in as the owner, review all fields and confirm that you submitted this application. Then ask the AI to create it. Previewing does not save an application." };
}
export async function getPreview(id: string, ownerSub: string) {
  const preview = await (await getDb()).collection<ApplicationPreview>("application_previews").findOne({ _id: id, ownerSub });
  return preview ? { ...preview, expired: preview.expiresAt.getTime() <= Date.now() } : null;
}
export async function approvePreview(id: string, ownerSub: string) {
  const result = await (await getDb()).collection<ApplicationPreview>("application_previews").updateOne(
    { _id: id, ownerSub, expiresAt: { $gt: new Date() }, approvedAt: { $exists: false }, applicationId: { $exists: false } },
    { $set: { approvedAt: Date.now() } });
  return result.modifiedCount === 1;
}
export async function createPreviewApplication(id: string, identity: McpIdentity) {
  if (!identity.scopes.includes("write:applications")) throw new Error("Write permission required. Reconnect after granting write:applications.");
  const db = await getDb();
  // All MCP creates contend on one durable document. Transactions retry write conflicts,
  // serializing duplicate checks across serverless instances without in-memory locks.
  const locks = db.collection<{ _id: string; revision: number }>("application_creation_locks");
  await locks.updateOne({ _id: "mcp" }, { $setOnInsert: { revision: 0 } }, { upsert: true });
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      await locks.updateOne({ _id: "mcp" }, { $inc: { revision: 1 } }, { session });
      const previews = db.collection<ApplicationPreview>("application_previews");
      const preview = await previews.findOne({ _id: id, ownerSub: identity.sub, clientId: identity.clientId }, { session });
      if (!preview) throw new Error("Preview not found for this user and OAuth client.");
      const applications = db.collection<ApplicationDocument>("applications");
      if (preview.applicationId) return { applicationId: preview.applicationId, alreadyCreated: true };
      if (preview.expiresAt.getTime() <= Date.now()) throw new Error("Preview expired. Request a new preview and approval.");
      if (!preview.approvedAt) throw new Error("Owner approval required. Open the preview approval URL first.");
      if ((await duplicates(preview.draft, session)).length) throw new Error("Duplicate application found. No application was created.");
      const now = Date.now();
      const applicationId = randomUUID();
      await applications.insertOne({ ...preview.draft, _id: applicationId, createdAt: now, updatedAt: now,
        provenance: { origin: "mcp", ownerSub: identity.sub, clientId: identity.clientId, previewId: id },
        auditHistory: [{ action: "created", actor: identity.sub, clientId: identity.clientId, at: now, approvedAt: preview.approvedAt }] }, { session });
      await previews.updateOne({ _id: id }, { $set: { applicationId } }, { session });
      return { applicationId, alreadyCreated: false };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally { await session.endSession(); }
}

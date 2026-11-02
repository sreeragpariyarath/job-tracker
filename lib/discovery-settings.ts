import "server-only";
import { z } from "zod";
import { getDb } from "./db";

export const settingsSchema = z.object({ enabled: z.boolean(), freehire: z.boolean(), jsearch: z.boolean(), queries: z.array(z.string().trim().min(1).max(120)).max(3), location: z.string().trim().min(1).max(80).default("Kochi"), includeRemote: z.boolean().default(true) }).strict().refine(value => !value.enabled || (value.queries.length > 0 && (value.freehire || value.jsearch)), "Choose a source and at least one search.");
export type DiscoverySettings = z.infer<typeof settingsSchema>;
export const defaultSettings: DiscoverySettings = { enabled: false, freehire: true, jsearch: false, queries: [], location: "Kochi", includeRemote: true };
export async function getSettings(): Promise<DiscoverySettings> {
  const db = await getDb();
  const doc = await db.collection<{ _id: string; settings: DiscoverySettings }>("discovery_settings").findOne({ _id: "owner" });
  const result = settingsSchema.safeParse(doc?.settings);
  return result.success ? result.data : defaultSettings;
}

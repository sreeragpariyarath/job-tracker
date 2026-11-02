import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { PRIVATE_HEADERS, requireOwner } from "@/lib/api-auth";

const profileSchema = z.object({
  name: z.string().max(200),
  skills: z.string().max(10000),
  experience: z.string().max(20000),
  education: z.string().max(10000),
  projects: z.string().max(20000),
  roles: z.string().max(2000),
  locations: z.string().max(2000),
  preferences: z.string().max(5000),
  resumeText: z.string().max(50000).default(""),
}).strict();

export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const db = await getDb();
    const profile = await db.collection("career_profiles").findOne({ _id: "owner" as never });
    if (!profile) return NextResponse.json({ profile: null }, { headers: PRIVATE_HEADERS });
    const { _id, ...fields } = profile;
    void _id;
    return NextResponse.json({ profile: fields }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Could not load your profile." }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function PUT(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const input = profileSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Please check your profile details." }, { status: 400, headers: PRIVATE_HEADERS });
    const db = await getDb();
    await db.collection("career_profiles").replaceOne({ _id: "owner" as never }, { _id: "owner" as never, ...input.data }, { upsert: true });
    return NextResponse.json({ profile: input.data }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

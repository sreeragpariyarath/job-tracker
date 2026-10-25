import { requireOwner, PRIVATE_HEADERS } from "@/lib/api-auth";
import { getAuth0 } from "@/lib/auth0";
import { approvePreview } from "@/lib/application-previews";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const form = await request.formData();
  if (form.get("submitted") !== "yes") return Response.json({ error: "Submission confirmation required" }, { status: 400, headers: PRIVATE_HEADERS });
  const { id } = await params;
  const session = await getAuth0().getSession();
  if (!await approvePreview(id, session!.user.sub)) return Response.json({ error: "Preview expired or already approved" }, { status: 409, headers: PRIVATE_HEADERS });
  return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: `/mcp/approve/${encodeURIComponent(id)}` } });
}

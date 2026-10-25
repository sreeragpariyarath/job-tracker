import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth0 } from "@/lib/auth0";
import { authConfigured, isOwner } from "@/lib/auth-policy";
import { getPreview } from "@/lib/application-previews";

export const dynamic = "force-dynamic";
export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  if (!authConfigured()) return <main>Authentication is not configured.</main>;
  const { id } = await params;
  const session = await getAuth0().getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(`/mcp/approve/${id}`)}`);
  if (!isOwner(session.user.sub)) return <main>Access denied.</main>;
  const preview = await getPreview(id, session.user.sub);
  if (!preview) return <main>Preview not found.</main>;
  return <main style={{ maxWidth: 720, margin: "48px auto", padding: 24 }}>
    <Link href="/">← Application Tracker</Link>
    <h1>Review application</h1>
    <p>Review the exact data below before authorizing the AI to save it.</p>
    <dl>{Object.entries(preview.draft).map(([key, value]) => <div key={key} style={{ padding: "10px 0", borderBottom: "1px solid #8884" }}>
      <dt style={{ fontWeight: 600 }}>{key}</dt><dd style={{ margin: "4px 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value || "Not provided"}</dd>
    </div>)}</dl>
    {preview.applicationId ? <p>Application saved. You may return to your AI chat.</p>
      : preview.expired ? <p>This preview expired. Ask for a new preview.</p>
      : preview.approvedAt ? <p>Approved. Return to your AI chat and ask it to create this application before the preview expires.</p>
      : <form method="post" action={`/mcp/approve/${encodeURIComponent(id)}/confirm`}>
        <label style={{ display: "block", margin: "24px 0" }}><input type="checkbox" name="submitted" value="yes" required /> I submitted this job application and approve saving these exact details.</label>
        <button type="submit" style={{ padding: "12px 20px", cursor: "pointer" }}>Approve application</button>
      </form>}
    <p>Approval expires {preview.expiresAt.toISOString()}. Duplicate checks run again before saving.</p>
  </main>;
}

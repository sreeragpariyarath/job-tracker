import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth0 } from "@/lib/auth0";
import { authConfigured, isOwner } from "@/lib/auth-policy";
import { getPreview } from "@/lib/application-previews";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Draft } from "@/lib/types";
import styles from "./approval.module.css";

const sections: { title: string; fields: [keyof Draft, string][] }[] = [
  { title: "Application details", fields: [["applied", "Date applied"], ["source", "Source"], ["location", "Location"], ["workMode", "Work mode"], ["salary", "Salary"], ["followUp", "Follow-up date"]] },
  { title: "Contact & listing", fields: [["contact", "Contact / email"], ["phone", "Phone number"], ["link", "Job listing"]] },
];
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export const dynamic = "force-dynamic";
export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  if (!authConfigured()) return <main>Authentication is not configured.</main>;
  const { id } = await params;
  const session = await getAuth0().getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent(`/mcp/approve/${id}`)}`);
  if (!isOwner(session.user.sub)) return <main>Access denied.</main>;
  const preview = await getPreview(id, session.user.sub);
  if (!preview) return <main>Preview not found.</main>;
  const draft = preview.draft;
  const state = preview.applicationId ? "saved" : preview.expired ? "expired" : preview.approvedAt ? "approved" : "pending";
  const expiry = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(preview.expiresAt);
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/"><span className={styles.mark} aria-hidden="true">↗</span> Application Tracker</Link>
      <ThemeToggle />
    </header>
    <div className={styles.content}>
      <Link href="/" className={styles.back}>← Back to tracker</Link>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>REVIEW & APPROVE</p>
        <h1>Your application, ready to review.</h1>
        <p>Check the details below. You decide what gets added to your tracker.</p>
      </div>
      <div className={styles.layout}>
        <article className={styles.card} aria-label="Application preview">
          <div className={styles.summary}>
            <div className={styles.companyIcon} aria-hidden="true">{draft.company.charAt(0).toUpperCase()}</div>
            <div className={styles.company}><p>{draft.company}</p><h2>{draft.role}</h2></div>
            <span className={styles.badge}>{draft.status}</span>
          </div>
          {sections.map(section => <section className={styles.section} key={section.title}>
            <h3>{section.title}</h3>
            <dl className={styles.details}>{section.fields.map(([key, label]) => {
              const value = draft[key];
              return <div key={key} className={key === "link" ? styles.fullWidth : undefined}>
                <dt>{label}</dt>
                <dd className={!value ? styles.empty : undefined}>{value
                  ? (key === "applied" || key === "followUp") ? dateLabel(value) : value
                  : "Not provided"}</dd>
              </div>;
            })}</dl>
          </section>)}
          <section className={styles.section}><h3>Notes</h3><p className={draft.notes ? styles.notes : styles.empty}>{draft.notes || "No notes added."}</p></section>
          {draft.rejectReason && <section className={styles.section}><h3>Rejection reason</h3><p className={styles.notes}>{draft.rejectReason}</p></section>}
        </article>
        <aside className={styles.sidebar} aria-label="Approval">
          <section className={styles.approval}>
            <div className={styles.approvalIcon} aria-hidden="true">{state === "saved" || state === "approved" ? "✓" : state === "expired" ? "◷" : "↗"}</div>
            <h2>{state === "saved" ? "Application saved" : state === "expired" ? "Preview expired" : state === "approved" ? "You’re all set" : "You’re in control"}</h2>
            <p className={styles.description}>{state === "saved" ? "This application is now in your tracker. You can return to your AI chat."
              : state === "expired" ? "This approval link is no longer active. Ask your AI for a fresh preview to continue."
              : state === "approved" ? "You approved these details. Return to your AI chat and ask it to save the application before this preview expires."
              : "Approve only after you’ve submitted the job application and reviewed these details."}</p>
            {state === "pending" ? <form method="post" action={`/mcp/approve/${encodeURIComponent(id)}/confirm`}>
              <label className={styles.confirmation}><input type="checkbox" name="submitted" value="yes" required />
                <span>I submitted this job application and approve saving these exact details.</span>
              </label>
              <button className={styles.approveButton} type="submit">Approve application <span aria-hidden="true">→</span></button>
              <p className={styles.hint}>After approval, return to your AI chat to finish saving.</p>
            </form> : <Link className={styles.secondaryButton} href="/">Back to tracker <span aria-hidden="true">→</span></Link>}
            <div className={styles.expiry}><span>{state === "saved" ? "Preview expiry" : "Approval link expires"}</span><time dateTime={preview.expiresAt.toISOString()}>{expiry} IST</time></div>
          </section>
          <p className={styles.safety}>Duplicate checks run again before saving. To change any details, ask your AI for a new preview.</p>
        </aside>
      </div>
      <footer className={styles.footer}>Your private application tracker · Only you can approve this application</footer>
    </div>
  </main>;
}

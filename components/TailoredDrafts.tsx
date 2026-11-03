"use client";
import { useEffect, useState } from "react";

type Content = { fitSummary: string; matchingQualifications: string[]; missingQualifications: string[]; resume: string; emailSubject: string; emailBody: string };
type Draft = { _id: string; company: string; role: string; content: Content; reviewNumbers?: string[]; usage?: { inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null; inputPerMillionUsd?: number; outputPerMillionUsd?: number; pricingDate?: string } };

function DraftEditor({ draft }: { draft: Draft }) {
  const [content, setContent] = useState(draft.content);
  const [saved, setSaved] = useState(draft.content);
  const [message, setMessage] = useState("");
  async function save() {
    setMessage("Saving…");
    try { const response = await fetch("/api/tailored-drafts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft._id, content }) }); if (!response.ok) throw new Error(); setSaved(content); setMessage("Saved."); }
    catch { setMessage("Could not save. Please check the fields and try again."); }
  }
  const dirty = JSON.stringify(content) !== JSON.stringify(saved);
  const usage = draft.usage;
  const estimate = usage && usage.inputTokens != null && usage.outputTokens != null && usage.inputPerMillionUsd != null && usage.outputPerMillionUsd != null ? (usage.inputTokens * usage.inputPerMillionUsd + usage.outputTokens * usage.outputPerMillionUsd) / 1000000 : null;
  return <article className="rounded-xl border border-line bg-surface p-5"><h3 className="text-lg font-semibold">{draft.role} · {draft.company}</h3><p className="mt-2 text-sm text-muted">Review every detail. AI can make mistakes. This draft has not been sent.</p>{draft.reviewNumbers && draft.reviewNumbers.length > 0 && <p className="mt-2 text-sm">Check these numbers against your profile: {draft.reviewNumbers.join(", ")}. This is not a complete fact check.</p>}<p className="mt-2 text-sm text-muted">{usage?.totalTokens != null ? `AI tokens: ${usage.totalTokens}. ` : ""}{estimate != null ? `Estimated paid API cost: $${estimate.toFixed(4)} (rates from ${usage?.pricingDate}; excludes taxes). This is not your bill.` : "Cost estimate unavailable for this draft."}</p><p className="mt-3 text-sm">{content.fitSummary}</p><p className="mt-2 text-sm"><strong>Matches:</strong> {content.matchingQualifications.join("; ") || "None listed"}</p><p className="mt-2 text-sm"><strong>Gaps:</strong> {content.missingQualifications.join("; ") || "None listed"}</p>
    {([ ["resume", "Tailored resume"], ["emailSubject", "Email subject"], ["emailBody", "Email"] ] as const).map(([key, label]) => <label key={key} className="mt-4 grid gap-1 text-sm">{label}<textarea className="w-full rounded-md border border-line bg-transparent p-3 text-fg" rows={key === "resume" ? 14 : key === "emailBody" ? 7 : 2} value={content[key]} onChange={event => setContent({ ...content, [key]: event.target.value })} /></label>)}
    <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => void save()} className="rounded-md bg-fg px-4 py-2 text-sm text-surface">Save changes</button>{!dirty ? <a href={`/api/tailored-drafts/pdf?id=${encodeURIComponent(draft._id)}`} className="rounded-md border border-line px-4 py-2 text-sm">Download saved PDF</a> : <span className="text-sm text-muted">Save changes before downloading the PDF.</span>}</div><p role="status" className="mt-2 text-sm text-muted">{message}</p></article>;
}
export function TailoredDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>([]); const [message, setMessage] = useState("Loading drafts…");
  useEffect(() => { let active = true; fetch("/api/tailored-drafts", { cache: "no-store" }).then(async response => { if (!response.ok) throw new Error(); const data = await response.json(); if (active) { setDrafts(data.drafts); setMessage(data.drafts.length ? "" : "No drafts yet. Open Job inbox and choose Create draft on a job."); } }).catch(() => { if (active) setMessage("Could not load drafts."); }); return () => { active = false; }; }, []);
  return <section className="grid gap-4"><div><h2 className="text-xl font-semibold">Resume drafts</h2><p className="mt-1 text-sm text-muted">Your drafts stay separate from applications.</p></div><p role="status" className="text-sm text-muted">{message}</p>{drafts.map(draft => <DraftEditor key={draft._id} draft={draft} />)}</section>;
}

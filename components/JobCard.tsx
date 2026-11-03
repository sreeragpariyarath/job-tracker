import { Button } from "./ui/Button";

export type InboxJob = { _id: string; title: string; company: string; location: string; workMode?: string; url: string; description: string; source: string; postedAt: string; status: string; applied: boolean; possibleDuplicate: boolean };

export function JobCard({ job, busy, onDraft, onUpdate }: { job: InboxJob; busy: boolean; onDraft: (id: string) => void; onUpdate: (id: string, status: string) => void }) {
  const posted = job.postedAt ? new Date(job.postedAt) : null;
  const date = posted && !Number.isNaN(posted.getTime()) ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(posted) : null;
  return <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-applied-line sm:p-6">
    <div className="flex items-start gap-4"><div aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-applied-soft text-base font-semibold text-applied-fg">{job.company.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-wider text-muted">{job.company}</p><h3 className="mt-1 text-lg font-semibold leading-snug text-fg">{job.title}</h3></div>{job.status === "saved" && <span className="rounded-full bg-applied-soft px-3 py-1 text-xs font-medium text-applied-fg">Saved</span>}</div>
    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">{[job.location || "Location not provided", job.workMode || "Work mode not specified", job.source, date && `Posted ${date}`].filter(Boolean).map(value => <span key={value} className="rounded-full border border-line bg-subtle px-3 py-1.5">{value}</span>)}</div>
    {(job.applied || job.possibleDuplicate) && <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-fg">{job.applied ? "You may have already applied. Check your tracker." : "A similar job is already in your inbox."}</p>}
    <p className="mt-4 line-clamp-4 flex-1 whitespace-pre-wrap text-sm leading-6 text-muted">{job.description || "No description provided."}</p>
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4"><Button variant="primary" disabled={busy || !job.description} onClick={() => onDraft(job._id)}>Create draft</Button><a href={job.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm font-medium text-fg transition-colors hover:bg-subtle">View job ↗</a><Button onClick={() => onUpdate(job._id, job.status === "saved" ? "new" : "saved")}>{job.status === "saved" ? "Unsave" : "Save"}</Button><Button variant="quiet" onClick={() => onUpdate(job._id, "dismissed")}>Dismiss</Button></div>
  </article>;
}

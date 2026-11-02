"use client";

import { useEffect, useState } from "react";

const fields = [
  ["name", "Your name"], ["skills", "Skills"], ["experience", "Work experience"],
  ["education", "Education"], ["projects", "Projects and achievements"],
  ["roles", "Preferred roles"], ["locations", "Preferred locations"],
  ["preferences", "Work mode, salary and other preferences"],
] as const;
type Profile = Record<(typeof fields)[number][0] | "resumeText", string>;
const empty = { ...Object.fromEntries(fields.map(([key]) => [key, ""])), resumeText: "" } as Profile;

export function CareerProfile() {
  const [profile, setProfile] = useState<Profile>(empty);
  const [message, setMessage] = useState("Loading profile…");
  const [ready, setReady] = useState(false);
  const [extracted, setExtracted] = useState("");
  const [extracting, setExtracting] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/profile", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (active) { setProfile({ ...empty, ...data.profile }); setMessage(""); setReady(true); }
    }).catch(() => { if (active) setMessage("Could not load your profile. Please refresh and try again."); });
    return () => { active = false; };
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Saving…");
    try {
      const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      if (!response.ok) throw new Error();
      setMessage("Profile saved.");
    } catch { setMessage("Could not save your profile. Please try again."); }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) { setMessage("Choose a file under 1 MB."); return; }
    setExtracting(true);
    setMessage("Reading CV…");
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch("/api/profile/extract", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setExtracted(result.text);
      setMessage("Review the extracted CV below. It is not saved yet.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not read your CV."); }
    finally { setExtracting(false); }
  }
  return <section className="rounded-xl border border-line bg-surface p-6" aria-labelledby="profile-title">
    <h2 id="profile-title" className="text-lg font-semibold">Career profile</h2>
    <p className="mt-1 text-sm text-muted">Add your real experience and job preferences. You can update this anytime.</p>
    <div className="mt-4 grid gap-2 text-sm">
      <label htmlFor="resume-upload">Upload your CV (PDF, DOCX or TXT, under 1 MB)</label>
      <input id="resume-upload" type="file" accept=".pdf,.docx,.txt" disabled={!ready || extracting} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
      {extracted && <div className="grid gap-2"><label htmlFor="resume-review">Review and correct the extracted text</label><textarea id="resume-review" rows={12} value={extracted} onChange={(event) => setExtracted(event.target.value)} className="w-full rounded-md border border-line bg-transparent p-2 text-fg" /><div className="flex gap-3"><button type="button" className="underline" onClick={() => { setProfile({ ...profile, resumeText: extracted }); setExtracted(""); setMessage("CV added to the profile. Press Save profile to keep it."); }}>Use this CV</button><button type="button" className="underline" onClick={() => { setExtracted(""); setMessage("CV discarded."); }}>Discard</button></div></div>}
    </div>
    <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
      {fields.map(([key, label]) => <label key={key} className="grid gap-1 text-sm">
        <span>{label}</span>
        <textarea disabled={!ready} value={profile[key]} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} rows={key === "experience" || key === "projects" ? 4 : 2} className="w-full rounded-md border border-line bg-transparent p-2 text-fg" />
      </label>)}
      <label className="grid gap-1 text-sm sm:col-span-2"><span>Verified CV text</span><textarea disabled={!ready} rows={8} maxLength={50000} value={profile.resumeText} onChange={(event) => setProfile({ ...profile, resumeText: event.target.value })} className="w-full rounded-md border border-line bg-transparent p-2 text-fg" /></label>
      <div className="sm:col-span-2"><button disabled={!ready} className="rounded-md bg-fg px-4 py-2 text-sm font-medium text-surface disabled:opacity-50" type="submit">Save profile</button><p className="mt-2 text-sm text-muted" role="status">{message}</p></div>
    </form>
  </section>;
}

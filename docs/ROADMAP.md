# Personal job search assistant roadmap

This private, single-owner application extends the existing tracker. The owner reviews every application and follow-up before sending. Discovered jobs are not applications until sending or manual submission is confirmed. Existing records and MCP approvals remain available.

## Phase 1 — Profile and installable app

Make the tracker installable on iPhone as a PWA. Add an owner-only career profile, verified skills, experience, education and projects; preferences for roles, locations, remote work and salary; and CV upload with review of extracted content before it is used. Keep personal data private. Test installation and profile persistence.

## Phase 2 — Job discovery

Search JSearch and FreeHire daily, initially three JSearch searches per day. Keep sources and result limits configurable. Import Naukri job-alert emails after verifying their format. Store listings separately, remove duplicates and compare against existing applications. Show source links, discovery dates and job details in a Job Inbox. Never assume complete coverage.

### Setup and current limits

Set `JSEARCH_API_KEY` to an OpenWeb Ninja API key and `CRON_SECRET` to a random secret in the Vercel production environment; redeploy to apply them. Vercel sends the cron secret as a bearer token. The schedule runs daily at 03:30 UTC (approximately 09:00–10:00 IST on Hobby). In Job inbox → Daily search settings, select sources, enter up to three searches and enable the schedule. Daily searches use the selected city (Kochi by default). FreeHire optionally also searches India remote jobs; JSearch searches the selected city. Manual search can select India remote jobs. Existing saved results are preserved and may be from earlier searches. Provider location data may be incomplete, so check eligibility. Each query requests only the first page. Results are not AI-scored, and an existing application match is a warning rather than proof. Scheduled runs are claimed once per IST day; if a run is interrupted it is not retried automatically, to avoid duplicate API usage. The owner can search manually. Vercel cron delivery is not guaranteed. Naukri alert import requires the later Gmail connection and is not implemented yet.

## Phase 3 — Tailored resumes

Use the verified profile and paid Gemini to score job fit and produce truthful tailored resumes and application emails. Flag missing qualifications; never invent facts. Generate accessible, text-based ATS-friendly PDFs and validate extraction. Store the exact resume version with each draft. Limit AI use and record costs.

## Phase 4 — Gmail applications

Connect Gmail with separate OAuth consent and minimum necessary scopes. Show recipient, message and resume for review; attach the tailored PDF and send only after approval. Record confirmed message and thread IDs. Reconcile uncertain sends before retrying. For portal-only jobs, open the link and record the application only after manual confirmation.

## Phase 5 — Notifications

Add Firebase Cloud Messaging and test on a real iPhone PWA. If unsupported, use standard Web Push. Require notification permission from an explicit user action; store and revoke subscriptions securely. Notify about new matches, reviews, replies, follow-ups and failures without exposing sensitive content on the lock screen.

## Phase 6 — Reply monitoring

Use Gmail watch and Pub/Sub to trigger synchronization, renew the watch, and perform periodic recovery sync. Link replies by thread; ask for confirmation when the match is uncertain. Show a timeline and draft suggested responses. Pause no-response follow-ups on a relevant reply and alert on disconnection.

## Phase 7 — Follow-ups

Check after three working days, excluding weekends, then prepare a follow-up for review. After a confirmed send, check again after three working days; stop after two follow-ups. Allow snooze and stop. Check Gmail immediately before sending; postpone if synchronization is unavailable. Do not send without approval.

## Phase 8 — Launch and reliability

Run short-lived Cloud Run tasks with Cloud Scheduler and durable task records. Add failure alerts, safe retries, backups, usage dashboards and a configurable AI spending limit. Test the entire flow, access control, duplicates and recovery. Verify free-tier limits and cloud billing; budget alerts alone do not cap charges. Document deployment, OAuth reconnection, costs and recovery.

## Dependencies and safeguards

Retain Auth0 owner checks, same-origin browser writes, the MongoDB DNS workaround and MCP behavior. Preserve license and copyright notices when adapting Dossier code. Use sample data until external services are configured. Real iPhone push requires a Home Screen web app and iOS 16.4 or later. The Google Cloud trial does not pay for Gemini API or external job APIs.

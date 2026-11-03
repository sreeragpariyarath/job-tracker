"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ApplicationDetails } from "./ApplicationDetails";
import { CareerProfile } from "./CareerProfile";
import { JobInbox } from "./JobInbox";
import { TailoredDrafts } from "./TailoredDrafts";
import { ApplicationForm } from "./ApplicationForm";
import { ApplicationsTable } from "./ApplicationsTable";
import { FollowUpQueue } from "./FollowUpQueue";
import { JsonImportModal } from "./JsonImportModal";
import { StatsBar } from "./StatsBar";
import { StatusTabs, type TabItem } from "./StatusTabs";
import { ThemeToggle } from "./ThemeToggle";
import { TableToolbar, type SortKey } from "./TableToolbar";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { ChevronDown, Document, Plus } from "./ui/icons";
import { useApplications } from "@/hooks/useApplications";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useToast } from "@/hooks/useToast";
import { downloadCSV, toCSV } from "@/lib/csv";
import { FOLLOW_DAYS, addDays, today } from "@/lib/date";
import { SOURCES, STATUSES, type App, type Draft, type Status } from "@/lib/types";

const CSV_HEADERS = [
  "Company", "Role", "Source", "Work mode", "Salary", "Location", "Date applied",
  "Status", "Follow-up date", "Contact", "Mobile", "Link", "Notes", "Rejection reason", "Created", "Updated",
];

type SheetData = {
  editing: App | null;
  /** "view" shows read-only details (row click); "edit" shows the form. */
  mode: "view" | "edit";
  presetStatus?: Status;
  focusReason?: boolean;
};
type SheetState = SheetData | null;

function openView(a: App): SheetData {
  return { editing: a, mode: "view" };
}

function openEdit(a: App | null, extra?: Partial<Omit<SheetData, "editing" | "mode">>): SheetData {
  return { editing: a, mode: "edit", ...extra };
}

export default function Tracker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  // Defaults only — the URL is applied in the effect below after mount, so the
  // hydration render never reads searchParams (render-time reads stall reveal
  // of the streamed Suspense boundary in this Next version).
  const [statusFilter, setStatusFilter] = useState("Active");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [jsonImportOpen, setJsonImportOpen] = useState(false);
  const [workspace, setWorkspace] = useState<"applications" | "inbox" | "profile" | "drafts">("applications");
  const searchRef = useRef<HTMLInputElement>(null);
  const pageSize = 10;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const status = searchParams.get("status");
      const source = searchParams.get("source");
      const nextSort = searchParams.get("sort") as SortKey | null;
      setQuery(searchParams.get("search") || "");
      setStatusFilter(status && (["Active", "All", ...STATUSES] as string[]).includes(status) ? status : "Active");
      setSourceFilter(source && (SOURCES as readonly string[]).includes(source) ? source : "");
      setSort(nextSort && ["updated", "applied", "followUp", "company"].includes(nextSort) ? nextSort : "updated");
      setPage(Math.max(1, Number(searchParams.get("page")) || 1));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const { apps, summary, pagination, loaded, loading, error, retry, create, update, remove } = useApplications({
    query: debouncedQuery,
    status: statusFilter,
    source: sourceFilter,
    sort,
    page,
    pageSize,
  });

  useHotkeys(
    {
      n: () => setSheet(openEdit(null)),
      "/": () => searchRef.current?.focus(),
    },
    sheet === null,
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    counts.set("Active", summary.activeTab);
    counts.set("All", summary.total);
    for (const status of STATUSES) counts.set(status, summary.byStatus[status]);
    return counts;
  }, [summary]);

  const tabs: readonly TabItem[] = useMemo(() => {
    return ["Active", "All", ...STATUSES].map((key) => ({
      id: key,
      label: key,
      count: statusCounts.get(key) ?? 0,
    }));
  }, [statusCounts]);

  const list = apps;

  function resetPage() {
    setPage(1);
  }

  function updateUrl(changes: Record<string, string | number>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === "" || (key === "sort" && value === "updated")) next.delete(key);
      else next.set(key, String(value));
    }
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setStatusFilter("Active");
    setSourceFilter("");
    setSort("updated");
    setPage(1);
    updateUrl({ search: "", status: "Active", source: "", sort: "updated", page: 1 });
  }

  function exportCsv() {
    const rows = apps.map((a) => [
      a.company, a.role, a.source, a.workMode, a.salary, a.location, a.applied,
      a.status, a.followUp, a.contact, a.phone, a.link, a.notes, a.rejectReason,
      new Date(a.createdAt).toISOString(), new Date(a.updatedAt).toISOString(),
    ]);
    downloadCSV(`applications-${today()}.csv`, toCSV(CSV_HEADERS, rows));
    toast(`Exported ${apps.length} application${apps.length === 1 ? "" : "s"} on this page`);
  }

  async function handleSave(data: Draft): Promise<boolean> {
    const editing = sheet?.editing ?? null;
    if (editing) {
      const ok = await update(editing.id, data);
      if (ok) {
        toast("Saved");
        setSheet(null);
      }
      return ok;
    }
    const created = await create(data);
    if (created) {
      toast("Added " + created.company);
      setSheet(null);
    }
    return created !== null;
  }

  async function handleDelete(a: App) {
    if (await remove(a.id)) setSheet(null);
  }

  function handleStatusChange(a: App, status: Status) {
    if (status === a.status) return;
    if (status === "Rejected") {
      // Needs a mandatory reason — route through the form instead of a blind patch.
      setSheet(openEdit(a, { presetStatus: "Rejected", focusReason: true }));
      return;
    }
    if (status === "Closed") {
      void update(a.id, { status, followUp: "" }, "Closed");
      return;
    }
    void update(a.id, { status });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied " + text);
    } catch {
      toast(text);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-10 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-line pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-applied-fg">Your career workspace</p>
          <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-tight text-fg">Application Tracker</h1>
          <p className="mt-1 text-sm text-muted">Your job search, all in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/auth/logout"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium whitespace-nowrap text-muted no-underline transition-colors hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <svg className="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4M12 6l4 4-4 4M7 10h9" />
            </svg>
            Sign out
          </a>
          <ThemeToggle />
          <Button size="lg" onClick={() => setJsonImportOpen(true)}>
            <Document className="size-3.5" />
            Quick add JSON
          </Button>
          <Button variant="primary" size="lg" onClick={() => setSheet(openEdit(null))}>
            <Plus className="size-3.5" />
            Add application
          </Button>
        </div>
      </header>

      <nav aria-label="Tracker sections" className="rounded-2xl border border-line bg-surface p-1.5 shadow-sm">
        <div className="flex flex-wrap gap-1">
          {([
            ["applications", "Applications"],
            ["inbox", "Job inbox"],
            ["drafts", "Resume drafts"],
            ["profile", "Career profile"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={workspace === id} onClick={() => setWorkspace(id)} className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${workspace === id ? "bg-applied-soft text-applied-fg" : "text-muted hover:bg-subtle hover:text-fg"}`}>
              {label}
            </button>
          ))}
        </div>
      </nav>

      {workspace === "profile" && <CareerProfile />}
      {workspace === "inbox" && <JobInbox />}
      {workspace === "drafts" && <TailoredDrafts />}

      <div className={workspace === "applications" ? "flex flex-col gap-4" : "hidden"}>

      <StatsBar
        dueCount={summary.due.length}
        waitingCount={summary.active}
        interviewCount={statusCounts.get("Interview") ?? 0}
        totalCount={summary.total}
      />

      {summary.due.length > 0 && (
        <FollowUpQueue
          items={summary.due}
          onFollowUp={(a) =>
            void update(
              a.id,
              { status: "Followed up", followUp: addDays(today(), FOLLOW_DAYS) },
              `Marked followed up. Next check in ${FOLLOW_DAYS} days.`,
            )
          }
          onClose={(a) => void update(a.id, { status: "Closed", followUp: "" }, "Closed with no response")}
          onCopy={copy}
          onOpen={(a) => setSheet(openView(a))}
        />
      )}

      <section aria-label="All applications" className="flex flex-col gap-4">
        <TableToolbar
          query={query}
          onQuery={(value) => {
            setQuery(value);
            resetPage();
            updateUrl({ search: value, page: 1 });
          }}
          source={sourceFilter}
          onSource={(value) => {
            setSourceFilter(value);
            resetPage();
            updateUrl({ source: value, page: 1 });
          }}
          sort={sort}
          onSort={(value) => {
            setSort(value);
            resetPage();
            updateUrl({ sort: value, page: 1 });
          }}
          onExport={exportCsv}
          searchRef={searchRef}
        />

        <StatusTabs
          tabs={tabs}
          activeId={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            resetPage();
            updateUrl({ status: value, page: 1 });
          }}
        />

        <ApplicationsTable
          apps={list}
          loaded={loaded}
          loading={loading}
          error={error}
          emptyKind={summary.total === 0 ? "database" : "filters"}
          onRetry={retry}
          onEmptyAction={summary.total === 0 ? () => setSheet(openEdit(null)) : clearFilters}
          onOpen={(a) => setSheet(openView(a))}
          onStatusChange={handleStatusChange}
          footer={
            loaded ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-4 text-[12px] text-muted">
                <span>
                  {pagination.totalPages > 1
                    ? `Showing ${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total} applications`
                    : `Showing ${apps.length} of ${pagination.total} applications`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={page <= 1}
                    onClick={() => {
                      const nextPage = page - 1;
                      setPage(nextPage);
                      updateUrl({ page: nextPage });
                    }}
                    className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronDown className="size-4 rotate-90" />
                  </button>
                  <span className="flex size-9 items-center justify-center rounded-md bg-page-active font-medium text-white tabular-nums">
                    {pagination.page}
                  </span>
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={page >= pagination.totalPages}
                    onClick={() => {
                      const nextPage = page + 1;
                      setPage(nextPage);
                      updateUrl({ page: nextPage });
                    }}
                    className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-fg disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronDown className="size-4 -rotate-90" />
                  </button>
                </div>
              </div>
            ) : null
          }
        />
      </section>
      </div>

      <Modal
        open={sheet !== null}
        onClose={() => setSheet(null)}
        xwide
        description={
          !sheet?.editing
            ? "Track a new job application"
            : sheet.mode === "view"
              ? "View complete information about this application"
              : "Update the details of this job application"
        }
        title={
          sheet?.editing
            ? sheet.mode === "view"
              ? "Application details"
              : "Edit application"
            : "Add application"
        }
      >
        {sheet?.editing && sheet.mode === "view" ? (
          <ApplicationDetails
            key={sheet.editing.id}
            app={sheet.editing}
            onEdit={() => setSheet((s) => (s ? { ...s, mode: "edit" } : s))}
            onDelete={handleDelete}
          />
        ) : (
          sheet && (
            <ApplicationForm
              key={sheet.editing?.id ?? "new"}
              editing={sheet.editing}
              presetStatus={sheet.presetStatus}
              focusReason={sheet.focusReason}
              existing={apps}
              onSave={handleSave}
              onDelete={handleDelete}
              onCancel={() => setSheet(null)}
            />
          )
        )}
      </Modal>

      <JsonImportModal
        open={jsonImportOpen}
        onClose={() => setJsonImportOpen(false)}
        onImported={(result) => {
          setJsonImportOpen(false);
          void retry();
          if (result.errors.length > 0) {
            toast(`Imported ${result.createdCount}; ${result.errors.length} row${result.errors.length === 1 ? "" : "s"} had issues`);
          } else if (result.skippedCount > 0) {
            toast(`Imported ${result.createdCount}; skipped ${result.skippedCount} duplicate${result.skippedCount === 1 ? "" : "s"}`);
          } else {
            toast(`Imported ${result.createdCount} application${result.createdCount === 1 ? "" : "s"}`);
          }
        }}
      />
    </div>
  );
}

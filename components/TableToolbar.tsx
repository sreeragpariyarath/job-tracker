import type { RefObject } from "react";
import { SOURCES } from "@/lib/types";
import type { ApplicationSort } from "@/lib/types";
import { Button } from "./ui/Button";
import { Search, Download } from "./ui/icons";
import { Select, type SelectOption } from "./ui/Select";

export const SORTS: SelectOption[] = [
  { value: "updated", label: "Recently updated" },
  { value: "applied", label: "Newest applied" },
  { value: "followUp", label: "Follow-up date" },
  { value: "company", label: "Company A–Z" },
];
export type SortKey = ApplicationSort;

const SOURCE_OPTIONS: SelectOption[] = [{ value: "", label: "All sources" }, ...SOURCES.map((s) => ({ value: s, label: s }))];

type Props = {
  query: string;
  onQuery: (v: string) => void;
  source: string;
  onSource: (v: string) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  onExport: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
};

export function TableToolbar({ query, onQuery, source, onSource, sort, onSort, onExport, searchRef }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative min-w-0 flex-[1_1_208px]">
        <Search className="pointer-events-none absolute top-1/2 left-[22.4px] size-4 -translate-y-1/2 text-muted" />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search company, role, contact or notes…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search applications"
          className="min-h-11 w-full rounded-lg border border-line bg-surface pr-4 pl-[41.6px] text-sm text-fg placeholder:text-muted transition-colors focus:border-tab-active-line focus:outline-none"
        />
      </div>
      <Select value={source} options={SOURCE_OPTIONS} onChange={onSource} ariaLabel="Filter by source" large />
      <Select value={sort} options={SORTS} onChange={(v) => onSort(v as SortKey)} ariaLabel="Sort applications" large />
      <Button size="lg" variant="default" onClick={onExport} title="Download applications on this page as CSV" className="bg-surface">
        <Download className="size-4" />
        Export CSV
      </Button>
    </div>
  );
}

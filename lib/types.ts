export const STATUSES = ["Applied", "Followed up", "Interview", "Offer", "Rejected", "Closed"] as const;
export type Status = (typeof STATUSES)[number];

export type ApplicationSort = "updated" | "applied" | "followUp" | "company";

export type ApplicationSummary = {
  total: number;
  active: number;
  activeTab: number;
  byStatus: Record<Status, number>;
  due: App[];
};

export type ApplicationListResponse = {
  items: App[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: ApplicationSummary;
};

export const SOURCES = ["Email", "Indeed", "Naukri", "LinkedIn", "Company site", "Infopark", "Referral", "Other"] as const;

export const WORK_MODES = ["Remote", "Hybrid", "On-site"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export type Draft = {
  company: string;
  role: string;
  source: string;
  location: string;
  applied: string;
  status: Status;
  followUp: string;
  contact: string;
  phone: string;
  link: string;
  notes: string;
  rejectReason: string;
  salary: string;
  workMode: string;
};

export type App = Draft & {
  id: string;
  createdAt: number;
  updatedAt: number;
  provenance?: { origin: "mcp"; ownerSub: string; clientId: string; previewId: string };
  auditHistory?: { action: "created"; actor: string; clientId: string; at: number; approvedAt: number }[];
};

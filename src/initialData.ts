import type { DocumentItem, SchedulingEvent } from "./types/domain";
export type { DocumentItem, SchedulingEvent } from "./types/domain";

export interface DashboardLead {
  id: string;
  name: string;
  phone: string;
  service: string;
  status: string;
  date: string;
}

export interface RosterItem {
  name: string;
  role: string;
  code: string;
  status: string;
}

export interface RecentAiAction {
  id: string;
  date: string;
  time: string;
  module: string;
  action: string;
  reason: string;
  status: "Approved" | "Pending Approval" | "Completed" | "Undone" | "Active";
  approvedBy: string;
}

export interface SnapshotItem {
  id: string;
  pageId: string;
  pageName: string;
  timestamp: string;
  filename: string;
  fileSize: string;
  meta: { recordCount: number; filters: string; details: string };
  imageSrc?: string;
}

export const INITIAL_DASHBOARD_LEADS: DashboardLead[] = [];

export const INITIAL_RECENT_ROSTER: RosterItem[] = [];

export const INITIAL_DOCUMENTS: DocumentItem[] = [];

export const INITIAL_SCHEDULING_EVENTS: SchedulingEvent[] = [];

export const INITIAL_RECENT_AI_ACTIONS: RecentAiAction[] = [];

export const INITIAL_SNAPSHOTS: SnapshotItem[] = [];

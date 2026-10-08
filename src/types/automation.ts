/**
 * WHEN -> IF -> DO automations. Optional, OFF by default, and layered on top
 * of the existing manual workflow (Lead -> Estimate -> Job -> Scheduling ->
 * Completion -> Invoice) -- an automation only ever calls the same canonical
 * actions a manual button already calls, never a parallel copy of them.
 *
 * Persisted per business in the `automations` collection (tenant-scoped by
 * businessId, enforced in firestore.rules) and every execution is logged in
 * `automation_runs`.
 */

export type AutomationTrigger =
  | "lead.created"
  | "estimate.created"
  | "estimate.accepted"
  | "job.created"
  | "job.completed"
  | "appointment.created"
  | "invoice.created"
  | "invoice.paid"
  | "invoice.overdue"
  | "booking.website.created"
  | "booking.portal.created";

export type AutomationConditionField = "amount" | "priority" | "source" | "daysOverdue" | "serviceType" | "status";

export type AutomationConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "at_least"
  | "less_than"
  | "at_most"
  | "contains";

/** One IF rule. Every condition on an automation must pass (simple AND only). */
export interface AutomationCondition {
  id: string;
  field: AutomationConditionField;
  operator: AutomationConditionOperator;
  value: string;
}

export type AutomationActionType =
  | "create_job"
  | "create_appointment"
  | "create_invoice"
  | "send_customer_confirmation"
  | "send_customer_message"
  | "notify_team"
  | "create_follow_up_task"
  | "request_review"
  | "mark_priority"
  | "update_status"
  | "add_timeline_entry";

export type AutomationRecipients = "owner" | "managers" | "owner_and_managers";

export interface AutomationActionConfig {
  /** Message body for customer messages, team notifications, and timeline entries. Supports {customer}, {number}, {amount}, {date}, {business}. */
  message?: string;
  /** notify_team */
  recipients?: AutomationRecipients;
  /** mark_priority */
  priority?: "Low" | "Medium" | "High" | "Urgent";
  /** update_status (validated against a safe, non-destructive allowlist per record type) */
  status?: string;
  /** create_job / create_appointment / create_follow_up_task: schedule N days after the event (default 1). */
  daysFromNow?: number;
  /** create_appointment: calendar entry type (Site Visit, Consultation, Estimate, Inspection). */
  appointmentType?: string;
  /** create_appointment / create_follow_up_task title */
  title?: string;
}

export interface AutomationAction {
  id: string;
  type: AutomationActionType;
  config?: AutomationActionConfig;
}

export type AutomationRunStatus = "Running" | "Completed" | "Partial" | "Skipped" | "Failed";

export interface Automation {
  id: string;
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  /** Denormalized list of actions[].type -- lets firestore.rules enforce the safe action allowlist server-side (rules can't iterate a list of maps). */
  actionTypes: AutomationActionType[];
  enabled: boolean;
  /** When the automation was last switched ON. Time-based triggers (invoice.overdue) never reach back before this, so turning one on can't blast every historical record. */
  enabledAt?: string;
  templateId?: string;
  createdAt: string;
  createdBy?: string;
  lastRunAt?: string;
  lastRunStatus?: AutomationRunStatus;
  lastRunSummary?: string;
}

export interface AutomationActionResult {
  actionId: string;
  type: AutomationActionType;
  status: "completed" | "skipped" | "failed";
  detail: string;
  recordId?: string;
}

/** One execution-history entry (collection `automation_runs`). Document id is deterministic -- see automationRunId() -- which is what makes a replayed event a no-op. */
export interface AutomationRun {
  id: string;
  businessId: string;
  automationId: string;
  automationName: string;
  trigger: AutomationTrigger;
  eventKey: string;
  sourceCollection: string;
  sourceRecordId: string;
  sourceLabel?: string;
  conditions: AutomationCondition[];
  conditionResults: string[];
  conditionsMet: boolean;
  actionsAttempted: AutomationActionType[];
  actionResults: AutomationActionResult[];
  completedActions: number;
  skippedActions: number;
  failedActions: number;
  errors: string[];
  status: AutomationRunStatus;
  startedAt: string;
  finishedAt?: string;
  /** Email of the signed-in user whose session executed the run. */
  runBy?: string;
}

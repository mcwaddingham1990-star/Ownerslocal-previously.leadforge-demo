export type CompletionGoalStatus = "Not Started" | "In Progress" | "Blocked" | "Completed";

export interface CompletionMaterial {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  notes?: string;
  submittedBy: string;
  submittedAt: string;
  approvalStatus: "pending" | "approved" | "rejected";
  deductedAt?: string;
  deductedBy?: string;
}

export interface CompletionAttachment { id: string; documentId: string; name: string; type: string; uploadedBy: string; uploadedAt: string }
export interface CompletionActivity { id: string; action: string; detail?: string; by: string; at: string }

export interface CompletionGoal {
  id: string;
  title: string;
  estimatedStartDate: string;
  estimatedCompletionDate: string;
  instructions: string;
  status: CompletionGoalStatus;
  completed: boolean;
  completedOnSchedule: boolean;
  actualCompletionDate: string;
  projectNotes: string;
  issuesDuringCompletion: string;
  lastEmployeeName?: string;
  lastUpdatedAt?: string;
  /** Stamped only when the assigned employee explicitly saves their goal response. Management should not treat unsaved/blank worker fields as a response. */
  employeeResponseSubmittedAt?: string;
  employeeResponseSubmittedBy?: string;
  materials: CompletionMaterial[];
  attachments: CompletionAttachment[];
  // Per-goal manager sign-off -- distinct from the whole-plan
  // finalCloseoutApproved below. Lets a manager review and approve (or leave
  // notes on) each technician's/foreman's individual completed goal at any
  // time, rather than only being able to approve the entire plan at once.
  managerReviewed: boolean;
  managerReviewedBy?: string;
  managerReviewedAt?: string;
  managerReviewNotes: string;
}

export interface ProjectCompletionPlan {
  id: string;
  jobId: string;
  businessId?: string;
  summary: string;
  overallGoal: string;
  projectStartDate: string;
  estimatedCompletionDate: string;
  goals: CompletionGoal[];
  activity: CompletionActivity[];
  finalCloseoutApproved: boolean;
  finalCloseoutApprovedBy?: string;
  finalCloseoutApprovedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

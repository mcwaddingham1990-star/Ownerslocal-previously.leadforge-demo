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
  materials: CompletionMaterial[];
  attachments: CompletionAttachment[];
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

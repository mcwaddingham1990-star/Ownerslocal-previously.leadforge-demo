export type PayrollRunStatus = "draft" | "approved" | "submitted" | "processing" | "paid" | "failed" | "void";
export type PayrollPaymentMethod = "direct_deposit" | "paper_check";

export interface PayrollTaxConfig {
  federalWithholdingRate: number;
  stateWithholdingRate: number;
  localWithholdingRate: number;
  employeeSocialSecurityRate: number;
  employeeMedicareRate: number;
  employerSocialSecurityRate: number;
  employerMedicareRate: number;
  federalUnemploymentRate: number;
  stateUnemploymentRate: number;
}

export interface PayrollEmployeeLine {
  employeeId: string;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  federalWithholding: number;
  stateWithholding: number;
  localWithholding: number;
  employeeSocialSecurity: number;
  employeeMedicare: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerTaxes: number;
  paymentMethod: PayrollPaymentMethod;
}

export interface PayrollTotals {
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  employeeTaxes: number;
  otherDeductions: number;
  netPay: number;
  employerTaxes: number;
  taxLiability: number;
  fundingRequired: number;
}

export interface PayrollRun {
  id: string;
  businessId?: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: PayrollRunStatus;
  taxConfig: PayrollTaxConfig;
  lines: PayrollEmployeeLine[];
  totals: PayrollTotals;
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  submittedAt?: string;
  provider?: "plaid" | "stripe" | "bank_ach" | "manual";
  providerBatchId?: string;
  failureReason?: string;
  auditLog: Array<{ at: string; by: string; action: string; detail?: string }>;
}

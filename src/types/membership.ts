/**
 * One shared Service Agreements / Memberships system with Recurring
 * Maintenance built in -- no separate version per page, no preset plans.
 * A Membership is the reusable master plan; each recurring visit it
 * generates is a real WorkOrder (see domain.ts) tagged with
 * sourceMembershipId -- WorkOrder already gives every generated visit its
 * own independent, freely-editable copy, so nothing new was needed for
 * that guarantee.
 */

export type MaintenanceFrequencyUnit = "days" | "weeks" | "months" | "years" | "specific_dates";

export interface MaintenanceFrequency {
  unit: MaintenanceFrequencyUnit;
  /** Every N units -- ignored when unit is "specific_dates". */
  interval?: number;
  /** YYYY-MM-DD dates, used only when unit is "specific_dates". */
  specificDates?: string[];
}

export type BillingFrequency = "weekly" | "monthly" | "quarterly" | "annually" | "one_time" | "custom";

export interface MembershipIncludedService {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  priceBookModelId?: string;
}

export interface MembershipCustomField {
  key: string;
  value: string;
}

export type MembershipStatus = "Draft" | "Active" | "Paused" | "Canceled" | "Expired";
export type MembershipBillingMethod = "stripe" | "manual" | "invoice";

export interface Membership {
  id: string;
  membershipNumber?: string;
  planName: string;
  description?: string;
  price: number;
  billingFrequency: BillingFrequency;
  /** Days between billings -- only used when billingFrequency is "custom". */
  customBillingDays?: number;
  includedServices: MembershipIncludedService[];
  discountPercent?: number;
  discountFlat?: number;
  maintenanceFrequency: MaintenanceFrequency;
  startDate: string;
  endDate?: string;
  notes?: string;
  customFields?: MembershipCustomField[];

  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  /** Property/location the agreement covers, when different from (or more specific than) the customer's own address. */
  address?: string;
  sourceEstimateId?: string;
  sourceJobId?: string;
  assignedEmployee?: string;
  assignedCrew?: string;

  status: MembershipStatus;
  /** Next date a recurring maintenance visit should be generated for. Advanced by the scheduler after each generation; cleared once endDate or the specific-dates list is exhausted. */
  nextMaintenanceDate?: string;
  lastGeneratedVisitDate?: string;
  billingMethod?: MembershipBillingMethod;
  /** Next date a recurring bill/invoice/charge should be generated for. */
  nextPaymentDate?: string;
  lastBilledDate?: string;
  stripeSubscriptionId?: string;

  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  activity?: Array<{ id: string; timestamp: string; action: string; by: string; detail?: string }>;
}

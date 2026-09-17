import { authedFetch } from "./apiClient";

/**
 * Thin client wrapper for every /api/customer-accounts/... and
 * /api/business/customers/.../invite-code or disconnect endpoint (see
 * server/customerAccounts.ts) -- each call just attaches the signed-in
 * user's Firebase ID token (authedFetch) and returns the parsed JSON body.
 * No client-side business logic lives here; every permission/tenant check
 * happens server-side.
 */
async function callJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await authedFetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  return response.json() as Promise<T>;
}

const qs = (businessId?: string) => (businessId ? `?businessId=${encodeURIComponent(businessId)}` : "");

export interface ServiceProfessionalCard {
  relationshipId: string;
  businessId: string;
  businessName: string;
  logo?: string;
  phone?: string;
  status: string;
  activeJobs: number;
  nextAppointment?: string;
  amountDue: number;
}
export interface PendingConnection { relationshipId: string; businessId: string; businessName: string; source: string }

export const getServiceProfessionals = () =>
  callJson<{ ok: boolean; error?: string; professionals?: ServiceProfessionalCard[]; pending?: PendingConnection[] }>("/api/customer-accounts/service-professionals");

export const redeemInviteCode = (code: string) =>
  callJson<{ ok: boolean; error?: string; businessName?: string }>("/api/customer-accounts/invite/redeem", { method: "POST", body: JSON.stringify({ code }) });

export const acceptRelationship = (relationshipId: string) =>
  callJson<{ ok: boolean; error?: string }>(`/api/customer-accounts/relationships/${encodeURIComponent(relationshipId)}/accept`, { method: "POST" });

export const declineRelationship = (relationshipId: string) =>
  callJson<{ ok: boolean; error?: string }>(`/api/customer-accounts/relationships/${encodeURIComponent(relationshipId)}/decline`, { method: "POST" });

export const removeRelationship = (relationshipId: string) =>
  callJson<{ ok: boolean; error?: string }>(`/api/customer-accounts/relationships/${encodeURIComponent(relationshipId)}/remove`, { method: "POST" });

export interface TaggedJob { id: string; businessId: string; businessName: string; jobNumber?: string; title?: string; description?: string; date: string; startTime: string; endTime: string; status: string; priority: string; assignedEmployee?: string; location?: string; progress?: number; checklist?: Array<{ id: string; label: string; completed: boolean }> }
export const getJobs = (businessId?: string) => callJson<{ ok: boolean; error?: string; jobs?: TaggedJob[] }>(`/api/customer-accounts/jobs${qs(businessId)}`);

export interface TaggedAppointment { id: string; businessId: string; businessName: string; eventType: string; title?: string; date: string; startTime: string; endTime: string; status: string; assignedEmployee?: string; location?: string }
export const getAppointments = (businessId?: string) => callJson<{ ok: boolean; error?: string; appointments?: TaggedAppointment[] }>(`/api/customer-accounts/appointments${qs(businessId)}`);

export interface TaggedEstimate { id: string; businessId: string; businessName: string; number: string; status: string; amount: number; createdDate: string; expirationDate: string; projectSpecifics?: string; declineReason?: string; lineItems?: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }
export const getEstimates = (businessId?: string) => callJson<{ ok: boolean; error?: string; estimates?: TaggedEstimate[] }>(`/api/customer-accounts/estimates${qs(businessId)}`);
export const submitEstimateDecision = (businessId: string, estimateId: string, decision: "Accepted" | "Declined", declineReason?: string) =>
  callJson<{ ok: boolean; error?: string }>(`/api/customer-accounts/estimates/${encodeURIComponent(estimateId)}/decision`, { method: "POST", body: JSON.stringify({ businessId, decision, declineReason }) });

export interface TaggedInvoice { id: string; businessId: string; businessName: string; invoiceNumber: string; issuedDate: string; dueDate: string; status: string; total: number; amountPaid: number; balanceDue: number; lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }
export const getInvoices = (businessId?: string) => callJson<{ ok: boolean; error?: string; invoices?: TaggedInvoice[] }>(`/api/customer-accounts/invoices${qs(businessId)}`);
export const createInvoiceCheckout = (businessId: string, invoiceId: string) =>
  callJson<{ ok: boolean; error?: string; url?: string }>(`/api/customer-accounts/invoices/${encodeURIComponent(invoiceId)}/checkout`, { method: "POST", body: JSON.stringify({ businessId }) });

export interface TaggedMembership { id: string; businessId: string; businessName: string; membershipNumber?: string; planName: string; description?: string; price: number; billingFrequency: string; includedServices?: Array<{ id: string; description: string; quantity: number; unitPrice: number }>; startDate: string; endDate?: string; status: string; nextMaintenanceDate?: string; nextPaymentDate?: string }
export const getMemberships = (businessId?: string) => callJson<{ ok: boolean; error?: string; memberships?: TaggedMembership[] }>(`/api/customer-accounts/memberships${qs(businessId)}`);

export interface TaggedDocument { id: string; businessId: string; businessName: string; name: string; date: string; status: string; folder?: string; hasPdf: boolean; canSign: boolean }
export const getDocuments = (businessId?: string) => callJson<{ ok: boolean; error?: string; documents?: TaggedDocument[] }>(`/api/customer-accounts/documents${qs(businessId)}`);
export const getDocumentPdf = (businessId: string, documentId: string) =>
  callJson<{ ok: boolean; error?: string; pdfBase64?: string; name?: string }>(`/api/customer-accounts/documents/${encodeURIComponent(documentId)}?businessId=${encodeURIComponent(businessId)}`);

export interface ServiceRequestSubmission { description?: string; preferredDate?: string; address?: string; notes?: string; photos?: string[] }
export const submitServiceRequest = (businessId: string, body: ServiceRequestSubmission) =>
  callJson<{ ok: boolean; error?: string }>("/api/customer-accounts/service-request", { method: "POST", body: JSON.stringify({ businessId, ...body }) });

export interface TaggedMessage { id: string; sender: string; senderRole: string; content: string; timestamp: string }
export const getMessages = (businessId: string) => callJson<{ ok: boolean; error?: string; messages?: TaggedMessage[] }>(`/api/customer-accounts/messages?businessId=${encodeURIComponent(businessId)}`);
export const sendMessage = (businessId: string, content: string) =>
  callJson<{ ok: boolean; error?: string }>("/api/customer-accounts/messages", { method: "POST", body: JSON.stringify({ businessId, content }) });

export interface BusinessProfileView {
  businessId: string; name: string; phone?: string; email?: string; address?: string; logo?: string;
  description?: string; trades?: string[]; serviceArea?: string; hours?: string; photos?: string[]; licenses?: string[]; acceptingNewCustomers?: boolean;
  relationship: { status: string; activeJobs: number; nextAppointment?: string; amountDue: number };
}
export const getBusinessProfile = (businessId: string) => callJson<{ ok: boolean; error?: string; profile?: BusinessProfileView }>(`/api/customer-accounts/business/${encodeURIComponent(businessId)}`);

// Business-side (used from CustomerPortalControls.tsx).
export const createBusinessInviteCode = (businessCustomerId: string, source?: "invite_code" | "bid_accepted" | "visit_scheduled") =>
  callJson<{ ok: boolean; error?: string; code?: string; expiresAt?: string }>(`/api/business/customers/${encodeURIComponent(businessCustomerId)}/invite-code`, { method: "POST", body: JSON.stringify({ source }) });
export const disconnectCustomerAccount = (businessCustomerId: string) =>
  callJson<{ ok: boolean; error?: string }>(`/api/business/customers/${encodeURIComponent(businessCustomerId)}/disconnect`, { method: "POST" });

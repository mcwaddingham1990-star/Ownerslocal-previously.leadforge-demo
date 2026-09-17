// Client-side counterpart to server/customerPortal.ts -- talks to the
// unauthenticated /api/portal/:token endpoints so a customer can use their
// portal with no OwnersLocal login of their own, same pattern as
// remoteSigningClient.ts.

export interface PortalCustomer { id: string; name: string; company: string; phone: string; email: string; address: string }
export interface PortalEstimate { id: string; number: string; status: string; amount: number; createdDate: string; expirationDate: string; projectSpecifics?: string; lineItems?: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }
export interface PortalJob { id: string; jobNumber?: string; title?: string; description?: string; date: string; startTime: string; endTime: string; status: string; priority: string; assignedEmployee?: string; location?: string; progress?: number; checklist?: Array<{ id: string; label: string; completed: boolean }> }
export interface PortalAppointment { id: string; eventType: string; title?: string; date: string; startTime: string; endTime: string; status: string; assignedEmployee?: string; location?: string }
export interface PortalWorkOrder { id: string; workOrderNumber?: string; jobDescription: string; date: string; scheduledDate?: string; scheduledTime?: string; status?: string; priority?: string; estimatedValue?: number }
export interface PortalInvoice { id: string; invoiceNumber: string; issuedDate: string; dueDate: string; status: string; total: number; amountPaid: number; balanceDue: number; notes?: string; lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }
export interface PortalMembership { id: string; membershipNumber?: string; planName: string; description?: string; price: number; billingFrequency: string; includedServices?: Array<{ id: string; description: string; quantity: number; unitPrice: number }>; maintenanceFrequency?: { unit: string; interval?: number; specificDates?: string[] }; startDate: string; endDate?: string; status: string; nextMaintenanceDate?: string; nextPaymentDate?: string }
export interface PortalDocument { id: string; name: string; date: string; status: string; folder?: string; hasPdf: boolean; canSign: boolean; remoteToken?: string }
export interface PortalMessage { id: string; sender: string; senderRole: string; content: string; timestamp: string }

export interface PortalData {
  ok: boolean;
  error?: string;
  businessName?: string;
  customer?: PortalCustomer;
  estimates?: PortalEstimate[];
  jobs?: PortalJob[];
  appointments?: PortalAppointment[];
  workOrders?: PortalWorkOrder[];
  invoices?: PortalInvoice[];
  memberships?: PortalMembership[];
  documents?: PortalDocument[];
  conversation?: { messages: PortalMessage[] };
}

async function postJson(url: string, body?: unknown): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export async function fetchPortalData(token: string): Promise<PortalData> {
  try {
    const res = await fetch(`/api/portal/${encodeURIComponent(token)}`);
    return await res.json();
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export async function fetchPortalDocumentPdf(token: string, documentId: string): Promise<{ ok: boolean; error?: string; pdfBase64?: string; name?: string }> {
  try {
    const res = await fetch(`/api/portal/${encodeURIComponent(token)}/documents/${encodeURIComponent(documentId)}`);
    return await res.json();
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export function submitPortalEstimateDecision(token: string, estimateId: string, decision: "Accepted" | "Declined") {
  return postJson(`/api/portal/${encodeURIComponent(token)}/estimates/${encodeURIComponent(estimateId)}/decision`, { decision });
}

export interface ServiceRequestInput {
  description: string;
  preferredDate?: string;
  address?: string;
  notes?: string;
  photos?: string[];
}

export function submitPortalServiceRequest(token: string, input: ServiceRequestInput) {
  return postJson(`/api/portal/${encodeURIComponent(token)}/service-request`, input);
}

export function submitPortalMessage(token: string, body: string) {
  return postJson(`/api/portal/${encodeURIComponent(token)}/messages`, { body });
}

export async function startInvoiceCheckout(token: string, invoiceId: string): Promise<{ ok: boolean; error?: string; url?: string }> {
  return postJson(`/api/portal/${encodeURIComponent(token)}/invoices/${encodeURIComponent(invoiceId)}/checkout`) as Promise<{ ok: boolean; error?: string; url?: string }>;
}

/** The link a business texts/emails to a customer to open their portal. */
export function buildCustomerPortalLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}?portal=${encodeURIComponent(token)}`;
}

/** True when the current URL is a Customer Portal link -- checked once at
 * the very top of the app, before the normal login gate, so a customer
 * with no account of their own can still reach their portal. */
export function getCustomerPortalTokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("portal");
}

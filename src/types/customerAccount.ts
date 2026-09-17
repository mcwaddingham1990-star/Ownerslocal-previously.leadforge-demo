/**
 * Owner'sLOCAL Customer -- a real, global customer identity (its own
 * Firebase Auth account, email + password) that can be linked to many
 * completely separate businesses at once. Never merges different
 * businesses' CRM Customer records together -- each link just points from
 * this one global account to that business's own existing Customer record
 * (see BusinessRelationship). Entirely separate from the Owner/Employee
 * account system in src/context/AuthContext.tsx.
 */
export interface CustomerAccount {
  id: string; // == Firebase Auth uid
  name: string;
  email: string;
  phone?: string;
  createdAt: string;
}

/** Lightweight session shape App.tsx keeps in memory once Firebase Auth
 * resolves to a real CustomerAccount -- everything else (relationships,
 * jobs, invoices, etc.) is fetched from the server per screen, not carried
 * around in this. */
export interface CustomerSession {
  uid: string;
  email: string;
  name: string;
}

export type BusinessRelationshipStatus =
  | "Pending"
  | "Active"
  | "Inactive"
  // Reserved for the future marketplace (browsing a business, or messaging
  // one without a real connection yet) -- never set by anything built so
  // far; present now so that feature won't need a data migration later.
  | "Viewed"
  | "Potential";

export type BusinessRelationshipSource = "invite_code" | "bid_accepted" | "visit_scheduled";

/**
 * The ONE link between a global CustomerAccount and one business -- never a
 * merge of CRM data. businessCustomerId is that business's own existing
 * Customer record id (types/domain.ts's Customer), so every document/job/
 * invoice/estimate already tagged with that id or matching that customer's
 * name keeps working exactly as it does for the business side today.
 */
export interface BusinessRelationship {
  id: string;
  customerAccountId: string;
  businessId: string;
  businessCustomerId: string;
  businessName?: string;
  status: BusinessRelationshipStatus;
  source: BusinessRelationshipSource;
  createdAt: string;
  updatedAt?: string;
  respondedAt?: string;
  removedAt?: string;
  removedBy?: "customer" | "business";
}

/**
 * A secure, single-use, expiring code a business hands a customer (text/
 * email/QR) to connect their global account to that business's existing
 * Customer record. Redeeming one creates a Pending BusinessRelationship --
 * it never grants access by itself.
 */
export interface BusinessInviteCode {
  id: string;
  code: string;
  businessId: string;
  businessCustomerId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedByCustomerAccountId?: string;
  revoked?: boolean;
}

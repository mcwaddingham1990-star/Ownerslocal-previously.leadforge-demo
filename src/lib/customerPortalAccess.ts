import type { Dispatch, SetStateAction } from "react";
import type { Customer } from "../types/domain";

const newPortalToken = () => `portal_${crypto.randomUUID().replace(/-/g, "")}`;

/**
 * Turns on Customer Portal access for a customer if it isn't already on,
 * generating a real portalToken -- shared so any action that needs a working
 * portal link (sending the portal link itself, or a real "pay this invoice
 * online" link) can get one without duplicating the token-generation logic
 * that used to live only inside CustomerPortalControls.
 */
export function ensureCustomerPortalAccess(customer: Customer, setCustomers: Dispatch<SetStateAction<Customer[]>>): Customer {
  if (customer.portalEnabled && customer.portalToken) return customer;
  const updated: Customer = { ...customer, portalEnabled: true, portalToken: customer.portalToken || newPortalToken(), portalTokenCreatedAt: customer.portalTokenCreatedAt || new Date().toISOString() };
  setCustomers(prev => prev.map(c => c.id === customer.id ? updated : c));
  return updated;
}

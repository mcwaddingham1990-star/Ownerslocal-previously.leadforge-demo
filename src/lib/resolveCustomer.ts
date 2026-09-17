import type { Customer } from "../types/domain";

/**
 * Finds the real Customer record a Job/Estimate/Invoice/Document/Scheduling
 * record belongs to -- prefers a real customerId link, falls back to
 * matching contact/company name (the same matching every existing "find
 * this customer's records" lookup in the app already uses, e.g.
 * CustomersPage.compileCustomerDocuments), since many of those record types
 * only ever captured the customer's name.
 */
export function resolveCustomerByIdOrName(customers: Customer[], id?: string, name?: string): Customer | null {
  if (id) {
    const byId = customers.find(c => c.id === id);
    if (byId) return byId;
  }
  if (name) {
    const trimmed = name.trim().toLowerCase();
    if (trimmed) {
      const byName = customers.find(c => c.contact.trim().toLowerCase() === trimmed || c.company.trim().toLowerCase() === trimmed);
      if (byName) return byName;
    }
  }
  return null;
}

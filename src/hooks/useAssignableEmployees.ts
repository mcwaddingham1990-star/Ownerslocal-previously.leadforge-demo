import { useMemo } from "react";
import { useDomainData } from "../context/DomainDataContext";

/**
 * The one real "who can be assigned to a job, scheduling event, dispatch
 * record, or work order" roster. Merges the roster collection (recentRoster
 * -- a lighter onboarding-invite list without email/hourlyRate, excluding
 * anyone marked Inactive there) with the employees collection (full payroll
 * records), deduplicated by name.
 *
 * Previously this exact merge was hand-coded independently in
 * WorkOrderBuilder.tsx, while Jobs/BuildJobModal derived their list from
 * recentRoster only and Scheduling/Dispatch derived theirs from employees
 * only -- so the same person could be assignable on one page and missing
 * from the dropdown on another, and the "who's on the roster" set could
 * drift between the one place that filtered out Inactive entries and the
 * places that didn't.
 */
export function useAssignableEmployeeRoster(): Array<{ id: string; name: string }> {
  const { recentRoster, employees } = useDomainData();
  return useMemo(() => {
    const byName = new Map<string, { id: string; name: string }>();
    recentRoster
      .filter(person => person.status?.toLowerCase() !== "inactive")
      .forEach(person => {
        const name = person.name?.trim();
        if (name) byName.set(name.toLowerCase(), { id: person.id || person.code || name, name });
      });
    employees.forEach(employee => {
      const name = `${employee.firstName} ${employee.lastName}`.trim();
      if (name) byName.set(name.toLowerCase(), { id: employee.id || employee.email || name, name });
    });
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [recentRoster, employees]);
}

/** Same canonical roster as useAssignableEmployeeRoster, as plain names -- for callers (a <select>-style field) that only need the name, not an id. */
export function useAssignableEmployeeNames(): string[] {
  const roster = useAssignableEmployeeRoster();
  return useMemo(() => roster.map(r => r.name), [roster]);
}

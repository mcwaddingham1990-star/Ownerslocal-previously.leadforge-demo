import React from "react";
import { useAssignableEmployeeNames } from "../hooks/useAssignableEmployees";

/**
 * The one shared "who is this assigned to" dropdown -- same canonical
 * employee list (see useAssignableEmployeeNames) everywhere a job,
 * scheduling event, or dispatch record gets assigned to a person, so
 * someone assignable on one screen is never mysteriously missing from
 * another. Previously Jobs, Scheduling, and Dispatch each hand-rolled
 * their own <select> against a different underlying list.
 *
 * Callers keep their own surrounding label/wrapper markup and pass their
 * page's existing className so this drops in without changing how each
 * page already looks.
 */
export function AssignEmployeeField({
  value, onChange, className, unassignedLabel = "Unassigned", noOptionsLabel, placeholderLabel
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Shown as the empty selection when there's at least one assignable name. Default "Unassigned". */
  unassignedLabel?: string;
  /** When set, shown instead of unassignedLabel if the roster is empty. */
  noOptionsLabel?: string;
  /** When set (with noOptionsLabel), shown as a disabled placeholder option instead of a real "Unassigned" choice. */
  placeholderLabel?: string;
}) {
  const names = useAssignableEmployeeNames();
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className}>
      {names.length === 0 && noOptionsLabel ? (
        <option value="">{noOptionsLabel}</option>
      ) : placeholderLabel ? (
        <>
          {value === "" && <option value="" disabled>{placeholderLabel}</option>}
        </>
      ) : (
        <option value="">{unassignedLabel}</option>
      )}
      {names.map(name => <option key={name} value={name}>{name}</option>)}
    </select>
  );
}

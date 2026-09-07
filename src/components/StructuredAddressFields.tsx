import React, { useRef, useState } from "react";

export interface AddressParts {
  street: string;
  cityState: string;
  zip: string;
}

export function parseAddress(value = ""): AddressParts {
  const parts = value.split(",").map(part => part.trim()).filter(Boolean);
  const street = parts.shift() || "";
  const remainder = parts.join(", ");
  // Treat an in-progress ZIP as a ZIP too. Requiring all five digits here makes
  // digits 1-4 get reparsed into City/State after every controlled-input update.
  const zipMatch = remainder.match(/(?:^|,\s*)(\d{1,5}(?:-\d{0,4})?)\s*$/);
  const zip = zipMatch?.[1]?.trim() || "";
  const cityState = zip ? remainder.slice(0, remainder.lastIndexOf(zip)).replace(/,\s*$/, "").trim() : remainder;
  return { street, cityState, zip };
}

export function formatAddress({ street, cityState, zip }: AddressParts): string {
  return [street.trim(), cityState.trim(), zip.trim()].filter(Boolean).join(", ");
}

interface StructuredAddressFieldsProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  compact?: boolean;
  className?: string;
  inputClassName?: string;
}

export function StructuredAddressFields({
  value,
  onChange,
  required = false,
  label = "Address / Location",
  compact = false,
  className = "",
  inputClassName = "w-full bg-white border border-[#A9CDEE] rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-[#315C9F]"
}: StructuredAddressFieldsProps) {
  // Local, untrimmed copy of the three fields -- `value` is a single trimmed,
  // comma-joined string, so deriving the input's displayed value straight from
  // it on every render would erase a trailing space the instant it's typed
  // (format -> trim -> reparse, every keystroke). Keep local state as the
  // source of truth for display, and only re-sync it from `value` when that
  // string changed for a reason other than our own last edit.
  const [local, setLocal] = useState<AddressParts>(() => parseAddress(value));
  const prevValueRef = useRef(value);
  if (prevValueRef.current !== value) {
    prevValueRef.current = value;
    if (formatAddress(local) !== value) {
      setLocal(parseAddress(value));
    }
  }
  const update = (patch: Partial<AddressParts>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(formatAddress(next));
  };
  const parts = local;

  return (
    <fieldset className={`space-y-2 ${className}`}>
      <legend className="text-[10px] uppercase font-bold text-slate-500 mb-1">{label}</legend>
      <label className="block space-y-1">
        <span className="text-[9px] uppercase font-bold text-slate-500">Street Address</span>
        <input
          type="text"
          value={parts.street}
          onChange={event => update({ street: event.target.value })}
          placeholder="123 Main Street"
          autoComplete="street-address"
          required={required}
          className={inputClassName}
        />
      </label>
      <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(110px,1fr)] gap-2"}>
        <label className="block space-y-1">
          <span className="text-[9px] uppercase font-bold text-slate-500">City, State</span>
          <input
            type="text"
            value={parts.cityState}
            onChange={event => update({ cityState: event.target.value })}
            placeholder="Fort Worth, TX"
            autoComplete="address-level2"
            required={required}
            className={inputClassName}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[9px] uppercase font-bold text-slate-500">ZIP Code</span>
          <input
            type="text"
            value={parts.zip}
            onChange={event => update({ zip: event.target.value })}
            placeholder="76102"
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="[0-9]{5}(-[0-9]{4})?"
            required={required}
            className={inputClassName}
          />
        </label>
      </div>
    </fieldset>
  );
}

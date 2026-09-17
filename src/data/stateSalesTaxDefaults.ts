// Statewide general sales/use tax defaults -- source: Tax Foundation,
// "State and Local Sales Tax Rates, Midyear 2026" (published 2026-07-06),
// cross-checked against Sales Tax Institute rates as of 2026-09-01.
//
// IMPORTANT: statewideDefaultRatePercent is a STARTING POINT for the
// editable rate field, never a guaranteed final customer rate. City,
// county, and special-district rates vary by exact address and are NOT
// included here -- averageLocalRatePercentReference/maxLocalRatePercentReference
// are informational only (shown to the user as context) and must never be
// added into a calculated tax amount automatically.
//
// District of Columbia is intentionally excluded (not a state).

export const SALES_TAX_DATASET_VERSION = "2026-07-01";

export interface StateSalesTaxDefault {
  state: string;
  abbreviation: string;
  statewideDefaultRatePercent: number;
  averageLocalRatePercentReference: number;
  maxLocalRatePercentReference: number;
  hasStatewideGeneralSalesTax: boolean;
  localSalesTaxMayApply: boolean;
  note: string | null;
}

// Alphabetical by state name, as required for the dropdown.
export const STATE_SALES_TAX_DEFAULTS: StateSalesTaxDefault[] = [
  { state: "Alabama", abbreviation: "AL", statewideDefaultRatePercent: 4.0, averageLocalRatePercentReference: 5.46, maxLocalRatePercentReference: 8.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Alaska", abbreviation: "AK", statewideDefaultRatePercent: 0.0, averageLocalRatePercentReference: 1.82, maxLocalRatePercentReference: 7.85, hasStatewideGeneralSalesTax: false, localSalesTaxMayApply: true, note: "No statewide sales tax; local jurisdictions may impose sales tax." },
  { state: "Arizona", abbreviation: "AZ", statewideDefaultRatePercent: 5.6, averageLocalRatePercentReference: 2.94, maxLocalRatePercentReference: 5.3, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Arkansas", abbreviation: "AR", statewideDefaultRatePercent: 6.5, averageLocalRatePercentReference: 2.98, maxLocalRatePercentReference: 6.13, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "California", abbreviation: "CA", statewideDefaultRatePercent: 7.25, averageLocalRatePercentReference: 1.78, maxLocalRatePercentReference: 5.25, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: "Includes a mandatory statewide local add-on (underlying state component is 6.0%)." },
  { state: "Colorado", abbreviation: "CO", statewideDefaultRatePercent: 2.9, averageLocalRatePercentReference: 4.99, maxLocalRatePercentReference: 9.1, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Connecticut", abbreviation: "CT", statewideDefaultRatePercent: 6.35, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: false, note: null },
  { state: "Delaware", abbreviation: "DE", statewideDefaultRatePercent: 0.0, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: false, localSalesTaxMayApply: false, note: "No general statewide sales tax." },
  { state: "Florida", abbreviation: "FL", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 0.98, maxLocalRatePercentReference: 2.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Georgia", abbreviation: "GA", statewideDefaultRatePercent: 4.0, averageLocalRatePercentReference: 3.56, maxLocalRatePercentReference: 5.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Hawaii", abbreviation: "HI", statewideDefaultRatePercent: 4.0, averageLocalRatePercentReference: 0.5, maxLocalRatePercentReference: 0.5, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: "Broad tax base; many services/business-to-business transactions may be taxable." },
  { state: "Idaho", abbreviation: "ID", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 0.03, maxLocalRatePercentReference: 3.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Illinois", abbreviation: "IL", statewideDefaultRatePercent: 6.25, averageLocalRatePercentReference: 2.73, maxLocalRatePercentReference: 4.75, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Indiana", abbreviation: "IN", statewideDefaultRatePercent: 7.0, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: false, note: null },
  { state: "Iowa", abbreviation: "IA", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 0.94, maxLocalRatePercentReference: 1.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Kansas", abbreviation: "KS", statewideDefaultRatePercent: 6.5, averageLocalRatePercentReference: 2.21, maxLocalRatePercentReference: 4.25, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Kentucky", abbreviation: "KY", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: false, note: null },
  { state: "Louisiana", abbreviation: "LA", statewideDefaultRatePercent: 5.0, averageLocalRatePercentReference: 5.13, maxLocalRatePercentReference: 7.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Maine", abbreviation: "ME", statewideDefaultRatePercent: 5.5, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: false, note: null },
  { state: "Maryland", abbreviation: "MD", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: false, note: null },
  { state: "Massachusetts", abbreviation: "MA", statewideDefaultRatePercent: 6.25, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: false, note: null },
  { state: "Michigan", abbreviation: "MI", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: false, note: null },
  { state: "Minnesota", abbreviation: "MN", statewideDefaultRatePercent: 6.875, averageLocalRatePercentReference: 1.26, maxLocalRatePercentReference: 3.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Mississippi", abbreviation: "MS", statewideDefaultRatePercent: 7.0, averageLocalRatePercentReference: 0.06, maxLocalRatePercentReference: 1.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Missouri", abbreviation: "MO", statewideDefaultRatePercent: 4.225, averageLocalRatePercentReference: 4.22, maxLocalRatePercentReference: 6.25, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Montana", abbreviation: "MT", statewideDefaultRatePercent: 0.0, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: false, localSalesTaxMayApply: false, note: "No general statewide sales tax." },
  { state: "Nebraska", abbreviation: "NE", statewideDefaultRatePercent: 5.5, averageLocalRatePercentReference: 1.48, maxLocalRatePercentReference: 2.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Nevada", abbreviation: "NV", statewideDefaultRatePercent: 6.85, averageLocalRatePercentReference: 1.39, maxLocalRatePercentReference: 1.53, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "New Hampshire", abbreviation: "NH", statewideDefaultRatePercent: 0.0, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: false, localSalesTaxMayApply: false, note: "No general statewide sales tax." },
  { state: "New Jersey", abbreviation: "NJ", statewideDefaultRatePercent: 6.625, averageLocalRatePercentReference: -0.02, maxLocalRatePercentReference: 3.31, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: "Special reduced-rate jurisdictions exist; exact customer rate is address-specific." },
  { state: "New Mexico", abbreviation: "NM", statewideDefaultRatePercent: 4.875, averageLocalRatePercentReference: 2.8, maxLocalRatePercentReference: 4.56, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: "Broad tax base; many services/business-to-business transactions may be taxable." },
  { state: "New York", abbreviation: "NY", statewideDefaultRatePercent: 4.0, averageLocalRatePercentReference: 4.54, maxLocalRatePercentReference: 4.88, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "North Carolina", abbreviation: "NC", statewideDefaultRatePercent: 4.75, averageLocalRatePercentReference: 2.35, maxLocalRatePercentReference: 3.5, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "North Dakota", abbreviation: "ND", statewideDefaultRatePercent: 5.0, averageLocalRatePercentReference: 2.09, maxLocalRatePercentReference: 3.75, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Ohio", abbreviation: "OH", statewideDefaultRatePercent: 5.75, averageLocalRatePercentReference: 1.54, maxLocalRatePercentReference: 2.25, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Oklahoma", abbreviation: "OK", statewideDefaultRatePercent: 4.5, averageLocalRatePercentReference: 4.56, maxLocalRatePercentReference: 7.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Oregon", abbreviation: "OR", statewideDefaultRatePercent: 0.0, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: false, localSalesTaxMayApply: false, note: "No general statewide sales tax." },
  { state: "Pennsylvania", abbreviation: "PA", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 0.34, maxLocalRatePercentReference: 2.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Rhode Island", abbreviation: "RI", statewideDefaultRatePercent: 7.0, averageLocalRatePercentReference: 0.0, maxLocalRatePercentReference: 0.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: false, note: null },
  { state: "South Carolina", abbreviation: "SC", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 1.49, maxLocalRatePercentReference: 3.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "South Dakota", abbreviation: "SD", statewideDefaultRatePercent: 4.2, averageLocalRatePercentReference: 1.91, maxLocalRatePercentReference: 4.5, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: "Broad tax base; many services/business-to-business transactions may be taxable." },
  { state: "Tennessee", abbreviation: "TN", statewideDefaultRatePercent: 7.0, averageLocalRatePercentReference: 2.61, maxLocalRatePercentReference: 2.75, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Texas", abbreviation: "TX", statewideDefaultRatePercent: 6.25, averageLocalRatePercentReference: 1.95, maxLocalRatePercentReference: 2.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Utah", abbreviation: "UT", statewideDefaultRatePercent: 6.1, averageLocalRatePercentReference: 1.32, maxLocalRatePercentReference: 4.7, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: "Includes a mandatory statewide local add-on (underlying state component is 4.85%)." },
  { state: "Vermont", abbreviation: "VT", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 0.43, maxLocalRatePercentReference: 1.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Virginia", abbreviation: "VA", statewideDefaultRatePercent: 5.3, averageLocalRatePercentReference: 0.47, maxLocalRatePercentReference: 2.7, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: "Includes a mandatory statewide local add-on (underlying state component is 4.3%)." },
  { state: "Washington", abbreviation: "WA", statewideDefaultRatePercent: 6.5, averageLocalRatePercentReference: 3.07, maxLocalRatePercentReference: 4.2, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "West Virginia", abbreviation: "WV", statewideDefaultRatePercent: 6.0, averageLocalRatePercentReference: 0.6, maxLocalRatePercentReference: 1.4, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Wisconsin", abbreviation: "WI", statewideDefaultRatePercent: 5.0, averageLocalRatePercentReference: 0.72, maxLocalRatePercentReference: 2.9, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
  { state: "Wyoming", abbreviation: "WY", statewideDefaultRatePercent: 4.0, averageLocalRatePercentReference: 1.39, maxLocalRatePercentReference: 3.0, hasStatewideGeneralSalesTax: true, localSalesTaxMayApply: true, note: null },
];

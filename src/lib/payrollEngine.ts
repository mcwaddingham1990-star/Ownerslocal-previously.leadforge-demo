import { PayrollEmployeeLine, PayrollTaxConfig, PayrollTotals } from "../types/payroll";

export interface PayrollSourceEmployee {
  id: string;
  name: string;
  hourlyRate: number;
  hoursThisPayPeriod: number;
  overtimeHours: number;
}

export const DEFAULT_TAX_CONFIG: PayrollTaxConfig = {
  federalWithholdingRate: 0,
  stateWithholdingRate: 0,
  localWithholdingRate: 0,
  employeeSocialSecurityRate: 6.2,
  employeeMedicareRate: 1.45,
  employerSocialSecurityRate: 6.2,
  employerMedicareRate: 1.45,
  federalUnemploymentRate: 0.6,
  stateUnemploymentRate: 0
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const tax = (gross: number, rate: number) => money(gross * Math.max(0, rate) / 100);

export function calculatePayrollLine(
  employee: PayrollSourceEmployee,
  config: PayrollTaxConfig,
  otherDeductions = 0
): PayrollEmployeeLine {
  const overtimeHours = Math.max(0, employee.overtimeHours);
  const regularHours = Math.max(0, employee.hoursThisPayPeriod - overtimeHours);
  const hourlyRate = Math.max(0, employee.hourlyRate);
  const regularPay = money(regularHours * hourlyRate);
  const overtimePay = money(overtimeHours * hourlyRate * 1.5);
  const grossPay = money(regularPay + overtimePay);
  const federalWithholding = tax(grossPay, config.federalWithholdingRate);
  const stateWithholding = tax(grossPay, config.stateWithholdingRate);
  const localWithholding = tax(grossPay, config.localWithholdingRate);
  const employeeSocialSecurity = tax(grossPay, config.employeeSocialSecurityRate);
  const employeeMedicare = tax(grossPay, config.employeeMedicareRate);
  const safeOtherDeductions = money(Math.max(0, otherDeductions));
  const totalDeductions = money(
    federalWithholding + stateWithholding + localWithholding +
    employeeSocialSecurity + employeeMedicare + safeOtherDeductions
  );
  const netPay = money(Math.max(0, grossPay - totalDeductions));
  const employerTaxes = money(
    tax(grossPay, config.employerSocialSecurityRate) +
    tax(grossPay, config.employerMedicareRate) +
    tax(grossPay, config.federalUnemploymentRate) +
    tax(grossPay, config.stateUnemploymentRate)
  );
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    regularHours: money(regularHours),
    overtimeHours: money(overtimeHours),
    hourlyRate: money(hourlyRate),
    regularPay,
    overtimePay,
    grossPay,
    federalWithholding,
    stateWithholding,
    localWithholding,
    employeeSocialSecurity,
    employeeMedicare,
    otherDeductions: safeOtherDeductions,
    totalDeductions,
    netPay,
    employerTaxes,
    paymentMethod: "direct_deposit"
  };
}

export function totalPayroll(lines: PayrollEmployeeLine[]): PayrollTotals {
  const sum = (select: (line: PayrollEmployeeLine) => number) =>
    money(lines.reduce((total, line) => total + select(line), 0));
  const grossPay = sum(line => line.grossPay);
  const employeeTaxes = sum(line =>
    line.federalWithholding + line.stateWithholding + line.localWithholding +
    line.employeeSocialSecurity + line.employeeMedicare
  );
  const otherDeductions = sum(line => line.otherDeductions);
  const netPay = sum(line => line.netPay);
  const employerTaxes = sum(line => line.employerTaxes);
  const taxLiability = money(employeeTaxes + employerTaxes);
  return {
    regularPay: sum(line => line.regularPay),
    overtimePay: sum(line => line.overtimePay),
    grossPay,
    employeeTaxes,
    otherDeductions,
    netPay,
    employerTaxes,
    taxLiability,
    fundingRequired: money(netPay + taxLiability + otherDeductions)
  };
}

export function validatePayroll(lines: PayrollEmployeeLine[]): string[] {
  const errors: string[] = [];
  if (!lines.length) errors.push("At least one employee is required.");
  for (const line of lines) {
    if (!line.employeeId) errors.push("An employee line is missing its employee ID.");
    if (line.hourlyRate <= 0) errors.push(`${line.employeeName} needs an hourly rate.`);
    if (line.grossPay < line.totalDeductions) errors.push(`${line.employeeName} has deductions above gross pay.`);
  }
  return errors;
}

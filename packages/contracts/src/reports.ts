import type { CurrencyCode, LocalDate } from '@finanz/kernel';

/** A part of a figure left out because there was no exchange rate for it. */
export interface ExcludedView {
  date: LocalDate;
  currency: CurrencyCode;
  component: string;
  amountMinor: string;
}

interface Completeness {
  /** The currency every figure is in (the user's primary currency). */
  currency: CurrencyCode;
  complete: boolean;
  excluded: ExcludedView[];
  /** Rates used, so any figure can be reproduced. */
  rateIds: string[];
  /** Rates used although more than 45 days old on the day they applied to. */
  staleRateIds: string[];
}

export interface SummaryReport extends Completeness {
  from: LocalDate;
  to: LocalDate;
  incomeMinor: string;
  expensesMinor: string;
  netMinor: string;
  incomeByCategory: { categoryId: string; amountMinor: string }[];
  expensesByCategory: { categoryId: string; amountMinor: string }[];
}

/** Income and expenses for each calendar month of a range (months without movements included). */
export interface MonthlyReport extends Completeness {
  from: LocalDate;
  to: LocalDate;
  months: {
    /** "2026-03". */
    month: string;
    from: LocalDate;
    to: LocalDate;
    incomeMinor: string;
    expensesMinor: string;
    netMinor: string;
    expensesByCategory: { categoryId: string; amountMinor: string }[];
  }[];
}

export interface NetWorthReport extends Completeness {
  on: LocalDate;
  totalMinor: string;
  assetsMinor: string;
  liabilitiesMinor: string;
  byAccount: { accountId: string; valueMinor: string }[];
}

export interface BridgeReport extends Completeness {
  from: LocalDate;
  to: LocalDate;
  startMinor: string;
  endMinor: string;
  netMinor: string;
  valuationMinor: string;
  openingContributionsMinor: string;
  realizedFxMinor: string;
  unrealizedFxMinor: string;
  roundingMinor: string;
}

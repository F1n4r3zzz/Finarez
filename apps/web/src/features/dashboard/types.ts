import type { LocalDate, Money } from '@finanz/kernel';

export interface DashboardHero {
  /** Bank, cash and wallet accounts today, in the primary currency. */
  available: Money;
  netWorth: Money;
}

export interface MonthTotals {
  /** Both positive. */
  income: Money;
  expenses: Money;
  monthName: string;
}

export interface Pace {
  /** Spending so far this month minus spending at the same point last month. */
  delta: Money;
  /** Last month's name. */
  monthName: string;
}

export interface AccountTile {
  id: string;
  name: string;
  /** What kind of account, or its bank. */
  kind: string;
  /** In the account's own currency; owed amounts are negative. */
  balance: Money;
  debt: boolean;
}

export interface BudgetRow {
  id: string;
  name: string;
  spent: Money;
  available: Money;
  overspent: boolean;
}

export interface RecentRow {
  id: string;
  date: LocalDate;
  description: string;
  /** Category name, or "From → To" for a transfer. */
  category: string;
  amount: Money;
  /** Money moved between the user's own accounts: shown without a sign or color. */
  transfer?: boolean;
}

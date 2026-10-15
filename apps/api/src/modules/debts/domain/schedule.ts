import { divRoundHalfEven, type ExactRate, type LocalDate, parseLocalDate } from '@finanz/kernel';

/** Rates are exact fractions; an interest-free debt has rate 0. */
export interface DebtRate {
  numerator: bigint;
  denominator: bigint;
}

export const ZERO_RATE: DebtRate = { numerator: 0n, denominator: 1n };

/** Rounds to the nearest multiple of `increment` minor units, half to even (100 = whole pesos). */
export function roundTo(numerator: bigint, denominator: bigint, increment: bigint): bigint {
  return divRoundHalfEven(numerator, denominator * increment) * increment;
}

/** Interest on a balance for one period, rounded like the lender rounds (`increment`). */
export function interestFor(balanceMinor: bigint, rate: DebtRate, increment: bigint): bigint {
  return roundTo(balanceMinor * rate.numerator, rate.denominator, increment);
}

/** Fixed installment that pays `principal` off in `months`: P·r·g / (g − 1), with g = (1 + r)^n. */
export function installmentFor(
  principalMinor: bigint,
  rate: DebtRate,
  months: number,
  increment: bigint,
): bigint {
  if (rate.numerator === 0n) return roundTo(principalMinor, BigInt(months), increment);
  const base = rate.denominator + rate.numerator; // (1 + r) as base / denominator
  const g = base ** BigInt(months);
  const d = rate.denominator ** BigInt(months);
  // P · (r_n / r_d) · (g / d) / ((g − d) / d) = P · r_n · g / (r_d · (g − d))
  return roundTo(principalMinor * rate.numerator * g, rate.denominator * (g - d), increment);
}

export interface Split {
  interestMinor: bigint;
  principalMinor: bigint;
}

/**
 * How a payment splits: interest for the period on the outstanding balance first, the rest
 * reduces the debt. The user can override it with what the lender's statement says.
 */
export function proposeSplit(
  outstandingMinor: bigint,
  paymentMinor: bigint,
  rate: DebtRate,
  increment: bigint,
): Split {
  const interest = interestFor(outstandingMinor, rate, increment);
  const interestMinor = interest > paymentMinor ? paymentMinor : interest;
  return { interestMinor, principalMinor: paymentMinor - interestMinor };
}

export interface ScheduleRow {
  dueOn: LocalDate;
  installmentMinor: bigint;
  interestMinor: bigint;
  principalMinor: bigint;
  balanceAfterMinor: bigint;
}

function addMonths(date: LocalDate, months: number, day: number): LocalDate {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return parseLocalDate(first.toISOString().slice(0, 10));
}

/**
 * What's left to pay, month by month, if every installment is paid on time. A projection: it
 * never changes balances. The last installment pays exactly what is left, as lenders adjust it.
 */
export function projectSchedule(input: {
  outstandingMinor: bigint;
  rate: DebtRate;
  installmentMinor: bigint;
  increment: bigint;
  firstDueOn: LocalDate;
  dueDay: number;
  /** Installments left by the contract: the last one pays whatever remains (rounding residue). */
  remainingInstallments?: number;
  maxRows?: number;
}): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let balance = input.outstandingMinor;
  for (let k = 0; balance > 0n && k < (input.maxRows ?? 600); k++) {
    const interest = interestFor(balance, input.rate, input.increment);
    const due = balance + interest;
    const last = input.remainingInstallments !== undefined && k === input.remainingInstallments - 1;
    const installment = last || input.installmentMinor >= due ? due : input.installmentMinor;
    const principal = installment - interest;
    if (principal <= 0n) break; // the installment doesn't cover the interest: it never ends
    balance -= principal;
    rows.push({
      dueOn: addMonths(input.firstDueOn, k, input.dueDay),
      installmentMinor: installment,
      interestMinor: interest,
      principalMinor: principal,
      balanceAfterMinor: balance,
    });
  }
  return rows;
}

/** Integer k-th root of n (largest x with x^k ≤ n), by Newton's method. */
function integerRoot(n: bigint, k: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << (BigInt(n.toString(2).length) / k + 1n);
  for (;;) {
    const y = ((k - 1n) * x + n / x ** (k - 1n)) / k;
    if (y >= x) return x;
    x = y;
  }
}

const SCALE = 10n ** 18n;

/**
 * The monthly rate equivalent to an effective annual rate: (1 + a)^(1/12) − 1, to 18 decimal
 * places (an irrational number in general, so it can't be an exact fraction).
 */
export function monthlyFromAnnual(annual: ExactRate): DebtRate {
  const onePlus = annual.denominator + annual.numerator; // over annual.denominator
  // root(onePlus / den, 12) · SCALE = root(onePlus · SCALE^12 / den, 12)
  const root = integerRoot((onePlus * SCALE ** 12n) / annual.denominator, 12n);
  return { numerator: root - SCALE, denominator: SCALE };
}

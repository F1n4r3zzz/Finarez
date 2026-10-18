import type { DebtView, OccurrenceView, RuleView } from '@finanz/contracts';
import { parseLocalDate } from '@finanz/kernel';
import { describe, expect, it } from 'vitest';
import { monthFigures, samePointLastMonth, upcomingItems } from './month';

describe('monthFigures', () => {
  it('shows how much of what came in is spent and what is left', () => {
    const figures = monthFigures(3_100_000n, 2_300_000n);
    expect(figures.state).toBe('left');
    expect(figures.spentShare).toBeCloseTo(0.742, 3);
    expect(figures.remaining).toBe(800_000n);
  });

  it('spending above income, or spending with no income, is "over" and never divides by zero', () => {
    expect(monthFigures(0n, 50_000n)).toEqual({
      state: 'over',
      spentShare: 1,
      remaining: -50_000n,
    });
    expect(monthFigures(1_000n, 1_500n)).toEqual({
      state: 'over',
      spentShare: 1,
      remaining: -500n,
    });
  });

  it('a month with nothing yet is "empty"', () => {
    expect(monthFigures(0n, 0n)).toEqual({ state: 'empty', spentShare: 0, remaining: 0n });
  });
});

describe('samePointLastMonth', () => {
  it('runs from the first of last month to the same day number', () => {
    expect(samePointLastMonth(parseLocalDate('2026-10-18'))).toEqual({
      from: '2026-09-01',
      to: '2026-09-18',
    });
  });

  it('stops at the last day of a shorter month', () => {
    expect(samePointLastMonth(parseLocalDate('2026-03-31'))).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(samePointLastMonth(parseLocalDate('2026-01-15'))).toEqual({
      from: '2025-12-01',
      to: '2025-12-15',
    });
  });
});

const today = parseLocalDate('2026-10-18');

const occurrence = (over: Partial<OccurrenceView>): OccurrenceView => ({
  ruleId: 'r-phone',
  dueOn: parseLocalDate('2026-10-18'),
  status: 'pending',
  transactionId: null,
  error: null,
  description: 'Plan celular Claro',
  amountMinor: '6590000',
  currency: 'COP',
  ...over,
});

const rule = (over: Partial<RuleView> & { description: string }): RuleView =>
  ({
    id: `r-${over.description}`,
    template: { description: over.description } as RuleView['template'],
    frequency: 'monthly',
    anchorOn: parseLocalDate('2026-01-30'),
    secondDay: null,
    nextDueOn: parseLocalDate('2026-10-30'),
    endsOn: null,
    confirm: false,
    ended: false,
    pending: 0,
    amountMinor: '155000000',
    currency: 'COP',
    ...over,
  }) as RuleView;

const debt = (over: Partial<DebtView>): DebtView =>
  ({
    id: 'd-car',
    accountId: 'a-car',
    name: 'Crédito vehículo',
    type: 'loan',
    currency: 'COP',
    outstandingMinor: '2741216900',
    installmentMinor: '132132200',
    nextDueOn: parseLocalDate('2026-10-25'),
    archived: false,
    ...over,
  }) as DebtView;

describe('upcomingItems', () => {
  it('puts what waits for confirmation first, then the next 14 days by date, at most three', () => {
    const items = upcomingItems({
      pending: [occurrence({})],
      rules: [
        rule({ description: 'Salario quincenal', nextDueOn: parseLocalDate('2026-10-30') }),
        rule({ description: 'Arriendo', nextDueOn: parseLocalDate('2026-11-01') }),
        rule({ description: 'Gimnasio', nextDueOn: parseLocalDate('2026-11-20') }),
      ],
      debts: [debt({})],
      today,
    });
    expect(items.map((i) => [i.kind, i.title, i.date])).toEqual([
      ['confirm', 'Plan celular Claro', '2026-10-18'],
      ['debt', 'Crédito vehículo', '2026-10-25'],
      ['recurring', 'Salario quincenal', '2026-10-30'],
    ]);
    expect(items[0]?.ruleId).toBe('r-phone');
    expect(items[1]?.amount?.amountMinor).toBe(132_132_200n);
  });

  it('does not list a rule twice when it already waits for confirmation', () => {
    const items = upcomingItems({
      pending: [occurrence({})],
      rules: [rule({ description: 'Plan celular Claro', id: 'r-phone' })],
      debts: [],
      today,
    });
    expect(items.map((i) => i.kind)).toEqual(['confirm']);
  });

  it('leaves out ended rules, archived debts and anything past 14 days', () => {
    const items = upcomingItems({
      pending: [],
      rules: [
        rule({ description: 'Ended', ended: true, nextDueOn: parseLocalDate('2026-10-20') }),
        rule({ description: 'Far', nextDueOn: parseLocalDate('2026-11-02') }),
      ],
      debts: [debt({ archived: true }), debt({ id: 'd2', nextDueOn: null })],
      today,
    });
    expect(items).toEqual([]);
  });
});

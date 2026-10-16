import type { Category } from '@finanz/contracts';
import { parseLocalDate } from '@finanz/kernel';
import { describe, expect, it } from 'vitest';
import { spendingRange, spendingSlices } from './spending';

const day = (d: string) => parseLocalDate(d);

describe('spending periods', () => {
  it('cover today, the week from Monday, the fortnight and the month', () => {
    // Thursday 15 October 2026.
    const today = day('2026-10-15');
    expect(spendingRange('today', today)).toEqual({ from: today, to: today });
    expect(spendingRange('week', today)).toEqual({ from: day('2026-10-12'), to: today });
    expect(spendingRange('fortnight', today)).toEqual({
      from: day('2026-10-01'),
      to: day('2026-10-15'),
    });
    expect(spendingRange('month', today)).toEqual({
      from: day('2026-10-01'),
      to: day('2026-10-31'),
    });
  });

  it('start the second fortnight on the 16th and end it with the month, February too', () => {
    expect(spendingRange('fortnight', day('2026-10-16'))).toEqual({
      from: day('2026-10-16'),
      to: day('2026-10-31'),
    });
    expect(spendingRange('fortnight', day('2028-02-20'))).toEqual({
      from: day('2028-02-16'),
      to: day('2028-02-29'),
    });
  });

  it('count a Sunday in the week that began the Monday before, across a month change', () => {
    expect(spendingRange('week', day('2026-11-01'))).toEqual({
      from: day('2026-10-26'),
      to: day('2026-11-01'),
    });
    expect(spendingRange('week', day('2026-10-12'))).toEqual({
      from: day('2026-10-12'),
      to: day('2026-10-12'),
    });
  });
});

describe('spending slices', () => {
  const category = (id: string, name: string, parentId: string | null = null): Category => ({
    id,
    kind: 'expense',
    parentId,
    name,
    archived: false,
  });
  const CATEGORIES = [
    category('home', 'Vivienda'),
    category('rent', 'Arriendo', 'home'),
    category('food', 'Mercado'),
    category('fun', 'Ocio'),
    category('car', 'Transporte'),
    category('health', 'Salud'),
    category('gifts', 'Regalos'),
    category('pets', 'Mascotas'),
  ];
  const line = (categoryId: string, pesos: number) => ({
    categoryId,
    amountMinor: String(pesos * 100),
  });

  it('roll subcategories into their parent, largest first, and leave out refunds that win', () => {
    const { slices, total } = spendingSlices(
      [line('rent', 1_000_000), line('home', 200_000), line('food', 500_000), line('fun', -30_000)],
      CATEGORIES,
    );
    expect(slices.map((s) => [s.name, s.amount])).toEqual([
      ['Vivienda', 120_000_000n],
      ['Mercado', 50_000_000n],
    ]);
    expect(total).toBe(170_000_000n);
  });

  it('keep five slices and put the rest together, so the ring never has more than six', () => {
    const { slices, total } = spendingSlices(
      [
        line('home', 600),
        line('food', 500),
        line('fun', 400),
        line('car', 300),
        line('health', 200),
        line('gifts', 100),
        line('pets', 50),
      ],
      CATEGORIES,
    );
    expect(slices.map((s) => s.key)).toEqual(['home', 'food', 'fun', 'car', 'health', 'other']);
    expect(slices.at(-1)).toMatchObject({ amount: 15_000n, count: 2 });
    expect(total).toBe(215_000n);
  });
});

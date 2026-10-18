import type { Category, TransactionView } from '@finanz/contracts';
import { describe, expect, it } from 'vitest';
import { topCategories } from './category-usage';

const category = (id: string, name: string, over: Partial<Category> = {}): Category => ({
  id,
  kind: 'expense',
  parentId: null,
  name,
  archived: false,
  ...over,
});

const CATEGORIES = [
  category('home', 'Vivienda'),
  category('rent', 'Arriendo', { parentId: 'home' }),
  category('food', 'Mercado'),
  category('bus', 'Transporte'),
  category('eat', 'Restaurantes'),
  category('old', 'Viejo', { archived: true }),
  category('pay', 'Salario', { kind: 'income' }),
];

const spent = (categoryId: string, kind: TransactionView['kind'] = 'expense') =>
  ({
    kind,
    entries: [{ categoryId }, { categoryId: null }],
  }) as unknown as TransactionView;

describe('topCategories', () => {
  it('puts the most used first, ties by name', () => {
    const history = [spent('eat'), spent('food'), spent('eat'), spent('bus'), spent('food')];
    const names = topCategories(history, CATEGORIES, 'expense', 3).map((c) => c.name);
    expect(names).toEqual(['Mercado', 'Restaurantes', 'Transporte']);
  });

  it('fills with the kind’s categories in their usual order when history is short', () => {
    const names = topCategories([spent('bus')], CATEGORIES, 'expense', 4).map((c) => c.name);
    expect(names).toEqual(['Transporte', 'Vivienda', 'Arriendo', 'Mercado']);
  });

  it('never offers archived categories or the other kind', () => {
    const history = [spent('old'), spent('pay', 'income'), spent('pay')];
    const names = topCategories(history, CATEGORIES, 'expense', 10).map((c) => c.name);
    expect(names).not.toContain('Viejo');
    expect(names).not.toContain('Salario');
    expect(topCategories(history, CATEGORIES, 'income', 6).map((c) => c.name)).toEqual(['Salario']);
  });
});

import { money, parseLocalDate } from '@finanz/kernel';
import type {
  AccountTile,
  BudgetRow,
  DashboardHero,
  MonthTotals,
  RecentRow,
} from './DashboardView';
import type { UpcomingItem } from './month';
import type { Slice } from './spending';

// Development-only sample data for /dev/preview and the view's tests. Never shown in production.
const cop = (pesos: number) => money(BigInt(pesos) * 100n, 'COP');

export const SAMPLE_HERO: DashboardHero = {
  available: cop(12_450_000),
  netWorth: cop(21_300_000),
};

export const SAMPLE_MONTH: MonthTotals = {
  income: cop(4_200_000),
  expenses: cop(2_850_000),
  monthName: 'octubre',
};

export const SAMPLE_TILES: readonly AccountTile[] = [
  {
    id: 'a1',
    name: 'Cuenta de ahorros',
    kind: 'Bancolombia',
    balance: cop(8_100_000),
    debt: false,
  },
  { id: 'a2', name: 'Nequi', kind: 'Billetera digital', balance: cop(650_000), debt: false },
  {
    id: 'a3',
    name: 'Interactive Brokers',
    kind: 'Inversión',
    balance: money(238_050n, 'USD'),
    debt: false,
  },
  { id: 'a4', name: 'Efectivo', kind: 'En la casa', balance: cop(180_000), debt: false },
  {
    id: 'a5',
    name: 'Crédito vehículo',
    kind: 'Banco de Bogotá',
    balance: cop(-27_412_169),
    debt: true,
  },
];

export const SAMPLE_BUDGETS: readonly BudgetRow[] = [
  { id: 'b1', name: 'Mercado', spent: cop(480_000), available: cop(700_000), overspent: false },
  { id: 'b2', name: 'Transporte', spent: cop(210_000), available: cop(350_000), overspent: false },
  { id: 'b3', name: 'Restaurantes', spent: cop(200_000), available: cop(180_000), overspent: true },
];

export const SAMPLE_UPCOMING: readonly UpcomingItem[] = [
  {
    key: 'u1',
    date: parseLocalDate('2026-10-14'),
    title: 'Plan celular Claro',
    amount: cop(65_900),
    kind: 'confirm',
    ruleId: 'r1',
  },
  {
    key: 'u2',
    date: parseLocalDate('2026-10-25'),
    title: 'Cuota Crédito vehículo',
    amount: cop(1_321_322),
    kind: 'debt',
  },
  {
    key: 'u3',
    date: parseLocalDate('2026-10-30'),
    title: 'Salario quincenal',
    amount: cop(1_550_000),
    kind: 'recurring',
    ruleId: 'r2',
  },
];

export const SAMPLE_SPENDING: readonly Slice[] = [
  { key: 'vivienda', name: 'Vivienda', amount: 180_000_000n },
  { key: 'comida', name: 'Comida', amount: 52_000_000n },
  { key: 'transporte', name: 'Transporte', amount: 26_000_000n },
  { key: 'salud', name: 'Salud', amount: 15_000_000n },
  { key: 'ocio', name: 'Ocio', amount: 12_000_000n },
];

export const SAMPLE_RECENT: readonly RecentRow[] = [
  {
    id: 't1',
    date: parseLocalDate('2026-10-13'),
    description: 'Almuerzo',
    category: 'Comida',
    amount: cop(-32_000),
  },
  {
    id: 't2',
    date: parseLocalDate('2026-10-12'),
    description: 'Nómina',
    category: 'Salario',
    amount: cop(4_200_000),
  },
  {
    id: 't3',
    date: parseLocalDate('2026-10-11'),
    description: 'Recarga transporte',
    category: 'Transporte',
    amount: cop(-50_000),
  },
  {
    id: 't4',
    date: parseLocalDate('2026-10-10'),
    description: 'Arriendo',
    category: 'Vivienda',
    amount: cop(-1_800_000),
  },
];

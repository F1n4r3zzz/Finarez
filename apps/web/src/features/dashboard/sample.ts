import { money, parseLocalDate } from '@finanz/kernel';
import type { AccountRow, DashboardSummary, RecentRow } from './DashboardView';
import type { Slice } from './spending';

// Development-only sample data for /dev/preview. Never shown in production builds.
const cop = (pesos: number) => money(BigInt(pesos) * 100n, 'COP');

export const SAMPLE_SUMMARY: DashboardSummary = {
  available: cop(12_450_000),
  accountCount: 3,
  current: {
    month: parseLocalDate('2026-10-14'),
    income: cop(4_200_000),
    expenses: cop(-2_850_000),
  },
  previous: {
    month: parseLocalDate('2026-09-30'),
    income: cop(3_900_000),
    expenses: cop(-2_500_000),
  },
};

export const SAMPLE_ACCOUNTS: readonly AccountRow[] = [
  { id: 'a1', name: 'Cuenta de ahorros', detail: 'Bancolombia', balance: cop(8_100_000) },
  { id: 'a2', name: 'Billetera', detail: 'Nequi', balance: cop(650_000) },
  { id: 'a3', name: 'Efectivo', detail: 'En la casa', balance: cop(180_000) },
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
  {
    id: 't5',
    date: parseLocalDate('2026-10-08'),
    description: 'Farmacia',
    category: 'Salud',
    amount: cop(-85_000),
  },
];

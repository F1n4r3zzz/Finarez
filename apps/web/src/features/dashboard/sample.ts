import { money, parseLocalDate } from '@finanz/kernel';
import type { AccountRow, DashboardSummary, RecentRow } from './DashboardView';

// Development-only sample data for /dev/preview. Never shown in production builds.
export const SAMPLE_SUMMARY: DashboardSummary = {
  available: money(1_245_000_000n, 'COP'),
  monthIncome: money(420_000_000n, 'COP'),
  monthExpenses: money(-285_000_000n, 'COP'),
  month: parseLocalDate('2026-10-14'),
};

export const SAMPLE_ACCOUNTS: readonly AccountRow[] = [
  {
    id: 'a1',
    name: 'Cuenta de ahorros',
    detail: 'Bancolombia',
    balance: money(810_000_000n, 'COP'),
  },
  { id: 'a2', name: 'Billetera', detail: 'Nequi', balance: money(65_000_000n, 'COP') },
  { id: 'a3', name: 'Efectivo', detail: 'En la casa', balance: money(18_000_000n, 'COP') },
];

export const SAMPLE_RECENT: readonly RecentRow[] = [
  {
    id: 't1',
    date: parseLocalDate('2026-10-13'),
    description: 'Almuerzo',
    category: 'Comida',
    amount: money(-3_200_000n, 'COP'),
  },
  {
    id: 't2',
    date: parseLocalDate('2026-10-12'),
    description: 'Nómina',
    category: 'Salario',
    amount: money(420_000_000n, 'COP'),
  },
  {
    id: 't3',
    date: parseLocalDate('2026-10-11'),
    description: 'Recarga transporte',
    category: 'Transporte',
    amount: money(-5_000_000n, 'COP'),
  },
  {
    id: 't4',
    date: parseLocalDate('2026-10-10'),
    description: 'Arriendo',
    category: 'Vivienda',
    amount: money(-180_000_000n, 'COP'),
  },
];

import {
  ChartColumn,
  CreditCard,
  Ellipsis,
  FileUp,
  House,
  type LucideIcon,
  PiggyBank,
  ReceiptText,
  Scale,
  Settings,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export type ModuleId =
  | 'dashboard'
  | 'accounts'
  | 'transactions'
  | 'import'
  | 'budgets'
  | 'savings'
  | 'debts'
  | 'networth'
  | 'reports'
  | 'investments'
  | 'settings'
  | 'more';

export interface ModuleDef {
  id: ModuleId;
  path: string;
  icon: LucideIcon;
  /** Kind of section: day to day, planning, analysis, settings. */
  group: 'daily' | 'plan' | 'analyze' | 'settings';
  /** A pill in the desktop top menu; the other sections live in its "Más" menu. */
  top?: boolean;
  /** In the phone's bottom bar, beside the + and "Más". */
  bar?: boolean;
  /** Can be hidden by the user (investments are a secondary module). */
  optional?: boolean;
}

export const MODULES: readonly ModuleDef[] = [
  { id: 'dashboard', path: '/', icon: House, group: 'daily', top: true, bar: true },
  { id: 'accounts', path: '/accounts', icon: Wallet, group: 'daily', top: true },
  {
    id: 'transactions',
    path: '/transactions',
    icon: ReceiptText,
    group: 'daily',
    top: true,
    bar: true,
  },
  { id: 'import', path: '/import', icon: FileUp, group: 'daily' },
  { id: 'budgets', path: '/budgets', icon: Target, group: 'plan', top: true },
  { id: 'savings', path: '/savings', icon: PiggyBank, group: 'plan' },
  { id: 'debts', path: '/debts', icon: CreditCard, group: 'plan' },
  { id: 'networth', path: '/net-worth', icon: Scale, group: 'analyze' },
  { id: 'reports', path: '/reports', icon: ChartColumn, group: 'analyze', top: true, bar: true },
  { id: 'investments', path: '/investments', icon: TrendingUp, group: 'analyze', optional: true },
  { id: 'settings', path: '/settings', icon: Settings, group: 'settings' },
];

export const MORE: ModuleDef = { id: 'more', path: '/more', icon: Ellipsis, group: 'settings' };

export function moduleById(id: ModuleId): ModuleDef {
  const found = id === 'more' ? MORE : MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown module: ${id}`);
  return found;
}

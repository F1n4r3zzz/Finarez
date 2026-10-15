import {
  ArrowLeftRight,
  ChartColumn,
  CreditCard,
  Ellipsis,
  FileUp,
  House,
  type LucideIcon,
  PiggyBank,
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
  /** Sidebar group: day to day, planning, analysis, settings. */
  group: 'daily' | 'plan' | 'analyze' | 'settings';
  /** Shown in the mobile bottom bar (at most five, including "Más"). */
  mobile?: boolean;
  /** Can be hidden by the user (investments are a secondary module). */
  optional?: boolean;
}

export const MODULES: readonly ModuleDef[] = [
  { id: 'dashboard', path: '/', icon: House, group: 'daily', mobile: true },
  { id: 'accounts', path: '/accounts', icon: Wallet, group: 'daily', mobile: true },
  { id: 'transactions', path: '/transactions', icon: ArrowLeftRight, group: 'daily', mobile: true },
  { id: 'import', path: '/import', icon: FileUp, group: 'daily' },
  { id: 'budgets', path: '/budgets', icon: Target, group: 'plan' },
  { id: 'savings', path: '/savings', icon: PiggyBank, group: 'plan' },
  { id: 'debts', path: '/debts', icon: CreditCard, group: 'plan' },
  { id: 'networth', path: '/net-worth', icon: Scale, group: 'analyze' },
  { id: 'reports', path: '/reports', icon: ChartColumn, group: 'analyze', mobile: true },
  { id: 'investments', path: '/investments', icon: TrendingUp, group: 'analyze', optional: true },
  { id: 'settings', path: '/settings', icon: Settings, group: 'settings' },
];

export const MORE: ModuleDef = { id: 'more', path: '/more', icon: Ellipsis, group: 'settings' };

export function moduleById(id: ModuleId): ModuleDef {
  const found = id === 'more' ? MORE : MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown module: ${id}`);
  return found;
}

import type { RouteObject } from 'react-router';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ErrorPage } from '../features/errors/ErrorPage';
import { NotFoundPage } from '../features/errors/NotFoundPage';
import { ImportPage } from '../features/modules/ImportPage';
import { ModulePage } from '../features/modules/ModulePage';
import { MorePage } from '../features/more/MorePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AppShell } from './AppShell';

// Sample-data preview for design work; the dynamic import is dropped from production builds.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/preview',
        lazy: async () => ({
          Component: (await import('../features/dashboard/DevPreview')).DevPreview,
        }),
      },
    ]
  : [];

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'accounts', element: <ModulePage id="accounts" /> },
      { path: 'transactions', element: <ModulePage id="transactions" /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'budgets', element: <ModulePage id="budgets" /> },
      { path: 'savings', element: <ModulePage id="savings" /> },
      { path: 'debts', element: <ModulePage id="debts" /> },
      { path: 'net-worth', element: <ModulePage id="networth" /> },
      { path: 'reports', element: <ModulePage id="reports" /> },
      { path: 'investments', element: <ModulePage id="investments" /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'more', element: <MorePage /> },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

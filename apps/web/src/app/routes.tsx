import { useTranslation } from 'react-i18next';
import type { RouteObject } from 'react-router';
import { AuthLayout } from '../features/auth/AuthLayout';
import { ForgotPasswordPage, forgotPasswordAction } from '../features/auth/ForgotPasswordPage';
import {
  ResetPasswordPage,
  resetPasswordAction,
  resetPasswordLoader,
} from '../features/auth/ResetPasswordPage';
import { SignInPage, signInAction } from '../features/auth/SignInPage';
import { SignUpPage, signUpAction } from '../features/auth/SignUpPage';
import { signOutAction } from '../features/auth/sign-out';
import { DashboardPage, dashboardLoader } from '../features/dashboard/DashboardPage';
import { ErrorPage } from '../features/errors/ErrorPage';
import { NotFoundPage } from '../features/errors/NotFoundPage';
import {
  AccountsPage,
  accountsLoader,
  NewAccountPage,
  newAccountAction,
} from '../features/ledger/AccountsPage';
import {
  TransactionFormPage,
  transactionFormAction,
  transactionFormLoader,
} from '../features/ledger/TransactionFormPage';
import { TransactionsPage, transactionsLoader } from '../features/ledger/TransactionsPage';
import { ImportPage } from '../features/modules/ImportPage';
import { ModulePage } from '../features/modules/ModulePage';
import { MorePage } from '../features/more/MorePage';
import { ratesAction, ratesLoader } from '../features/settings/RatesSection';
import { SettingsPage, settingsAction } from '../features/settings/SettingsPage';
import { WelcomePage, welcomeAction } from '../features/welcome/WelcomePage';
import { AppShell } from './AppShell';
import { APP_ROUTE_ID, accountLoader, guestOnlyLoader, welcomeLoader } from './account';

/** Shown while the first page loads (checking the session). */
function Loading() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="min-h-dvh">
      <span className="sr-only">{t('app.loading')}</span>
    </div>
  );
}

// Sample-data preview for design work, without signing in; dropped from production builds.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev',
        element: <AppShell />,
        children: [
          {
            path: 'preview',
            lazy: async () => ({
              Component: (await import('../features/dashboard/DevPreview')).DevPreview,
            }),
          },
        ],
      },
    ]
  : [];

export const routes: RouteObject[] = [
  {
    errorElement: <ErrorPage />,
    hydrateFallbackElement: <Loading />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            // Checked once on arrival, not again when moving between these pages, so the
            // next page shows at once (no request in between to type into the old one).
            loader: guestOnlyLoader,
            shouldRevalidate: () => false,
            children: [
              { path: 'sign-in', action: signInAction, element: <SignInPage /> },
              { path: 'sign-up', action: signUpAction, element: <SignUpPage /> },
              {
                path: 'forgot-password',
                action: forgotPasswordAction,
                element: <ForgotPasswordPage />,
              },
            ],
          },
          {
            path: 'reset-password',
            loader: resetPasswordLoader,
            action: resetPasswordAction,
            element: <ResetPasswordPage />,
          },
          {
            path: 'welcome',
            loader: welcomeLoader,
            action: welcomeAction,
            element: <WelcomePage />,
          },
        ],
      },
      { path: 'sign-out', action: signOutAction },
      ...devRoutes,
      {
        id: APP_ROUTE_ID,
        path: '/',
        loader: accountLoader,
        element: <AppShell />,
        children: [
          { index: true, loader: dashboardLoader, element: <DashboardPage /> },
          { path: 'accounts', loader: accountsLoader, element: <AccountsPage /> },
          { path: 'accounts/new', action: newAccountAction, element: <NewAccountPage /> },
          { path: 'transactions', loader: transactionsLoader, element: <TransactionsPage /> },
          {
            path: 'transactions/new',
            loader: transactionFormLoader,
            action: transactionFormAction,
            element: <TransactionFormPage />,
          },
          {
            path: 'transactions/:id',
            loader: transactionFormLoader,
            action: transactionFormAction,
            element: <TransactionFormPage />,
          },
          { path: 'import', element: <ImportPage /> },
          { path: 'budgets', element: <ModulePage id="budgets" /> },
          { path: 'savings', element: <ModulePage id="savings" /> },
          { path: 'debts', element: <ModulePage id="debts" /> },
          { path: 'net-worth', element: <ModulePage id="networth" /> },
          { path: 'reports', element: <ModulePage id="reports" /> },
          { path: 'investments', element: <ModulePage id="investments" /> },
          { path: 'settings', action: settingsAction, element: <SettingsPage /> },
          { path: 'settings/rates', loader: ratesLoader, action: ratesAction },
          { path: 'more', element: <MorePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

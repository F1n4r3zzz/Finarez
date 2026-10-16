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
import {
  EditBudgetPage,
  editBudgetAction,
  editBudgetLoader,
  NewBudgetPage,
  newBudgetAction,
  newBudgetLoader,
} from '../features/budgets/BudgetFormPage';
import { BudgetPage, budgetAction, budgetLoader } from '../features/budgets/BudgetPage';
import { BudgetsPage, budgetsLoader } from '../features/budgets/BudgetsPage';
import {
  availableLoader,
  DashboardPage,
  dashboardLoader,
} from '../features/dashboard/DashboardPage';
import { spendingLoader } from '../features/dashboard/SpendingPanel';
import { DebtPage, debtAction, debtLoader, proposalLoader } from '../features/debts/DebtPage';
import {
  DebtsPage,
  debtsLoader,
  EditDebtPage,
  editDebtAction,
  editDebtLoader,
  NewDebtPage,
  newDebtAction,
} from '../features/debts/DebtsPage';
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
import {
  AcceptTermsPage,
  acceptTermsAction,
  acceptTermsLoader,
} from '../features/legal/AcceptTermsPage';
import { LegalDocumentPage, LegalIndexPage, LegalLayout } from '../features/legal/LegalPage';
import { ImportPage } from '../features/modules/ImportPage';
import { ModulePage } from '../features/modules/ModulePage';
import { MorePage } from '../features/more/MorePage';
import {
  RecurringPage,
  recurringAction,
  recurringLoader,
} from '../features/recurring/RecurringPage';
import { EditRulePage, editRuleAction, editRuleLoader } from '../features/recurring/RuleFormPage';
import { RulePage, ruleLoader } from '../features/recurring/RulePage';
import {
  ReportsPage,
  reportsLoader,
  reportsShouldRevalidate,
} from '../features/reports/ReportsPage';
import { GoalPage, goalAction, goalLoader } from '../features/savings/GoalPage';
import {
  EditGoalPage,
  editGoalAction,
  editGoalLoader,
  NewGoalPage,
  newGoalAction,
  SavingsPage,
  savingsLoader,
} from '../features/savings/SavingsPage';
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
        path: 'legal',
        element: <LegalLayout />,
        children: [
          { index: true, element: <LegalIndexPage /> },
          { path: 'terms', element: <LegalDocumentPage documentId="terms" /> },
          { path: 'privacy', element: <LegalDocumentPage documentId="privacy" /> },
          { path: 'cookies', element: <LegalDocumentPage documentId="cookies" /> },
        ],
      },
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
            path: 'accept-terms',
            loader: acceptTermsLoader,
            action: acceptTermsAction,
            element: <AcceptTermsPage />,
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
          { path: 'dashboard/spending', loader: spendingLoader },
          { path: 'dashboard/available', loader: availableLoader },
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
          {
            path: 'transactions/recurring',
            loader: recurringLoader,
            action: recurringAction,
            element: <RecurringPage />,
          },
          { path: 'transactions/recurring/:id', loader: ruleLoader, element: <RulePage /> },
          {
            path: 'transactions/recurring/:id/edit',
            loader: editRuleLoader,
            action: editRuleAction,
            element: <EditRulePage />,
          },
          { path: 'import', element: <ImportPage /> },
          { path: 'budgets', loader: budgetsLoader, element: <BudgetsPage /> },
          {
            path: 'budgets/new',
            loader: newBudgetLoader,
            action: newBudgetAction,
            element: <NewBudgetPage />,
          },
          {
            path: 'budgets/:id',
            loader: budgetLoader,
            action: budgetAction,
            element: <BudgetPage />,
          },
          {
            path: 'budgets/:id/edit',
            loader: editBudgetLoader,
            action: editBudgetAction,
            element: <EditBudgetPage />,
          },
          { path: 'savings', loader: savingsLoader, element: <SavingsPage /> },
          { path: 'savings/new', action: newGoalAction, element: <NewGoalPage /> },
          {
            path: 'savings/:id',
            loader: goalLoader,
            action: goalAction,
            element: <GoalPage />,
          },
          {
            path: 'savings/:id/edit',
            loader: editGoalLoader,
            action: editGoalAction,
            element: <EditGoalPage />,
          },
          { path: 'debts', loader: debtsLoader, element: <DebtsPage /> },
          { path: 'debts/new', action: newDebtAction, element: <NewDebtPage /> },
          {
            path: 'debts/:id',
            loader: debtLoader,
            action: debtAction,
            element: <DebtPage />,
          },
          {
            path: 'debts/:id/edit',
            loader: editDebtLoader,
            action: editDebtAction,
            element: <EditDebtPage />,
          },
          { path: 'debts/:id/proposal', loader: proposalLoader },
          { path: 'net-worth', element: <ModulePage id="networth" /> },
          {
            path: 'reports',
            loader: reportsLoader,
            shouldRevalidate: reportsShouldRevalidate,
            element: <ReportsPage />,
          },
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

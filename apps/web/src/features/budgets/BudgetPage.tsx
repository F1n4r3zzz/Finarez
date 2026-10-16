import type { BudgetPeriodView, BudgetView, Category } from '@finanz/contracts';
import { todayIn } from '@finanz/kernel';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Link,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from 'react-router';
import { useAccount } from '../../app/account';
import { Button } from '../../components/Button';
import { ColumnChart } from '../../components/charts/ColumnChart';
import { FailureNotice } from '../../components/FailureNotice';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { isApiFailure } from '../../lib/api';
import { describeFailure, type Failure } from '../../lib/failure';
import { formatMoney } from '../../lib/money';
import { NotFoundPage } from '../errors/NotFoundPage';
import { listCategories } from '../ledger/api';
import { archiveBudget, budgetHistory, getBudget } from './api';
import { amountOf, PeriodStatus, useCategoryNames, usePeriodName, useScope } from './BudgetsPage';
import { monthYear, shortMonth } from './periods';

const SHOWN = 12;

export async function budgetLoader({ params }: LoaderFunctionArgs) {
  const id = params.id ?? '';
  try {
    const [budget, history, categories] = await Promise.all([
      getBudget(id),
      budgetHistory(id, SHOWN),
      listCategories(),
    ]);
    return { budget, history, categories };
  } catch (error) {
    if (isApiFailure(error, 404))
      return { budget: undefined, history: [], categories: [] as Category[] };
    throw error;
  }
}

interface BudgetResult {
  failure?: Failure;
}

export async function budgetAction({ request, params }: ActionFunctionArgs): Promise<BudgetResult> {
  const form = await request.formData();
  if (form.get('intent') !== 'archive') return {};
  try {
    await archiveBudget(params.id ?? '');
    return {};
  } catch (error) {
    return { failure: describeFailure(error) };
  }
}

/** Ticks and tooltip names for each period of the chart. */
function periodLabels(kind: BudgetView['period'], periods: readonly BudgetPeriodView[]) {
  return periods.map((p, i) => {
    if (kind === 'yearly') return { tick: { label: p.from.slice(0, 4) }, long: p.from.slice(0, 4) };
    const year = i === 0 || p.from.slice(5, 7) === '01' ? p.from.slice(0, 4) : undefined;
    if (kind === 'monthly')
      return { tick: { label: shortMonth(p.from), sub: year }, long: monthYear(p.from) };
    return {
      tick: { label: `${shortMonth(p.from)}–${shortMonth(p.to)}`, sub: year },
      long: `${monthYear(p.from)} – ${monthYear(p.to)}`,
    };
  });
}

function History({ budget, history }: { budget: BudgetView; history: BudgetPeriodView[] }) {
  const { t } = useTranslation();
  // One period has nothing to compare with; the status above already shows it.
  if (history.length < 2) return null;
  const labels = periodLabels(budget.period, history);
  const over = history.filter((p) => p.overspent).length;
  return (
    <Panel title={t(`budgets.detail.history.${budget.period}`)}>
      <p className="mb-4 text-sm text-muted">
        {over === 0
          ? t(`budgets.detail.neverOver.${budget.period}`, { total: history.length })
          : t(`budgets.detail.over.${budget.period}`, { over, total: history.length })}
      </p>
      <ColumnChart
        title={t(`budgets.detail.history.${budget.period}`)}
        ticks={labels.map((l) => l.tick)}
        longLabels={labels.map((l) => l.long)}
        currency={budget.currency}
        series={[
          {
            key: 'spent',
            label: t('budgets.detail.spent'),
            fill: 'fill-chart-expense',
            swatch: 'bg-chart-expense',
            values: history.map((p) => BigInt(p.spentMinor)),
          },
        ]}
        average={{ label: t('budgets.detail.limitNow'), value: BigInt(budget.limitMinor) }}
        extra={{
          label: t('budgets.detail.available'),
          values: history.map((p) => BigInt(p.availableMinor)),
        }}
      />
    </Panel>
  );
}

function Archive() {
  const { t } = useTranslation();
  const archive = useFetcher<BudgetResult>();
  const [confirming, setConfirming] = useState(false);
  return (
    <archive.Form method="post" className="grid gap-3 border-line border-t pt-5">
      <input type="hidden" name="intent" value="archive" />
      {confirming ? (
        <>
          <p className="text-sm">{t('budgets.detail.confirmArchive')}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="secondary" pending={archive.state !== 'idle'}>
              {t('budgets.detail.archive')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              {t('budgets.form.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            {t('budgets.detail.archive')}
          </Button>
        </div>
      )}
      <FailureNotice failure={archive.data?.failure} />
    </archive.Form>
  );
}

export function BudgetPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof budgetLoader>();
  const { preferences } = useAccount();
  const names = useCategoryNames(data.categories);
  const scope = useScope(data.categories);
  const periodName = usePeriodName();
  if (!data.budget) return <NotFoundPage />;
  const budget: BudgetView = data.budget;
  const today = todayIn(preferences.timeZone);
  const { name, parent } = names(budget.categoryId);

  return (
    <>
      <PageHeader
        title={parent ? `${parent}: ${name}` : name}
        description={
          budget.archived
            ? t('budgets.detail.archived')
            : t('budgets.detail.since', {
                scope: scope(budget),
                month: monthYear(budget.startsOn),
              })
        }
        action={
          !budget.archived && (
            <Link
              to={`/budgets/${budget.id}/edit`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-surface px-4 font-medium transition-colors duration-150 hover:bg-hover sm:w-auto"
            >
              {t('budgets.detail.edit')}
            </Link>
          )
        }
      />
      <section className="mb-6 grid gap-4 rounded-xl border border-line bg-surface p-5 md:p-6">
        {budget.current ? (
          <>
            <h2 className="font-semibold first-letter:uppercase">
              {periodName(budget.period, budget.current)}
            </h2>
            <PeriodStatus budget={budget} period={budget.current} today={today} large />
          </>
        ) : (
          <p className="text-muted">
            {t('budgets.startsIn', {
              month: monthYear(budget.startsOn),
              limit: formatMoney(amountOf(budget.limitMinor, budget.currency)),
            })}
          </p>
        )}
      </section>
      <div className="grid gap-6">
        <History budget={budget} history={data.history} />
        {!budget.archived && (
          <div className="px-1">
            <Archive />
          </div>
        )}
      </div>
    </>
  );
}

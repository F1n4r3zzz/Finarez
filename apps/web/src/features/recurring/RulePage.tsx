import type {
  AccountView,
  Category,
  OccurrenceView,
  RecurringTemplate,
  RuleView,
} from '@finanz/contracts';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, type LoaderFunctionArgs, useFetcher, useLoaderData } from 'react-router';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { isApiFailure } from '../../lib/api';
import { formatFullDate, formatLongDate, formatMediumDate } from '../../lib/dates';
import { NotFoundPage } from '../errors/NotFoundPage';
import { listAccounts, listCategories } from '../ledger/api';
import { getRule, listPending, ruleHistory } from './api';
import { PendingList, type RecurringResult } from './RecurringPage';
import { nextDates, templateAccounts, templateAmount, useDescribeSchedule } from './schedule';

const ACTION = '/transactions/recurring';

export async function ruleLoader({ params }: LoaderFunctionArgs) {
  const id = params.id ?? '';
  try {
    const [rule, history, pending, accounts, categories] = await Promise.all([
      getRule(id),
      ruleHistory(id),
      listPending(),
      listAccounts(),
      listCategories(),
    ]);
    return { rule, history, pending: pending.filter((o) => o.ruleId === id), accounts, categories };
  } catch (error) {
    if (isApiFailure(error, 404))
      return {
        rule: undefined,
        history: [] as OccurrenceView[],
        pending: [] as OccurrenceView[],
        accounts: [] as AccountView[],
        categories: [] as Category[],
      };
    throw error;
  }
}

/** "Arriendo" or "3 categorías"; a transfer has none. */
function useCategoryLine(categories: readonly Category[]) {
  const { t } = useTranslation();
  return (template: RecurringTemplate) => {
    if (template.kind === 'transfer') return '';
    if (template.lines.length > 1)
      return t('ledger.transactions.split', { count: template.lines.length });
    return categories.find((c) => c.id === template.lines[0]?.categoryId)?.name ?? '';
  };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="first-letter:uppercase">{children}</dd>
    </div>
  );
}

function SkipNext({ rule }: { rule: RuleView }) {
  const { t } = useTranslation();
  const fetcher = useFetcher<RecurringResult>();
  return (
    <fetcher.Form method="post" action={ACTION} className="grid gap-2">
      <input type="hidden" name="intent" value="skipNext" />
      <input type="hidden" name="ruleId" value={rule.id} />
      <div>
        <Button type="submit" variant="secondary" pending={fetcher.state !== 'idle'}>
          {t('recurring.detail.skipNext', { date: formatMediumDate(rule.nextDueOn) })}
        </Button>
      </div>
      <p className="text-sm text-subtle">{t('recurring.detail.skipNextHint')}</p>
      <FailureNotice failure={fetcher.data?.failure} />
    </fetcher.Form>
  );
}

function End({ rule }: { rule: RuleView }) {
  const { t } = useTranslation();
  const fetcher = useFetcher<RecurringResult>();
  const [confirming, setConfirming] = useState(false);
  return (
    <fetcher.Form method="post" action={ACTION} className="grid gap-3">
      <input type="hidden" name="intent" value="end" />
      <input type="hidden" name="ruleId" value={rule.id} />
      {confirming ? (
        <>
          <p className="text-sm">{t('recurring.detail.confirmEnd')}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="secondary" pending={fetcher.state !== 'idle'}>
              {t('recurring.detail.end')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              {t('recurring.form.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            {t('recurring.detail.end')}
          </Button>
        </div>
      )}
      <FailureNotice failure={fetcher.data?.failure} />
    </fetcher.Form>
  );
}

/** Each date it happened on: recorded (with a link to the movement), skipped or waiting. */
function History({ history }: { history: readonly OccurrenceView[] }) {
  const { t } = useTranslation();
  if (history.length === 0) return null;
  return (
    <Panel title={t('recurring.detail.history')}>
      <ul className="divide-y divide-line">
        {history.map((o) => (
          <li
            key={o.dueOn}
            className="flex min-h-11 items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
          >
            <span className="first-letter:uppercase">{formatLongDate(o.dueOn)}</span>
            {o.status === 'posted' && o.transactionId ? (
              <Link
                to={`/transactions/${o.transactionId}`}
                className="-mr-2 inline-flex min-h-11 items-center rounded-md px-2 font-medium text-brand text-sm transition-colors duration-150 hover:bg-brand-soft"
              >
                {t('recurring.status.posted')}
              </Link>
            ) : (
              <span className={`text-sm ${o.status === 'pending' ? 'text-ink' : 'text-subtle'}`}>
                {t(`recurring.status.${o.status}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function RulePage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof ruleLoader>();
  const describe = useDescribeSchedule();
  const categoryLine = useCategoryLine(data.categories);
  if (!data.rule) return <NotFoundPage />;
  const rule: RuleView = data.rule;
  const accountMap = new Map(data.accounts.map((a) => [a.id, a]));
  const [, ...after] = nextDates(rule, 4);

  return (
    <>
      <PageHeader
        title={rule.template.description}
        description={rule.ended ? t('recurring.detail.endedNote') : describe(rule)}
        action={
          !rule.ended && (
            <Link
              to={`/transactions/recurring/${rule.id}/edit`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-surface px-4 font-medium transition-colors duration-150 hover:bg-hover sm:w-auto"
            >
              {t('recurring.detail.edit')}
            </Link>
          )
        }
      />
      <section className="mb-6 grid gap-5 rounded-[22px] border border-line bg-surface p-5 md:p-6">
        <div className="grid gap-1">
          <Amount
            value={templateAmount(rule.template, rule.currency)}
            signed={rule.template.kind !== 'transfer'}
            className="text-2xl md:text-3xl"
          />
          <p className="text-muted">
            {[
              t(`ledger.transactions.kinds.${rule.template.kind}`),
              categoryLine(rule.template),
              templateAccounts(rule.template, accountMap),
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          {!rule.ended && (
            <Fact label={t('recurring.detail.next')}>{formatLongDate(rule.nextDueOn)}</Fact>
          )}
          <Fact label={t('recurring.detail.mode')}>
            {t(`recurring.modeLong.${rule.confirm ? 'confirm' : 'auto'}`)}
          </Fact>
          <Fact label={t('recurring.detail.until')}>
            {rule.endsOn ? formatFullDate(rule.endsOn) : t('recurring.detail.untilEnded')}
          </Fact>
          {after.length > 0 && (
            <Fact label={t('recurring.detail.after')}>
              {after.map((d) => formatMediumDate(d)).join(', ')}
            </Fact>
          )}
        </dl>
      </section>
      <div className="grid gap-6">
        <PendingList pending={data.pending} rules={[rule]} accounts={data.accounts} />
        <History history={data.history} />
        {!rule.ended && (
          <div className="grid gap-6 border-line border-t px-1 pt-5">
            <SkipNext rule={rule} />
            <End rule={rule} />
          </div>
        )}
      </div>
    </>
  );
}

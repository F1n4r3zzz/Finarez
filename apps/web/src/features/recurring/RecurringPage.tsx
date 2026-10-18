import type { AccountView, ConfirmOccurrence, OccurrenceView, RuleView } from '@finanz/contracts';
import { type CurrencyCode, type LocalDate, money } from '@finanz/kernel';
import { Repeat } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ActionFunctionArgs, Link, useFetcher, useLoaderData } from 'react-router';
import { ActionLink } from '../../components/ActionLink';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FailureNotice } from '../../components/FailureNotice';
import { TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { formatAmountInput, parseAmountInput } from '../../lib/amount-input';
import { formatLongDate, formatShortDate } from '../../lib/dates';
import { describeFailure, type Failure, failureForCode } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import { listAccounts } from '../ledger/api';
import {
  confirmOccurrence,
  endRule,
  listPending,
  listRules,
  skipNext,
  skipOccurrence,
} from './api';
import { templateAccounts, templateAmount, useDescribeSchedule } from './schedule';

export async function recurringLoader() {
  const [rules, pending, accounts] = await Promise.all([
    listRules(),
    listPending(),
    listAccounts(),
  ]);
  return { rules, pending, accounts };
}

export interface RecurringResult {
  failure?: Failure;
  fieldErrors?: { amount?: 'required' | 'amountInvalid' };
}

/** Confirming or skipping what waits, skipping the next date and ending a rule. */
export async function recurringAction({ request }: ActionFunctionArgs): Promise<RecurringResult> {
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const ruleId = field('ruleId');
  const dueOn = field('dueOn');
  try {
    switch (field('intent')) {
      case 'confirm': {
        const change: ConfirmOccurrence = {};
        const occurredOn = field('occurredOn');
        if (occurredOn && occurredOn !== dueOn) change.occurredOn = occurredOn as LocalDate;
        if (form.has('amount')) {
          const text = field('amount');
          if (!text) return { fieldErrors: { amount: 'required' } };
          let value: bigint;
          try {
            value = parseAmountInput(
              text,
              field('currency') as CurrencyCode,
              formattingLocale(),
            ).amountMinor;
          } catch {
            return { fieldErrors: { amount: 'amountInvalid' } };
          }
          if (value <= 0n) return { fieldErrors: { amount: 'amountInvalid' } };
          if (value.toString() !== field('usualAmount')) change.amountMinor = value.toString();
        }
        await confirmOccurrence(ruleId, dueOn, change);
        return {};
      }
      case 'skip':
        await skipOccurrence(ruleId, dueOn);
        return {};
      case 'skipNext':
        await skipNext(ruleId);
        return {};
      case 'end':
        await endRule(ruleId);
        return {};
    }
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return {};
}

const ACTION = '/transactions/recurring';

/** One date waiting for the user: record it as usual, adjusted, or skip it. */
function PendingItem({
  occurrence,
  rule,
  accounts,
}: {
  occurrence: OccurrenceView;
  rule: RuleView | undefined;
  accounts: ReadonlyMap<string, AccountView>;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher<RecurringResult>();
  const [adjusting, setAdjusting] = useState(false);
  const busy = fetcher.state !== 'idle';
  const intent = fetcher.formData?.get('intent');
  const amount = rule ? templateAmount(rule.template, rule.currency) : undefined;
  // Single-amount rules only; shown without sign (a refund line keeps its own).
  const usual = rule?.amountMinor ? BigInt(rule.amountMinor) : null;
  const usualAbs = usual !== null && usual < 0n ? -usual : usual;
  const amountError = fetcher.data?.fieldErrors?.amount;

  return (
    <li className="grid gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <Link
            to={`/transactions/recurring/${occurrence.ruleId}`}
            className="line-clamp-2 font-medium underline-offset-4 hover:underline"
          >
            {occurrence.description}
          </Link>
          <span className="block text-sm text-subtle first-letter:uppercase">
            {[
              formatLongDate(occurrence.dueOn),
              rule ? templateAccounts(rule.template, accounts) : '',
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
        </span>
        {amount && <Amount value={amount} signed={rule?.template.kind !== 'transfer'} />}
      </div>
      {occurrence.error && (
        <p className="text-sm text-expense">
          {t('recurring.pending.failed', {
            reason: t(`failures.${failureForCode(occurrence.error).key}`),
          })}
        </p>
      )}
      <fetcher.Form method="post" action={ACTION} className="grid gap-3">
        <input type="hidden" name="ruleId" value={occurrence.ruleId} />
        <input type="hidden" name="dueOn" value={occurrence.dueOn} />
        {adjusting && (
          <div className="grid gap-4 sm:grid-cols-2">
            {usualAbs !== null && rule && (
              <>
                <input type="hidden" name="currency" value={rule.currency} />
                <input type="hidden" name="usualAmount" value={usualAbs.toString()} />
                <TextField
                  label={t('recurring.pending.amount', { currency: rule.currency })}
                  name="amount"
                  inputMode="decimal"
                  defaultValue={formatAmountInput(
                    money(usualAbs, rule.currency),
                    formattingLocale(),
                  )}
                  error={amountError ? t(`ledger.transactions.fields.${amountError}`) : undefined}
                />
              </>
            )}
            <TextField
              label={t('recurring.pending.date')}
              name="occurredOn"
              type="date"
              defaultValue={occurrence.dueOn}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {/* Each button sends its own intent; Enter in a field records it, the first one. */}
          <Button
            type="submit"
            name="intent"
            value="confirm"
            pending={busy && intent === 'confirm'}
            disabled={busy}
          >
            {t('recurring.pending.confirm')}
          </Button>
          {!adjusting && (
            <Button type="button" variant="secondary" onClick={() => setAdjusting(true)}>
              {t('recurring.pending.adjust')}
            </Button>
          )}
          <Button
            type="submit"
            variant="secondary"
            name="intent"
            value="skip"
            pending={busy && intent === 'skip'}
            disabled={busy}
          >
            {t('recurring.pending.skip')}
          </Button>
        </div>
      </fetcher.Form>
      <FailureNotice failure={fetcher.data?.failure} />
    </li>
  );
}

/** What waits for the user, oldest first. */
export function PendingList({
  pending,
  rules,
  accounts,
}: {
  pending: readonly OccurrenceView[];
  rules: readonly RuleView[];
  accounts: readonly AccountView[];
}) {
  const { t } = useTranslation();
  const byId = new Map(rules.map((r) => [r.id, r]));
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  if (pending.length === 0) return null;
  return (
    <Panel title={t('recurring.pending.title', { count: pending.length })}>
      <p className="mb-4 text-sm text-muted">{t('recurring.pending.body')}</p>
      <ul className="divide-y divide-line">
        {pending.map((o) => (
          <PendingItem
            key={`${o.ruleId}:${o.dueOn}`}
            occurrence={o}
            rule={byId.get(o.ruleId)}
            accounts={accountMap}
          />
        ))}
      </ul>
    </Panel>
  );
}

function RuleRow({
  rule,
  accounts,
}: {
  rule: RuleView;
  accounts: ReadonlyMap<string, AccountView>;
}) {
  const { t } = useTranslation();
  const describe = useDescribeSchedule();
  return (
    <li>
      <Link
        to={`/transactions/recurring/${rule.id}`}
        className={`flex min-h-16 items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-hover ${rule.ended ? 'text-muted' : ''}`}
      >
        <span className="min-w-0">
          <span className="line-clamp-2 font-medium">{rule.template.description}</span>
          <span className="block text-sm text-subtle">{describe(rule)}</span>
          <span className="block text-sm text-subtle">
            {[
              rule.ended
                ? t('recurring.ended')
                : t('recurring.next', { date: formatShortDate(rule.nextDueOn) }),
              rule.confirm && !rule.ended ? t('recurring.asks') : '',
              templateAccounts(rule.template, accounts),
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
        </span>
        <Amount
          value={templateAmount(rule.template, rule.currency)}
          signed={rule.template.kind !== 'transfer' && !rule.ended}
        />
      </Link>
    </li>
  );
}

function RuleList({
  title,
  rules,
  accounts,
}: {
  title: string;
  rules: readonly RuleView[];
  accounts: ReadonlyMap<string, AccountView>;
}) {
  if (rules.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-2 font-medium text-muted text-sm">{title}</h2>
      <ul className="divide-y divide-line rounded-[22px] border border-line bg-surface">
        {rules.map((r) => (
          <RuleRow key={r.id} rule={r} accounts={accounts} />
        ))}
      </ul>
    </section>
  );
}

export function RecurringPage() {
  const { t } = useTranslation();
  const { rules, pending, accounts } = useLoaderData<typeof recurringLoader>();
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const add = <ActionLink to="/transactions/new?repeat=1" label={t('recurring.add')} />;

  return (
    <>
      <PageHeader
        title={t('recurring.title')}
        description={t('recurring.description')}
        action={rules.length > 0 && add}
      />
      {rules.length === 0 ? (
        <EmptyState icon={Repeat} title={t('recurring.emptyTitle')} body={t('recurring.emptyBody')}>
          <div className="mt-6 flex justify-center">{add}</div>
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          <PendingList pending={pending} rules={rules} accounts={accounts} />
          <RuleList
            title={t('recurring.active')}
            rules={rules.filter((r) => !r.ended)}
            accounts={accountMap}
          />
          <RuleList
            title={t('recurring.endedList')}
            rules={rules.filter((r) => r.ended)}
            accounts={accountMap}
          />
        </div>
      )}
    </>
  );
}

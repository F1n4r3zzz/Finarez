import {
  type AccountView,
  type AllocationView,
  ASSET_SUBTYPES,
  type GoalView,
} from '@finanz/contracts';
import { type LocalDate, todayIn } from '@finanz/kernel';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Link,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from 'react-router';
import { useAccount } from '../../app/account';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { SelectField, TextField } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Segmented } from '../../components/Segmented';
import { parseAmountInput } from '../../lib/amount-input';
import { formatFullDate, formatLongDate } from '../../lib/dates';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import { formatMoney } from '../../lib/money';
import { NotFoundPage } from '../errors/NotFoundPage';
import { listAccounts } from '../ledger/api';
import { allocate, archiveGoal, listAllocations, listGoals, voidAllocation } from './api';
import { amountOf, GoalProgress, useGoalPace } from './SavingsPage';

export async function goalLoader({ params }: LoaderFunctionArgs) {
  const id = params.id ?? '';
  const goal = (await listGoals()).find((g) => g.id === id);
  if (!goal) return { goal: undefined };
  const [history, accounts] = await Promise.all([listAllocations(id), listAccounts()]);
  return { goal, history, accounts };
}

type Loaded = Extract<Awaited<ReturnType<typeof goalLoader>>, { history: unknown }>;
type FieldKey = 'amount' | 'accountId' | 'fromAccountId';
interface GoalResult {
  done?: boolean;
  fieldErrors?: Partial<Record<FieldKey, 'required' | 'amountInvalid'>>;
  failure?: Failure;
}

export async function goalAction({ request, params }: ActionFunctionArgs): Promise<GoalResult> {
  const id = params.id ?? '';
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  try {
    if (field('intent') === 'void') {
      await voidAllocation(id, field('allocationId'));
      return { done: true };
    }
    if (field('intent') === 'archive') {
      await archiveGoal(id);
      return { done: true };
    }
  } catch (error) {
    return { failure: describeFailure(error) };
  }

  const accounts = new Map((await listAccounts()).map((a) => [a.id, a]));
  const errors: GoalResult['fieldErrors'] = {};
  const accountId = field('accountId');
  if (!accountId) errors.accountId = 'required';
  const transfer = field('transfer') === 'on' && field('direction') === 'contribute';
  const fromAccountId = transfer ? field('fromAccountId') : '';
  if (transfer && !fromAccountId) errors.fromAccountId = 'required';
  let amountMinor = '';
  const text = field('amount');
  const currency = accounts.get(accountId)?.currency;
  if (!text) errors.amount = 'required';
  else
    try {
      if (!currency) throw new Error('no account');
      const value = parseAmountInput(text, currency, formattingLocale()).amountMinor;
      if (value <= 0n) throw new Error('not positive');
      amountMinor = value.toString();
    } catch {
      errors.amount = 'amountInvalid';
    }
  if (Object.keys(errors).length) return { fieldErrors: errors };
  try {
    await allocate(
      id,
      {
        direction: field('direction') === 'withdraw' ? 'withdraw' : 'contribute',
        accountId,
        amountMinor,
        occurredOn: field('occurredOn') as LocalDate,
        ...(fromAccountId ? { fromAccountId } : {}),
      },
      field('idempotencyKey'),
    );
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return { done: true };
}

const canHoldSavings = (a: AccountView) =>
  !a.archived && (ASSET_SUBTYPES as readonly string[]).includes(a.subtype);

function MoveForm({ goal, accounts }: { goal: GoalView; accounts: AccountView[] }) {
  const { t } = useTranslation();
  const { preferences } = useAccount();
  const move = useFetcher<GoalResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const [direction, setDirection] = useState<'contribute' | 'withdraw'>('contribute');
  const [accountId, setAccountId] = useState('');
  const [transfer, setTransfer] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const holding = new Map(goal.byAccount.map((b) => [b.accountId, b.amountMinor]));
  const options =
    direction === 'withdraw'
      ? accounts.filter((a) => holding.has(a.id))
      : accounts.filter(canHoldSavings);
  const chosen = options.find((a) => a.id === accountId) ?? options[0];
  const sources = accounts.filter(
    (a) => canHoldSavings(a) && a.id !== chosen?.id && a.currency === chosen?.currency,
  );

  useEffect(() => {
    if (move.state === 'idle' && move.data?.done) {
      formRef.current?.reset();
      setTransfer(false);
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [move.state, move.data]);

  const error = (key: FieldKey) => {
    const code = move.data?.fieldErrors?.[key];
    return code ? t(`savings.fields.${code}`) : undefined;
  };

  return (
    <Panel title={t('savings.detail.move')}>
      <move.Form method="post" ref={formRef} noValidate className="grid gap-5">
        <input type="hidden" name="intent" value="allocate" />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <Segmented
          legend={t('savings.detail.direction')}
          name="direction"
          options={(['contribute', 'withdraw'] as const).map((v) => ({
            value: v,
            label: t(`savings.detail.${v}`),
          }))}
          value={direction}
          onChange={(v) => {
            setDirection(v);
            setAccountId('');
          }}
        />
        {options.length === 0 ? (
          <p className="text-muted text-sm">
            {t(
              direction === 'withdraw'
                ? 'savings.detail.nothingToWithdraw'
                : 'savings.detail.noAccounts',
            )}
          </p>
        ) : (
          <>
            <SelectField
              label={t(
                direction === 'withdraw'
                  ? 'savings.detail.withdrawAccount'
                  : 'savings.detail.account',
              )}
              name="accountId"
              value={chosen?.id ?? ''}
              onChange={(e) => setAccountId(e.target.value)}
              hint={direction === 'contribute' ? t('savings.detail.accountHint') : undefined}
              error={error('accountId')}
            >
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {direction === 'withdraw'
                    ? t('savings.detail.holding', {
                        account: a.name,
                        amount: formatMoney(amountOf(holding.get(a.id) ?? '0', a.currency)),
                      })
                    : `${a.name} (${a.currency})`}
                </option>
              ))}
            </SelectField>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label={t('savings.detail.amount')}
                name="amount"
                inputMode="decimal"
                error={error('amount')}
              />
              <TextField
                label={t('savings.detail.date')}
                name="occurredOn"
                type="date"
                defaultValue={todayIn(preferences.timeZone)}
              />
            </div>
            {direction === 'contribute' && sources.length > 0 && (
              <>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="transfer"
                    checked={transfer}
                    onChange={(e) => setTransfer(e.target.checked)}
                    className="size-5 accent-brand"
                  />
                  {t('savings.detail.transfer')}
                </label>
                {transfer && (
                  <SelectField
                    label={t('savings.detail.from')}
                    name="fromAccountId"
                    hint={t('savings.detail.fromHint')}
                    error={error('fromAccountId')}
                  >
                    {sources.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </SelectField>
                )}
              </>
            )}
            <FailureNotice failure={move.data?.failure} />
            {move.state === 'idle' && move.data?.done && (
              <Notice tone="success">{t('savings.detail.done')}</Notice>
            )}
            <div>
              <Button type="submit" pending={move.state !== 'idle'}>
                {t(
                  move.state !== 'idle'
                    ? 'savings.detail.sending'
                    : direction === 'withdraw'
                      ? 'savings.detail.withdraw'
                      : 'savings.detail.contribute',
                )}
              </Button>
            </div>
          </>
        )}
      </move.Form>
    </Panel>
  );
}

function HistoryRow({
  item,
  accounts,
}: {
  item: AllocationView;
  accounts: Map<string, AccountView>;
}) {
  const { t } = useTranslation();
  const voider = useFetcher<GoalResult>();
  const [confirming, setConfirming] = useState(false);
  const account = accounts.get(item.accountId);
  const value = amountOf(item.amountMinor, account?.currency ?? 'COP');
  const contribution = BigInt(item.amountMinor) > 0n;
  return (
    <li className={`grid gap-1 pt-3 ${item.voided ? 'pb-3 opacity-60' : 'pb-1'}`}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0">
          <span className="block font-medium">{formatLongDate(item.occurredOn)}</span>
          <span className="block text-sm text-subtle">
            {item.voided
              ? t('savings.detail.voided')
              : t(
                  contribution
                    ? item.transactionId
                      ? 'savings.detail.movedTo'
                      : 'savings.detail.setAsideIn'
                    : 'savings.detail.releasedFrom',
                  { account: account?.name ?? '' },
                )}
          </span>
        </span>
        <Amount value={value} signed className={item.voided ? 'line-through' : ''} />
      </div>
      {!item.voided && (
        <voider.Form method="post" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="intent" value="void" />
          <input type="hidden" name="allocationId" value={item.id} />
          {confirming ? (
            <>
              <span className="text-sm">
                {t(
                  item.transactionId
                    ? 'savings.detail.confirmVoidTransfer'
                    : 'savings.detail.confirmVoid',
                )}
              </span>
              <Button type="submit" variant="secondary" pending={voider.state !== 'idle'}>
                {t('savings.detail.void')}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t('savings.detail.keep')}
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-muted text-sm transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              {t('savings.detail.void')}
            </button>
          )}
        </voider.Form>
      )}
      <FailureNotice failure={voider.data?.failure} />
    </li>
  );
}

function Archive({ goal }: { goal: GoalView }) {
  const { t } = useTranslation();
  const archive = useFetcher<GoalResult>();
  const empty = goal.byAccount.length === 0;
  return (
    <archive.Form method="post" className="grid gap-2 border-line border-t pt-5">
      <input type="hidden" name="intent" value="archive" />
      <div>
        <Button
          type="submit"
          variant="secondary"
          disabled={!empty}
          pending={archive.state !== 'idle'}
        >
          {t('savings.detail.archive')}
        </Button>
      </div>
      {!empty && <p className="text-sm text-subtle">{t('savings.detail.archiveHint')}</p>}
      <FailureNotice failure={archive.data?.failure} />
    </archive.Form>
  );
}

export function GoalPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof goalLoader>();
  const pace = useGoalPace();
  if (!data.goal) return <NotFoundPage />;
  const { goal, history, accounts } = data as Loaded;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const paceText = pace(goal);

  return (
    <>
      <PageHeader
        title={goal.name}
        description={
          goal.archived
            ? t('savings.detail.archived')
            : goal.targetDate
              ? t('savings.by', { date: formatFullDate(goal.targetDate) })
              : t('savings.noDate')
        }
        action={
          !goal.archived && (
            <Link
              to={`/savings/${goal.id}/edit`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line bg-surface px-4 font-medium transition-colors duration-150 hover:bg-hover sm:w-auto"
            >
              {t('savings.detail.edit')}
            </Link>
          )
        }
      />
      <section className="mb-6 grid gap-4 rounded-[22px] border border-line bg-surface p-5 md:p-6">
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <dt className="text-sm text-muted">{t('savings.saved')}</dt>
            <dd className="mt-1 text-2xl md:text-3xl">
              <Amount value={amountOf(goal.savedMinor, goal.currency)} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t('savings.detail.target')}</dt>
            <dd className="mt-1 text-lg md:text-xl">
              <Amount value={amountOf(goal.targetMinor, goal.currency)} />
            </dd>
          </div>
        </dl>
        <GoalProgress goal={goal} />
        {paceText && <p className="text-sm">{paceText}</p>}
        {goal.excluded.length > 0 && (
          <Notice tone="info">
            {t('savings.detail.missingRates', {
              currencies: [...new Set(goal.excluded.map((e) => e.currency))].join(', '),
            })}
          </Notice>
        )}
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid gap-4">
          {!goal.archived && <MoveForm goal={goal} accounts={accounts} />}
          <Panel title={t('savings.detail.history')}>
            {history.length === 0 ? (
              <p className="text-muted text-sm">{t('savings.detail.noHistory')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {history.map((item) => (
                  <HistoryRow key={item.id} item={item} accounts={byId} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="grid gap-4">
          {goal.byAccount.length > 0 && (
            <Panel title={t('savings.detail.where')}>
              <ul className="grid gap-2 text-sm">
                {goal.byAccount.map((b) => {
                  const account = byId.get(b.accountId);
                  return (
                    <li key={b.accountId} className="flex justify-between gap-4">
                      <span className="text-muted">{account?.name}</span>
                      <Amount value={amountOf(b.amountMinor, account?.currency ?? goal.currency)} />
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
          {!goal.archived && (
            <div className="px-1">
              <Archive goal={goal} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

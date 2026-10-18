import type { AccountView, Category, DraftInput, TransactionView } from '@finanz/contracts';
import {
  type CurrencyCode,
  type Frequency,
  fromWire,
  type LocalDate,
  todayIn,
} from '@finanz/kernel';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Form,
  Link,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { useAccount } from '../../app/account';
import { useBandOverlap } from '../../app/band';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { SelectField, TextField } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { Segmented } from '../../components/Segmented';
import { formatAmountInput, parseAmountInput } from '../../lib/amount-input';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import { createRule } from '../recurring/api';
import { RepeatFields } from '../recurring/RepeatFields';
import { dayOfMonth } from '../recurring/schedule';
import {
  createTransaction,
  editTransaction,
  getTransaction,
  listAccounts,
  listCategories,
  listTransactions,
  restoreTransaction,
  voidTransaction,
} from './api';
import { selectableCategories, topCategories } from './category-usage';

type Kind = 'expense' | 'income' | 'transfer';
const KINDS: readonly Kind[] = ['expense', 'income', 'transfer'];

export async function transactionFormLoader({ params, request }: LoaderFunctionArgs) {
  const [accounts, categories, transaction, recent] = await Promise.all([
    listAccounts(),
    listCategories(),
    params.id ? getTransaction(params.id) : Promise.resolve(undefined),
    // Recent movements tell which categories to offer as quick picks.
    params.id ? Promise.resolve([]) : listTransactions({ limit: 300 }),
  ]);
  // "Nuevo recurrente" opens the form with "Repetir" already on.
  const repeat = new URL(request.url).searchParams.get('repeat') === '1';
  return { accounts, categories, transaction, repeat, recent };
}

type FieldKey =
  | 'description'
  | 'accountId'
  | 'categoryId'
  | 'amount'
  | 'from'
  | 'to'
  | 'sent'
  | 'received';
interface FormResult {
  fieldErrors?: Partial<Record<FieldKey, 'required' | 'amountInvalid'>> & {
    endsOn?: 'endsBeforeStart';
    secondDay?: 'secondDaySame';
  };
  failure?: Failure;
}

/** The parts of a saved transaction this form can show and edit. */
function initialValues(t: TransactionView | undefined, accounts: Map<string, AccountView>) {
  if (!t) return undefined;
  const legs = t.entries.filter((e) => e.accountKind === 'asset' || e.accountKind === 'liability');
  const lines = t.entries.filter((e) => e.categoryId);
  const display = (amountMinor: string, currency: CurrencyCode) => {
    const value = fromWire({ amountMinor, currency });
    const positive = value.amountMinor < 0n ? { ...value, amountMinor: -value.amountMinor } : value;
    return formatAmountInput(positive, formattingLocale());
  };
  if (t.kind === 'transfer') {
    const from = legs.find((l) => BigInt(l.amountMinor) < 0n);
    const to = legs.find((l) => BigInt(l.amountMinor) > 0n);
    if (!from || !to) return undefined;
    return {
      kind: 'transfer' as const,
      from: from.accountId,
      to: to.accountId,
      sent: display(from.amountMinor, from.currency),
      received:
        accounts.get(from.accountId)?.currency === accounts.get(to.accountId)?.currency
          ? ''
          : display(to.amountMinor, to.currency),
    };
  }
  if ((t.kind === 'expense' || t.kind === 'income') && legs.length === 1 && lines.length === 1) {
    const [leg] = legs;
    const [line] = lines;
    if (!leg || !line) return undefined;
    return {
      kind: t.kind,
      accountId: leg.accountId,
      categoryId: line.categoryId ?? '',
      amount: display(line.amountMinor, line.currency),
    };
  }
  return undefined;
}

export async function transactionFormAction({
  request,
  params,
}: ActionFunctionArgs): Promise<FormResult | Response> {
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const intent = field('intent');
  const version = Number(field('version'));
  try {
    if (intent === 'void' && params.id) {
      await voidTransaction(params.id, version);
      return redirect('/transactions');
    }
    if (intent === 'restore' && params.id) {
      await restoreTransaction(params.id, version);
      return redirect('/transactions');
    }
  } catch (error) {
    return { failure: describeFailure(error) };
  }

  const accounts = new Map(((await listAccounts()) as AccountView[]).map((a) => [a.id, a]));
  const kind = field('kind') as Kind;
  const errors: NonNullable<FormResult['fieldErrors']> = {};
  const required = (name: FieldKey) => {
    if (!field(name)) errors[name] = 'required';
    return field(name);
  };
  const amount = (name: FieldKey, accountId: string) => {
    const currency = accounts.get(accountId)?.currency;
    const text = field(name);
    if (!text) {
      errors[name] ??= 'required';
      return '0';
    }
    try {
      if (!currency) throw new Error('no account');
      const value = parseAmountInput(text, currency, formattingLocale()).amountMinor;
      if (value <= 0n) throw new Error('not positive');
      return value.toString();
    } catch {
      errors[name] = 'amountInvalid';
      return '0';
    }
  };

  const base = {
    occurredOn: field('occurredOn') as LocalDate,
    description: required('description'),
  };
  let draft: DraftInput;
  if (kind === 'transfer') {
    const from = required('from');
    const to = required('to');
    const sent = amount('sent', from);
    const sameCurrency = accounts.get(from)?.currency === accounts.get(to)?.currency;
    const received = sameCurrency ? sent : amount('received', to);
    draft = {
      ...base,
      kind,
      from: { accountId: from, amountMinor: sent },
      to: { accountId: to, amountMinor: received },
    };
  } else {
    const accountId = required('accountId');
    const categoryId = required('categoryId');
    const lines = [{ categoryId, amountMinor: amount('amount', accountId) }];
    draft =
      kind === 'income'
        ? { ...base, kind, accountId, lines }
        : { ...base, kind: 'expense', accountId, lines };
  }
  const repeat = !params.id && form.get('repeat') === 'on';
  const frequency = field('frequency') as Frequency;
  const secondDay = frequency === 'twice_monthly' ? Number(field('secondDay')) : null;
  const endsOn = (field('endsOn') || null) as LocalDate | null;
  if (repeat && endsOn && endsOn < base.occurredOn) errors.endsOn = 'endsBeforeStart';
  if (repeat && secondDay === dayOfMonth(base.occurredOn)) errors.secondDay = 'secondDaySame';
  if (Object.keys(errors).length) return { fieldErrors: errors };

  if (repeat) {
    let ruleId: string;
    try {
      const rule = await createRule(
        { draft, frequency, secondDay, endsOn, confirm: field('mode') === 'confirm' },
        field('idempotencyKey'),
      );
      ruleId = rule.id;
    } catch (error) {
      return { failure: describeFailure(error) };
    }
    return redirect(`/transactions/recurring/${ruleId}`);
  }

  try {
    if (params.id) await editTransaction(params.id, { version, draft });
    else await createTransaction(draft, field('idempotencyKey'));
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return redirect('/transactions');
}

function categoryOptions(categories: Category[], kind: 'income' | 'expense') {
  return selectableCategories(categories, kind).map((c) => ({
    value: c.id,
    label: c.parentId ? `— ${c.name}` : c.name,
  }));
}

/** The amount, large, with the currency of the account it moves. */
function MoneyField({
  label,
  name,
  currency,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  currency?: string;
  defaultValue?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="font-medium text-sm">
        {label}
      </label>
      <div
        className={`flex items-baseline gap-2.5 rounded-[18px] border bg-field px-4 py-2.5 has-focus-visible:outline-2 has-focus-visible:outline-brand ${
          error ? 'border-expense' : 'border-line-strong'
        }`}
      >
        {currency && <span className="font-semibold text-muted">{currency}</span>}
        <input
          id={id}
          name={name}
          inputMode="decimal"
          autoComplete="off"
          defaultValue={defaultValue}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="amount min-w-0 flex-1 bg-transparent text-[2.5rem] leading-tight outline-none"
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="text-expense text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export function TransactionFormPage() {
  const { t } = useTranslation();
  useBandOverlap();
  const { preferences } = useAccount();
  const { accounts, categories, transaction, repeat, recent } =
    useLoaderData<typeof transactionFormLoader>();
  const result = useActionData<FormResult>();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const active = accounts.filter((a) => !a.archived);
  const initial = initialValues(transaction, accountMap);
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'expense');
  const [from, setFrom] = useState<string>(
    (initial && 'from' in initial ? initial.from : active[0]?.id) ?? '',
  );
  const [to, setTo] = useState<string>(
    (initial && 'to' in initial ? initial.to : active[1]?.id) ?? '',
  );
  const [accountId, setAccountId] = useState<string>(
    (initial && 'accountId' in initial ? initial.accountId : active[0]?.id) ?? '',
  );
  const [categoryId, setCategoryId] = useState<string>(
    (initial && 'categoryId' in initial ? initial.categoryId : '') ?? '',
  );
  const today = todayIn(preferences.timeZone);
  const [date, setDate] = useState<string>(transaction?.occurredOn ?? today);
  // One key per form: a double tap on "Guardar" can never post twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const error = (key: FieldKey) => {
    const code = result?.fieldErrors?.[key];
    return code ? t(`ledger.transactions.fields.${code}`) : undefined;
  };
  const editable =
    !transaction ||
    (initial !== undefined && transaction.status === 'posted' && !transaction.managedBy);
  const differentCurrencies = accountMap.get(from)?.currency !== accountMap.get(to)?.currency;
  const accountOptions = active.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name} ({a.currency})
    </option>
  ));
  const options = kind === 'transfer' ? [] : categoryOptions(categories, kind);
  const picks = kind === 'transfer' || transaction ? [] : topCategories(recent, categories, kind);
  // Until the user picks one, the most used category of this kind (not the list's first).
  const fallback = picks[0]?.id ?? options[0]?.value ?? '';
  const chosen = options.some((o) => o.value === categoryId) ? categoryId : fallback;

  return (
    <>
      <PageHeader
        title={t(
          transaction ? 'ledger.transactions.form.editTitle' : 'ledger.transactions.form.newTitle',
        )}
        description={transaction?.description ?? t('ledger.transactions.form.newDescription')}
        action={
          <Link
            to="/transactions"
            aria-label={t('ledger.transactions.form.close')}
            className="absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-full bg-band-chip text-on-band lg:hidden"
          >
            <X size={22} aria-hidden="true" />
          </Link>
        }
      />
      <div className="grid max-w-[45rem] gap-5 rounded-[22px] border border-line bg-surface p-5 sm:p-6">
        {transaction?.managedBy && (
          <Notice tone="info">{t('ledger.transactions.form.managed')}</Notice>
        )}
        {editable && (
          <Form method="post" noValidate className="grid gap-5">
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input type="hidden" name="version" value={transaction?.version ?? 0} />
            <Segmented
              legend={t('ledger.transactions.form.type')}
              name="kind"
              options={KINDS.map((k) => ({ value: k, label: t(`ledger.transactions.kinds.${k}`) }))}
              value={kind}
              onChange={setKind}
              disabled={Boolean(transaction)}
            />
            {kind === 'transfer' ? (
              <>
                <MoneyField
                  label={t(
                    differentCurrencies
                      ? 'ledger.transactions.form.sent'
                      : 'ledger.transactions.form.amount',
                  )}
                  name="sent"
                  currency={accountMap.get(from)?.currency}
                  defaultValue={initial && 'sent' in initial ? initial.sent : ''}
                  error={error('sent')}
                />
                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    label={t('ledger.transactions.form.from')}
                    name="from"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    error={error('from')}
                  >
                    {accountOptions}
                  </SelectField>
                  <SelectField
                    label={t('ledger.transactions.form.to')}
                    name="to"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    error={error('to')}
                  >
                    {accountOptions}
                  </SelectField>
                </div>
                {differentCurrencies && (
                  <TextField
                    label={t('ledger.transactions.form.received')}
                    name="received"
                    inputMode="decimal"
                    defaultValue={initial && 'received' in initial ? initial.received : ''}
                    hint={t('ledger.transactions.form.receivedHint')}
                    error={error('received')}
                  />
                )}
              </>
            ) : (
              <>
                <MoneyField
                  label={t('ledger.transactions.form.amount')}
                  name="amount"
                  currency={accountMap.get(accountId)?.currency}
                  defaultValue={initial && 'amount' in initial ? initial.amount : ''}
                  error={error('amount')}
                />
                <div className="grid gap-5 sm:grid-cols-2">
                  <SelectField
                    label={t('ledger.transactions.form.account')}
                    name="accountId"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    error={error('accountId')}
                  >
                    {accountOptions}
                  </SelectField>
                  <TextField
                    label={t('ledger.transactions.form.date')}
                    name="occurredOn"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                {picks.length > 0 && (
                  <fieldset className="flex flex-wrap gap-2">
                    <legend className="sr-only">{t('ledger.transactions.form.quickPicks')}</legend>
                    {picks.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={chosen === c.id}
                        onClick={() => setCategoryId(c.id)}
                        className={`min-h-10 rounded-full border px-3.5 font-medium transition-colors duration-150 ${
                          chosen === c.id
                            ? 'border-action bg-action text-on-action'
                            : 'border-line-strong hover:bg-hover'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </fieldset>
                )}
                <SelectField
                  label={t('ledger.transactions.form.category')}
                  name="categoryId"
                  value={chosen}
                  onChange={(e) => setCategoryId(e.target.value)}
                  error={error('categoryId')}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectField>
              </>
            )}
            {kind === 'transfer' && (
              <TextField
                label={t('ledger.transactions.form.date')}
                name="occurredOn"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
            <TextField
              label={t('ledger.transactions.form.description')}
              name="description"
              defaultValue={transaction?.description}
              hint={t('ledger.transactions.form.descriptionHint')}
              error={error('description')}
              autoComplete="off"
            />
            {!transaction && (
              <RepeatFields
                date={date as LocalDate}
                today={today}
                defaultOn={repeat}
                error={(key) => {
                  const code = result?.fieldErrors?.[key];
                  return code ? t(`recurring.fields.${code}`) : undefined;
                }}
              />
            )}
            <FailureNotice failure={result?.failure} />
            {/* On phones the save button stays at the bottom of the screen. */}
            <div className="sticky bottom-0 -mx-5 flex gap-3 border-line border-t bg-surface px-5 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0">
              <Button type="submit" pending={submitting} wide>
                {submitting
                  ? t('ledger.transactions.form.submitting')
                  : transaction
                    ? t('ledger.transactions.form.saveChanges')
                    : t(`ledger.transactions.form.save.${kind}`)}
              </Button>
              <Link
                to="/transactions"
                className="hidden min-h-11 items-center justify-center rounded-full border border-line-strong px-5 font-medium hover:bg-hover sm:inline-flex"
              >
                {t('ledger.transactions.form.cancel')}
              </Link>
            </div>
          </Form>
        )}
        {transaction && !transaction.managedBy && (
          <Form method="post" className="grid gap-2 border-line border-t pt-5">
            <input type="hidden" name="version" value={transaction.version} />
            <input
              type="hidden"
              name="intent"
              value={transaction.status === 'posted' ? 'void' : 'restore'}
            />
            <div>
              <Button type="submit" variant="secondary">
                {t(
                  transaction.status === 'posted'
                    ? 'ledger.transactions.form.void'
                    : 'ledger.transactions.form.restore',
                )}
              </Button>
            </div>
            {transaction.status === 'posted' && (
              <p className="text-sm text-subtle">{t('ledger.transactions.form.voidHint')}</p>
            )}
          </Form>
        )}
      </div>
    </>
  );
}

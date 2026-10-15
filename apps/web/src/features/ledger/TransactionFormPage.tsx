import type { AccountView, Category, DraftInput, TransactionView } from '@finanz/contracts';
import { type CurrencyCode, fromWire, type LocalDate, todayIn } from '@finanz/kernel';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { useAccount } from '../../app/account';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { SelectField, TextField } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { Segmented } from '../../components/Segmented';
import { formatAmountInput, parseAmountInput } from '../../lib/amount-input';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import {
  createTransaction,
  editTransaction,
  getTransaction,
  listAccounts,
  listCategories,
  restoreTransaction,
  voidTransaction,
} from './api';

type Kind = 'expense' | 'income' | 'transfer';
const KINDS: readonly Kind[] = ['expense', 'income', 'transfer'];

export async function transactionFormLoader({ params }: LoaderFunctionArgs) {
  const [accounts, categories, transaction] = await Promise.all([
    listAccounts(),
    listCategories(),
    params.id ? getTransaction(params.id) : Promise.resolve(undefined),
  ]);
  return { accounts, categories, transaction };
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
  fieldErrors?: Partial<Record<FieldKey, 'required' | 'amountInvalid'>>;
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
  const errors: FormResult['fieldErrors'] = {};
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
  if (Object.keys(errors).length) return { fieldErrors: errors };

  try {
    if (params.id) await editTransaction(params.id, { version, draft });
    else await createTransaction(draft, field('idempotencyKey'));
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return redirect('/transactions');
}

function categoryOptions(categories: Category[], kind: 'income' | 'expense') {
  const active = categories.filter((c) => c.kind === kind && !c.archived);
  const roots = active.filter((c) => !c.parentId);
  return roots.flatMap((root) => [
    { value: root.id, label: root.name },
    ...active
      .filter((c) => c.parentId === root.id)
      .map((c) => ({ value: c.id, label: `— ${c.name}` })),
  ]);
}

export function TransactionFormPage() {
  const { t } = useTranslation();
  const { preferences } = useAccount();
  const { accounts, categories, transaction } = useLoaderData<typeof transactionFormLoader>();
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

  return (
    <>
      <PageHeader
        title={t(
          transaction ? 'ledger.transactions.form.editTitle' : 'ledger.transactions.form.newTitle',
        )}
        description={transaction?.description ?? t('modules.transactions.description')}
      />
      <div className="grid max-w-lg gap-5">
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
            <TextField
              label={t('ledger.transactions.form.date')}
              name="occurredOn"
              type="date"
              defaultValue={transaction?.occurredOn ?? todayIn(preferences.timeZone)}
            />
            <TextField
              label={t('ledger.transactions.form.description')}
              name="description"
              defaultValue={transaction?.description}
              hint={t('ledger.transactions.form.descriptionHint')}
              error={error('description')}
              autoComplete="off"
            />
            {kind === 'transfer' ? (
              <>
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
                <TextField
                  label={t(
                    differentCurrencies
                      ? 'ledger.transactions.form.sent'
                      : 'ledger.transactions.form.amount',
                  )}
                  name="sent"
                  inputMode="decimal"
                  defaultValue={initial && 'sent' in initial ? initial.sent : ''}
                  error={error('sent')}
                />
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
                <SelectField
                  label={t('ledger.transactions.form.account')}
                  name="accountId"
                  defaultValue={
                    initial && 'accountId' in initial ? initial.accountId : active[0]?.id
                  }
                  error={error('accountId')}
                >
                  {accountOptions}
                </SelectField>
                <SelectField
                  key={kind}
                  label={t('ledger.transactions.form.category')}
                  name="categoryId"
                  defaultValue={initial && 'categoryId' in initial ? initial.categoryId : undefined}
                  error={error('categoryId')}
                >
                  {categoryOptions(categories, kind).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label={t('ledger.transactions.form.amount')}
                  name="amount"
                  inputMode="decimal"
                  defaultValue={initial && 'amount' in initial ? initial.amount : ''}
                  error={error('amount')}
                />
              </>
            )}
            <FailureNotice failure={result?.failure} />
            <div>
              <Button type="submit" pending={submitting}>
                {t(
                  submitting
                    ? 'ledger.transactions.form.submitting'
                    : 'ledger.transactions.form.submit',
                )}
              </Button>
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

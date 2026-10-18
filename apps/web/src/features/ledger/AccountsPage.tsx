import { type AccountView, ASSET_SUBTYPES, LIABILITY_SUBTYPES } from '@finanz/contracts';
import { type CurrencyCode, fromWire, type Money, money, todayIn } from '@finanz/kernel';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { useAccount } from '../../app/account';
import { moduleById } from '../../app/modules';
import { ActionLink } from '../../components/ActionLink';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FailureNotice } from '../../components/FailureNotice';
import { SelectField, TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { parseAmountInput } from '../../lib/amount-input';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import { currencyOptions } from '../preferences/options';
import { createAccount, listAccounts } from './api';

export async function accountsLoader() {
  return { accounts: await listAccounts() };
}

const isLiability = (subtype: string) =>
  (LIABILITY_SUBTYPES as readonly string[]).includes(subtype);

function totalsByCurrency(accounts: readonly AccountView[]): Money[] {
  const totals = new Map<CurrencyCode, bigint>();
  for (const a of accounts)
    totals.set(a.currency, (totals.get(a.currency) ?? 0n) + BigInt(a.balanceMinor));
  return [...totals].map(([currency, amount]) => money(amount, currency));
}

function AccountList({
  title,
  accounts,
  owed,
}: {
  title: string;
  accounts: AccountView[];
  owed: boolean;
}) {
  const { t } = useTranslation();
  if (accounts.length === 0) return null;
  // Debts read better as positive amounts under "Lo que debes".
  const shown = (value: Money) => (owed ? money(-value.amountMinor, value.currency) : value);
  return (
    <Panel title={title}>
      <ul className="divide-y divide-line">
        {accounts.map((a) => (
          <li key={a.id}>
            <Link
              to={`/transactions?account=${a.id}`}
              className="-mx-2 flex min-h-14 items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-hover"
            >
              <span className="min-w-0">
                <span className="line-clamp-2 font-medium">{a.name}</span>
                <span className="block truncate text-sm text-subtle">
                  {a.archived
                    ? t('ledger.accounts.archived')
                    : (a.institution ?? t(`ledger.subtypes.${a.subtype}`))}
                </span>
              </span>
              <Amount
                value={shown(fromWire({ amountMinor: a.balanceMinor, currency: a.currency }))}
              />
            </Link>
          </li>
        ))}
      </ul>
      <ul className="mt-3 grid gap-1 border-line border-t pt-3 text-sm">
        {totalsByCurrency(accounts).map((total) => (
          <li key={total.currency} className="flex justify-between gap-4 text-muted">
            <span>{t('ledger.accounts.total', { currency: total.currency })}</span>
            <Amount value={shown(total)} className="text-ink" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function AccountsPage() {
  const { t } = useTranslation();
  const { accounts } = useLoaderData<typeof accountsLoader>();
  const have = accounts.filter((a) => !isLiability(a.subtype));
  const owe = accounts.filter((a) => isLiability(a.subtype));

  return (
    <>
      <PageHeader
        title={t('modules.accounts.title')}
        description={t('modules.accounts.description')}
        action={
          accounts.length > 0 && <ActionLink to="/accounts/new" label={t('ledger.accounts.add')} />
        }
      />
      {accounts.length === 0 ? (
        <EmptyState
          icon={moduleById('accounts').icon}
          title={t('ledger.accounts.emptyTitle')}
          body={t('ledger.accounts.emptyBody')}
        >
          <Link
            to="/accounts/new"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action"
          >
            <Plus size={18} aria-hidden="true" />
            {t('ledger.accounts.add')}
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AccountList title={t('ledger.accounts.have')} accounts={have} owed={false} />
          <AccountList title={t('ledger.accounts.owe')} accounts={owe} owed />
        </div>
      )}
    </>
  );
}

interface NewAccountResult {
  fieldErrors?: Partial<Record<'name' | 'balance', 'required' | 'amountInvalid'>>;
  failure?: Failure;
}

export async function newAccountAction({
  request,
}: ActionFunctionArgs): Promise<NewAccountResult | Response> {
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const subtype = field('subtype');
  const currency = field('currency') as CurrencyCode;
  const name = field('name');
  const balanceText = field('balance') || '0';
  const fieldErrors: NewAccountResult['fieldErrors'] = {};
  if (!name) fieldErrors.name = 'required';
  let balanceMinor = 0n;
  try {
    balanceMinor = parseAmountInput(balanceText, currency, formattingLocale()).amountMinor;
  } catch {
    fieldErrors.balance = 'amountInvalid';
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  // What you owe is stored as a negative balance.
  const signed = isLiability(subtype)
    ? -(balanceMinor < 0n ? -balanceMinor : balanceMinor)
    : balanceMinor;
  try {
    await createAccount(
      {
        name,
        subtype,
        currency,
        institution: field('institution') || null,
        openedOn: field('openedOn'),
        ...(signed === 0n ? {} : { openingBalanceMinor: signed.toString() }),
      },
      field('idempotencyKey'),
    );
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return redirect('/accounts');
}

export function NewAccountPage() {
  const { t, i18n } = useTranslation();
  const { preferences } = useAccount();
  const result = useActionData<NewAccountResult>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const [subtype, setSubtype] = useState('bank');
  // One key per form: pressing "Crear cuenta" twice creates one account.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const owed = isLiability(subtype);
  const error = (key?: 'required' | 'amountInvalid') =>
    key ? t(`ledger.transactions.fields.${key}`) : undefined;

  return (
    <>
      <PageHeader
        title={t('ledger.accounts.form.title')}
        description={t('ledger.accounts.emptyBody')}
      />
      <Form method="post" ref={formRef} noValidate className="grid max-w-lg gap-5">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <TextField
          label={t('ledger.accounts.form.name')}
          name="name"
          hint={t('ledger.accounts.form.nameHint')}
          error={error(result?.fieldErrors?.name)}
          autoComplete="off"
        />
        <SelectField
          label={t('ledger.accounts.form.type')}
          name="subtype"
          value={subtype}
          onChange={(e) => setSubtype(e.target.value)}
        >
          <optgroup label={t('ledger.accounts.form.haveGroup')}>
            {ASSET_SUBTYPES.map((s) => (
              <option key={s} value={s}>
                {t(`ledger.subtypes.${s}`)}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('ledger.accounts.form.oweGroup')}>
            {LIABILITY_SUBTYPES.map((s) => (
              <option key={s} value={s}>
                {t(`ledger.subtypes.${s}`)}
              </option>
            ))}
          </optgroup>
        </SelectField>
        <SelectField
          label={t('ledger.accounts.form.currency')}
          name="currency"
          defaultValue={preferences.primaryCurrency}
        >
          {currencyOptions(i18n.resolvedLanguage ?? 'es').map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('ledger.accounts.form.institution')}
          name="institution"
          autoComplete="off"
        />
        <TextField
          label={t('ledger.accounts.form.openedOn')}
          name="openedOn"
          type="date"
          defaultValue={todayIn(preferences.timeZone)}
        />
        <TextField
          label={t(
            owed ? 'ledger.accounts.form.balanceLiability' : 'ledger.accounts.form.balanceAsset',
          )}
          name="balance"
          inputMode="decimal"
          defaultValue="0"
          hint={t(
            owed
              ? 'ledger.accounts.form.balanceLiabilityHint'
              : 'ledger.accounts.form.balanceAssetHint',
          )}
          error={error(result?.fieldErrors?.balance)}
        />
        <FailureNotice failure={result?.failure} />
        <div>
          <Button type="submit" pending={submitting}>
            {t(submitting ? 'ledger.accounts.form.submitting' : 'ledger.accounts.form.submit')}
          </Button>
        </div>
      </Form>
    </>
  );
}

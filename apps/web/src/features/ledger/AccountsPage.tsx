import { type AccountView, ASSET_SUBTYPES, LIABILITY_SUBTYPES } from '@finanz/contracts';
import { type CurrencyCode, fromWire, type Money, money, todayIn } from '@finanz/kernel';
import { ChevronRight, Plus } from 'lucide-react';
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
import { useBandOverlap } from '../../app/band';
import { moduleById } from '../../app/modules';
import { ActionLink } from '../../components/ActionLink';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { FailureNotice } from '../../components/FailureNotice';
import { SelectField, TextField } from '../../components/Field';
import { Monogram } from '../../components/Monogram';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { parseAmountInput } from '../../lib/amount-input';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import { formatMoney } from '../../lib/money';
import { currencyOptions } from '../preferences/options';
import { createAccount, getNetWorth, listAccounts } from './api';

export async function accountsLoader() {
  const [accounts, worth] = await Promise.all([listAccounts(), getNetWorth()]);
  return { accounts, worth };
}

const isLiability = (subtype: string) =>
  (LIABILITY_SUBTYPES as readonly string[]).includes(subtype);

/** How Cuentas groups accounts: what you can spend, what you set aside, other things, debts. */
const GROUPS = [
  { key: 'available', subtypes: ['bank', 'cash', 'wallet'] },
  { key: 'saved', subtypes: ['savings', 'investment'] },
  { key: 'otherAssets', subtypes: ['receivable', 'other_asset'] },
  { key: 'owe', subtypes: LIABILITY_SUBTYPES },
] as const;

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
  // Debts keep their minus sign, in the alarm color, as on Inicio.
  const tone = owed ? 'text-expense' : '';
  return (
    <Panel title={title}>
      <ul className="divide-y divide-line">
        {accounts.map((a) => (
          <li key={a.id}>
            <Link
              to={`/transactions?account=${a.id}`}
              className="-mx-2 flex min-h-16 items-center gap-3.5 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-hover"
            >
              <Monogram name={a.name} tone={owed ? 'debt' : 'neutral'} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-semibold">{a.name}</span>
                <span className="block truncate text-muted text-sm">
                  {a.archived
                    ? t('ledger.accounts.archived')
                    : (a.institution ?? t(`ledger.subtypes.${a.subtype}`))}
                </span>
              </span>
              <Amount
                value={fromWire({ amountMinor: a.balanceMinor, currency: a.currency })}
                className={tone}
              />
              <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <ul className="mt-3 grid gap-1 border-line border-t pt-3 text-sm">
        {totalsByCurrency(accounts).map((total) => (
          <li key={total.currency} className="flex justify-between gap-4 text-muted">
            <span>{t('ledger.accounts.total', { currency: total.currency })}</span>
            <Amount value={total} className={owed ? tone : 'text-ink'} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Groups({ accounts }: { accounts: AccountView[] }) {
  const { t } = useTranslation();
  useBandOverlap();
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-[1.375rem] xl:grid-cols-3">
      {GROUPS.map((group) => (
        <AccountList
          key={group.key}
          title={t(`ledger.accounts.${group.key}`)}
          accounts={accounts.filter((a) =>
            (group.subtypes as readonly string[]).includes(a.subtype),
          )}
          owed={group.key === 'owe'}
        />
      ))}
    </div>
  );
}

export function AccountsPage() {
  const { t } = useTranslation();
  const { accounts, worth } = useLoaderData<typeof accountsLoader>();
  // Currencies without an exchange rate are left out of the total: say so, never hide it.
  const missing = [...new Set(worth.excluded.map((e) => e.currency))];

  return (
    <>
      <PageHeader
        title={t('modules.accounts.title')}
        description={
          accounts.length > 0
            ? t(
                missing.length > 0 ? 'ledger.accounts.netWorthPartial' : 'ledger.accounts.netWorth',
                {
                  amount: formatMoney(
                    money(BigInt(worth.totalMinor), worth.currency as CurrencyCode),
                  ),
                  currencies: missing.join(', '),
                },
              )
            : t('modules.accounts.description')
        }
        action={
          accounts.length > 0 && (
            <ActionLink to="/accounts/new" label={t('ledger.accounts.add')} variant="band" />
          )
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
        <Groups accounts={accounts} />
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

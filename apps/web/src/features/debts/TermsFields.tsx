import type { DebtView } from '@finanz/contracts';
import { type CurrencyCode, fromWire, type LocalDate } from '@finanz/kernel';
import { useTranslation } from 'react-i18next';
import { SelectField, TextField } from '../../components/Field';
import {
  formatAmountInput,
  fractionToPercent,
  parseAmountInput,
  percentToFraction,
} from '../../lib/amount-input';
import { formattingLocale } from '../../lib/locale';

export type DebtType = DebtView['type'];
export type TermsFieldKey =
  | 'rate'
  | 'installment'
  | 'dueDay'
  | 'statementDay'
  | 'termMonths'
  | 'original'
  | 'limit';
export type FieldError =
  | 'required'
  | 'amountInvalid'
  | 'rateInvalid'
  | 'dayInvalid'
  | 'monthsInvalid';
export type FieldErrors<K extends string> = Partial<Record<K, FieldError>>;

/** Reads typed form text: amounts in the debt's currency, whole numbers within a range. */
export function formReader<K extends string>(
  form: FormData,
  currency: CurrencyCode,
  errors: FieldErrors<K>,
) {
  const field = (name: string) => String(form.get(name) ?? '').trim();
  return {
    field,
    /** Minor units, or null when left empty (unless required). */
    amount(name: K, { required = false, zeroOk = false } = {}) {
      const text = field(name);
      if (!text) {
        if (required) errors[name] = 'required';
        return null;
      }
      try {
        const value = parseAmountInput(text, currency, formattingLocale()).amountMinor;
        if (value < 0n || (value === 0n && !zeroOk)) throw new Error('not positive');
        return value.toString();
      } catch {
        errors[name] = 'amountInvalid';
        return null;
      }
    },
    whole(name: K, max: number, error: FieldError) {
      const text = field(name);
      if (!text) return null;
      const value = Number(text);
      if (!Number.isInteger(value) || value < 1 || value > max) {
        errors[name] = error;
        return null;
      }
      return value;
    },
  };
}

/** The terms a debt of this type takes, as sent to the API (null clears a term). */
export function readTerms(
  form: FormData,
  type: DebtType,
  currency: CurrencyCode,
  errors: FieldErrors<TermsFieldKey>,
) {
  const read = formReader<TermsFieldKey>(form, currency, errors);
  const rateText = read.field('rate');
  const rate = rateText ? percentToFraction(rateText, formattingLocale()) : null;
  if (rate === undefined) errors.rate = 'rateInvalid';
  const common = {
    rate: rate && rate !== '0' ? rate : null,
    ratePeriod: read.field('ratePeriod') === 'annual' ? ('annual' as const) : ('monthly' as const),
    dueDay: read.whole('dueDay', 31, 'dayInvalid'),
  };
  return type === 'loan'
    ? {
        ...common,
        installmentMinor: read.amount('installment'),
        termMonths: read.whole('termMonths', 600, 'monthsInvalid'),
        startOn: (read.field('startOn') || null) as LocalDate | null,
        originalPrincipalMinor: read.amount('original'),
      }
    : {
        ...common,
        creditLimitMinor: read.amount('limit'),
        statementDay: read.whole('statementDay', 31, 'dayInvalid'),
      };
}

const Pair = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-5 sm:grid-cols-2">{children}</div>
);

/** Rate, installment, days and limits: the part of the debt form shared by add and edit. */
export function TermsFields({
  type,
  debt,
  errors,
}: {
  type: DebtType;
  /** When editing: the current terms, shown as typed values. */
  debt?: DebtView;
  errors?: FieldErrors<TermsFieldKey>;
}) {
  const { t } = useTranslation();
  const locale = formattingLocale();
  const error = (key: TermsFieldKey) => {
    const code = errors?.[key];
    return code ? t(`debts.fields.${code}`) : undefined;
  };
  const shown = (minor: string | null | undefined) =>
    minor && debt
      ? formatAmountInput(fromWire({ amountMinor: minor, currency: debt.currency }), locale)
      : undefined;
  const loan = type === 'loan';
  const dueDay = (
    <TextField
      label={t('debts.form.dueDay')}
      name="dueDay"
      inputMode="numeric"
      defaultValue={debt?.dueDay ?? undefined}
      error={error('dueDay')}
    />
  );

  return (
    <>
      {!loan && (
        <TextField
          label={t('debts.form.limit')}
          name="limit"
          inputMode="decimal"
          defaultValue={shown(debt?.creditLimitMinor)}
          error={error('limit')}
        />
      )}
      <Pair>
        <TextField
          label={t('debts.form.rate')}
          name="rate"
          inputMode="decimal"
          defaultValue={debt?.rate ? fractionToPercent(debt.rate, locale) : undefined}
          hint={t('debts.form.rateHint')}
          error={error('rate')}
        />
        <SelectField
          label={t('debts.form.ratePeriod')}
          name="ratePeriod"
          defaultValue={debt?.ratePeriod ?? (loan ? 'monthly' : 'annual')}
          key={type}
        >
          <option value="monthly">{t('debts.form.monthly')}</option>
          <option value="annual">{t('debts.form.annual')}</option>
        </SelectField>
      </Pair>
      {loan ? (
        <>
          <Pair>
            <TextField
              label={t('debts.form.installment')}
              name="installment"
              inputMode="decimal"
              defaultValue={shown(debt?.installmentMinor)}
              error={error('installment')}
            />
            {dueDay}
          </Pair>
          <Pair>
            <TextField
              label={t('debts.form.termMonths')}
              name="termMonths"
              inputMode="numeric"
              defaultValue={debt?.termMonths ?? undefined}
              error={error('termMonths')}
            />
            <TextField
              label={t('debts.form.startOn')}
              name="startOn"
              type="date"
              defaultValue={debt?.startOn ?? undefined}
            />
          </Pair>
          <TextField
            label={t('debts.form.original')}
            name="original"
            inputMode="decimal"
            defaultValue={shown(debt?.originalPrincipalMinor)}
            hint={t('debts.form.originalHint')}
            error={error('original')}
          />
        </>
      ) : (
        <Pair>
          <TextField
            label={t('debts.form.statementDay')}
            name="statementDay"
            inputMode="numeric"
            defaultValue={debt?.statementDay ?? undefined}
            error={error('statementDay')}
          />
          {dueDay}
        </Pair>
      )}
    </>
  );
}

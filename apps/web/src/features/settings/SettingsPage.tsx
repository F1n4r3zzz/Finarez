import { money } from '@finanz/kernel';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Form,
  redirect,
  useActionData,
  useFetcher,
  useNavigation,
} from 'react-router';
import { savePreferences, signInPath, useAccount } from '../../app/account';
import { setShowInvestments, useShowInvestments } from '../../app/preferences';
import { setThemePreference, useTheme } from '../../app/theme';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { isApiFailure } from '../../lib/api';
import { describeFailure, type Failure } from '../../lib/failure';
import { formattingLocale } from '../../lib/locale';
import { formatMoney } from '../../lib/money';
import { LegalLinks } from '../legal/LegalLinks';
import { preferencesFromForm } from '../preferences/defaults';
import { PreferencesFields } from '../preferences/PreferencesFields';
import { RatesSection } from './RatesSection';

const FORMAT_SAMPLES = [
  money(123_456_789n, 'COP'),
  money(123_456_789n, 'MXN'),
  money(123_456_789n, 'USD'),
  money(123_456_789n, 'EUR'),
];

const THEME_OPTIONS = [
  { value: 'system', icon: Monitor, key: 'settings.themeSystem' },
  { value: 'light', icon: Sun, key: 'settings.themeLight' },
  { value: 'dark', icon: Moon, key: 'settings.themeDark' },
] as const;

function ThemeChoice() {
  const { t } = useTranslation();
  const { preference } = useTheme();
  return (
    <fieldset>
      <legend className="sr-only">{t('settings.appearance')}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-paper p-1">
        {THEME_OPTIONS.map(({ value, icon: Icon, key }) => (
          <label
            key={value}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-sm text-muted transition-colors duration-150 hover:text-ink has-checked:bg-surface has-checked:font-medium has-checked:text-ink has-checked:ring-1 has-checked:ring-line has-focus-visible:outline-2 has-focus-visible:outline-brand"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={preference === value}
              onChange={() => setThemePreference(value)}
              className="sr-only"
            />
            <Icon size={16} aria-hidden="true" />
            {t(key)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface SaveResult {
  saved?: boolean;
  failure?: Failure;
}

export async function settingsAction({ request }: ActionFunctionArgs) {
  const preferences = preferencesFromForm(await request.formData(), 'es');
  if (!preferences) return { failure: { key: 'unexpected' } } satisfies SaveResult;
  try {
    await savePreferences(preferences);
  } catch (error) {
    if (isApiFailure(error, 401)) return redirect(signInPath(request));
    return { failure: describeFailure(error) } satisfies SaveResult;
  }
  return { saved: true } satisfies SaveResult;
}

function AccountSection() {
  const { t } = useTranslation();
  const { user } = useAccount();
  const fetcher = useFetcher<{ failure?: Failure }>();
  return (
    <>
      <p className="text-ink">{t('settings.signedInAs', { email: user.email })}</p>
      <div className="mt-3 grid gap-3">
        <fetcher.Form method="post" action="/sign-out">
          <Button type="submit" variant="secondary" pending={fetcher.state !== 'idle'}>
            {t('settings.signOut')}
          </Button>
        </fetcher.Form>
        <FailureNotice failure={fetcher.data?.failure} />
      </div>
    </>
  );
}

function PreferencesForm() {
  const { t } = useTranslation();
  const { preferences } = useAccount();
  const result = useActionData<SaveResult>();
  const navigation = useNavigation();
  const saving = navigation.state !== 'idle' && navigation.formAction === '/settings';
  return (
    <Form method="post" className="grid max-w-md gap-5 text-ink">
      <PreferencesFields initial={preferences} />
      {!saving && result?.saved && <Notice tone="success">{t('preferences.saved')}</Notice>}
      <FailureNotice failure={result?.failure} />
      <div>
        <Button type="submit" pending={saving}>
          {t(saving ? 'preferences.saving' : 'preferences.save')}
        </Button>
      </div>
    </Form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-line border-t py-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
      <h2 className="font-semibold">{title}</h2>
      <div className="text-muted">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const showInvestments = useShowInvestments();
  const locale = formattingLocale();

  return (
    <>
      <PageHeader
        title={t('modules.settings.title')}
        description={t('modules.settings.description')}
      />
      <div className="max-w-3xl">
        <Section title={t('settings.account')}>
          <AccountSection />
        </Section>
        <Section title={t('settings.currencyAndZone')}>
          <PreferencesForm />
        </Section>
        <Section title={t('settings.rates')}>
          <RatesSection />
        </Section>
        <Section title={t('settings.appearance')}>
          <ThemeChoice />
          <p className="mt-2 text-sm">{t('settings.themeHint')}</p>
        </Section>
        <Section title={t('settings.language')}>
          <p className="font-medium text-ink">{t('settings.languageValue')}</p>
          <p className="mt-1 text-sm">{t('settings.languageNote')}</p>
        </Section>
        <Section title={t('settings.format')}>
          <p>{t('settings.formatDetected', { locale })}</p>
          <ul className="mt-3 grid gap-1 text-ink">
            {FORMAT_SAMPLES.map((sample) => (
              <li key={sample.currency} className="flex justify-between gap-6 sm:max-w-sm">
                <span className="text-muted">{sample.currency}</span>
                <span className="amount">{formatMoney(sample, { locale })}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={t('settings.sections')}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <p id="investments-label" className="font-medium text-ink">
                {t('settings.showInvestments')}
              </p>
              <p className="mt-1 text-sm">{t('settings.showInvestmentsHint')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showInvestments}
              aria-labelledby="investments-label"
              onClick={() => setShowInvestments(!showInvestments)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                showInvestments ? 'bg-brand' : 'bg-line'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-1 left-1 size-5 rounded-full bg-surface motion-safe:transition-transform ${
                  showInvestments ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </Section>
        <Section title={t('legal.title')}>
          <p className="mb-3 text-sm">{t('legal.settingsDescription')}</p>
          <LegalLinks />
        </Section>
        <p className="border-line border-t pt-6 text-muted text-sm">{t('settings.deviceNote')}</p>
      </div>
    </>
  );
}

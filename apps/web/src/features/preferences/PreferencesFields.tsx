import type { Preferences } from '@finanz/contracts';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from '../../components/Field';
import { detectedTimeZone } from '../../lib/locale';
import { currencyOptions, timeZoneLabel, timeZoneOptions } from './options';

interface PreferencesFieldsProps {
  initial: Pick<Preferences, 'primaryCurrency' | 'timeZone'>;
}

/** Main currency and time zone, shared by first setup and Ajustes. */
export function PreferencesFields({ initial }: PreferencesFieldsProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'es';
  const device = detectedTimeZone();
  const currencies = useMemo(() => currencyOptions(language), [language]);
  const zones = useMemo(
    () => timeZoneOptions(language, [initial.timeZone]).filter((z) => z.value !== device),
    [language, initial.timeZone, device],
  );

  return (
    <>
      <SelectField
        label={t('preferences.currency')}
        name="primaryCurrency"
        defaultValue={initial.primaryCurrency}
        hint={t('preferences.currencyHint')}
      >
        {currencies.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('preferences.timeZone')}
        name="timeZone"
        defaultValue={initial.timeZone}
        hint={t('preferences.timeZoneHint')}
      >
        <optgroup label={t('preferences.deviceZone')}>
          <option value={device}>{timeZoneLabel(device, language)}</option>
        </optgroup>
        <optgroup label={t('preferences.allZones')}>
          {zones.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      </SelectField>
    </>
  );
}

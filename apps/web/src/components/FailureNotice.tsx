import { useTranslation } from 'react-i18next';
import type { Failure } from '../lib/failure';
import { Notice } from './Notice';

export function FailureNotice({ failure }: { failure: Failure | undefined }) {
  const { t } = useTranslation();
  if (!failure) return null;
  const text =
    failure.key === 'tooManyAttempts'
      ? t('failures.tooManyAttempts', { count: failure.minutes ?? 5 })
      : t(`failures.${failure.key}`);
  return <Notice tone="error">{text}</Notice>;
}

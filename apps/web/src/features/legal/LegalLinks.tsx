import { useTranslation } from 'react-i18next';
import { TextLink } from '../../components/TextLink';
import { LEGAL_DOCUMENTS } from './documents';

/** Public links: reading a document never requires an account or records consent. */
export function LegalLinks() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('legal.navigation')}>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {LEGAL_DOCUMENTS.map(({ id, path }) => (
          <li key={id}>
            <TextLink to={path}>{t(`legal.documents.${id}.title`)}</TextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

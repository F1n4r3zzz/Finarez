import { useTranslation } from 'react-i18next';
import { Notice } from './Notice';

/** Says plainly that a page is a preview of a feature that isn't built yet. */
export function UnderConstruction({ scope }: { scope: 'section' | 'app' }) {
  const { t } = useTranslation();
  return (
    <Notice tone="info" className="mb-6">
      {t(`underConstruction.${scope}`)}
    </Notice>
  );
}

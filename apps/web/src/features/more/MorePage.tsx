import { ChevronRight, FileText, LogOut, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Link } from 'react-router';
import { useBandOverlap } from '../../app/band';
import { MODULES } from '../../app/modules';
import { useShowInvestments } from '../../app/preferences';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { ThemeChoice } from '../../components/ThemeChoice';

function MenuLink({
  to,
  icon,
  title,
  detail,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <li>
      <Link to={to} className="flex min-h-16 items-center gap-3.5 py-2.5">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block text-muted text-sm">{detail}</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-muted" />
      </Link>
    </li>
  );
}

/** Phones: every section without a place in the bottom bar, the theme and the way out. */
export function MorePage() {
  const { t } = useTranslation();
  useBandOverlap();
  const showInvestments = useShowInvestments();
  const sections = MODULES.filter(
    (m) => !m.bar && m.group !== 'settings' && (!m.optional || showInvestments),
  );
  const card = 'rounded-[22px] border border-line bg-surface px-5';
  return (
    <>
      <PageHeader title={t('modules.more.title')} description={t('modules.more.description')} />
      <div className="grid max-w-2xl gap-4">
        <nav aria-label={t('more.sections')} className={card}>
          <ul className="divide-y divide-line">
            {sections.map((m) => {
              const Icon = m.icon;
              return (
                <MenuLink
                  key={m.id}
                  to={m.path}
                  icon={<Icon size={20} aria-hidden="true" />}
                  title={t(`modules.${m.id}.title`)}
                  detail={t(`modules.${m.id}.description`)}
                />
              );
            })}
          </ul>
        </nav>
        <div className={`${card} pb-5`}>
          <nav aria-label={t('more.account')}>
            <ul className="divide-y divide-line">
              <MenuLink
                to="/settings"
                icon={<Settings size={20} aria-hidden="true" />}
                title={t('modules.settings.title')}
                detail={t('modules.settings.description')}
              />
              <MenuLink
                to="/legal"
                icon={<FileText size={20} aria-hidden="true" />}
                title={t('more.legal')}
                detail={t('more.legalDetail')}
              />
            </ul>
          </nav>
          <div className="mt-3 grid gap-2 border-line border-t pt-4">
            <p className="font-semibold">{t('more.theme')}</p>
            <ThemeChoice />
          </div>
        </div>
        <Form method="post" action="/sign-out">
          <Button type="submit" variant="secondary" wide>
            <LogOut size={18} aria-hidden="true" />
            {t('more.signOut')}
          </Button>
        </Form>
      </div>
    </>
  );
}

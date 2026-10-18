import { LEGAL_VERSION } from '@finanz/contracts';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { BandArt } from '../../components/BandArt';
import { Notice } from '../../components/Notice';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Wordmark } from '../../components/Wordmark';
import type { LegalDocument, LegalSection } from '../../i18n/legal.es';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from './documents';
import { LegalLinks } from './LegalLinks';

export function LegalLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset the reading position when the document path changes.
  useEffect(() => {
    // Document links should open at the beginning, even after reading a long policy.
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-4 py-2 font-medium text-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('app.skipToContent')}
      </a>
      <header className="relative overflow-hidden border-band-edge border-b bg-band">
        <BandArt />
        <div className="relative mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-8 lg:min-h-[76px]">
          <Wordmark />
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-full bg-cta px-4 font-bold text-on-cta"
            >
              {t('legal.openApp')}
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-8 sm:py-12"
      >
        <nav aria-label={t('legal.navigation')} className="mb-8">
          <ul className="flex flex-wrap gap-2">
            <li>
              <NavLink to="/legal" end className={({ isActive }) => tabClass(isActive)}>
                {t('legal.title')}
              </NavLink>
            </li>
            {LEGAL_DOCUMENTS.map(({ id, path }) => (
              <li key={id}>
                <NavLink to={path} className={({ isActive }) => tabClass(isActive)}>
                  {t(`legal.documents.${id}.title`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <Outlet />
      </main>
      <footer className="border-line border-t bg-surface">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-6 sm:px-8">
          <p className="text-muted text-sm">{t('legal.version', { version: LEGAL_VERSION })}</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

function tabClass(active: boolean) {
  return `block rounded-lg px-3 py-2 text-sm font-medium ${
    active ? 'bg-brand text-on-brand' : 'text-muted hover:bg-hover hover:text-ink'
  }`;
}

function DraftNotice() {
  const { t } = useTranslation();
  return (
    <Notice tone="info" className="mb-8">
      <p className="font-semibold">{t('legal.draft')}</p>
      <p>{t('legal.draftNotice')}</p>
    </Notice>
  );
}

function OperatorDetails() {
  const { t } = useTranslation();
  const fields = t('legal.operatorFields', { returnObjects: true });
  return (
    <section
      aria-labelledby="operator-title"
      className="mt-10 rounded-[22px] border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="operator-title" className="font-semibold text-lg">
        {t('legal.operatorTitle')}
      </h2>
      <p className="mt-2 text-muted text-sm">{t('legal.operatorNote')}</p>
      <dl className="mt-5 grid gap-5 sm:grid-cols-2">
        {fields.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted text-sm">{label}</dt>
            <dd className="mt-1 break-words font-medium text-sm">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function LegalIndexPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl">
      <title>{`${t('legal.title')} · Finarez`}</title>
      <h1 className="font-semibold text-3xl tracking-tight">{t('legal.title')}</h1>
      <p className="mt-3 text-muted text-lg">{t('legal.description')}</p>
      <div className="mt-6">
        <DraftNotice />
      </div>
      <div className="grid gap-3">
        {LEGAL_DOCUMENTS.map(({ id, path }) => (
          <Link
            key={id}
            to={path}
            className="rounded-[22px] border border-line bg-surface p-5 transition-colors hover:border-brand"
          >
            <h2 className="font-semibold text-brand text-lg">{t(`legal.documents.${id}.title`)}</h2>
            <p className="mt-2 text-muted">{t(`legal.documents.${id}.description`)}</p>
          </Link>
        ))}
      </div>
      <section className="mt-8" aria-labelledby="legal-summary">
        <h2 id="legal-summary" className="font-semibold text-lg">
          {t('legal.summaryTitle')}
        </h2>
        <ul className="mt-3 list-disc space-y-3 pl-5 text-muted">
          {t('legal.summary', { returnObjects: true }).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <OperatorDetails />
    </div>
  );
}

function DocumentSection({ section }: { section: LegalSection }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-6">
      <h2 id={`${section.id}-title`} className="font-semibold text-xl tracking-tight">
        {section.title}
      </h2>
      <div className="mt-3 space-y-3 leading-7 text-muted">
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {section.items && (
          <ul className="list-disc space-y-3 pl-5">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
      {section.table && (
        <section
          className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface"
          aria-label={section.table.caption}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll this table on narrow screens.
          tabIndex={0}
        >
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="px-4 py-3 text-left font-medium">{section.table.caption}</caption>
            <thead className="border-line border-y bg-hover">
              <tr>
                {section.table.columns.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {section.table.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) =>
                    index === 0 ? (
                      <th
                        key={cell}
                        scope="row"
                        className="px-4 py-3 align-top font-mono font-medium text-xs"
                      >
                        {cell}
                      </th>
                    ) : (
                      <td key={cell} className="px-4 py-3 align-top text-muted">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {section.links && (
        <ul className="mt-4 space-y-2 text-sm">
          {section.links.map(({ label, href }) => (
            <li key={href}>
              <a
                href={href}
                rel="noreferrer"
                className="break-words font-medium text-brand underline underline-offset-4"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LegalDocumentPage({ documentId }: { documentId: LegalDocumentId }) {
  const { t } = useTranslation();
  const document: LegalDocument = t(`legal.documents.${documentId}`, { returnObjects: true });
  return (
    <>
      <title>{`${document.title} · Finarez`}</title>
      <header className="mb-8 max-w-3xl">
        <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">{document.title}</h1>
        <p className="mt-3 text-muted text-lg">{document.description}</p>
        <div className="mt-5 grid gap-1 text-muted text-sm">
          <p>{t('legal.version', { version: LEGAL_VERSION })}</p>
          <p>{t('legal.reviewed')}</p>
          <p>{t('legal.effective')}</p>
        </div>
      </header>
      <DraftNotice />
      <div className="grid items-start gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <nav
          aria-label={t('legal.contents')}
          className="rounded-[22px] border border-line bg-surface p-4 lg:sticky lg:top-6"
        >
          <p className="mb-3 font-semibold text-sm">{t('legal.contents')}</p>
          <ul className="grid gap-3 text-muted text-sm">
            {document.sections.map(({ id, title }) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:text-brand">
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0">
          <div className="space-y-9">
            {document.sections.map((section) => (
              <DocumentSection key={section.id} section={section} />
            ))}
          </div>
          <OperatorDetails />
          <p className="mt-8 mb-3 text-muted text-sm">{t('legal.related')}</p>
          <LegalLinks />
        </article>
      </div>
    </>
  );
}

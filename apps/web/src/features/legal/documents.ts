export const LEGAL_DOCUMENTS = [
  { id: 'terms', path: '/legal/terms' },
  { id: 'privacy', path: '/legal/privacy' },
  { id: 'cookies', path: '/legal/cookies' },
] as const;

export type LegalDocumentId = (typeof LEGAL_DOCUMENTS)[number]['id'];

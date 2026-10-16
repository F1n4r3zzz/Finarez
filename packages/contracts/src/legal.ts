import { z } from 'zod';

/**
 * The version of the terms and the privacy policy. Raising it asks every user to accept the
 * new texts again before they continue.
 */
export const LEGAL_VERSION = '0.3';

/** What a person accepts, and the version each one stands at. */
export const CONSENTS = {
  /** The terms and conditions. */
  terms: LEGAL_VERSION,
  /** The authorization to process personal data (Ley 1581), separate from the terms. */
  privacy: LEGAL_VERSION,
  /** "Tengo 18 años o más": adults only until the process for 14 to 17 exists. */
  adult: '1',
} as const;

export type ConsentKind = keyof typeof CONSENTS;
export const CONSENT_KINDS = Object.keys(CONSENTS) as ConsentKind[];

/** Every consent at its current version: sent with sign-up, and to accept a new version. */
export const consentsSchema = z.object({
  terms: z.literal(CONSENTS.terms),
  privacy: z.literal(CONSENTS.privacy),
  adult: z.literal(CONSENTS.adult),
});
export type Consents = z.infer<typeof consentsSchema>;

export interface ConsentStatus {
  /** What the user hasn't accepted at its current version yet. */
  pending: ConsentKind[];
}

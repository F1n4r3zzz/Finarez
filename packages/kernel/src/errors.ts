export type DomainErrorCode =
  | 'money.currency_mismatch'
  | 'money.invalid_amount'
  | 'money.out_of_range'
  | 'money.unknown_currency'
  | 'date.invalid'
  | 'date.invalid_time_zone';

/** An expected business-rule failure. `code` is stable and translated by the UI. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

import { parseRate } from '@finanz/kernel';
import { describe, expect, it } from 'vitest';
import { ZERO_RATE } from '../domain/schedule';
import { monthlyRate } from './debts';

describe('a stored debt rate', () => {
  it('reads the same with or without the database’s trailing zeros, whole numbers included', () => {
    const monthly = (rate: string) => monthlyRate({ rate, ratePeriod: 'monthly' });
    expect(monthly('0.012000000000')).toEqual(parseRate('0.012'));
    expect(monthly('10.000000000000')).toEqual(parseRate('10'));
    expect(monthly('10')).toEqual(parseRate('10'));
    expect(monthly('100.500000000000')).toEqual(parseRate('100.5'));
    expect(monthly('0.000000000000')).toEqual(ZERO_RATE);
  });
});

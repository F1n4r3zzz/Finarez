import { money } from '@finanz/kernel';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Amount } from './Amount';

describe('Amount', () => {
  it('signs income in green and spending in plain ink: red is kept for alarms', () => {
    render(
      <>
        <Amount value={money(155_000_000n, 'COP')} signed />
        <Amount value={money(-8_640_000n, 'COP')} signed />
      </>,
    );
    const income = screen.getByText(/1\.550\.000/);
    const spending = screen.getByText(/86\.400/);
    expect(income.textContent).toMatch(/^\+/);
    expect(income.className).toContain('text-income');
    expect(spending.textContent).toMatch(/^-/);
    expect(spending.className).not.toContain('text-expense');
  });
});

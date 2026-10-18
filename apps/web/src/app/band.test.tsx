import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BandSlotProvider, BandSlotTarget, InBand } from './band';

describe('the band slot', () => {
  it('shows what a page puts in the band at the top of main', async () => {
    render(
      <BandSlotProvider>
        <main>
          <BandSlotTarget className="band" />
          <div className="content">
            <InBand>
              <h1>Cuentas</h1>
            </InBand>
          </div>
        </main>
      </BandSlotProvider>,
    );
    const heading = await screen.findByRole('heading', { level: 1, name: 'Cuentas' });
    expect(heading.closest('main')).toBeTruthy();
    expect(heading.closest('.band')).toBeTruthy();
    expect(heading.closest('.content')).toBeNull();
  });

  it('refuses to render outside a provider, so a missing shell is caught early', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <InBand>
          <h1>Cuentas</h1>
        </InBand>,
      ),
    ).toThrow(/BandSlotProvider/);
  });
});

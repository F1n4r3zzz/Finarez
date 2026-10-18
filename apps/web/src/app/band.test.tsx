import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  BandSlotProvider,
  BandSlotTarget,
  InBand,
  useBandOverlap,
  useBandOverlapValue,
} from './band';

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

  it('lets a page that starts with cards ask for them to overlap the band', async () => {
    function Shell({ children }: { children: ReactNode }) {
      const overlap = useBandOverlapValue();
      return <div data-overlap={overlap}>{children}</div>;
    }
    function CardsPage() {
      useBandOverlap();
      return <p>cards</p>;
    }
    const { rerender } = render(
      <BandSlotProvider>
        <Shell>
          <CardsPage />
        </Shell>
      </BandSlotProvider>,
    );
    expect(await screen.findByText('cards')).toBeTruthy();
    expect(document.querySelector('[data-overlap]')?.getAttribute('data-overlap')).toBe('true');
    rerender(
      <BandSlotProvider>
        <Shell>
          <p>form</p>
        </Shell>
      </BandSlotProvider>,
    );
    expect(document.querySelector('[data-overlap]')?.getAttribute('data-overlap')).toBe('false');
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

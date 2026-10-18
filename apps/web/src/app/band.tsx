import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Slot {
  element: HTMLElement | null;
  setElement: (element: HTMLElement | null) => void;
  /** How many mounted pages asked their first cards to overlap the band. */
  overlaps: number;
  setOverlaps: (update: (count: number) => number) => void;
}

const BandSlotContext = createContext<Slot | null>(null);

/**
 * The band is the brand header at the top of every page. The shell draws it; each page puts its
 * title (or Inicio its balance) into it through `InBand`, so the page keeps its own markup and
 * the heading stays inside <main>.
 */
export function BandSlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [overlaps, setOverlaps] = useState(0);
  return (
    <BandSlotContext.Provider value={{ element, setElement, overlaps, setOverlaps }}>
      {children}
    </BandSlotContext.Provider>
  );
}

/** Where the band's content lands: the shell renders it first inside <main>. */
export function BandSlotTarget({ className }: { className?: string }) {
  const slot = useSlot();
  return <div ref={slot.setElement} className={className} />;
}

/** Renders its children in the band; nothing until the band exists. */
export function InBand({ children }: { children: ReactNode }) {
  const { element } = useSlot();
  return element ? createPortal(children, element) : null;
}

/**
 * For pages whose first block is a card: the band grows and the card rises over its lower edge.
 * Pages that start with plain text (forms not yet on a card) don't call it, so nothing dark
 * ever sits on the band.
 */
export function useBandOverlap(): void {
  const { setOverlaps } = useSlot();
  useEffect(() => {
    setOverlaps((count) => count + 1);
    return () => setOverlaps((count) => count - 1);
  }, [setOverlaps]);
}

/** For the shell: whether the current page asked for the overlap. */
export function useBandOverlapValue(): boolean {
  return useSlot().overlaps > 0;
}

function useSlot(): Slot {
  const slot = useContext(BandSlotContext);
  if (!slot) throw new Error('The band is only available inside a BandSlotProvider');
  return slot;
}

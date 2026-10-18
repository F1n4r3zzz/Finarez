import { createContext, type ReactNode, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

type Slot = { element: HTMLElement | null; setElement: (element: HTMLElement | null) => void };

const BandSlotContext = createContext<Slot | null>(null);

/**
 * The band is the brand header at the top of every page. The shell draws it; each page puts its
 * title (or Inicio its balance) into it through `InBand`, so the page keeps its own markup and
 * the heading stays inside <main>.
 */
export function BandSlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return (
    <BandSlotContext.Provider value={{ element, setElement }}>{children}</BandSlotContext.Provider>
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

function useSlot(): Slot {
  const slot = useContext(BandSlotContext);
  if (!slot) throw new Error('The band is only available inside a BandSlotProvider');
  return slot;
}

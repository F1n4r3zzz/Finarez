import { useSyncExternalStore } from 'react';

// Device-local until user preferences are stored on the server (after login exists).
const SHOW_INVESTMENTS = 'finanz.showInvestments';
const listeners = new Set<() => void>();

function readShowInvestments(): boolean {
  try {
    return localStorage.getItem(SHOW_INVESTMENTS) !== 'false';
  } catch {
    return true;
  }
}

export function setShowInvestments(show: boolean): void {
  try {
    localStorage.setItem(SHOW_INVESTMENTS, String(show));
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useShowInvestments(): boolean {
  return useSyncExternalStore(subscribe, readShowInvestments, () => true);
}

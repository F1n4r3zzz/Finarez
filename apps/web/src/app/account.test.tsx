import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi, json, renderApp, signedIn, signedOut, USER } from '../test/fake-api';

describe('who can see the app', () => {
  it('sends signed-out visitors to sign in, and back to the page they wanted afterwards', async () => {
    fakeApi(signedOut);
    const router = renderApp('/accounts?view=all');
    expect(await screen.findByRole('heading', { name: 'Entra a Finanz' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/accounts?view=all')}`);
  });

  it('asks new users for their currency and time zone before anything else', async () => {
    fakeApi({
      ...signedIn,
      'GET /me/preferences': () =>
        json({ error: { code: 'preferences.not_set', message: 'No preferences saved yet' } }, 404),
    });
    const router = renderApp('/reports');
    expect(await screen.findByRole('heading', { name: 'Antes de empezar' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/welcome');
    expect(router.state.location.search).toBe('?next=%2Freports');
  });

  it('skips the sign-in page for someone already signed in', async () => {
    fakeApi(signedIn);
    const router = renderApp('/sign-in?next=%2Fbudgets');
    expect(await screen.findByRole('heading', { name: 'Presupuestos' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/budgets');
  });

  it('skips first setup once preferences are saved', async () => {
    fakeApi(signedIn);
    const router = renderApp('/welcome');
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });

  it('treats a session that ends between the two checks as signed out', async () => {
    fakeApi({ ...signedOut, 'GET /auth/get-session': () => json({ session: {}, user: USER }) });
    const router = renderApp('/');
    await screen.findByRole('heading', { name: 'Entra a Finanz' });
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('says the API is unreachable, with a retry, instead of a blank page', async () => {
    fakeApi({
      'GET /auth/get-session': () => json({ message: 'down' }, 503),
      'GET /me/preferences': () => json({ message: 'down' }, 503),
    });
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'No pudimos conectar con Finanz' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('still shows the sign-in form when the session check cannot reach the API', async () => {
    fakeApi({ 'GET /auth/get-session': () => json({ message: 'down' }, 503) });
    renderApp('/sign-in');
    expect(await screen.findByRole('heading', { name: 'Entra a Finanz' })).toBeTruthy();
  });
});

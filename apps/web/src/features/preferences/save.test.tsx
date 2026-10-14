import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { detectedTimeZone } from '../../lib/locale';
import { fakeApi, json, PREFERENCES, renderApp, signedIn } from '../../test/fake-api';

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;

describe('first setup', () => {
  it('starts from this device’s time zone and saves both choices before opening the page', async () => {
    let saved: unknown = null;
    const api = fakeApi({
      ...signedIn,
      'GET /me/preferences': () =>
        saved ? json(saved) : json({ error: { code: 'preferences.not_set', message: '' } }, 404),
      'PUT /me/preferences': (body) => {
        saved = body;
        return json(body);
      },
    });
    const router = renderApp('/savings');
    await screen.findByRole('heading', { name: 'Antes de empezar' });
    expect(select('Zona horaria').value).toBe(detectedTimeZone());
    fireEvent.change(select('Moneda principal'), { target: { value: 'EUR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y empezar' }));
    // Then on to the page that was asked for.
    expect(await screen.findByRole('heading', { name: 'Ahorros' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/savings');
    expect(api.actions()).toEqual([
      {
        method: 'PUT',
        path: '/me/preferences',
        body: { language: 'es', timeZone: detectedTimeZone(), primaryCurrency: 'EUR' },
      },
    ]);
  });
});

describe('Ajustes', () => {
  it('shows the saved currency and time zone, and saves changes to the account', async () => {
    let current: Record<string, string> = PREFERENCES;
    const api = fakeApi({
      ...signedIn,
      'GET /me/preferences': () => json(current),
      'PUT /me/preferences': (body) => {
        current = body as Record<string, string>;
        return json(body);
      },
    });
    renderApp('/settings');
    await screen.findByText('Entraste con ana@example.com.');
    expect(select('Moneda principal').value).toBe('COP');
    expect(select('Zona horaria').value).toBe('America/Bogota');

    fireEvent.change(select('Moneda principal'), { target: { value: 'MXN' } });
    fireEvent.change(select('Zona horaria'), { target: { value: 'America/Mexico_City' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados.')).toBeTruthy();
    expect(api.actions()).toEqual([
      {
        method: 'PUT',
        path: '/me/preferences',
        body: { language: 'es', timeZone: 'America/Mexico_City', primaryCurrency: 'MXN' },
      },
    ]);
  });

  it('sends the user to sign in if the session ended before saving', async () => {
    fakeApi({
      ...signedIn,
      'PUT /me/preferences': () => json({ error: { code: 'auth.required', message: '' } }, 401),
    });
    const router = renderApp('/settings');
    await screen.findByText('Entraste con ana@example.com.');
    // The session is gone now: every check answers "signed out".
    fakeApi({
      'GET /auth/get-session': () => json(null),
      'GET /me/preferences': () => json({ error: { code: 'auth.required', message: '' } }, 401),
      'PUT /me/preferences': () => json({ error: { code: 'auth.required', message: '' } }, 401),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByRole('heading', { name: 'Entra a Finanz' });
    expect(router.state.location.search).toBe('?next=%2Fsettings');
  });
});

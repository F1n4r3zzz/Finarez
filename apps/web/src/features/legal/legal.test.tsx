import { CONSENTS } from '@finanz/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeApi, json, renderApp, signedIn, signedOut } from '../../test/fake-api';

describe('public legal documents', () => {
  it.each([
    ['/legal', 'Legal y privacidad'],
    ['/legal/terms', 'Términos y condiciones'],
    ['/legal/privacy', 'Política de privacidad'],
    ['/legal/cookies', 'Cookies y almacenamiento local'],
  ])('opens %s without a session or a working API', async (path, title) => {
    const api = fakeApi({});
    const router = renderApp(path);

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(router.state.location.pathname).toBe(path);
    expect(screen.getByText('Borrador para revisión')).toBeTruthy();
    expect(screen.getByText('finarezapp@gmail.com')).toBeTruthy();
    expect(screen.getByText('[NIT]')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it('navigates between documents and keeps their contents anchors valid', async () => {
    const api = fakeApi({});
    const router = renderApp('/legal/terms');
    await screen.findByRole('heading', { level: 1, name: 'Términos y condiciones' });
    const navigation = screen.getAllByRole('navigation', { name: 'Documentos legales' })[0];
    if (!navigation) throw new Error('Missing document navigation');
    fireEvent.click(within(navigation).getByRole('link', { name: 'Política de privacidad' }));

    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    expect(router.state.location.pathname).toBe('/legal/privacy');
    expect(
      within(navigation)
        .getByRole('link', { name: 'Política de privacidad' })
        .getAttribute('aria-current'),
    ).toBe('page');
    for (const link of within(
      screen.getByRole('navigation', { name: 'En esta página' }),
    ).getAllByRole('link')) {
      const id = link.getAttribute('href')?.slice(1);
      expect(id && document.getElementById(id)).toBeTruthy();
    }
    expect(screen.queryByRole('heading', { name: '1. Qué ofrece Finarez' })).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it('offers the documents from registration without submitting or recording consent', async () => {
    const api = fakeApi(signedOut);
    const router = renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });
    const footer = screen.getByRole('navigation', { name: 'Documentos legales' });
    fireEvent.click(within(footer).getByRole('link', { name: 'Cookies y almacenamiento local' }));

    await screen.findByRole('heading', { level: 1, name: 'Cookies y almacenamiento local' });
    expect(router.state.location.pathname).toBe('/legal/cookies');
    expect(api.actions()).toEqual([]);
  });

  it('keeps privacy information reachable from Settings for a signed-in account', async () => {
    const api = fakeApi(signedIn);
    const router = renderApp('/settings');
    await screen.findByText('Entraste con ana@example.com.');
    fireEvent.click(screen.getByRole('link', { name: 'Política de privacidad' }));

    await screen.findByRole('heading', { level: 1, name: 'Política de privacidad' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/legal/privacy'));
    expect(api.actions()).toEqual([]);
  });
});

describe('accepting the terms', () => {
  /** A signed-in user who still has `pending` to accept, until they accept it. */
  function pendingApi(pending: string[]) {
    let left = pending;
    return fakeApi({
      ...signedIn,
      'GET /me/consents': () => json({ pending: left }),
      'POST /me/consents': () => {
        left = [];
        return json({ pending: [] });
      },
    });
  }
  const check = (name: RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }));

  it('stops an account without them at the door, and lets it in once accepted', async () => {
    const api = pendingApi(['terms', 'privacy', 'adult']);
    const router = renderApp('/budgets');
    await screen.findByRole('heading', { name: 'Antes de continuar' });
    expect(router.state.location.pathname).toBe('/accept-terms');

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
    expect(await screen.findByText('Marca todas las casillas para continuar.')).toBeTruthy();
    expect(api.actions()).toEqual([]);

    check(/^Acepto los Términos/);
    check(/^Autorizo el tratamiento/);
    check(/^Tengo 18 años/);
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/budgets'));
    expect(api.actions()).toEqual([
      expect.objectContaining({ method: 'POST', path: '/me/consents', body: CONSENTS }),
    ]);
  });

  it('after an update asks only for what changed', async () => {
    pendingApi(['terms', 'privacy']);
    renderApp('/');
    await screen.findByRole('heading', { name: 'Actualizamos los términos' });
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.queryByRole('checkbox', { name: /^Tengo 18 años/ })).toBeNull();
  });

  it('sends anyone with nothing to accept on into the app', async () => {
    fakeApi(signedIn);
    const router = renderApp('/accept-terms');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

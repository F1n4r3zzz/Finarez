import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeApi, json, renderApp, signedIn, signedOut } from '../../test/fake-api';

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

/** After a successful sign-in the app loads: answer as a signed-in user from then on. */
function signInSucceeds() {
  const handlers = { ...signedOut };
  return {
    ...signedIn, // the app's own data, used once signed in
    ...handlers,
    'POST /auth/sign-in/email': () => {
      Object.assign(handlers, signedIn);
      return json({ redirect: false, user: {} });
    },
    'GET /auth/get-session': () => handlers['GET /auth/get-session'](),
    'GET /me/preferences': () => handlers['GET /me/preferences'](),
  };
}

describe('sign in', () => {
  it('checks the fields before calling the API and focuses the first one to fix', async () => {
    const api = fakeApi(signedOut);
    renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Entra a Finarez' });
    type('Correo', 'ana@');
    click('Entrar');
    expect(
      await screen.findByText('Escribe un correo válido, como nombre@ejemplo.com.'),
    ).toBeTruthy();
    expect(screen.getByText('Escribe tu contraseña.')).toBeTruthy();
    expect(field('Correo').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field('Correo'));
    expect(api.actions()).toEqual([]);
  });

  it('signs in and continues to the page that was asked for', async () => {
    const api = fakeApi(signInSucceeds());
    const router = renderApp('/sign-in?next=%2Fdebts');
    await screen.findByRole('heading', { name: 'Entra a Finarez' });
    type('Correo', ' ana@example.com ');
    type('Contraseña', 'una frase larga');
    click('Entrar');
    expect(await screen.findByRole('heading', { name: 'Deudas' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/debts');
    expect(api.actions()).toEqual([
      {
        method: 'POST',
        path: '/auth/sign-in/email',
        body: { email: 'ana@example.com', password: 'una frase larga' },
      },
    ]);
  });

  it('never follows a "next" address that leaves the app', async () => {
    fakeApi(signInSucceeds());
    const router = renderApp('/sign-in?next=%2F%2Fevil.example%2Fphish');
    await screen.findByRole('heading', { name: 'Entra a Finarez' });
    type('Correo', 'ana@example.com');
    type('Contraseña', 'una frase larga');
    click('Entrar');
    await screen.findByRole('heading', { name: 'Inicio' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('says when the email or password is wrong, without saying which', async () => {
    fakeApi({
      ...signedOut,
      'POST /auth/sign-in/email': () =>
        json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401),
    });
    renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Entra a Finarez' });
    type('Correo', 'ana@example.com');
    type('Contraseña', 'otra cosa distinta');
    click('Entrar');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'El correo o la contraseña no coinciden.',
    );
  });

  it('tells how long to wait when there were too many attempts', async () => {
    fakeApi({
      ...signedOut,
      'POST /auth/sign-in/email': () =>
        json({ message: 'Too many requests' }, 429, { 'X-Retry-After': '540' }),
    });
    renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Entra a Finarez' });
    type('Correo', 'ana@example.com');
    type('Contraseña', 'una frase larga');
    click('Entrar');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Demasiados intentos. Inténtalo de nuevo en 9 minutos.',
    );
  });

  it('offers a new confirmation link to an unconfirmed account', async () => {
    const api = fakeApi({
      ...signedOut,
      'POST /auth/sign-in/email': () =>
        json({ code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }, 403),
      'POST /auth/send-verification-email': () => json({ status: true }),
    });
    renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Entra a Finarez' });
    type('Correo', 'ana@example.com');
    type('Contraseña', 'una frase larga');
    click('Entrar');
    expect(
      await screen.findByText('Antes de entrar, confirma tu correo con el enlace que te enviamos.'),
    ).toBeTruthy();
    click('Enviar el enlace otra vez');
    expect(
      await screen.findByText(
        'Te enviamos un enlace nuevo. Si no lo ves, revisa la carpeta de spam.',
      ),
    ).toBeTruthy();
    expect(api.actions().at(-1)).toEqual({
      method: 'POST',
      path: '/auth/send-verification-email',
      body: { email: 'ana@example.com', callbackURL: '/sign-in?verified=1' },
    });
  });

  it.each([
    ['?verified=1', 'Tu correo está confirmado. Ya puedes entrar.'],
    ['?verified=1&error=TOKEN_EXPIRED', 'El enlace de confirmación venció o no es válido.'],
    ['?reset=1', 'Tu contraseña cambió. Entra con la nueva.'],
  ])('explains why the visitor landed here (%s)', async (search, message) => {
    fakeApi(signedOut);
    renderApp(`/sign-in${search}`);
    expect((await screen.findByRole('status')).textContent).toContain(message);
  });

  it('reports a lost connection instead of failing silently', async () => {
    fakeApi(signedOut);
    renderApp('/sign-in');
    await screen.findByRole('heading', { name: 'Entra a Finarez' });
    // The API was reachable for the page, then the network dropped.
    const offline = async () => {
      throw new TypeError('Failed to fetch');
    };
    vi.stubGlobal('fetch', offline);
    type('Correo', 'ana@example.com');
    type('Contraseña', 'una frase larga');
    click('Entrar');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No hay conexión con Finarez. Revisa tu internet e inténtalo de nuevo.',
    );
  });
});

describe('sign up', () => {
  it('asks for at least 10 characters before calling the API', async () => {
    const api = fakeApi(signedOut);
    renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });
    type('Correo', 'ana@example.com');
    type('Contraseña', 'corta1234');
    click('Crear cuenta');
    expect(await screen.findByText('Usa al menos 10 caracteres.')).toBeTruthy();
    expect(api.actions()).toEqual([]);
  });

  it('creates the account and explains the confirmation email, with a way to resend it', async () => {
    const api = fakeApi({
      ...signedOut,
      'POST /auth/sign-up/email': () => json({ token: null, user: {} }),
      'POST /auth/send-verification-email': () => json({ status: true }),
    });
    renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });
    type('Correo', 'ana@example.com');
    type('Contraseña', 'una frase larga');
    click('Crear cuenta');
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
    expect(screen.getByText(/Te enviamos un enlace a ana@example.com/)).toBeTruthy();
    expect(api.actions()[0]).toEqual({
      method: 'POST',
      path: '/auth/sign-up/email',
      body: {
        name: '',
        email: 'ana@example.com',
        password: 'una frase larga',
        callbackURL: '/sign-in?verified=1',
      },
    });

    click('Enviar otro enlace');
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(api.actions().at(-1)?.path).toBe('/auth/send-verification-email');
  });

  it('says when email is temporarily unavailable', async () => {
    fakeApi({
      ...signedOut,
      'POST /auth/sign-up/email': () =>
        json({ code: 'EMAIL_UNAVAILABLE', message: 'Email is temporarily unavailable.' }, 503),
    });
    renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });
    type('Correo', 'ana@example.com');
    type('Contraseña', 'una frase larga');
    click('Crear cuenta');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Ahora mismo no podemos enviar correos. Inténtalo de nuevo más tarde.',
    );
  });

  it('lets the visitor see the password they typed', async () => {
    fakeApi(signedOut);
    renderApp('/sign-up');
    await screen.findByRole('heading', { name: 'Crea tu cuenta' });
    expect(field('Contraseña').type).toBe('password');
    click('Mostrar contraseña');
    expect(field('Contraseña').type).toBe('text');
    click('Ocultar contraseña');
    expect(field('Contraseña').type).toBe('password');
  });
});

describe('password reset', () => {
  it('sends the reset link to the address given, with the page it should open', async () => {
    const api = fakeApi({ ...signedOut, 'POST /auth/request-password-reset': () => json({}) });
    renderApp('/forgot-password');
    await screen.findByRole('heading', { name: 'Recupera tu contraseña' });
    type('Correo', 'ana@example.com');
    click('Enviar enlace');
    expect(await screen.findByText(/Si ana@example.com tiene una cuenta en Finarez/)).toBeTruthy();
    expect(api.actions()).toEqual([
      {
        method: 'POST',
        path: '/auth/request-password-reset',
        body: { email: 'ana@example.com', redirectTo: '/reset-password' },
      },
    ]);
  });

  it('saves the new password and sends the user to sign in again', async () => {
    const api = fakeApi({
      ...signedOut,
      'POST /auth/reset-password': () => json({ status: true }),
    });
    const router = renderApp('/reset-password?token=abc123');
    await screen.findByRole('heading', { name: 'Elige una contraseña nueva' });
    type('Contraseña nueva', 'una frase nueva');
    click('Guardar contraseña');
    expect(await screen.findByText('Tu contraseña cambió. Entra con la nueva.')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(api.actions()[0]).toEqual({
      method: 'POST',
      path: '/auth/reset-password',
      body: { token: 'abc123', newPassword: 'una frase nueva' },
    });
  });

  it('explains an expired link and offers a new one', async () => {
    fakeApi(signedOut);
    renderApp('/reset-password?error=INVALID_TOKEN');
    expect(await screen.findByRole('heading', { name: 'Este enlace ya no sirve' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' }).getAttribute('href')).toBe(
      '/forgot-password',
    );
  });

  it('explains a link that stopped working while the page was open', async () => {
    fakeApi({
      ...signedOut,
      'POST /auth/reset-password': () =>
        json({ code: 'INVALID_TOKEN', message: 'Invalid token' }, 400),
    });
    renderApp('/reset-password?token=used');
    await screen.findByRole('heading', { name: 'Elige una contraseña nueva' });
    type('Contraseña nueva', 'una frase nueva');
    click('Guardar contraseña');
    expect(await screen.findByRole('heading', { name: 'Este enlace ya no sirve' })).toBeTruthy();
  });
});

describe('sign out', () => {
  it('ends the session from Ajustes', async () => {
    const handlers = { ...signedIn };
    const api = fakeApi({
      ...handlers,
      'GET /auth/get-session': () => handlers['GET /auth/get-session'](),
      'GET /me/preferences': () => handlers['GET /me/preferences'](),
      'POST /auth/sign-out': () => {
        Object.assign(handlers, signedOut);
        return json({ success: true });
      },
    });
    const router = renderApp('/settings');
    expect(await screen.findByText('Entraste con ana@example.com.')).toBeTruthy();
    click('Cerrar sesión');
    await screen.findByRole('heading', { name: 'Entra a Finarez' });
    expect(router.state.location.pathname).toBe('/sign-in');
    await waitFor(() => expect(api.actions().map((c) => c.path)).toEqual(['/auth/sign-out']));
  });
});

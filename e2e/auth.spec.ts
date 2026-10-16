import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { emailedLinks } from './servers';

const PASSWORD = 'una frase bastante larga';

const uniqueEmail = () => `e2e-${randomUUID()}@example.com`;

/**
 * Waits for email number `count` to `to` and returns its link. (Counting, because two links
 * issued in the same second can be identical.)
 */
async function emailedLink(to: string, count: number): Promise<string> {
  await expect.poll(() => emailedLinks(to).length).toBeGreaterThanOrEqual(count);
  return emailedLinks(to)[count - 1] as string;
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function signUp(page: Page, email: string) {
  await page.goto('/sign-up');
  await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible();
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox', { name: /^Acepto los Términos/ }).check();
  await page.getByRole('checkbox', { name: /^Autorizo el tratamiento/ }).check();
  await page.getByRole('checkbox', { name: /^Tengo 18 años/ }).check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
}

test('a new user signs up, confirms the email, sets up the account and signs out', async ({
  page,
}) => {
  const email = uniqueEmail();

  await page.goto('/');
  await expect(page).toHaveURL('/sign-in');
  await page.getByRole('link', { name: 'Crea una' }).click();
  await expect(page).toHaveURL('/sign-up');
  await signUp(page, email);
  await emailedLink(email, 1);

  // Signing in before confirming: the app offers a new link.
  await page.goto('/sign-in');
  await signIn(page, email, PASSWORD);
  await expect(
    page.getByText('Antes de entrar, confirma tu correo con el enlace que te enviamos.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enviar el enlace otra vez' }).click();
  await expect(page.getByText('Te enviamos un enlace nuevo.')).toBeVisible();
  const link = await emailedLink(email, 2);

  // The link confirms the address but does not sign in.
  await page.goto(link);
  await expect(page).toHaveURL('/sign-in?verified=1');
  await expect(page.getByText('Tu correo está confirmado. Ya puedes entrar.')).toBeVisible();
  await signIn(page, email, PASSWORD);

  // First setup, guessed from the browser's time zone (Bogotá).
  await expect(page.getByRole('heading', { name: 'Antes de empezar' })).toBeVisible();
  await expect(page.getByLabel('Moneda principal')).toHaveValue('COP');
  await expect(page.getByLabel('Zona horaria')).toHaveValue('America/Bogota');
  await page.getByRole('button', { name: 'Guardar y empezar' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();

  // Ajustes keeps changes in the account, across reloads.
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Ajustes' })
    .click();
  await expect(page.getByText(`Entraste con ${email}.`)).toBeVisible();
  await page.getByLabel('Moneda principal').selectOption('USD');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Moneda principal')).toHaveValue('USD');

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL('/sign-in');
  await page.goto('/settings');
  await expect(page).toHaveURL('/sign-in?next=%2Fsettings');
});

test('a user who forgot the password chooses a new one and returns to the page they wanted', async ({
  page,
}) => {
  const email = uniqueEmail();
  await signUp(page, email);
  await page.goto(await emailedLink(email, 1));

  await page.goto('/budgets');
  await expect(page).toHaveURL('/sign-in?next=%2Fbudgets');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('heading', { name: 'Recupera tu contraseña' })).toBeVisible();
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByText(`Si ${email} tiene una cuenta en Finarez`)).toBeVisible();

  const resetLink = await emailedLink(email, 2);
  await page.goto(resetLink);
  await expect(page.getByRole('heading', { name: 'Elige una contraseña nueva' })).toBeVisible();
  const NEW_PASSWORD = 'otra frase nueva y larga';
  await page.getByLabel('Contraseña nueva').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText('Tu contraseña cambió. Entra con la nueva.')).toBeVisible();

  // The link works once.
  await page.goto(resetLink);
  await expect(page.getByRole('heading', { name: 'Este enlace ya no sirve' })).toBeVisible();

  await page.goto('/sign-in?next=%2Fbudgets');
  await signIn(page, email, PASSWORD);
  await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no coinciden.');
  await signIn(page, email, NEW_PASSWORD);
  await expect(page.getByRole('heading', { name: 'Antes de empezar' })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar y empezar' }).click();
  await expect(page.getByRole('heading', { name: 'Presupuestos', level: 1 })).toBeVisible();
  await expect(page).toHaveURL('/budgets');
});

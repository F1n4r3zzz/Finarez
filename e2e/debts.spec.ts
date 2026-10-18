import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { emailedLinks } from './servers';

const PASSWORD = 'una frase bastante larga';

test('a loan payment is split into interest and principal, and voiding it restores the debt', async ({
  page,
}) => {
  const email = `e2e-debts-${randomUUID()}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox', { name: /^Acepto los Términos/ }).check();
  await page.getByRole('checkbox', { name: /^Autorizo el tratamiento/ }).check();
  await page.getByRole('checkbox', { name: /^Tengo 18 años/ }).check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await expect.poll(() => emailedLinks(email).length).toBe(1);
  await page.goto(emailedLinks(email)[0] as string);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Guardar y empezar' }).click();
  await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toBeVisible();

  await page.goto('/accounts/new');
  await page.getByLabel('Nombre').fill('Bancolombia');
  await page.getByLabel('Saldo ese día').fill('18.500.000');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL('/accounts');

  // The car loan of the freelancer fixture, as of its September 2025 statement.
  await page.goto('/debts/new');
  await page.getByLabel('Nombre').fill('Crédito vehículo');
  await page.getByLabel('Desde qué día la registras').fill('2025-09-30');
  await page.getByLabel('Cuánto debes ese día').fill('38.441.578');
  await page.getByLabel('Tasa de interés (%)').fill('1,2');
  await page.getByLabel('Cuota mensual').fill('1.321.322');
  await page.getByLabel('Día de pago').fill('28');
  await page.getByRole('button', { name: 'Agregar deuda' }).click();
  await expect(page.getByRole('heading', { name: 'Crédito vehículo' })).toBeVisible();

  await page.getByLabel('Fecha', { exact: true }).fill('2025-10-28');
  await page.getByLabel('Valor pagado').fill('1.321.322');
  await expect(
    page.getByText(/461\.299 son intereses y .*860\.023 reducen tu deuda/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(page.getByText('Pago registrado.')).toBeVisible();
  const history = page.getByRole('region', { name: 'Pagos' });
  await expect(history.getByText(/860\.023 a la deuda, .*461\.299 de intereses/)).toBeVisible();
  await expect(page.getByText('$ 37.581.555', { exact: true })).toBeVisible();

  // Only the principal lowers what is owed; the interest is spending.
  await page.goto('/accounts');
  const owe = page.getByRole('region', { name: 'Lo que debes' });
  await expect(owe.getByText(/37\.581\.555/).first()).toBeVisible();
  const have = page.getByRole('region', { name: 'Disponible' });
  await expect(have.getByText(/17\.178\.678/).first()).toBeVisible();

  await page.goto('/debts');
  await page.getByRole('link', { name: /Crédito vehículo/ }).click();
  await history.getByRole('button', { name: 'Anular pago' }).click();
  await history.getByRole('button', { name: 'Anular pago' }).click();
  await expect(history.getByText('Anulado')).toBeVisible();
  await expect(page.getByText('$ 38.441.578', { exact: true })).toBeVisible();
});

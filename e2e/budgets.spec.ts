import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { emailedLinks } from './servers';

const PASSWORD = 'una frase bastante larga';

test('a budget shows what is left, then how much it went over after a purchase', async ({
  page,
}) => {
  const email = `e2e-budgets-${randomUUID()}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
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
  await page.getByLabel('Tipo').selectOption('bank');
  await page.getByLabel('Saldo ese día').fill('5.000.000');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL('/accounts');

  await page.goto('/budgets');
  await page.getByRole('link', { name: 'Nuevo presupuesto' }).click();
  await page.getByLabel('Categoría').selectOption({ label: 'Mercado' });
  await page.getByLabel('Límite al mes').fill('500.000');
  await page.getByRole('button', { name: 'Crear presupuesto' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mercado' })).toBeVisible();
  await expect(page.getByText('Te queda')).toBeVisible();
  await expect(page.getByText(/^Gastaste \$\s?0 de \$\s?500\.000\./)).toBeVisible();

  await page.goto('/transactions/new');
  await page.getByLabel('Descripción').fill('Mercado del mes');
  await page.getByLabel('Cuenta').selectOption({ label: 'Bancolombia (COP)' });
  await page.getByLabel('Categoría').selectOption({ label: 'Mercado' });
  await page.getByLabel('Valor').fill('650.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL('/transactions');

  await page.goto('/budgets');
  const card = page.getByRole('link', { name: /Mercado/ });
  await expect(card.getByText('Te pasaste por')).toBeVisible();
  await expect(card.getByText(/150\.000/)).toBeVisible();
  await expect(page.getByText('1 presupuesto pasado del límite')).toBeVisible();
});

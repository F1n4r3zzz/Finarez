import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { emailedLinks } from './servers';

const PASSWORD = 'una frase bastante larga';

test('a new user adds accounts, records movements and sees them in Cuentas and Inicio', async ({
  page,
}) => {
  const email = `e2e-ledger-${randomUUID()}@example.com`;
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

  for (const [name, type, balance] of [
    ['Bancolombia', 'bank', '18.500.000'],
    ['Visa', 'credit_card', '2.340.000'],
  ] as const) {
    await page.goto('/accounts/new');
    await page.getByLabel('Nombre').fill(name);
    await page.getByLabel('Tipo').selectOption(type);
    await page.getByLabel(/Saldo ese día|Deuda ese día/).fill(balance);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL('/accounts');
  }

  await page.goto('/transactions/new');
  await page.getByLabel('Descripción').fill('Mercado en el Éxito');
  await page.getByLabel('Cuenta').selectOption({ label: 'Visa (COP)' });
  await page.getByLabel('Categoría').selectOption({ label: 'Mercado' });
  await page.getByLabel('Valor').fill('310.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL('/transactions');
  await expect(page.getByText('Mercado, Visa')).toBeVisible();

  await page.goto('/transactions/new');
  await page.getByRole('radio', { name: 'Transferencia' }).check({ force: true });
  await page.getByLabel('Descripción').fill('Pago Visa');
  await page.getByLabel('Desde').selectOption({ label: 'Bancolombia (COP)' });
  await page.getByLabel('Hacia').selectOption({ label: 'Visa (COP)' });
  await page.getByLabel('Valor').fill('2.650.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL('/transactions');

  await page.goto('/accounts');
  const owe = page.getByRole('region', { name: 'Lo que debes' });
  await expect(owe.getByText('Visa')).toBeVisible();
  // 2.340.000 + 310.000 − 2.650.000 = 0 owed
  await expect(owe.getByText(/\$\s?0$/).first()).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Lo que tienes' })
      .getByText(/15\.850\.000/)
      .first(),
  ).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('Disponible hoy')).toBeVisible();
  await expect(page.getByText(/15\.850\.000/).first()).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Gastos por categoría' }).getByText('Mercado'),
  ).toBeVisible();
});

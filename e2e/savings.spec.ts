import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { emailedLinks } from './servers';

const PASSWORD = 'una frase bastante larga';

test('a goal takes money moved from the bank to the fund, without changing what you have in total', async ({
  page,
}) => {
  const email = `e2e-savings-${randomUUID()}@example.com`;
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

  for (const [name, type, balance] of [
    ['Bancolombia', 'bank', '18.500.000'],
    ['Fondo', 'investment', '0'],
  ] as const) {
    await page.goto('/accounts/new');
    await page.getByLabel('Nombre').fill(name);
    await page.getByLabel('Tipo').selectOption(type);
    await page.getByLabel('Saldo ese día').fill(balance);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL('/accounts');
  }

  await page.goto('/savings/new');
  await page.getByLabel('Nombre').fill('Fondo de emergencia');
  await page.getByLabel('Cuánto quieres ahorrar').fill('60.000.000');
  await page.getByRole('button', { name: 'Crear meta' }).click();
  await expect(page.getByRole('heading', { name: 'Fondo de emergencia' })).toBeVisible();

  await page.getByLabel('Cuenta', { exact: true }).selectOption({ label: 'Fondo (COP)' });
  await page.getByLabel('Valor').fill('1.800.000');
  await page.getByRole('checkbox', { name: 'Mover el dinero desde otra cuenta' }).check();
  await page.getByLabel('Desde', { exact: true }).selectOption({ label: 'Bancolombia' });
  await page.getByRole('button', { name: 'Aportar' }).click();
  await expect(page.getByText('Listo.')).toBeVisible();
  await expect(page.getByText(/Llevas el 3\s?% de/)).toBeVisible();
  await expect(page.getByText('Aporte movido a Fondo')).toBeVisible();

  // The money moved between your own accounts: the total you have is the same.
  await page.goto('/accounts');
  const available = page.getByRole('region', { name: 'Disponible' });
  await expect(available.getByText(/16\.700\.000/).first()).toBeVisible();
  const saved = page.getByRole('region', { name: 'Ahorros e inversiones' });
  await expect(saved.getByText(/1\.800\.000/).first()).toBeVisible();
  await expect(page.getByText(/^Tu patrimonio: .*18\.500\.000$/)).toBeVisible();
});

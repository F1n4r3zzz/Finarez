import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { emailedLinks } from './servers';

const PASSWORD = 'una frase bastante larga';

test('a movement set to repeat is recorded now; its next date can be skipped, changed and ended', async ({
  page,
}) => {
  const email = `e2e-recurring-${randomUUID()}@example.com`;
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
  await page.getByLabel('Tipo').selectOption('bank');
  await page.getByLabel('Saldo ese día').fill('5.000.000');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL('/accounts');

  await page.goto('/transactions');
  await page.getByRole('link', { name: 'Recurrentes' }).click();
  await expect(page.getByRole('heading', { name: 'Nada se repite todavía' })).toBeVisible();
  await page.getByRole('link', { name: 'Nuevo recurrente' }).click();
  await expect(page.getByLabel(/Repetir este movimiento/)).toBeChecked();
  await page.getByLabel('Descripción').fill('Plan celular');
  await page.getByLabel('Categoría').selectOption({ label: '— Celular' });
  await page.getByLabel('Valor', { exact: true }).fill('65.900');
  await page.getByText('Preguntarme', { exact: true }).click();
  await expect(page.getByText('Este movimiento se guarda ahora.')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Plan celular' })).toBeVisible();
  await expect(page.getByText(/^Cada mes, el día \d+$/)).toBeVisible();
  await expect(page.getByText('Te pregunta antes de registrarlo')).toBeVisible();
  // The first one is already a movement, as if typed in by hand.
  await page.getByRole('link', { name: 'Registrado' }).click();
  await expect(page.getByRole('heading', { name: 'Editar movimiento' })).toBeVisible();
  await expect(page.getByLabel('Valor', { exact: true })).toHaveValue('65.900');
  await page.goBack();

  const skip = page.getByRole('button', { name: /^Saltar el / });
  const next = await skip.textContent();
  await skip.click();
  await expect(page.getByText('Omitido')).toBeVisible();
  await expect(skip).not.toHaveText(next ?? '');

  await page.getByRole('link', { name: 'Editar' }).click();
  await page.getByLabel('Valor').fill('69.900');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plan celular' })).toBeVisible();
  await expect(page.getByText(/69\.900/)).toBeVisible();

  await page.getByRole('button', { name: 'Terminar recurrente' }).click();
  await page.getByRole('button', { name: 'Terminar recurrente' }).click();
  await expect(page.getByText('Terminado. Lo que registró se conserva.')).toBeVisible();
  await page.goto('/transactions/recurring');
  await expect(
    page.getByRole('region', { name: 'Terminados' }).getByText('Plan celular'),
  ).toBeVisible();
});

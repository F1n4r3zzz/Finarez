export interface DefaultCategory {
  name: string;
  /** Subcategories (one level). */
  children?: readonly string[];
}

/**
 * Categories every new user starts with, in Spanish. They are copied into the user's own
 * rows on first use, so each user can rename, reorganize or archive them freely.
 *
 * Version 2 (2026-10-15) split housing from the household bills: Vivienda is the home itself
 * (rent, building fee, repairs) and Servicios del hogar holds each bill on its own, so
 * reports can tell water from electricity. Earlier users are upgraded by
 * `upgradeDefaultsToV2`.
 */
export const DEFAULTS_VERSION = 2;

export const DEFAULT_CATEGORIES: Readonly<
  Record<'income' | 'expense', readonly DefaultCategory[]>
> = {
  income: [
    { name: 'Salario' },
    { name: 'Ingresos por servicios' },
    { name: 'Intereses recibidos' },
    { name: 'Ganancias realizadas' },
    { name: 'Otros ingresos' },
    { name: 'Ajustes' },
  ],
  expense: [
    { name: 'Vivienda', children: ['Arriendo', 'Administración', 'Reparaciones y mantenimiento'] },
    {
      name: 'Servicios del hogar',
      children: ['Agua', 'Luz', 'Gas', 'Aseo', 'Internet', 'Celular', 'Televisión'],
    },
    { name: 'Mercado' },
    { name: 'Hogar' },
    { name: 'Restaurantes y domicilios' },
    { name: 'Transporte' },
    { name: 'Vehículo' },
    { name: 'Salud' },
    { name: 'Seguridad social' },
    { name: 'Impuestos' },
    { name: 'Intereses' },
    { name: 'Comisiones bancarias' },
    { name: 'Suscripciones y software' },
    { name: 'Educación' },
    { name: 'Entretenimiento' },
    { name: 'Viajes' },
    { name: 'Ropa' },
    { name: 'Regalos' },
    { name: 'Mascotas' },
    { name: 'Cuidado personal' },
    { name: 'Ajustes' },
  ],
};

/** Names of the version 1 roots that version 2 reorganizes. */
export const V1_UTILITIES = 'Servicios públicos';
export const V1_TELECOM = 'Internet y celular';

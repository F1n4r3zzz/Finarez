/**
 * Categories every new user starts with, in Spanish. They are copied into the user's own
 * rows on first use, so each user can rename, reorganize or archive them freely.
 */
export const DEFAULT_CATEGORIES: Readonly<Record<'income' | 'expense', readonly string[]>> = {
  income: [
    'Salario',
    'Ingresos por servicios',
    'Intereses recibidos',
    'Ganancias realizadas',
    'Otros ingresos',
    'Ajustes',
  ],
  expense: [
    'Vivienda',
    'Servicios públicos',
    'Internet y celular',
    'Mercado',
    'Hogar',
    'Restaurantes y domicilios',
    'Transporte',
    'Vehículo',
    'Salud',
    'Seguridad social',
    'Impuestos',
    'Intereses',
    'Comisiones bancarias',
    'Suscripciones y software',
    'Educación',
    'Entretenimiento',
    'Viajes',
    'Ropa',
    'Regalos',
    'Mascotas',
    'Cuidado personal',
    'Ajustes',
  ],
};

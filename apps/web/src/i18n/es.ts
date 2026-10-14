/** Spanish UI strings. Every visible text goes through here; English will mirror this shape. */
export const es = {
  app: {
    name: 'Finanz',
    skipToContent: 'Saltar al contenido',
    mainNav: 'Navegación principal',
    mobileNav: 'Secciones',
    goHome: 'Ir al inicio',
  },
  modules: {
    dashboard: { title: 'Inicio', description: 'Tu dinero de un vistazo.' },
    accounts: {
      title: 'Cuentas',
      description: 'El dinero que tienes y lo que debes, cuenta por cuenta.',
    },
    transactions: { title: 'Movimientos', description: 'Todo lo que entra y sale de tus cuentas.' },
    import: {
      title: 'Importar',
      description: 'Trae tus movimientos desde el extracto de tu banco.',
    },
    budgets: {
      title: 'Presupuestos',
      description: 'Límites de gasto por categoría y por periodo.',
    },
    savings: {
      title: 'Ahorros',
      description: 'Tus metas de ahorro y cuánto te falta para cada una.',
    },
    debts: { title: 'Deudas', description: 'Préstamos y tarjetas: cuánto debes y cuándo pagas.' },
    networth: {
      title: 'Patrimonio',
      description: 'Lo que tienes menos lo que debes, y cómo cambia con el tiempo.',
    },
    reports: {
      title: 'Reportes',
      description: 'Ingresos, gastos y tendencias del periodo que elijas.',
    },
    investments: {
      title: 'Inversiones',
      description: 'Seguimiento básico de lo que tienes invertido.',
    },
    settings: {
      title: 'Ajustes',
      description: 'Idioma, formato y secciones visibles en este dispositivo.',
    },
    more: { title: 'Más', description: 'Todas las secciones de Finanz.' },
  },
  empty: {
    accounts: {
      title: 'Todavía no tienes cuentas',
      body: 'Aquí verás tus cuentas de banco, efectivo, billeteras digitales, tarjetas de crédito y préstamos, cada una con su moneda y su saldo.',
    },
    transactions: {
      title: 'Todavía no hay movimientos',
      body: 'Tus ingresos, gastos y transferencias aparecerán aquí con su categoría. Pasar dinero entre tus propias cuentas no cuenta como gasto.',
    },
    budgets: {
      title: 'Todavía no tienes presupuestos',
      body: 'Elige una categoría y un límite mensual o trimestral para ver lo gastado y lo que te queda.',
    },
    savings: {
      title: 'Todavía no tienes metas',
      body: 'Define cuánto quieres ahorrar y para cuándo. El progreso sale del dinero que apartes en tus cuentas.',
    },
    debts: {
      title: 'No tienes deudas registradas',
      body: 'Al pagar una cuota, Finanz separa lo que reduce tu deuda de los intereses, que sí cuentan como gasto.',
    },
    networth: {
      title: 'Aún no hay datos para calcularlo',
      body: 'Tu patrimonio se calcula solo, a partir de tus cuentas, deudas e inversiones. No tienes que registrarlo aparte.',
    },
    reports: {
      title: 'Aún no hay movimientos para analizar',
      body: 'Con tus movimientos registrados podrás comparar meses, ver en qué gastas más y exportar tus datos.',
    },
    investments: {
      title: 'No tienes inversiones registradas',
      body: 'Registra qué compraste, a qué precio y en qué moneda para ver su valor estimado. Si no inviertes, puedes ocultar esta sección en Ajustes.',
    },
    import: {
      title: 'Sube un extracto de tu banco',
      body: 'Antes de guardar, revisarás cada movimiento, y los que ya tengas registrados se marcarán como repetidos.',
      formats: 'Formatos aceptados: CSV, XLSX y XLSM.',
      macros:
        'Las macros de los archivos XLSM nunca se ejecutan: solo se leen los valores de las celdas.',
    },
  },
  dashboard: {
    subtitle: 'Resumen de {{month}}',
    available: 'Disponible hoy',
    availableEmpty: 'Agrega tus cuentas para ver aquí cuánto dinero tienes disponible.',
    inAccounts_one: 'En {{count}} cuenta',
    inAccounts_other: 'En {{count}} cuentas',
    income: 'Ingresos de {{month}}',
    expenses: 'Gastos de {{month}}',
    net: 'Balance de {{month}}',
    versus: 'frente a {{month}}',
    spending: 'Gastos por categoría',
    spendingEmpty: 'Cuando registres gastos, verás aquí en qué se va tu dinero.',
    recent: 'Últimos movimientos',
    recentEmpty: 'Tus movimientos más recientes aparecerán aquí.',
    seeAll: 'Ver todo',
    firstSteps: 'Primeros pasos',
    steps: {
      accounts: {
        title: 'Agrega tus cuentas',
        body: 'Bancos, efectivo, billeteras digitales y tarjetas, cada una en su moneda.',
      },
      transactions: {
        title: 'Registra o importa tus movimientos',
        body: 'Escríbelos uno a uno o sube el extracto de tu banco en CSV o Excel.',
      },
      budgets: {
        title: 'Define un presupuesto',
        body: 'Pon un límite por categoría y mira cuánto te queda cada mes.',
      },
    },
  },
  settings: {
    language: 'Idioma',
    languageValue: 'Español',
    languageNote: 'El inglés estará disponible más adelante.',
    format: 'Formato de cifras',
    formatDetected: 'Según tu navegador ({{locale}}), así se ven las cantidades:',
    timeZone: 'Zona horaria',
    timeZoneDetected: '{{timeZone}}. Las fechas de tus movimientos se cuentan en esta zona.',
    sections: 'Secciones opcionales',
    showInvestments: 'Mostrar Inversiones',
    showInvestmentsHint:
      'Si no inviertes, ocúltala del menú. Puedes volver a mostrarla cuando quieras.',
    deviceNote: 'Por ahora estos ajustes se guardan en este dispositivo.',
  },
  notFound: {
    title: 'Esta página no existe',
    body: 'Revisa la dirección o vuelve al inicio.',
  },
  error: {
    title: 'No se pudo cargar esta página',
    body: 'Recarga la página. Si sigue fallando, vuelve al inicio.',
  },
  preview: {
    badge: 'Datos de ejemplo',
    note: 'Vista solo para desarrollo: así se verá Inicio con cuentas y movimientos.',
  },
} as const;

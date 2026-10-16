export interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
  items?: string[];
  table?: { caption: string; columns: string[]; rows: string[][] };
  links?: { label: string; href: string }[];
}

export interface LegalDocument {
  title: string;
  description: string;
  sections: LegalSection[];
}

/** Original Spanish drafts. Keep the current service and planned features explicit. */
export const legalEs = {
  title: 'Legal y privacidad',
  description: 'Cómo funciona Finarez, qué datos utiliza y qué control tienes sobre ellos.',
  navigation: 'Documentos legales',
  contents: 'En esta página',
  back: 'Todos los documentos',
  openApp: 'Ir a Finarez',
  footer: 'Términos, privacidad y cookies',
  settingsDescription: 'Consulta las condiciones del servicio y cómo se tratan tus datos.',
  draft: 'Borrador para revisión',
  draftNotice:
    'Estos documentos están en preparación. El NIT, el domicilio y el teléfono de la empresa aún deben completarse. La fecha de entrada en vigor está pendiente; las funciones futuras se identifican como previstas.',
  version: 'Versión {{version}} · Borrador',
  reviewed: 'Última revisión: 16 de octubre de 2026',
  effective: 'Entrada en vigor: pendiente de publicación definitiva',
  operatorTitle: 'Responsable y contacto',
  operatorNote: 'Los campos entre corchetes se completarán antes de abrir el servicio al público.',
  operatorFields: [
    { label: 'Nombre o razón social', value: 'Finarez' },
    { label: 'Identificación', value: '[NIT]' },
    { label: 'Domicilio y dirección', value: '[CIUDAD Y DIRECCIÓN EN COLOMBIA]' },
    { label: 'Privacidad y atención al usuario', value: 'finarez.contact@gmail.com' },
    { label: 'Teléfono', value: '[TELÉFONO DE CONTACTO]' },
    { label: 'Área responsable de datos', value: '[PERSONA O ÁREA RESPONSABLE]' },
  ],
  signupNotice:
    'Usamos tu correo para crear y proteger tu cuenta, y tus registros financieros para mostrar tus saldos y movimientos.',
  consents: {
    legend: 'Lo que aceptas',
    terms: 'Acepto los',
    privacy: 'Autorizo el tratamiento de mis datos personales según la',
    adult: 'Tengo 18 años o más.',
    newTab: '(se abre en otra pestaña)',
    missing: 'Marca todas las casillas para continuar.',
  },
  accept: {
    firstTitle: 'Antes de continuar',
    firstBody:
      'Para usar Finarez, acepta los términos, autoriza el tratamiento de tus datos y confirma que eres mayor de edad.',
    updateTitle: 'Actualizamos los términos',
    updateBody: 'Revisa los cambios y acéptalos para seguir usando Finarez.',
    submit: 'Aceptar y continuar',
    submitting: 'Guardando…',
    signOut: 'Salir',
  },
  summaryTitle: 'Antes de empezar',
  summary: [
    'Tus registros se utilizan para organizar tus finanzas personales. Las proyecciones son estimaciones.',
    'La versión actual utiliza una cookie de sesión y preferencias locales. No integra publicidad ni analítica de terceros.',
    'El modelo previsto incluye un plan gratuito con anuncios y planes de pago sin anuncios. Los precios y módulos se definirán más adelante.',
    'Por ahora Finarez es solo para mayores de 18 años. Más adelante se prevé admitir personas desde los 14 años, con protección adicional para adolescentes.',
  ],
  related: 'También puedes consultar',
  sources: 'Normativa y fuentes oficiales',
  documents: {
    terms: {
      title: 'Términos y condiciones',
      description:
        'El alcance del servicio, tus responsabilidades y las condiciones previstas de los planes.',
      sections: [
        {
          id: 'servicio',
          title: '1. Qué ofrece Finarez',
          paragraphs: [
            'Finarez es una aplicación de organización financiera personal dirigida inicialmente al mercado colombiano. Permite registrar cuentas, ingresos, gastos, transferencias y deudas, consultar saldos y trabajar con las monedas disponibles.',
            'Las cuentas que registras representan información ingresada por ti. Actualmente Finarez no se conecta a tus bancos, no custodia dinero, no ejecuta transferencias bancarias, no concede créditos y no compra ni vende inversiones por tu cuenta.',
            'Las secciones señaladas como en construcción todavía no prestan la funcionalidad anunciada. La disponibilidad de un módulo en el menú no significa que esté terminado o incluido en un plan comercial.',
          ],
        },
        {
          id: 'estado-documento',
          title: '2. Estado de estas condiciones',
          paragraphs: [
            'Este es un borrador del servicio en desarrollo. El NIT, el domicilio y el teléfono de la empresa y la fecha de vigencia aparecen pendientes. Leer este documento no registra aceptación: se registra solo al marcar las casillas descritas a continuación.',
            'Al crear tu cuenta marcas tres casillas por separado, ninguna marcada de antemano: la aceptación de estas condiciones, la autorización para tratar tus datos personales según la política de privacidad y la confirmación de que tienes 18 años o más. Finarez guarda la versión aceptada y la fecha de cada una como evidencia.',
            'Estas condiciones están disponibles en la pantalla de registro antes de aceptar. Es tu responsabilidad revisarlas y consultar las dudas que tengas. Si cambian, se te pedirá aceptar la nueva versión antes de seguir usando Finarez; si no la aceptas, puedes salir. Publicar un enlace no acredita por sí solo la aceptación ni sustituye la autorización separada para tratar datos personales.',
          ],
        },
        {
          id: 'edad',
          title: '3. Edad y protección de adolescentes',
          paragraphs: [
            'Por ahora solo pueden crear una cuenta personas de 18 años o más, que lo confirman al registrarse. A futuro, la edad mínima prevista es de 14 años. Para personas de 14 a 17 años se deberá habilitar un proceso especial que respete su interés superior, sus derechos y su opinión según su madurez, con la autorización de su representante legal que corresponda.',
            'Las conexiones bancarias y las funciones de inversión estarán restringidas para menores de 18 años. La edad mínima de 14 años es una decisión del producto y no elimina las protecciones legales de los menores.',
            'El proceso para adolescentes aún no está implementado; hasta entonces, el registro se limita a mayores de edad. Las condiciones para compras y publicidad destinadas a menores se revisarán por separado.',
            'Confirmar la edad al registrarte no acredita por sí solo la mayoría de edad ni la representación legal. El recorrido para adolescentes podrá incluir un enlace de autorización para su representante, con medidas proporcionales de verificación y registro antes de habilitar la cuenta.',
          ],
        },
        {
          id: 'cuenta',
          title: '4. Tu cuenta y su seguridad',
          paragraphs: [
            'Debes utilizar un correo al que tengas acceso, confirmar su titularidad y mantener una contraseña confidencial. No compartas enlaces de recuperación, códigos o sesiones. Si ves un acceso que no reconoces, escríbenos a finarez.contact@gmail.com.',
            'Eres responsable de la información que ingresas y debes revisar importes, monedas, fechas y saldos. No introduzcas claves bancarias, números completos de tarjetas, códigos de seguridad ni datos de otras personas que no tengas derecho a tratar.',
          ],
        },
        {
          id: 'estimaciones',
          title: '5. Cálculos y decisiones financieras',
          paragraphs: [
            'Los saldos, conversiones y proyecciones dependen de tus registros y de las tasas disponibles. Una tasa faltante puede producir un total parcial, y una proyección de deuda puede diferir del extracto del acreedor por fechas, cargos o reglas de redondeo.',
            'Finarez no presta asesoría financiera, de inversión, tributaria o jurídica personalizada. Contrasta los resultados con tus extractos y contratos antes de tomar decisiones. Esta explicación no limita los derechos que te reconozca la ley ni exime a la empresa de sus obligaciones.',
          ],
        },
        {
          id: 'planes',
          title: '6. Plan gratuito, publicidad y planes de pago',
          paragraphs: [
            'El modelo previsto incluye un plan gratuito con anuncios y planes de pago con módulos adicionales y sin anuncios. Todavía no hay precios, paquetes de módulos, publicidad ni cobros de suscripción habilitados.',
            'Antes de una compra se informarán los módulos incluidos, el precio total, los impuestos aplicables, la duración, la forma de renovación y cómo cancelar. No se presumirá que todos los medios de pago permiten débitos automáticos.',
            'La publicidad deberá identificarse como tal. Tus saldos, deudas, movimientos, descripciones e identificadores de cuentas no se utilizarán como datos de segmentación publicitaria. Los proveedores y el funcionamiento concreto se informarán antes de activar anuncios.',
          ],
        },
        {
          id: 'pagos',
          title: '7. Pagos y renovación previstos',
          paragraphs: [
            'Se prevé integrar Wompi, con medios como PSE, y evaluar PayPal para pagos internacionales compatibles. No se ofrecen todavía estos medios dentro de Finarez. Su disponibilidad dependerá de la habilitación del comercio y del método elegido.',
            'Un cobro recurrente requerirá autorización y condiciones claras. Cuando el método exija que completes cada pago, deberás renovar manualmente. Se enviará la confirmación correspondiente y se informará cómo resolver un pago fallido o duplicado.',
          ],
        },
        {
          id: 'cancelacion',
          title: '8. Cancelación, vencimiento y reembolsos',
          paragraphs: [
            'La regla prevista para las suscripciones es que puedas cancelar la siguiente renovación y conservar el periodo ya pagado hasta su vencimiento. Al terminar ese periodo se aplicará una degradación completa al plan gratuito: dejarás de tener acceso a funciones premium y al beneficio de ausencia de anuncios.',
            'La cancelación no equivale por sí misma a borrar la cuenta. La descarga de tus datos, las solicitudes de privacidad y la eliminación no dependerán de mantener una suscripción. La conservación de registros y su recuperación al volver a suscribirte se definirán antes de comercializar los planes.',
            'La política definitiva explicará retracto, devoluciones, reversión de pagos y sus condiciones según la normativa colombiana aplicable. No se establece una exclusión general de reembolsos ni una renuncia a derechos del consumidor. Una cancelación ordinaria y una solicitud de retracto o reversión se tramitarán según sus reglas respectivas.',
          ],
        },
        {
          id: 'uso',
          title: '9. Uso permitido y contenido',
          paragraphs: [
            'Puedes utilizar Finarez para organizar tus propias finanzas y los datos que legítimamente puedas registrar. Conservas tus derechos sobre el contenido que aportas; su tratamiento se limita a las finalidades informadas y autorizadas.',
            'No debes acceder a cuentas ajenas, compartir contenido ilícito, eludir controles de acceso o pago, introducir código dañino ni alterar el funcionamiento del servicio. Los derechos sobre la aplicación y sus elementos se respetarán junto con las licencias de componentes de terceros.',
          ],
        },
        {
          id: 'cierre',
          title: '10. Suspensión, cierre e inactividad',
          paragraphs: [
            'Las causas previstas para una restricción son intentos de acceder a cuentas o información ajenas; malware, ataques o automatización que perjudique el servicio; fraude de identidad o de pago; elusión de controles de acceso; y órdenes de una autoridad competente. Una cuenta comprometida podrá bloquearse temporalmente para proteger al titular. La falta de edad mínima o de la autorización exigible se atenderá mediante el procedimiento de elegibilidad correspondiente.',
            'Las medidas serán proporcionales a los hechos y a la información disponible. Se informarán el motivo y el canal de revisión cuando sea legalmente posible; una urgencia de seguridad podrá exigir actuar primero. La situación financiera del usuario, cancelar un plan o presentar una reclamación no serán por sí solos causas de suspensión. La pérdida ordinaria de acceso premium por vencimiento de un plan se regirá por las condiciones de suscripción. Una restricción no eliminará los derechos sobre tus datos.',
            'La política prevista es eliminar cuentas tras seis meses sin un inicio de sesión exitoso; los intentos fallidos no reinician ese plazo. Se enviará una advertencia un mes antes de la fecha de eliminación, con instrucciones para iniciar sesión y evitarla o solicitar una copia de los datos. Un inicio de sesión exitoso reiniciará el plazo y cancelará la eliminación programada por esa inactividad. Este proceso automático aún no está activo; antes de habilitarlo se concretarán el cálculo del plazo y el tratamiento de suscripciones, copias de respaldo y registros de conservación obligatoria.',
            'Una solicitud expresa de eliminación se tramitará por separado y no tendrá que esperar seis meses. Las retenciones justificadas se informarán, sin conservar indiscriminadamente el historial financiero personal.',
          ],
        },
        {
          id: 'disponibilidad',
          title: '11. Disponibilidad y cambios',
          paragraphs: [
            'La aplicación está en desarrollo y puede requerir mantenimiento o presentar interrupciones. No se ofrece disponibilidad ininterrumpida ni exactitud garantizada de toda estimación. Se deberá informar de los cambios que afecten materialmente un servicio contratado y respetar los derechos del consumidor.',
            'Los cambios relevantes en estas condiciones se comunicarán con su versión y fecha de aplicación. Los cambios en las finalidades de tratamiento se evaluarán conforme a las reglas de autorización de datos; navegar por una nueva versión del texto no sustituye esa autorización.',
          ],
        },
        {
          id: 'atencion',
          title: '12. Atención, ley aplicable y autoridades',
          paragraphs: [
            'El marco previsto es el colombiano, sin excluir normas imperativas ni derechos que resulten aplicables. Para soporte y privacidad, escribe a finarez.contact@gmail.com.',
            'Podrás presentar solicitudes y reclamaciones por los canales informados, sin costos por el simple ejercicio de tus derechos. Se respetan las competencias de la Superintendencia de Industria y Comercio y de las demás autoridades competentes, sin imponer renuncias a la protección legal o un arbitraje obligatorio en este borrador.',
          ],
          links: [
            { label: 'Superintendencia de Industria y Comercio', href: 'https://www.sic.gov.co/' },
            {
              label: 'Ley 1480 de 2011 · Estatuto del Consumidor',
              href: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306',
            },
            {
              label: 'Ley 2439 de 2024 · Comercio electrónico',
              href: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257116',
            },
          ],
        },
      ],
    },
    privacy: {
      title: 'Política de privacidad',
      description:
        'Política de tratamiento de datos personales para el servicio previsto en Colombia.',
      sections: [
        {
          id: 'responsable',
          title: '1. Responsable, alcance y estado',
          paragraphs: [
            'Finarez es responsable del tratamiento de los datos necesarios para prestar el servicio. Su NIT, domicilio y teléfono se completarán en la ficha de responsable de esta página. Para consultas y reclamos sobre tus datos, escribe a finarez.contact@gmail.com.',
            'Esta política cubre la información de cuentas, registros financieros, seguridad y preferencias de Finarez. Se dirige inicialmente a Colombia y se prepara con base en la Ley 1581 de 2012 y sus normas reglamentarias. Los proveedores externos también pueden tener responsabilidades y condiciones propias que se identificarán según cada servicio.',
          ],
        },
        {
          id: 'datos',
          title: '2. Qué información utiliza la aplicación',
          paragraphs: [
            'La información depende de lo que registras y de las funciones que utilizas:',
          ],
          items: [
            'Cuenta: correo, estado de verificación, contraseña almacenada como hash, registros de confirmación y recuperación, las versiones de los documentos que aceptaste con su fecha, y fechas técnicas. Actualmente no se solicita un nombre para registrarte.',
            'Seguridad: sesiones, dirección IP, información del navegador y registros para limitar intentos de acceso y prevenir abuso.',
            'Finanzas: nombres de cuentas e instituciones, monedas, saldos, ingresos, gastos, transferencias, deudas, categorías, fechas, destinatarios o comercios, notas e historial de cambios.',
            'Preferencias: idioma, zona horaria, moneda principal, tema visual y secciones que eliges mostrar.',
            'Información futura: datos mínimos del representante legal, soporte y facturación, únicamente cuando se habiliten e informen esas funciones. Actualmente no se recopilan datos de tarjetas para cobros dentro de Finarez.',
          ],
        },
        {
          id: 'finalidades',
          title: '3. Para qué se utilizan tus datos',
          paragraphs: [
            'Las finalidades del servicio son crear y proteger la cuenta, verificar tu correo, recuperar el acceso, guardar tus preferencias, registrar tus finanzas y calcular saldos, conversiones, resúmenes y proyecciones que solicitas. También se utilizan los datos técnicos necesarios para prevenir abuso y resolver problemas del servicio.',
            'Cuando se habiliten soporte, pagos o nuevas funciones, se informarán sus datos, finalidades y destinatarios. Los correos de acceso y seguridad son distintos de los mensajes promocionales. Una finalidad opcional no se incorporará automáticamente a la autorización necesaria para usar la cuenta.',
            'Los registros financieros no se destinan a segmentar anuncios, comercializar perfiles financieros ni alimentar sistemas publicitarios. La versión actual no integra publicidad ni analítica de terceros.',
          ],
        },
        {
          id: 'autorizacion',
          title: '4. Información y autorización',
          paragraphs: [
            'Antes de recopilar datos se deberá informar quién los trata, para qué, qué derechos tienes y cómo ejercerlos. Cuando corresponda, se solicitará una autorización previa e informada y se conservará su evidencia, separada de la aceptación de las condiciones del servicio.',
            'La lectura de esta política, el silencio o un enlace junto al registro no sustituyen la autorización. Al crear tu cuenta la otorgas marcando una casilla propia, separada de la aceptación de las condiciones y sin marcar de antemano; Finarez guarda la versión de esta política y la fecha. Si la política cambia, se te pedirá autorizar la nueva versión antes de seguir.',
            'Podrás solicitar prueba de tu autorización y retirar las autorizaciones opcionales por los mecanismos que se habiliten. La revocación o supresión se evaluará según las obligaciones legales y contractuales aplicables; se explicará cualquier retención que impida atenderla totalmente.',
          ],
        },
        {
          id: 'terceros',
          title: '5. Información sensible y de otras personas',
          paragraphs: [
            'Tus registros financieros son información privada. Las notas o categorías pueden revelar además información especialmente protegida, por ejemplo sobre salud u otras circunstancias personales. Evita ingresar esos detalles si no son necesarios para organizar tus finanzas.',
            'No introduzcas contraseñas bancarias, códigos de seguridad ni números completos de tarjetas. Evita datos personales de otras personas en descripciones o archivos. Si necesitas registrarlos, debes contar con una base legítima para hacerlo y limitarte a lo necesario.',
            'No se solicitarán datos sensibles como condición general para usar Finarez. Si una función llegara a necesitarlos, deberá evaluarse e informarse de manera específica, incluyendo el carácter facultativo de la respuesta y la autorización que corresponda.',
          ],
        },
        {
          id: 'menores',
          title: '6. Protección de personas de 14 a 17 años',
          paragraphs: [
            'La política prevista admite personas desde los 14 años, con un flujo especial para quienes no han cumplido 18. Se deberá comprobar la autorización del representante legal que corresponda, respetar el interés superior y escuchar a la persona adolescente según su madurez y capacidad de comprensión.',
            'Las conexiones bancarias y las funciones de inversión estarán restringidas para menores. La publicidad y las compras de suscripciones requieren una evaluación adicional. Estos controles y el flujo de representación aún no están activos; no se presenta este borrador como una habilitación para recopilar datos de menores sin esas medidas.',
            'La información para verificar edad o representación se limitará a lo necesario. Antes de abrir ese flujo se informarán sus campos, conservación, atención de solicitudes y transición al cumplir 18 años.',
          ],
        },
        {
          id: 'proveedores',
          title: '7. Proveedores y tratamiento internacional',
          paragraphs: [
            'Finarez necesita infraestructura para alojar la aplicación, almacenar registros y enviar correos de seguridad. El alojamiento previsto es Vercel, la base de datos prevista es Neon y el proveedor de correo configurado para entornos alojados es Resend. En desarrollo local los correos pueden imprimirse en el entorno de pruebas; utiliza datos de prueba.',
            'El inventario definitivo identificará los proveedores realmente habilitados, sus funciones, países o regiones de tratamiento, subencargados y garantías contractuales. No se afirma que toda la información permanezca en Colombia.',
            'Las transmisiones a proveedores que actúen por cuenta de la empresa y las transferencias a responsables independientes se evaluarán conforme a sus reglas respectivas. Los contratos, destinatarios y autorizaciones aplicables deben resolverse antes de la puesta en producción.',
            'Wompi y PayPal son opciones previstas para pagos; todavía no están integrados. No hay una red publicitaria seleccionada. Cualquier integración futura se incorporará a esta política antes de operar y recibirá únicamente los datos necesarios para su función.',
          ],
        },
        {
          id: 'conservacion',
          title: '8. Conservación, inactividad y eliminación',
          paragraphs: [
            'La regla prevista es eliminar cuentas después de seis meses sin un inicio de sesión exitoso. Los intentos fallidos no reiniciarán ese plazo. Se enviará una advertencia un mes antes de la fecha prevista de eliminación. Podrás evitarla iniciando sesión correctamente o solicitar una copia de tus datos antes del borrado; un acceso exitoso reiniciará el plazo y cancelará la eliminación programada por esa inactividad. El proceso automático aún no está implementado y su coordinación con suscripciones sigue pendiente.',
            'Una solicitud de eliminación no tendrá que esperar ese periodo. Los plazos específicos para soporte, registros técnicos, pruebas de autorización, facturación y copias de respaldo se completarán antes del lanzamiento, limitándolos a su finalidad y a las obligaciones aplicables.',
            'El vencimiento de una sesión o de un enlace de recuperación no demuestra por sí solo el borrado de sus registros. No se promete eliminación inmediata de todas las copias. Se deberá informar qué información se conserva, su motivo y hasta cuándo, y evitar que una restauración reactive cuentas ya eliminadas.',
            'Cancelar una suscripción retira los beneficios premium al terminar el periodo pagado, pero no elimina automáticamente la cuenta ni sus registros. El ejercicio de derechos sobre tus datos seguirá disponible para usuarios del plan gratuito.',
          ],
        },
        {
          id: 'derechos',
          title: '9. Tus derechos sobre la información',
          paragraphs: ['Conforme a las condiciones legales aplicables, puedes:'],
          items: [
            'Conocer y consultar tus datos, pedir su actualización y corregir información inexacta o incompleta.',
            'Solicitar prueba de la autorización y conocer el uso que se ha dado a tus datos.',
            'Solicitar la supresión de datos o revocar la autorización cuando proceda.',
            'Acceder gratuitamente a la información en los términos legales y presentar reclamaciones ante el responsable.',
            'Acudir a la Superintendencia de Industria y Comercio, una vez agotado el trámite previo que corresponda.',
          ],
        },
        {
          id: 'solicitudes',
          title: '10. Cómo ejercer tus derechos',
          paragraphs: [
            'El canal de privacidad es finarez.contact@gmail.com. La persona o área encargada está pendiente en la ficha de responsable. Ese correo debe estar disponible y monitoreado desde el lanzamiento. El centro de exportación y eliminación dentro de Ajustes también está pendiente; este documento no lo presenta como una función disponible.',
            'El procedimiento deberá permitir identificar la cuenta, describir la solicitud y recibir una respuesta, verificando identidad o representación de forma proporcionada. No envíes contraseñas ni datos financieros innecesarios. Las solicitudes se registrarán y se informará cualquier dato adicional indispensable para atenderlas.',
            'Las consultas se atienden, por regla general, en diez días hábiles; cuando proceda una extensión, se informarán los motivos y la fecha, sin superar los cinco días hábiles adicionales. Los reclamos se atienden en quince días hábiles contados desde el día siguiente a su recibo, con extensión motivada de hasta ocho días hábiles adicionales cuando corresponda.',
            'Los reclamos incompletos, su traslado al competente y la anotación de reclamo en trámite se gestionarán según la Ley 1581. No será necesario contratar un plan de pago para presentar una solicitud sobre tus datos.',
          ],
        },
        {
          id: 'seguridad',
          title: '11. Seguridad y acceso',
          paragraphs: [
            'La aplicación utiliza contraseñas almacenadas como hashes, sesiones, controles de acceso por usuario y medidas para limitar intentos de acceso. En un entorno HTTPS la cookie de sesión se configura para transmisión segura y no es accesible desde los scripts de la página.',
            'Estas medidas no garantizan ausencia absoluta de incidentes. Antes de la apertura pública se completarán las medidas operativas de acceso, copias de seguridad, restauración y respuesta a incidentes, incluyendo los reportes y comunicaciones que resulten exigibles. No se ofrece cifrado de extremo a extremo de los registros financieros.',
          ],
        },
        {
          id: 'cambios',
          title: '12. Cambios, vigencia y fuentes',
          paragraphs: [
            'La versión y última revisión figuran al inicio. La fecha de vigencia definitiva se completará antes de publicar esta política como aplicable al servicio. Los cambios relevantes se comunicarán y se solicitará una nueva autorización cuando el cambio de finalidad u otra circunstancia lo requiera.',
            'También puedes consultar la política de cookies y almacenamiento local para conocer las tecnologías de tu dispositivo y sus controles.',
          ],
          links: [
            {
              label: 'Ley 1581 de 2012 · Protección de datos personales',
              href: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981',
            },
            {
              label: 'Decreto 1074 de 2015 · Reglamentación de protección de datos',
              href: 'https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr026.htm',
            },
            { label: 'Superintendencia de Industria y Comercio', href: 'https://www.sic.gov.co/' },
          ],
        },
      ],
    },
    cookies: {
      title: 'Cookies y almacenamiento local',
      description:
        'Qué guarda Finarez en tu navegador, durante cuánto tiempo y cómo puedes controlarlo.',
      sections: [
        {
          id: 'tecnologias',
          title: '1. Qué son y para qué se usan',
          paragraphs: [
            'Una cookie es un pequeño dato que el navegador guarda y puede enviar al servidor al visitar el sitio. Finarez la utiliza para reconocer una sesión iniciada. El almacenamiento local guarda preferencias en el dispositivo y no se envía automáticamente con cada solicitud.',
            'La aplicación actual usa una cookie de autenticación y preferencias de idioma y apariencia. No integra redes publicitarias ni analítica de terceros. La configuración de la infraestructura alojada aún debe verificarse antes del lanzamiento.',
          ],
        },
        {
          id: 'sesion',
          title: '2. Cookie de autenticación',
          paragraphs: [
            'Al iniciar sesión, el servicio de autenticación guarda un identificador para mantener el acceso a tu cuenta. No contiene el detalle de tus movimientos. En HTTPS se utiliza el prefijo de seguridad indicado en la tabla; en desarrollo HTTP el nombre no lleva ese prefijo.',
            'La configuración actual utiliza HttpOnly y SameSite=Lax; Secure se activa en HTTPS. La duración puede renovarse mientras la sesión siga siendo válida. Cerrar sesión invalida el acceso de esa sesión y solicita retirar su cookie.',
          ],
          table: {
            caption: 'Cookie configurada para iniciar sesión',
            columns: ['Nombre', 'Finalidad', 'Duración configurada'],
            rows: [
              [
                '__Secure-better-auth.session_token',
                'Autenticación en HTTPS; better-auth.session_token en desarrollo HTTP.',
                '14 días, renovables según la actividad de la sesión; puede invalidarse antes.',
              ],
            ],
          },
        },
        {
          id: 'preferencias',
          title: '3. Preferencias guardadas en este dispositivo',
          paragraphs: [
            'Estas preferencias utilizan almacenamiento local del navegador. No tienen un vencimiento automático programado: permanecen hasta que las cambias, las eliminas o el navegador las borra. Borrarlas no elimina tu cuenta ni tus registros financieros en el servidor.',
          ],
          table: {
            caption: 'Claves de almacenamiento local de Finarez',
            columns: ['Clave', 'Qué recuerda', 'Conservación'],
            rows: [
              [
                'finanz.theme',
                'Tema claro, oscuro u OLED elegido.',
                'Hasta cambiarlo o borrar el almacenamiento.',
              ],
              [
                'finanz.theme.dark',
                'Variante oscura preferida al alternar el tema.',
                'Hasta cambiarla o borrar el almacenamiento.',
              ],
              [
                'finanz.language',
                'Idioma de la interfaz; actualmente español.',
                'Hasta cambiarlo o borrar el almacenamiento.',
              ],
              [
                'finanz.showInvestments',
                'Si deseas mostrar la sección de inversiones.',
                'Hasta cambiarlo o borrar el almacenamiento.',
              ],
            ],
          },
        },
        {
          id: 'publicidad',
          title: '4. Publicidad y tecnologías opcionales previstas',
          paragraphs: [
            'El plan gratuito previsto tendrá publicidad y los planes premium no cargarán anuncios. No se ha seleccionado una red publicitaria ni se ha integrado su tecnología. Tampoco se ha incorporado una herramienta de analítica de terceros.',
            'Antes de activar tecnologías opcionales se identificarán sus proveedores, finalidades, duración, destinatarios y tratamiento internacional. Cuando corresponda autorización, permanecerán desactivadas hasta que elijas; podrás aceptar, rechazar o personalizar y cambiar la decisión después.',
            'Como aún no se utilizan tecnologías publicitarias, por ahora no hay preferencias de anuncios que configurar. Los anuncios no recibirán los registros financieros como datos de segmentación; el uso publicitario para adolescentes requerirá revisión adicional.',
          ],
        },
        {
          id: 'controles',
          title: '5. Cómo controlar lo que se guarda',
          paragraphs: [
            'Puedes cambiar el tema desde el selector de apariencia y mostrar u ocultar la sección de inversiones desde Ajustes. Cerrar sesión retira el acceso de la sesión actual. También puedes bloquear o borrar cookies y datos del sitio desde la configuración de tu navegador.',
            'Si eliminas o bloqueas la cookie de autenticación, tendrás que volver a identificarte y algunas funciones de la cuenta pueden dejar de funcionar. Si eliminas el almacenamiento local, se restablecerán las preferencias de ese dispositivo; esto no borra la información de tu cuenta.',
            'Cerrar sesión no borra por sí solo las preferencias locales. Para eliminar registros del servidor se necesitará el procedimiento de eliminación de cuenta, que aún está pendiente de habilitar en Ajustes.',
          ],
        },
        {
          id: 'actualizaciones',
          title: '6. Actualizaciones y contacto',
          paragraphs: [
            'Este inventario corresponde a la configuración de la aplicación revisada en la fecha del documento. Antes de abrir el servicio al público se verificará también el entorno alojado, se incorporarán las tecnologías de los proveedores realmente habilitados y se fijará la fecha de vigencia.',
            'Para consultas, escribe a finarez.contact@gmail.com. La política de privacidad explica las finalidades generales, tus derechos y el procedimiento previsto para ejercerlos.',
          ],
        },
      ],
    },
  } satisfies Record<string, LegalDocument>,
};

import type { EmailMessage } from '../../../platform/email/email';

// Spanish only for now; the user's language preference will pick the template later.

export function verificationEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Confirma tu correo en Finarez',
    text: [
      'Hola:',
      '',
      'Para activar tu cuenta de Finarez, abre este enlace:',
      url,
      '',
      'El enlace vence en 24 horas. Si no creaste una cuenta en Finarez, ignora este correo.',
    ].join('\n'),
  };
}

export function resetPasswordEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Elige una contraseña nueva para Finarez',
    text: [
      'Hola:',
      '',
      'Para elegir una contraseña nueva, abre este enlace:',
      url,
      '',
      'El enlace vence en 1 hora. Si no lo pediste, ignora este correo: tu contraseña no cambia.',
    ].join('\n'),
  };
}

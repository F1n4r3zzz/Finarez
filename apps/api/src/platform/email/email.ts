export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Local development only: prints the email, including its links, to the terminal. */
export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.info(`\n[email] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
  }
}

export class EmailBudgetExceededError extends Error {
  constructor() {
    super('Daily email budget exhausted');
    this.name = 'EmailBudgetExceededError';
  }
}

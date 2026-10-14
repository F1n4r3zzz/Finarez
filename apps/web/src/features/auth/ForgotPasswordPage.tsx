import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type ActionFunctionArgs, Form, useActionData, useNavigation } from 'react-router';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { TextField } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { TextLink } from '../../components/TextLink';
import { describeFailure, type Failure } from '../../lib/failure';
import { AuthCard } from './AuthLayout';
import { requestPasswordReset } from './auth-api';
import { useFieldError, useFocusFirstInvalid } from './feedback';
import { checkEmail, type FieldErrors, fieldErrors, readField } from './form';

interface ForgotResult {
  fieldErrors?: FieldErrors;
  failure?: Failure;
  sentTo?: string;
}

export async function forgotPasswordAction({ request }: ActionFunctionArgs): Promise<ForgotResult> {
  const email = readField(await request.formData(), 'email').trim();
  const invalid = fieldErrors({ email: checkEmail(email) });
  if (invalid) return { fieldErrors: invalid };
  try {
    await requestPasswordReset(email);
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  // The same answer for unknown addresses (no account discovery).
  return { sentTo: email };
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const result = useActionData<ForgotResult>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const fieldError = useFieldError();
  useFocusFirstInvalid(formRef, result?.fieldErrors);
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const back = <TextLink to="/sign-in">{t('auth.forgot.back')}</TextLink>;

  if (result?.sentTo) {
    return (
      <AuthCard title={t('auth.checkEmail.title')}>
        <div className="grid gap-5">
          <Notice tone="success">{t('auth.forgot.sent', { email: result.sentTo })}</Notice>
          <p>{back}</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('auth.forgot.title')}
      description={t('auth.forgot.description')}
      footer={back}
    >
      <Form method="post" noValidate ref={formRef} className="grid gap-5">
        <TextField
          label={t('auth.email')}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          error={fieldError(result?.fieldErrors?.email)}
        />
        <FailureNotice failure={result?.failure} />
        <Button type="submit" pending={submitting} wide>
          {t(submitting ? 'auth.forgot.submitting' : 'auth.forgot.submit')}
        </Button>
      </Form>
    </AuthCard>
  );
}

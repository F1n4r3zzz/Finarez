import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Form,
  useActionData,
  useFetcher,
  useNavigation,
} from 'react-router';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { PasswordField, TextField } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { TextLink } from '../../components/TextLink';
import { isApiFailure } from '../../lib/api';
import { describeFailure, type Failure } from '../../lib/failure';
import { AuthCard } from './AuthLayout';
import { resendVerification, signUp } from './auth-api';
import { useFieldError, useFocusFirstInvalid } from './feedback';
import {
  checkEmail,
  checkNewPassword,
  type FieldErrors,
  fieldErrors,
  PASSWORD_LIMITS,
  readField,
} from './form';

interface SignUpResult {
  fieldErrors?: FieldErrors;
  failure?: Failure;
  /** Signed up: the address the confirmation link went to. */
  sentTo?: string;
  resent?: boolean;
}

export async function signUpAction({ request }: ActionFunctionArgs): Promise<SignUpResult> {
  const form = await request.formData();
  const email = readField(form, 'email').trim();

  if (readField(form, 'intent') === 'resend') {
    try {
      await resendVerification(email);
      return { sentTo: email, resent: true };
    } catch (error) {
      return { sentTo: email, failure: describeFailure(error) };
    }
  }

  const password = readField(form, 'password');
  const invalid = fieldErrors({ email: checkEmail(email), password: checkNewPassword(password) });
  if (invalid) return { fieldErrors: invalid };

  try {
    await signUp(email, password);
  } catch (error) {
    if (isApiFailure(error, 400) && error.code === 'INVALID_EMAIL') {
      return { fieldErrors: { email: 'emailInvalid' } };
    }
    return { failure: describeFailure(error) };
  }
  // The same answer whether or not the address already has an account (no account discovery).
  return { sentTo: email };
}

function CheckEmail({ email }: { email: string }) {
  const { t } = useTranslation();
  const resend = useFetcher<SignUpResult>();
  return (
    <AuthCard title={t('auth.checkEmail.title')}>
      <div className="grid gap-5">
        <p>{t('auth.checkEmail.body', { email })}</p>
        <p className="text-muted text-sm">{t('auth.checkEmail.existing')}</p>
        {resend.data?.resent && <Notice tone="success">{t('auth.signIn.resent')}</Notice>}
        <FailureNotice failure={resend.data?.failure} />
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            pending={resend.state !== 'idle'}
            onClick={() => resend.submit({ intent: 'resend', email }, { method: 'post' })}
          >
            {t(resend.state === 'idle' ? 'auth.checkEmail.resend' : 'auth.signIn.resending')}
          </Button>
        </div>
        <p>
          <TextLink to="/sign-in">{t('auth.checkEmail.goToSignIn')}</TextLink>
        </p>
      </div>
    </AuthCard>
  );
}

export function SignUpPage() {
  const { t } = useTranslation();
  const result = useActionData<SignUpResult>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const fieldError = useFieldError();
  useFocusFirstInvalid(formRef, result?.fieldErrors);
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';

  if (result?.sentTo) return <CheckEmail email={result.sentTo} />;

  return (
    <AuthCard
      title={t('auth.signUp.title')}
      description={t('auth.signUp.description')}
      footer={
        <>
          {t('auth.signUp.haveAccount')}{' '}
          <TextLink to="/sign-in">{t('auth.signUp.signIn')}</TextLink>
        </>
      }
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
        <PasswordField
          label={t('auth.password')}
          name="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint', PASSWORD_LIMITS)}
          error={fieldError(result?.fieldErrors?.password)}
        />
        <FailureNotice failure={result?.failure} />
        <Button type="submit" pending={submitting} wide>
          {t(submitting ? 'auth.signUp.submitting' : 'auth.signUp.submit')}
        </Button>
      </Form>
    </AuthCard>
  );
}

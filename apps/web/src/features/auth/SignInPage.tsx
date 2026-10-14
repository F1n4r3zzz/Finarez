import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Form,
  redirect,
  useActionData,
  useFetcher,
  useNavigation,
  useSearchParams,
} from 'react-router';
import { nextPath } from '../../app/account';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { PasswordField, TextField } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { TextLink } from '../../components/TextLink';
import { isApiFailure } from '../../lib/api';
import { describeFailure, type Failure } from '../../lib/failure';
import { AuthCard } from './AuthLayout';
import { resendVerification, signIn } from './auth-api';
import { useFieldError, useFocusFirstInvalid } from './feedback';
import { checkEmail, checkPassword, type FieldErrors, fieldErrors, readField } from './form';

interface SignInResult {
  fieldErrors?: FieldErrors;
  failure?: Failure;
  /** The address that still needs confirming, to offer a new link. */
  unverified?: string;
}

interface ResendResult {
  resent?: boolean;
  failure?: Failure;
}

export async function signInAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = readField(form, 'email').trim();

  if (readField(form, 'intent') === 'resend') {
    try {
      await resendVerification(email);
      return { resent: true } satisfies ResendResult;
    } catch (error) {
      return { failure: describeFailure(error) } satisfies ResendResult;
    }
  }

  const password = readField(form, 'password');
  const invalid = fieldErrors({ email: checkEmail(email), password: checkPassword(password) });
  if (invalid) return { fieldErrors: invalid } satisfies SignInResult;

  try {
    await signIn(email, password);
  } catch (error) {
    if (isApiFailure(error, 403) && error.code === 'EMAIL_NOT_VERIFIED') {
      return { unverified: email } satisfies SignInResult;
    }
    return { failure: describeFailure(error) } satisfies SignInResult;
  }
  return redirect(nextPath(request));
}

/** Why the user landed here: a confirmed email, a dead link or a new password. */
function ArrivalNotice() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  if (params.has('error')) return <Notice tone="info">{t('auth.signIn.linkInvalid')}</Notice>;
  if (params.has('verified')) return <Notice tone="success">{t('auth.signIn.verified')}</Notice>;
  if (params.has('reset')) {
    return <Notice tone="success">{t('auth.signIn.passwordChanged')}</Notice>;
  }
  return null;
}

function Unverified({ email }: { email: string }) {
  const { t } = useTranslation();
  const resend = useFetcher<ResendResult>();
  if (resend.data?.resent) return <Notice tone="success">{t('auth.signIn.resent')}</Notice>;
  // A button, not a form: this sits inside the sign-in form, and forms cannot nest.
  return (
    <>
      <Notice tone="info">
        <p>{t('auth.signIn.unverified')}</p>
        <div>
          <Button
            variant="secondary"
            pending={resend.state !== 'idle'}
            onClick={() => resend.submit({ intent: 'resend', email }, { method: 'post' })}
          >
            {t(resend.state === 'idle' ? 'auth.signIn.resend' : 'auth.signIn.resending')}
          </Button>
        </div>
      </Notice>
      <FailureNotice failure={resend.data?.failure} />
    </>
  );
}

export function SignInPage() {
  const { t } = useTranslation();
  const result = useActionData<SignInResult>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const fieldError = useFieldError();
  useFocusFirstInvalid(formRef, result?.fieldErrors);
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';

  return (
    <AuthCard
      title={t('auth.signIn.title')}
      footer={
        <>
          {t('auth.signIn.noAccount')}{' '}
          <TextLink to="/sign-up">{t('auth.signIn.createAccount')}</TextLink>
        </>
      }
    >
      <div className="grid gap-5">
        <ArrivalNotice />
        <Form method="post" noValidate ref={formRef} className="grid gap-5">
          <TextField
            label={t('auth.email')}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            spellCheck={false}
            error={fieldError(result?.fieldErrors?.email)}
          />
          <PasswordField
            label={t('auth.password')}
            name="password"
            autoComplete="current-password"
            error={fieldError(result?.fieldErrors?.password)}
            labelAside={<TextLink to="/forgot-password">{t('auth.signIn.forgot')}</TextLink>}
          />
          {result?.unverified && <Unverified key={result.unverified} email={result.unverified} />}
          <FailureNotice failure={result?.failure} />
          <Button type="submit" pending={submitting} wide>
            {t(submitting ? 'auth.signIn.submitting' : 'auth.signIn.submit')}
          </Button>
        </Form>
      </div>
    </AuthCard>
  );
}

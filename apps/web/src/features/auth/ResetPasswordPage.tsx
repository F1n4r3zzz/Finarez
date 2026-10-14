import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { PasswordField } from '../../components/Field';
import { TextLink } from '../../components/TextLink';
import { isApiFailure } from '../../lib/api';
import { describeFailure, type Failure } from '../../lib/failure';
import { AuthCard } from './AuthLayout';
import { resetPassword } from './auth-api';
import { useFieldError, useFocusFirstInvalid } from './feedback';
import {
  checkNewPassword,
  type FieldErrors,
  fieldErrors,
  PASSWORD_LIMITS,
  readField,
} from './form';

interface ResetResult {
  fieldErrors?: FieldErrors;
  failure?: Failure;
  /** The link expired or was already used. */
  invalidLink?: boolean;
}

/** The emailed link arrives here with `?token=`, or with `?error=` when it no longer works. */
export function resetPasswordLoader({ request }: LoaderFunctionArgs): { token: string | null } {
  const params = new URL(request.url).searchParams;
  return { token: params.has('error') ? null : params.get('token') };
}

export async function resetPasswordAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const token = readField(form, 'token');
  const password = readField(form, 'password');
  const invalid = fieldErrors({ password: checkNewPassword(password) });
  if (invalid) return { fieldErrors: invalid } satisfies ResetResult;
  try {
    await resetPassword(token, password);
  } catch (error) {
    if (isApiFailure(error, 400) && error.code === 'INVALID_TOKEN') {
      return { invalidLink: true } satisfies ResetResult;
    }
    return { failure: describeFailure(error) } satisfies ResetResult;
  }
  // Every session ends with a password reset, this one included.
  return redirect('/sign-in?reset=1');
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token } = useLoaderData<typeof resetPasswordLoader>();
  const result = useActionData<ResetResult>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const fieldError = useFieldError();
  useFocusFirstInvalid(formRef, result?.fieldErrors);
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';

  if (!token || result?.invalidLink) {
    return (
      <AuthCard title={t('auth.reset.invalidTitle')} description={t('auth.reset.invalidBody')}>
        <TextLink to="/forgot-password">{t('auth.reset.requestNew')}</TextLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.reset.title')} description={t('auth.reset.description')}>
      <Form method="post" noValidate ref={formRef} className="grid gap-5">
        <input type="hidden" name="token" value={token} />
        <PasswordField
          label={t('auth.newPassword')}
          name="password"
          autoComplete="new-password"
          hint={t('auth.passwordHint', PASSWORD_LIMITS)}
          error={fieldError(result?.fieldErrors?.password)}
        />
        <FailureNotice failure={result?.failure} />
        <Button type="submit" pending={submitting} wide>
          {t(submitting ? 'auth.reset.submitting' : 'auth.reset.submit')}
        </Button>
      </Form>
    </AuthCard>
  );
}

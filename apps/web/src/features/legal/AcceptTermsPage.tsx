import { CONSENT_KINDS, CONSENTS, type ConsentStatus } from '@finanz/contracts';
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
import { loadAccount, nextPath, signInPath } from '../../app/account';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { api } from '../../lib/api';
import { describeFailure, type Failure } from '../../lib/failure';
import { AuthCard } from '../auth/AuthLayout';
import { allChecked, ConsentChecks } from './ConsentChecks';

/** Only for signed-in users with something to accept; everyone else goes on. */
export async function acceptTermsLoader({ request }: LoaderFunctionArgs) {
  const { user, consents } = await loadAccount();
  if (!user) throw redirect(signInPath(request));
  if (!consents?.pending.length) throw redirect(nextPath(request));
  return { pending: consents.pending };
}

interface AcceptResult {
  missing?: boolean;
  failure?: Failure;
}

export async function acceptTermsAction({
  request,
}: ActionFunctionArgs): Promise<AcceptResult | Response> {
  const form = await request.formData();
  const { pending } = await api<ConsentStatus>('GET', '/me/consents');
  if (!allChecked(form, pending)) return { missing: true };
  try {
    await api('POST', '/me/consents', CONSENTS);
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return redirect(nextPath(request));
}

/**
 * Before entering the app: a new account made before these boxes existed, or terms that changed
 * since the user last accepted them.
 */
export function AcceptTermsPage() {
  const { t } = useTranslation();
  const { pending } = useLoaderData<typeof acceptTermsLoader>();
  const result = useActionData<AcceptResult>();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formAction !== '/sign-out';
  const everything = pending.length === CONSENT_KINDS.length;

  return (
    <AuthCard
      title={t(everything ? 'legal.accept.firstTitle' : 'legal.accept.updateTitle')}
      description={t(everything ? 'legal.accept.firstBody' : 'legal.accept.updateBody')}
    >
      <div className="grid gap-5">
        <Form method="post" noValidate className="grid gap-5">
          <ConsentChecks kinds={pending} missing={result?.missing} />
          <FailureNotice failure={result?.failure} />
          <Button type="submit" pending={submitting} wide>
            {t(submitting ? 'legal.accept.submitting' : 'legal.accept.submit')}
          </Button>
        </Form>
        <Form method="post" action="/sign-out">
          <Button type="submit" variant="secondary" wide>
            {t('legal.accept.signOut')}
          </Button>
        </Form>
      </div>
    </AuthCard>
  );
}

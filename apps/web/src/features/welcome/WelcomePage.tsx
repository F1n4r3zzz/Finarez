import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ActionFunctionArgs,
  Form,
  redirect,
  useActionData,
  useNavigation,
} from 'react-router';
import { nextPath, savePreferences, signInPath } from '../../app/account';
import { Button } from '../../components/Button';
import { FailureNotice } from '../../components/FailureNotice';
import { isApiFailure } from '../../lib/api';
import { describeFailure, type Failure } from '../../lib/failure';
import { AuthCard } from '../auth/AuthLayout';
import { preferencesFromForm, suggestedPreferences } from '../preferences/defaults';
import { PreferencesFields } from '../preferences/PreferencesFields';

export async function welcomeAction({ request }: ActionFunctionArgs) {
  const preferences = preferencesFromForm(await request.formData(), 'es');
  if (!preferences) return { failure: { key: 'unexpected' } satisfies Failure };
  try {
    await savePreferences(preferences);
  } catch (error) {
    if (isApiFailure(error, 401)) return redirect(signInPath(request));
    return { failure: describeFailure(error) };
  }
  return redirect(nextPath(request));
}

/** First sign-in: confirm the main currency and time zone before entering the app. */
export function WelcomePage() {
  const { t } = useTranslation();
  const result = useActionData<{ failure?: Failure }>();
  const navigation = useNavigation();
  const [initial] = useState(suggestedPreferences);
  const submitting = navigation.state !== 'idle' && navigation.formMethod === 'POST';

  return (
    <AuthCard title={t('welcome.title')} description={t('welcome.description')}>
      <Form method="post" className="grid gap-5">
        <PreferencesFields initial={initial} />
        <FailureNotice failure={result?.failure} />
        <Button type="submit" pending={submitting} wide>
          {t(submitting ? 'welcome.submitting' : 'welcome.submit')}
        </Button>
      </Form>
    </AuthCard>
  );
}

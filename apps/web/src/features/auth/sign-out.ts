import { redirect } from 'react-router';
import { describeFailure } from '../../lib/failure';
import { signOut } from './auth-api';

/** Ends the session, then goes to sign-in. Posted to from anywhere in the app. */
export async function signOutAction() {
  try {
    await signOut();
  } catch (error) {
    return { failure: describeFailure(error) };
  }
  return redirect('/sign-in');
}

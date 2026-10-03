import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { env } from '@/config/env';

export const isGoogleSignInEnabled = Boolean(env.googleWebClientId);

let configured = false;

function ensureConfigured() {
  if (configured) return;
  // The web client ID makes Google issue ID tokens the backend can verify
  GoogleSignin.configure({ webClientId: env.googleWebClientId });
  configured = true;
}

/** Opens the Google account picker. Resolves null if the user backs out. */
export async function getGoogleIdToken(): Promise<string | null> {
  ensureConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;

    if (!response.data.idToken) {
      throw new Error('Google did not return an ID token. Check EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.');
    }
    return response.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) {
        return null;
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play services is unavailable on this device. Sign in with email instead.');
      }
    }
    throw error;
  }
}

/** Forget the chosen Google account so the picker shows next time */
export async function signOutOfGoogle() {
  if (!isGoogleSignInEnabled) return;
  ensureConfigured();
  await GoogleSignin.signOut();
}

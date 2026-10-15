import * as Sentry from '@sentry/react-native';

// ListenUp's Sentry project. A DSN only lets the app send reports, so it ships in every build;
// EXPO_PUBLIC_SENTRY_DSN can point a build elsewhere, or turn reports off when set empty
const LISTENUP_DSN = 'https://419fe1f6ecd75554de7c537d6b1404cd@o4512261058592768.ingest.us.sentry.io/4512261060493312';
const dsn = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? LISTENUP_DSN) || undefined;

/** Crashes are sent from release builds that have a Sentry DSN; development builds keep them in the console */
export const crashReportsEnabled = !!dsn && !__DEV__;

// Links can carry secrets in their query (signed storage links, podcast tokens), so only the path is kept
const withoutQuery = (url: unknown) => (typeof url === 'string' ? url.split('?')[0] : url);

/**
 * Crash reports (Sentry): JavaScript errors and native crashes, with the steps
 * leading up to them and a masked screen recording of the last moments. No
 * account details are sent: no email, name or IP address.
 * Started when this file is first imported, which index.ts does before anything else.
 */
Sentry.init({
  dsn,
  enabled: crashReportsEnabled,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || 'production',
  sendDefaultPii: false,
  // Crashes only, no performance tracing
  tracesSampleRate: 0,
  // The moments before a crash, as a recording of the screen with every text, picture and icon
  // hidden (a document's words never leave the phone this way). Nothing is sent without a crash
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration({ maskAllText: true, maskAllImages: true, maskAllVectors: true })],
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.data?.url) breadcrumb.data.url = withoutQuery(breadcrumb.data.url);
    return breadcrumb;
  },
});

/** For errors the app catches itself (a screen that failed to draw) */
export function reportError(error: unknown) {
  Sentry.captureException(error);
}

export const withCrashReports = Sentry.wrap;

# Payments setup (Google Play + RevenueCat)

The code is ready; these steps are done once in the Play Console and RevenueCat.
Until they're done, the Plans page shows "Available soon".

## 1. Google Play Console

1. Upload any build of the app (internal testing is enough). Play only lets you
   create products after it has seen a build with the billing permission.
2. **Monetize → Subscriptions**: create two subscriptions, each with two
   auto-renewing base plans and **no free-trial offers**:

   | Subscription | Base plan | US price | Bangladesh |
   |---|---|---|---|
   | `plus` | `monthly` | $3.99 | ৳149 |
   | `plus` | `yearly` | $39.99 | ৳1,490 |
   | `pro` | `monthly` | $8.99 | ৳399 |
   | `pro` | `yearly` | $89.99 | ৳3,990 |

   Let Play suggest the other countries' prices from the US price, then lower
   India, Pakistan, Indonesia and the other reduced-allowance countries
   (`REDUCED_ALLOWANCE_COUNTRIES` in `src/modules/plans/plan-catalog.ts`) by hand.
3. **Monetize → In-app products**: `studio_30` ($2.99, ৳199) and `studio_120`
   ($9.99, ৳699).
4. **Settings → License testing**: add the Google accounts you'll test with.
   Their purchases are free test purchases.

## 2. RevenueCat

1. Create a project and an Android app for `dev.ratul.tts`. Upload a Google
   Play service-account JSON as RevenueCat's guide describes, and turn on
   Google's real-time developer notifications for faster renewals and cancellations.
2. **Products**: import the four subscription base plans and both Studio packs.
   Mark `studio_30` and `studio_120` as **consumable**.
3. **Entitlements**: `plus` gets `plus:monthly` and `plus:yearly`; `pro` gets
   `pro:monthly` and `pro:yearly`. Studio packs get no entitlement.
4. **Offerings**: in the current offering, add four custom packages named
   exactly `plus_monthly`, `plus_yearly`, `pro_monthly` and `pro_yearly`, each
   pointing at the matching base plan.
5. **Integrations → Webhooks**: URL `https://<your API>/api/v1/billing/webhook`,
   Authorization header set to a long random string.

## 3. Keys

| Where | Variable | Value |
|---|---|---|
| Backend (Render) | `REVENUECAT_SECRET_KEY` | RevenueCat secret API key (`sk_…`) |
| Backend (Render) | `REVENUECAT_WEBHOOK_SECRET` | The webhook's Authorization value |
| `frontend/.env` | `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` | RevenueCat public Google key (`goog_…`) |

Then make a new build of the app, since it adds native code.

## 4. Test

Sign in to the app with a license-tester account and buy Plus monthly. Within a
few seconds the Plans page should say you're on Plus, and Studio should show its
minutes. Cancel in Google Play: the plan stays until the period ends, then
returns to Free (test subscriptions renew every few minutes, so this is quick).

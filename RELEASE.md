# ListenUp release checklist (Android, v1.0.0)

Everything needed to put ListenUp on Google Play, in order.

- **Server deployment details:** [backend/DEPLOY.md](backend/DEPLOY.md)
- **Payment setup:** [backend/BILLING.md](backend/BILLING.md)
- **Progress:** [ROADMAP.md](ROADMAP.md)

Prepared 5 October 2026.

---

## 1. Verified so far

| Check | Result |
|---|---|
| Server typecheck and production build (`pnpm build`) | ✅ Passes |
| Server Docker image | ✅ Builds, starts, `/api/v1/health` answers `ok`, the podcast cover is served |
| Automated server checks | ✅ 137 passed across billing, languages, growth, offline, ads, invites, podcast, emotions and login refresh |
| Database | ⚠️ `20261007150000_creator_studio` (creator studio) is **not applied** yet; the earlier migrations are |
| App typecheck and lint | ✅ Clean |
| `expo-doctor` | ✅ 21 of 21 checks |
| Android release bundle | ✅ Builds (11 MB) |
| Secrets | ✅ The OpenRouter key isn't in the app bundle, and `.env` files aren't committed |
| App icons and splash | ✅ Real ListenUp icons; Expo's placeholders replaced |
| EAS build profiles | ✅ `eas.json`: development, preview (APK) and production (App Bundle, automatic build numbers) |

**Not yet checked on a phone:**
- the new Voices page
- the emotions redesign, by ear
- selection line spacing

The test phone was signed out and the OpenRouter key was out of credit. Do these in step 5.

---

## 2. Must do before release

### Accounts and keys

- [ ] **OpenRouter:** raise the API key's spending limit (it was $1, with $0.09 left), and keep credit topped up. Below $0.50 available, every HD voice falls back to the phone voice.
- [ ] **Expo / EAS:**
  1. In `frontend/`, run `npx eas-cli@latest login`, then `npx eas-cli@latest init`. This links the project and adds `extra.eas.projectId` to `app.json`; commit that change.
  2. Create the production environment variables:
     ```bash
     npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_API_URL --value https://<your-api>/api/v1 --visibility plaintext
     npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web client id> --visibility plaintext
     npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY --value <goog_...> --visibility plaintext
     npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_ADMOB_BANNER_ID --value <ca-app-pub-.../...> --visibility plaintext
     npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_ADMOB_REWARDED_ID --value <ca-app-pub-.../...> --visibility plaintext
     ```
- [ ] **AdMob:**
  1. Create the app and two ad units (a banner and a rewarded ad).
  2. Replace Google's **test** app ID in `frontend/app.json` (`react-native-google-mobile-ads` → `androidAppId`). Without this, the release build shows only test ads and earns nothing.
  3. Turn on server-side verification for the rewarded unit, then set `ADMOB_SSV=true` on the server.
- [ ] **Google sign-in:** add the release signing key's SHA-1 to the Android OAuth client in Google Cloud. EAS shows it under Credentials; once the app is on Play, also add the SHA-1 of Play's app signing key. Without this, "Continue with Google" fails in release builds.
- [ ] **Google Play Console** ($25 once):
  1. Create the app (`dev.ratul.tts`).
  2. Create the subscriptions `plus` and `pro` (base plans `monthly` and `yearly`) and the one-time products `studio_30` and `studio_120`. Set prices per country, taka included (see [BUSINESS.md](BUSINESS.md)).
  3. **Enroll in the 15% service-fee tier,** or one-time products pay 30%.
- [ ] **RevenueCat:** follow [BILLING.md](backend/BILLING.md), then buy a test subscription as a license tester.

### Server (Render)

- [ ] **Deploy the current code.** Supabase already has the new schema, and an older server fails on voice settings.
- [ ] **Set the environment** (full list in [DEPLOY.md](backend/DEPLOY.md)):
  - `NODE_ENV=production`
  - `RUN_WORKERS=true`
  - `PUBLIC_URL`: the public API address
  - the JWT secrets, SMTP and `OPENROUTER_API_KEY`
  - storage: `S3_*` for R2
  - `GOOGLE_CLIENT_ID`
  - `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_SECRET`
  - `FREE_DAILY_SPEND_CAP_USD=2` and `DAILY_SPEND_CAP_USD=25`
  - `ANDROID_PACKAGE=dev.ratul.tts`
  - optionally `KOKORO_URL`
  - **`GEMINI_API_KEY`** (recommended, it's what makes exports cheap): a key from [Google AI Studio](https://aistudio.google.com/apikey) on a project with billing turned on (the paid tier allows commercial use and doesn't train on your data). Expressive voices then skip OpenRouter's 5.5%, and MP3 exports, offline downloads and podcast episodes use Google's half-price flex tier when it's available. Keep `OPENROUTER_API_KEY` too: it's the fallback, and it runs OCR, translation and the AI director.
- [ ] **Same region for the API and the database** (load test, 7 Oct: Singapore ↔ Tokyo cut capacity about 10×). See [LOAD-TEST.md](LOAD-TEST.md#4-what-to-do-next-most-important-first).
- [ ] `DATABASE_POOL_MAX=10`, and watch memory on Render Starter (it peaked at 472 of 512 MB in the load test).
- [ ] **Health check path:** `/api/v1/health`.
- [ ] **On-device voice package:** build it with `tools/kokoro-model/build.py` and upload it with `pnpm kokoro:upload` (see [tools/kokoro-model/README.md](tools/kokoro-model/README.md)). Until it's uploaded, the app says Natural voices for the phone aren't ready, and they come from the server.
- [ ] **Licence check:** sherpa-onnx (on-device voices) includes espeak-ng, which is GPL-3.0.
- [ ] **Kokoro on a server (optional):** for phones that can't run it. If you host your own, run `ghcr.io/remsky/kokoro-fastapi-cpu:v0.9.0` with 4–8 GB of RAM and set `KOKORO_URL`. Without it, those phones use OpenRouter, which is slower and less reliable but works.

### Play listing and policy

- [ ] **A public privacy policy URL.** Play requires one on the web, not only inside the app. Publish the text from `frontend/src/features/legal/content.ts` on a simple page (your domain, or GitHub Pages).
- [ ] **Data safety form.** The app collects:
  - email and name (account)
  - documents the user imports
  - the advertising ID (AdMob, Free plan)
  - purchase history (RevenueCat)

  Data is encrypted in transit, and users can delete their account inside the app (30-day grace).
- [ ] **Ads declaration:** "Contains ads". Content rating questionnaire. Target audience: not for children (because of ads and AI).
- [ ] **Store listing:** title, short and full description, icon (512 px, from `frontend/assets/images/icon.png`), feature graphic (1024×500), and at least 2 phone screenshots. Phase 7, the launch kit, is on hold, so a minimal listing is enough to start.
- [ ] **Legal review** of the Terms and Privacy pages, plus a commercial-use sentence for exported audio.
- [ ] **Closed test:** a new personal developer account needs **12 testers opted in for 14 days** before production access.

---

## 3. Build and submit

```bash
cd frontend
npx eas-cli@latest build -p android --profile production      # an .aab with the next build number
npx eas-cli@latest submit -p android --profile production     # to the internal track, as a draft
```

For testers who install directly: `npx eas-cli@latest build -p android --profile preview` makes an APK.

Then in Play Console, promote **Internal → Closed testing**. After 14 days with 12 testers, apply for production.

---

## 4. Server deploy order

1. Set the environment variables on Render.
2. Run `pnpm db:deploy` (applies `20261007150000_creator_studio`), then deploy. The API paths changed on 7 October, so deploy the backend and ship the new app build together; older app builds can't talk to the new backend.
3. Check that `https://<api>/api/v1/health` returns `{"status":"ok"}`.
4. Point RevenueCat's webhook at `https://<api>/api/v1/billing/webhook`.

---

## 5. Smoke test on a real phone (release build)

- [ ] Sign up with email, and with Google.
- [ ] Import a PDF, a Bijoy-font Bangla PDF, a web article and a photo.
- [ ] Play with a Phone voice, a Natural voice (English) and an Expressive voice (Bangla).
- [ ] Mood bar: tap 😢 on a line, and hear it change.
- [ ] Hold a line in the transcript and give it a feeling; try paint mode and "say it in your own words".
- [ ] Make it expressive (Plus): pick a style and hear the difference.
- [ ] Voices page: Studio → Voices tiles → preview and choose a voice.
- [ ] Buy Plus as a license tester; check the limits change, then restore purchases.
- [ ] Offline download, then play in airplane mode.
- [ ] Private podcast: add a document, then subscribe in a podcast app.
- [ ] Free plan: the shelf banner and a rewarded ad.
- [ ] Share a link into ListenUp from Chrome.
- [ ] Close the account, then sign in again within 30 days.

---

## 6. Rolling back

- **App:** halt the rollout in Play Console, or push a fixed build. Build numbers count up automatically.
- **Server:** redeploy the previous commit on Render. The database changes so far only add columns, so older code keeps working. The exception: the old `voiceEnId`/`voiceBnId` columns are gone, so a server from before 4 October would fail on voice settings.

---

## 7. Known issues at release

- **Gemini's safety filter** refuses some violent passages (some horror). Those parts play in the phone voice.
- **Gemini voice prices double on 1 January 2027.** Margins are planned for it ([MARGIN.md](MARGIN.md)); watch the real numbers.
- **Bangladesh payments:** Google Play doesn't take bKash or Nagad. Explain Play gift cards in your marketing.
- **Translation allowance:** the same in every country. The fix is recommended before 2027 ([MARGIN.md](MARGIN.md), fix 1).

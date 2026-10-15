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
| Database | 🟡 Every migration is applied to Supabase except `20261015120000_security_fixes` and `20261015180000_free_user_share` (15 October): run `pnpm db:deploy` before starting or deploying this backend |
| Security reviews (15 October) | ✅ All sixteen findings of both reviews fixed. First: link import, EPUB/DOCX unpacking, free-minute farming, sign-up passwords, the OpenRouter key's copies, moderation, tokens after logout, account lookups and login limits. Second: PDFs in a watched process, speaker voices only in their translation, a daily Free share per account and per-account limits, Google linking by exact address, shared file names, lockout per email and IP, the Vertex key and podcast links kept out of logs. Checked on a throwaway database; not yet on a phone |
| Env on Render | Optional `FREE_USER_DAILY_SPEND_USD` (default 0.25). `REVENUECAT_SECRET_KEY` goes in `backend/.env` and on Render only, never in `.env.example` |
| Home-screen widget (9 October) | ✅ Plugin adds the widget to the manifest; its layout converts cleanly in every state and both themes. Not yet seen on a phone (needs a new build) |
| Margin fixes (9 October) | ✅ End-to-end run: translation by region, the time zone, ads and invites by region, Free OCR and digest caps, text AI in the daily caps |
| Explore Community (8 October) | ✅ An end-to-end run against a throwaway database: publishing, the check job, shared audio for listeners, hearts and contest rules, clips, reports, review, blocks, prizes, unpublishing. Not yet seen on a phone |
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
- [ ] **Sentry (crash reports):** the project exists, and its DSN, organization and project are already in the app (`src/lib/crash-reports.ts`, `app.json`). Left to do:
  1. In the Sentry project's settings → Security & Privacy, turn on **Prevent storing of IP addresses**.
  2. Make an auth token (Settings → Auth Tokens, an organization token) and add it to EAS as a secret:
     ```bash
     npx eas-cli@latest env:create --environment production --name SENTRY_AUTH_TOKEN --value <sntrys_...> --visibility secret
     ```
     Release builds upload their source maps with it, so crashes show the real code. **Without the token a release build fails at the upload**: for builds without it (the `preview` APK, or a local release build), set `SENTRY_DISABLE_AUTO_UPLOAD=true` in that environment or shell. Set `EXPO_PUBLIC_SENTRY_ENVIRONMENT=preview` on the `preview` environment to tell testers' crashes apart. Development builds never send reports.
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
  - **`GEMINI_API_KEY`** (recommended, it's what makes exports cheap): a key from [Google AI Studio](https://aistudio.google.com/apikey) on a project with billing turned on (the paid tier allows commercial use and doesn't train on your data). Expressive voices then skip OpenRouter's 5.5%, and MP3 exports, offline downloads and podcast episodes use Google's half-price flex tier when it's available. Keep `OPENROUTER_API_KEY` too: it's the fallback, and it runs OCR, translation and the AI director. **Your own voice (Pro) only works with this key**; without it the app hides the feature.
- [ ] **Your own voice:** make one on a real phone before release (it has never been tried against Google), listen to it in Bangla, and compare the Bangla consent sentence in `backend/src/modules/own-voice/own-voice.scripts.ts` with [Google's page](https://ai.google.dev/gemini-api/docs/voice-replication). Confirm with Google's terms whether the blocked regions (UK, EEA, Switzerland, India, Illinois, Texas) apply to your users.
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
  - crash logs and diagnostics (Sentry, under "App info and performance"): collected, not shared (Sentry processes it for us), not linked to the account; purpose "Analytics" (finding and fixing crashes)
  - app interactions (Sentry, under "App activity"): a screen recording from just before a crash, with all text and pictures hidden; same answers as crash logs
  - voice recordings, for Pro users who make their own voice (sent to Google, kept until they delete the voice)

  Data is encrypted in transit, and users can delete their account inside the app (30-day grace).
- [ ] **User-generated content (Explore Community):** say yes in the app content questions. The app has the four things Google asks for:
  - rules people agree to (Community rules, linked when publishing)
  - in-app reporting
  - blocking writers
  - moderation: the AI check, hiding after 3 reports, and your review
  In Data safety, add that pen names and published writing are shown to other users. Set `ADMIN_EMAILS` on the server so you can review reports, and check Community review in Profile now and then.
- [ ] **Ads declaration:** "Contains ads". Content rating questionnaire. Target audience: not for children (because of ads and AI).
- [ ] **Store listing:** title, short and full description, icon (512 px, from `frontend/assets/images/icon.png`), feature graphic (1024×500), and at least 2 phone screenshots. Phase 7, the launch kit, is on hold, so a minimal listing is enough to start.
- [ ] **Legal review** of the Terms, Privacy and Community rules pages, plus a commercial-use sentence for exported audio. Ask about voice recordings as biometric data (your own voice).
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
   - Once, after the 8 October backend is live: `pnpm audio:trim-silence` (a dry run), then `pnpm audio:trim-silence --apply`. It takes the long silence off audio stored before clips were trimmed. Running it again changes nothing.
4. Point RevenueCat's webhook at `https://<api>/api/v1/billing/webhook`.

---

## 5. Smoke test on a real phone (release build)

- [ ] Sign up with email, and with Google.
- [ ] Import a PDF, a Bijoy-font Bangla PDF, a web article and a photo.
- [ ] Play with a Phone voice, a Natural voice (English) and an Expressive voice (Bangla).
- [ ] Mood bar: tap 😢 on a line, and hear it change.
- [ ] Hold a line in the transcript and give it a feeling; try paint mode and "say it in your own words".
- [ ] "Say it yourself": record a line as a whisper and check the voice whispers it; record something else and check it's refused.
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
- **`expo-audio` is patched** (`frontend/patches/expo-audio@57.0.5.patch`) so the notification shows the whole document, and it's built from source (`expo.autolinking.android.buildFromSource` in `frontend/package.json`). Upgrading Expo means redoing the patch for the new version. Not yet checked on a phone.
- **Translation allowance:** the same in every country. The fix is recommended before 2027 ([MARGIN.md](MARGIN.md), fix 1).

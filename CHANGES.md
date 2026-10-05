# Changes

The latest change, the three before it, and what's left to build. Updated with every change (see [Claude.md](Claude.md)).

- **Business decisions:** [BUSINESS.md](BUSINESS.md)
- **Full build status:** [ROADMAP.md](ROADMAP.md)

> **Nothing is committed yet.** Everything since the `docker configuration` commit (`0b6aae7`) is uncommitted on `main`: about 130 changed and new files. All database migrations are applied to Supabase.

---

## Latest change

### Ready for release: new Voices page, sign-out fix, icons, build profiles (5 October 2026)

- **A new Voices page** (`/voices`):
  - **language tabs,** each language in its own script
  - **voices grouped by level** (Expressive, Natural, On your phone), each with a one-line meaning
  - **cards** with a colour gradient avatar per voice that turns into a moving waveform while it previews, an outline and check on the chosen voice, and a ▶ button to hear it
  - **Studio's "Voices"** is now a grid of language tiles that open the page, plus an "All languages" tile
  - **the player's "Change"** sheet uses the same cards
- **Login refresh grace period:** a refresh token replaced in the last 30 seconds, in a session that hasn't been ended, gets a fresh token instead of signing the user out. This covers the app being killed mid-refresh, a lost response, and parallel refreshes. Reuse after 30 seconds, or after logout, still ends the session. 7 checks on a test database.
- **App icons and splash** made from ListenUp's own mark (lavender gradient, white waveform), replacing Expo's placeholders. The old files are backed up in the session scratchpad.
- **`frontend/eas.json`:**
  - development
  - preview (APK for testers)
  - production (App Bundle, automatic build numbers)
  - submit to the internal track as a draft
- **Server fixes:**
  - an empty `KOKORO_URL` no longer stops the server from starting (found by the Docker smoke test)
  - local Kokoro now has a busy limit (`KOKORO_MAX_IN_FLIGHT`, default 2) and a 30-second pause after a failure
- **New [RELEASE.md](RELEASE.md):** what's verified, what you must do before release, the build commands, smoke tests and rollback. [DEPLOY.md](backend/DEPLOY.md) lists the new settings.
- **Checked:**
  - Server: typecheck, production build, Docker image (starts, health check, assets served).
  - App: typecheck, lint, `expo-doctor` (21 of 21), Android bundle. The OpenRouter key isn't in the bundle.
- **Not checked on the phone:** the Voices page (the phone was signed out).

---

## Previous three changes

### 1. Kokoro-82M on your own machine (5 October 2026)

- **`KOKORO_URL`:** Natural voices are made on your own Kokoro-FastAPI server, with OpenRouter as backup, and count $0 in the spending caps.
- **On a Ryzen 7 7700:** about 6× faster than real time, and all 20 Natural voices work. It uses 1.1–2.7 GB of RAM.
- **Hosting:** not chosen yet.

### 2. "Make it expressive" redesigned, and easier emotions (5 October 2026)

- **Make it expressive:** story styles and strength, an AI story brief, strong and directed marks, and a model by plan.
- **Adding emotions yourself:** the mood bar, selecting text, paint mode, and "say it in your own words".
- **Database:** migration `20261005150000_narration_style`, applied.

### 3. Margin and competitor reports (5 October 2026)

- **Added [MARGIN.md](MARGIN.md) and [COMPETITORS.md](COMPETITORS.md).** No code changed.

---

## Next updates left

### Your steps (I can't do these)

**The full release checklist is in [RELEASE.md](RELEASE.md).** In short:

0. **Top up or raise the limit on your OpenRouter key** (openrouter.ai/settings/keys). Requests are already being refused for low credit ("requires at least $0.50 in balance for audio"), and Gemini voices will start failing.
1. **Deploy the new backend to Render** and set the new environment variables, including `DATABASE_POOL_MAX=5` and `QUEUE_POOL_MAX=3` if Render sets pool sizes itself. The list is in [ROADMAP.md](ROADMAP.md#environment-variables); `PUBLIC_URL` must be the public API address. Do this soon: Supabase already has the new schema, and an older backend fails on voice settings.
2. **Rebuild the development app** (`npx expo run:android`), then test on a phone:
   - ads (test ads)
   - an invite link
   - the private podcast in a real podcast app
   - phone voices in airplane mode
   - sharing in from Chrome and WhatsApp
   - an offline download
   - a voice note
   - summary and quiz
3. **Commit the work** on a branch, for example `feature/business-phases`. I can do this when you ask.
4. **AdMob:**
   - Create the app and two ad units, a banner and a rewarded ad.
   - Replace Google's test app ID in `frontend/app.json`.
   - Set `EXPO_PUBLIC_ADMOB_BANNER_ID` and `EXPO_PUBLIC_ADMOB_REWARDED_ID`.
   - Turn on server-side verification, then set `ADMOB_SSV=true`.
5. **Google Play Console** ($25):
   - Create the app.
   - Create the subscriptions `plus` and `pro` (`monthly` and `yearly` base plans) and the products `studio_30` and `studio_120`.
   - Set prices per country, including taka.
   - Add license testers.
6. **RevenueCat:** set it up following [backend/BILLING.md](backend/BILLING.md), then test a purchase.
7. **Closed test:** 12 testers for 14 days before a new personal account can publish.
8. **Legal review** of the Terms and Privacy pages, plus a commercial-use sentence for exported audio.

### Decisions waiting on you

- **Where Kokoro runs in production:** one Hetzner server with the backend (~€10.49 a month), a Render private service ($25–85), or OpenRouter only for now.
- **Voice cloning for Pro:** build it or drop it.
- **bKash checkout on the web:** after the creator beta.
- **Auto-add new documents to the podcast.**
- **Emotions for Indian English voices.**
- **On hold:** the launch kit (Phase 7), and statistics with an owner dashboard.

### Suggested next builds

Ordered by value for effort.

| Feature | Why | Effort |
|---|---|---|
| Margin fixes from [MARGIN.md](MARGIN.md): a lower translation allowance in reduced-price countries, text-AI spending in the daily caps, limits on Make it expressive and OCR for Free | Removes the money-losing cases before the 2027 price doubling | Small |
| Creator basics: Bangla SRT subtitles, Banglish to Bangla, commercial licence, no tag on paid exports | First step of the creator plan | Small |
| Run Kokoro on your own server | Ends Natural-voice outages at a fixed $7–25 a month | Medium |
| Call Google directly, with Batch/Flex for exports and downloads | Saves 5.5%, and half price for audio nobody waits on | Medium |
| Owner dashboard | Needed for the 60-day review | Small |
| Send to ListenUp by email | A daily habit, and it feeds the digest | Medium |
| Exam pack (spaced-repetition flashcards) | A reason for students to buy Plus | Medium |
| Home-screen widget | A daily reminder | Medium |
| Student or family plan | More paying users in South Asia | Medium |
| iOS and a web reader | Only after Android pays for itself | Large |

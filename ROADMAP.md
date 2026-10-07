# ListenUp roadmap

Updated **5 October 2026** (late evening). Covers what's built, what's left before launch, and what to build next.

The full business research, with cost charts and a profit calculator, is on the [business plan page](https://claude.ai/artifact/MmgEXTBY23RTpmvHVUWnLJ) (private; share it from its Share menu).

---

## At a glance

| Phase | What | Status |
|---|---|---|
| 1 | Cost control | ✅ Done |
| 2 | Phone voices | ✅ Done |
| 3 | Payments (RevenueCat) | ✅ Built. Waiting on Play Console and RevenueCat setup |
| 4 | Hindi, Spanish, Portuguese (BR), French | ✅ Done |
| 5 | Growth features | ✅ Done |
| 6 | Offline downloads (Plus and Pro) | ✅ Done |
| + | Summary and quiz, daily digest, voice search, voice-service resilience | ✅ Done |
| + | Ads for Free users, invite a friend, private podcast feed (Plus and Pro), 5 more languages | ✅ Done |
| + | "Make it expressive" redesign: story styles, an AI director that knows the characters, and four easy ways to add emotions | ✅ Built. Not yet heard on the phone |
| + | Kokoro on your own server for Natural voices, with OpenRouter as backup | ✅ Built and tested on your PC. Hosting not chosen |
| + | A new Voices page, the login sign-out fix, real app icons, EAS build profiles | ✅ Built. Release checklist in [RELEASE.md](RELEASE.md) |
| + | Natural voices on the phone: Kokoro-82M downloaded after install, free and unlimited | ✅ Built 7 Oct. Not yet tried on a phone; the voice package isn't uploaded yet |
| 7 | Launch kit (store listing, marketing) | ⏸ On hold |
| — | Statistics and owner dashboard | ⏸ On hold |

How it was checked:
- 137 automated checks passed: Phase 1 (12), billing (9), Phases 4–6 (20), extras (11), ads, invites and languages (44), the Plus podcast (24), emotions (10), and login refresh (7).
- The production Docker image builds and starts, `expo-doctor` passes 21 of 21, and the Android release bundle builds.
- The new AI director was tried on "The Tell-Tale Heart", and local Kokoro was benchmarked on your PC.
- The Android build compiles.
- All five new migrations are applied to Supabase.
- Every new voice was listened to and approved.

> **Nothing is committed yet.** All of this is uncommitted on `main`.

---

## The business model in short

- **Don't compete on English listening.** ElevenReader and Speechify own their voice models and outspend everyone. ListenUp wins on Bangla, which they treat as an afterthought: old Bijoy-font PDFs, Bangla and English mixed in one document, and voices with emotion. It sells to Bengali speakers everywhere, and now also to Hindi, Spanish, Portuguese and French speakers.
- **Subscriptions are the business. Ads are pocket money.** One ad view in Bangladesh pays for about one second of a Gemini voice.
- **Keep voice costs low.** Phone voices cost nothing, Kokoro costs almost nothing, and Gemini is counted in minutes.
- **Creators pay more per minute than listeners.** Studio packs are the high-margin add-on.

### What one hour of audio costs

| Voice | Level | Cost per hour |
|---|---|---|
| Android's built-in voices | Phone | $0.00 |
| Kokoro (`hexgrad/kokoro-82m`) | Natural | ~$0.03 |
| Gemini 3.8 Flash-Lite TTS, today | Expressive | ~$0.58 |
| Gemini 3.8 Flash-Lite TTS, **from 1 Jan 2027** | Expressive | ~$1.16 |

These prices include OpenRouter's 5.5% fee. Replaying cached audio costs nothing.

### Plans and limits

The limits are set in [`backend/src/modules/plans/plan-catalog.ts`](backend/src/modules/plans/plan-catalog.ts). Prices live in Play Console, and the app shows the store's local price.

| | Free | Plus | Pro |
|---|---|---|---|
| Target price | $0 | $3.99/mo or $39.99/yr (৳149 or ৳1,490) | $8.99/mo or $89.99/yr (৳399 or ৳3,990) |
| Phone voices | Unlimited | Unlimited | Unlimited |
| Natural voices | 60 min a month | 40 h a month (reduced: 20 h) | 60 h a month (reduced: 40 h) |
| Expressive voices | 5 min, once | 90 min a month (reduced: 30) | 4 h a month (reduced: 90 min) |
| Translation | 30k characters a month | 1M characters a month | 3M characters a month |
| MP3 export and offline downloads | — | ✓ | ✓ |
| Summaries and quizzes | — | ✓ | ✓ |
| Private podcast feed | — | ✓ | ✓ |
| Voice notes | ✓, ends with "Made with ListenUp" | ✓ | ✓ |

- **"Reduced"** applies to subscriptions bought in lower-price countries: BD, IN, PK, NP, LK, ID, PH, VN, NG, EG and KE.
- **Studio packs** are one-time purchases of Expressive minutes that never expire: 30 minutes for $2.99 or 120 minutes for $9.99. They're used after the monthly minutes run out.

---

## What's done

### 1. Cost control

- **Three voice levels.**
  - Phone: free.
  - Natural: Kokoro.
  - Expressive: Gemini, with emotions and HD Bangla.
- **Allowances in minutes per level**, with lower allowances in the reduced-price countries, based on the user's Play country.
- **Daily spending caps.**
  - `FREE_DAILY_SPEND_CAP_USD` (default $2) covers all free users together, and `DAILY_SPEND_CAP_USD` (default $25) covers everyone.
  - When a cap is reached, generation returns `BUDGET_PAUSED` and the app moves to phone voices.
  - The 2027 Gemini price doubling is built into [`voice-pricing.ts`](backend/src/config/voice-pricing.ts).
- **Shared audio cache.** When two users play the same sentence in the same voice, the audio is generated once (the `AudioBlob` table, keyed by hash). Reused audio doesn't count against allowances or caps.
- **Smaller files.** MP3s are encoded at 40 kbps instead of 64, about 37% smaller. A daily job (`audio.purge-orphans`) deletes unused audio.

### 2. Phone voices

- **A local Kotlin module**, [`frontend/modules/phone-voice`](frontend/modules/phone-voice), synthesizes Android TTS to WAV files. Playback keeps lock-screen controls, speed and the sleep timer.
- **Automatic fallback to the phone voice** on `USAGE_LIMIT_REACHED`, `BUDGET_PAUSED`, `PROVIDER_TIMEOUT` and `PROVIDER_ERROR`. Playback keeps going and shows a short message.
- **Missing voices.** If a language's phone voice isn't installed (often Bangla), the app offers to open Android's installer.

### 3. Payments (RevenueCat)

- **The Plans screen** shows local Play prices, with monthly and yearly options and switching between them. It also has Studio packs, Restore purchases, and a "Manage in Google Play" link.
- **The backend's `modules/billing`:**
  - `POST /billing/webhook` triggers a sync with RevenueCat's REST API.
  - `POST /billing/sync` catches missed webhooks.
  - Studio packs are credited once per transaction.
  - An hourly job (`billing.expire-plans`) moves lapsed plans back to Free.
- **Entitlements** `plus` and `pro`. Play subscriptions `plus` and `pro`, each with `monthly` and `yearly` base plans. Studio packs `studio_30` and `studio_120`.
- **A review prompt** after the second finished document, at most once every 120 days.
- The setup steps are in [`backend/BILLING.md`](backend/BILLING.md).

### 4. Languages

- **Eleven languages:** English, Bangla, Hindi, Spanish, Portuguese (Brazil), French, Italian, Japanese, Mandarin, Urdu and Indonesian.
- **57 voices:** 20 Natural, 26 Expressive and 11 phone voices. Every new voice scored 5/5 on words and accent in an audio-model test. Urdu and Indonesian have no Kokoro voices, so they start on Expressive, like Bangla.
- **Language detection:** by script (Bengali, Devanagari, Arabic script for Urdu, kana for Japanese, Chinese characters), and with `tinyld` for Latin-script languages. Users can override it on import (`languageHint`).
- **Chunks are sized by speaking time,** so Japanese and Chinese chunks hold fewer characters. Urdu text lines up on the right in the player.
- **Voice preferences:** one preferred voice per language, stored as a JSON map (`UserPreference.voices`).
- **Bangla numbers:** Gemini reads them correctly, so no special number handling was needed.

### 5. Growth features

- **Share to ListenUp.** Share a link, text, PDF, EPUB, DOCX or photos from any app. Built with the `expo-sharing` plugin and [`+native-intent.ts`](frontend/src/app/+native-intent.ts).
- **Voice notes.**
  - Send a sentence or paragraph as an MP3, for example on WhatsApp, with its emotions.
  - On the Free plan it ends with a spoken "Made with ListenUp".
  - Endpoint: `POST /documents/:id/voice-notes`.
- **Translate and listen.**
  - `POST /documents/:id/translations` creates a translated copy, filled by the `document.translate` job.
  - The copy keeps the original's shelf kind.
  - It counts against the monthly translation allowance.
- **Skip the clutter.**
  - [`clutter.ts`](backend/src/modules/ingestion/text/clutter.ts) removes citations, footnote numbers, bare URLs and DOIs, page-number lines, table-of-contents lines, and a trailing references section.
  - A "Read everything" switch (`keepClutter`) turns this off.

### 6. Offline downloads (Plus and Pro)

- **Backend:** `POST /documents/:id/offline` starts the `document.prepare-offline` job. `GET /documents/:id/offline` returns the status, and `GET /documents/:id/offline/manifest` returns the files.
- **App:** files are saved under `Paths.document/offline/<docId>/` and play in airplane mode, with the text still in sync.
- **Resuming:** downloads pick up where they left off on the next launch.
- **Offline voice changes:** you can change voice while offline.
- **Storage:** Studio shows how much space downloads use.

### Extras

- **Summary and quiz** (Plus): `GET /documents/:id/study/:kind` and `POST /documents/:id/study/:kind` (a fresh one). You get a short summary and 10 questions, saved in the `StudyAid` table. The app's screen is `/study/[id]`.
- **Daily digest:** `POST /documents` with `{ from: 'digest', day }`. A cheap text model writes a short spoken briefing on the user's last five items from the past two weeks, in their main language. There's one per day, and it shows as a card on the shelf.
- **Voice search:** search the library by speaking (`recognizeAsync` in the phone-voice module).
- **Voice-service resilience** ([`openrouter.provider.ts`](backend/src/modules/tts/providers/openrouter.provider.ts)):
  - Each Kokoro request has a 7-second limit, then retries on the other host, up to 3 tries in all.
  - After 3 failed requests in a row, Kokoro is paused for 30 seconds, so the app moves to phone voices instead of waiting.

### Ads, invites, podcast (5 October)

- **Ads (Free plan only)** with `react-native-google-mobile-ads`:
  - a small banner on the shelf after the third item, with "No ads with Plus"
  - "Watch an ad for 10 more minutes" of Natural voices, at most 3 a day, in Studio and in the player's "out of minutes" message
  - Google's consent form first where the law needs it (EU, UK), and "Ad privacy choices" in Studio
  - Server: `GET /ads`, `POST /ads/rewards`, and `GET /ads/rewards/verify` for AdMob's signed server-side verification (switch on with `ADMOB_SSV=true`)
  - Development builds show Google's test ads; release builds show none until the real ad unit IDs are set.
- **Invite a friend:**
  - Each user has a 6-character code and a Play link that carries it, so it fills in on install through the Play install referrer.
  - Both people get 10 Expressive minutes once the friend has confirmed their email and listened for 5 minutes. Each person is rewarded for up to 10 invites.
  - Codes can be entered for 14 days after signing up. Own and circular codes are refused, and code entry is rate-limited.
  - Server: `GET /invites` and `POST /invites/redeem`. App: Studio → Invite friends.
- **Private podcast feed (Plus and Pro):**
  - "Add to podcast" in a document's menu builds its MP3, and episodes appear in an RSS feed at a secret address that any podcast app can subscribe to.
  - The feed is kept out of podcast directories and has its own cover art ([`backend/assets/podcast-cover.jpg`](backend/assets/podcast-cover.jpg), served at `/podcast/cover.jpg`). Its language follows the episodes.
  - Choosing "Update the episode" rebuilds it in the current voice. The episode link changes with it, so podcast apps download the new audio.
  - Podcast apps that check an episode with HEAD get its size directly; GET redirects to a short-lived storage link.
  - The link can be replaced. If the plan ends, the feed stays up but empty, so podcast apps keep the subscription and the episodes come back on resubscribing.
  - Server: `/podcast` routes, plus a public `/podcast/:token/feed.xml` and episode redirects. App: Studio → Private podcast.
  - 24 automated checks cover Free vs Plus, the feed, cover, HEAD and GET, a lapsed plan, a new link and removing an episode.
- **Terms and Privacy drafts** now cover ads (AdMob, advertising ID, consent), invites and the podcast link.

### Emotions redesign and your own Kokoro (5 October, late)

- **Make it expressive** (Plus and Pro only):
  - pick a story style (Auto-detect or one of 10, such as Suspense, Horror or Bedtime) and a strength (Subtle, Balanced, Dramatic)
  - the style colours **every** line on HD voices
  - AI first writes a story brief (genre, narrator, each character's voice), then directs every line with that context
  - emotions can be strong, and carry short directions ("as the captain roaring over the storm")
  - Plus uses Gemini 3.5 Flash-Lite, Pro uses Gemini 3.8 Flash
  - it only directs as far as the listener's Expressive minutes reach
- **Adding emotions yourself** (every plan):
  - a mood bar under the live text: one tap gives the line you just heard that feeling and replays it, a second tap makes it stronger, a third removes it
  - select text in the transcript with normal Android handles
  - paint mode for many lines
  - "say it in your own words", typed or spoken
- **Your own Kokoro** (`KOKORO_URL`):
  - Natural voices are made on your Kokoro-FastAPI server first, at 2 requests at once at most; the rest, or everything when it's down, goes to OpenRouter
  - local audio counts as $0 in the spending caps
  - on your 8-core PC: about 6× faster than real time, and all 20 Natural voices work
- **Fixes:**
  - "Make it expressive" no longer stays stuck after a restart, and now saves long documents
  - the database connection limit
  - the private podcast moved to Plus

### Creator studio (7 October)

For creators, the main target. Studio is now the script workspace; the settings it used to hold moved to Profile (the avatar).

- **Scripts of any length:** paste the whole thing (up to 200,000 characters, about 3 hours) or import a Word, text or PDF file. The server splits it into parts, so nothing is cut up by hand. Scripts live in Studio, not on the Soundshelf (`Document.isScript`); any document can move between the two.
- **Fix one part, voice only that part:** tap a part to change its words, add a part after it, delete it, or record a **new take** (`DocumentChunk.take`). Every part keeps its own cached audio, so only what changed is voiced again. The MP3 sheet shows it: "Only 1 part (0:18) will be voiced. The other 5 of 6 are reused, saving about 1:27." Emotions follow their words into the edited text; the listener's place and bookmarks move with the parts.
- **Pronunciations:** "Ratul → Rah-tool", for the whole account, whole words in any case, every script and every voice (server voices, Natural voices on the phone, Android's voices). Add from Studio or by tapping a word in a part; "Hear it" plays the spelling. A change re-voices only parts with that word.
- **Subtitles:** every MP3 export now comes with SRT and VTT files, timed to the pauses found in each part's audio (checked against Kokoro's own word timings: sentence breaks land within about 0.1–0.2 s). Lines are at most 42 characters, two per caption (16 for Japanese and Chinese). No AI cost; silences are kept with the shared audio so a re-export only listens to new parts.
- **Control over every part** (added later on 7 October):
  - **Redo one sentence.** That sentence alone is recorded again and spliced into the part's existing audio at the pauses around it (`lib/audio/splice.ts`). Only its seconds are charged, about 2 s in the test instead of the 7 s part. It's recorded on its own, so its tone can differ a little, and the app says so.
  - **A voice per part** for characters (`DocumentChunk.voiceId`), used by the player, exports, offline downloads and voice notes.
  - **Pause after a part** (0–10 s), in the player, the MP3 (silent frames) and the subtitles.
  - **Lock a part.** It keeps its recording: its voice is pinned, its pronunciations are copied, and AI direction, story styles, "remove emotions" and find and replace leave it alone.
  - **Find and replace** across a script, previewing matches, parts and cost first. A case-insensitive match keeps the capitals ("Hold" → "Brace").
  - **Honest costs everywhere:** every action that records audio shows its cost first, and each script shows the minutes it has used (`Document.voicedSec`).
  - **Export extras:** short one-line captions for Reels and Shorts (`.short.srt` and `.short.vtt`), the script as `.txt`, and downloading one part as an MP3. Captions split into even pieces.
  - **Play from a sentence.**
- **Studio design, "Lavender pro"** (the user's choice, 7 October):
  - the light brand kept, with pro pieces added
  - each script opens on a session card: length as a timecode, the voice, and an arrangement bar where every part is as wide as it is long and filled once voiced
  - parts are tracks: their start time and their **real waveform** (`AudioBlob.peaks`, measured from the audio), or a dotted lane until voiced
  - a transport bar plays the script in place, with a live timecode and the playing track lit, next to Export
  - the export sheet lists the files you'll get by name, and ticks off each part while it works
- **One API shape:** everything about a document lives under `/documents/:id`:

| Endpoint | Does |
|---|---|
| `POST /documents` | Adds anything: `{ from: 'text' \| 'url' \| 'upload' \| 'digest', …, script? }` (replaces `/documents/text`, `/url`, `/uploads/:id/complete`, `/digest`) |
| `POST /documents/uploads` | Signed upload link (step 1 of a file upload) |
| `GET /documents?view=shelf\|scripts` | The Soundshelf or Studio's scripts |
| `GET / PATCH / DELETE /documents/:id` | One document; `PATCH` also takes `script: true/false` |
| `GET /documents/:id/script` | Parts, voices, which parts are voiced, pronunciations (was `/reader`) |
| `POST /documents/:id/parts`, `PATCH / DELETE /documents/:id/parts/:index`, `POST …/parts/:index/retake` | Add, edit (text, emotions, own voice, pause after, lock), delete, new take |
| `POST /documents/:id/parts/:index/sentences/:sentence/retake` | Redo one sentence: only it is recorded again and spliced in |
| `POST /documents/:id/replace` | Find and replace; a preview of parts and cost unless `apply: true` |
| `GET /documents/:id/parts/:index/audio` | A part's audio (was `/playback/:id/chunks/:index/audio`) |
| `POST /documents/:id/parts/:index/direction` | "Say it like…" (was `/expressions/…/describe`) |
| `PUT /documents/:id/narration`, `POST /documents/:id/expressive`, `DELETE /documents/:id/expressions` | Story style, Make it expressive, remove emotions |
| `GET / POST /documents/:id/export` | MP3 + SRT + VTT, with what voicing it would cost |
| `GET / POST /documents/:id/offline`, `GET …/offline/manifest` | Offline downloads |
| `PUT /documents/:id/progress`, `/bookmarks`, `POST /documents/:id/voice-notes` | Listening |
| `GET / POST /documents/:id/study/:kind` | Summary and quiz |
| `GET / POST /pronunciations`, `PATCH / DELETE /pronunciations/:id`, `POST /pronunciations/preview` | Pronunciations |
| `GET /listening/stats` | Today's listening and streak (was `/playback/stats`) |

The old paths are gone, so the backend and app must be deployed together.

### Database migrations (all applied to Supabase, except the newest)

| Migration | Adds |
|---|---|
| `20261004200000_cost_controls` | `AudioBlob`, `SpendDay`, minutes per level in `UsageMonth`, and `billingCountry` and the trial and bonus minutes on `User` |
| `20261004210000_billing` | `planExpiresAt`, `planRenews`, `StudioPackPurchase` (each pack credited once) |
| `20261004220000_languages_growth_offline` | `UserPreference.voices` (copies and then drops `voiceEnId`/`voiceBnId`), `languageHint`, `keepClutter`, `translatedFromId`, `OfflineDownload` |
| `20261004230000_study_digest` | `StudyAid`, `Document.digestDay` |
| `20261005120000_ads_invites_podcast` | `AdReward`, `UsageMonth.bonusNaturalSec`, invite fields and `podcastToken` on `User`, `Document.podcastAddedAt` |
| `20261005150000_narration_style` | `Document.narrationStyle`, `narrationStrength`, `narrationBrief`, and `DocumentChunk.narration` |
| `20261007150000_creator_studio` | **Not applied yet.** `Pronunciation`; on `Document`: `isScript`, `editedAt`, `voicedSec`; on `DocumentChunk`: `take`, `sentenceTakes`, `voiceId`, `pauseAfterMs`, `locked`, `lockedLexicon`; on `AudioClip`: `baseKey`, `sentenceTakes`; on `AudioBlob`: `pauses`, `peaks` |

---

## What's left

**The step-by-step release checklist is in [RELEASE.md](RELEASE.md).**

> ⚠️ **Do this first.** The Supabase database already has the new schema, and the old voice-setting columns are gone. Any older backend still running on Render will fail on voice settings until the new code is deployed.

### Your steps

- [ ] **Raise the limit on your OpenRouter API key** (openrouter.ai/settings/keys). It has a $1 limit with $0.09 left, so every HD voice now falls back to the phone voice. The account itself still has $4.80.
- [ ] **Sign in again on your phone.** Testing signed you out (see "Watch for").
- [ ] **Upload the on-device voice package:** `cd backend && pnpm kokoro:upload` (build it first with `tools/kokoro-model/build.py`, see its [README](tools/kokoro-model/README.md)).
- [ ] **Test Natural voices on the phone** on 2–3 phones, including a budget one: Studio → Natural voices on this phone → Download, then the Voice lab (long-press the intro) for speed by thread count.
- [ ] **Kokoro on your own server** is now only a backup for phones that can't run it. Keep OpenRouter for now.
- [ ] **Deploy the new backend to Render** and add the new environment variables (listed below).
- [ ] **Make a new development build.** Phone voices, sharing and payments add native code:
  ```bash
  cd frontend
  npx expo prebuild --clean -p android
  npx expo run:android
  ```
  Then test these on a real phone:
  - airplane mode with a phone voice
  - sharing from Chrome and WhatsApp
  - an offline download
  - a voice note
  - the summary and quiz
- [ ] **AdMob** (free account): create the app and two ad units (banner, rewarded). Put the app ID in `frontend/app.json` (it holds Google's test ID now), and the unit IDs in `EXPO_PUBLIC_ADMOB_BANNER_ID` and `EXPO_PUBLIC_ADMOB_REWARDED_ID`. Turn on server-side verification for the rewarded unit with the URL `<API>/api/v1/ads/rewards/verify`, then set `ADMOB_SSV=true`. Fill in Play Console's "Ads" and Data safety answers (the app uses the advertising ID).
- [ ] **Commit the work.** Put it on a branch, for example `feature/business-phases`.
- [ ] **Google Play Console** ($25 once):
  - Create the app.
  - Create the subscriptions `plus` and `pro`, each with `monthly` and `yearly` base plans.
  - Create the one-time products `studio_30` and `studio_120`.
  - Set prices per country, including taka prices for Bangladesh.
  - Add license testers.
- [ ] **RevenueCat:** create the project, link the Play service account, set up the webhook and copy the keys. Follow [`backend/BILLING.md`](backend/BILLING.md). Then test a purchase with a license tester.
- [ ] **Closed test.** A new personal Play account needs 12 testers for 14 days before it can publish.
- [ ] **Legal.** Have the Terms and Privacy pages reviewed, and add licence wording for using Studio exports commercially.

### Environment variables

| Where | Variable | Value |
|---|---|---|
| Backend (Render) | `FREE_DAILY_SPEND_CAP_USD` | `2` |
| Backend (Render) | `DAILY_SPEND_CAP_USD` | `25` |
| Backend (Render) | `REVENUECAT_SECRET_KEY` | RevenueCat secret API key (v1) |
| Backend (Render) | `REVENUECAT_WEBHOOK_SECRET` | The webhook's Authorization header value |
| Backend (Render) | `ADMOB_SSV` | `true` once AdMob's server-side verification is set up |
| Backend (Render) | `ANDROID_PACKAGE` | `dev.ratul.tts` (used in invite links) |
| Backend (Render) | `PUBLIC_URL` | Must be the public API address: podcast feed links are built from it |
| Backend | `OPENROUTER_DIRECTOR_PRO_MODEL` | `google/gemini-3.8-flash` (the default): Pro's "Make it expressive" model |
| Backend (Render) | `GEMINI_API_KEY` | Google AI Studio key on a billed project. Expressive voices skip OpenRouter's fee; exports, downloads and podcast use half-price flex. `GEMINI_FLEX` (`true`) and `GEMINI_FLEX_TIMEOUT_MS` (`90000`) tune it. |
| Backend | `KOKORO_URL` | Your Kokoro server, for example `http://kokoro:8880`. Leave it empty to use OpenRouter for Natural voices. |
| Backend | `KOKORO_MAX_IN_FLIGHT` | `2` (the default): requests your Kokoro server gets at once; the rest go to OpenRouter |
| Backend | `DATABASE_POOL_MAX`, `QUEUE_POOL_MAX` | `5` and `3` (the defaults). Supabase allows 15 connections in all. |
| App | `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` | RevenueCat's public Google Play key. If it's empty, plans show "Available soon". |
| App | `EXPO_PUBLIC_ADMOB_BANNER_ID`, `EXPO_PUBLIC_ADMOB_REWARDED_ID` | AdMob ad unit IDs. If they're empty, development shows test ads and release builds show none. |

### On hold (your choice)

- **Phase 7, the launch kit:** store listing in six languages, keywords, screenshot captions, launch countries, a launch-week marketing calendar and the 60-day checks.
- **Statistics and an owner dashboard:** spending is already recorded per day and per model (`SpendDay`), so it can be built on top later.

### Not built yet

- **Voice cloning.** It was in the original plan, but the Plans screen doesn't promise it. Decide whether it's still wanted.

### Watch for

- **Kokoro is unreliable on OpenRouter** (5 October 2026). Both of its hosts often time out. Phones that run Natural voices themselves (7 October) don't need it.
- **Budget phones** may be too slow for Natural voices on the phone. They keep using the server.
- ✅ **Fixed: sign-outs after a refresh is cut off.** A token replaced in the last 30 seconds, in a session that hasn't been ended, now gets a fresh token.
- **Gemini's safety filter** refuses some violent passages (for example in "The Tell-Tale Heart"), with or without a style. Those parts fall back to the phone voice.
- **Gemini prices double on 1 January 2027.** The spending caps already account for it. Re-check margins once real usage comes in.
- **Paying on Play in Bangladesh.** Many people there don't have a card that works on Play. Check which local payment methods Play accepts before relying on Bangladeshi subscribers.

---

## Features to add next

Ordered by value for effort. None are started.

### Reliability and cost

| Feature | Why | Effort |
|---|---|---|
| ✅ ~~Run Kokoro yourself~~ | Built (`KOKORO_URL`), and tested on your PC. Since 7 October, Natural voices run on the phone, so a server is only a backup for phones that can't. It needs 4–8 GB of RAM. | Hosting only, later |
| **Smaller app download** | sherpa-onnx brings C and C++ API libraries the app doesn't use (about 5 MB per phone). A small config plugin can leave them out. | Small |
| ✅ ~~Call Google directly, with flex for downloads and exports~~ | Built 7 October: set `GEMINI_API_KEY`. Expressive voices skip OpenRouter's 5.5% fee; MP3 exports, offline downloads and podcast episodes try Google's half-price flex tier first. OpenRouter stays the fallback. | Key only |
| **Owner dashboard** | Daily spend, paying users, hours per payer and 30-day retention on one page. Needed for the 60-day review. | Small |

### Growth

| Feature | Why | Effort |
|---|---|---|
| **Send to ListenUp by email** | Each user gets their own address to forward newsletters and long emails to, and they land on the shelf. Brings people back daily and feeds the digest. | Medium |
| **Creator tools, next** | ✅ Studio, part edits, pronunciations and SRT/VTT subtitles are built (7 October). Left: Banglish to Bangla typing, a commercial-use line in the Terms, no "Made with ListenUp" on paid exports, and burned-in caption styles. See the [voiceover research](https://claude.ai/artifact/K7Soi8i3L8uPYaNXiuQsW8). | Small |
| **bKash checkout on the web** | Google Play doesn't take bKash or Nagad, so most Bangladeshis can't pay in the app. Needs a trade license. | Medium |
| **Exam pack** (BCS, university) | Turns quiz questions into flashcards that come back at spaced intervals. Builds on summary and quiz, and gives students a strong reason to pay for Plus. | Medium |

### Reach

| Feature | Why | Effort |
|---|---|---|
| **Home-screen widget** | "Continue listening" and today's digest on the home screen, as a daily reminder. | Medium |
| **Student or family plan** | A cheaper yearly plan with student verification, or one plan shared by a household. Both raise the share of users who pay in South Asia. | Medium |
| **iOS and a web reader** | Only after Android pays for itself. The backend is ready; phone voices and payments need iOS-specific work. | Large |

---

## After launch: the 60-day check

Decide what's next from these numbers, not from guesses:

- **Share of users who pay.** The median for freemium apps is 2.1%, and 1.4% in India and Southeast Asia.
- **Hours listened per paying user**, split into Natural and Expressive.
- **Voice cost per paying user**, compared with what they pay after Google's 15%.
- **Users still active after 30 days.**

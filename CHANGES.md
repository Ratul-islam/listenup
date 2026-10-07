# Changes

The latest change, the three before it, and what's left to build. Updated with every change (see [Claude.md](Claude.md)).

- **Business decisions:** [BUSINESS.md](BUSINESS.md)
- **Full build status:** [ROADMAP.md](ROADMAP.md)

> **Committed up to "Prepare ListenUp v1.0.0 for release"** (`1a2af1f` on `release/v1.0.0`, not pushed). The on-device Natural voices work and the creator studio are not committed yet. **The creator studio needs migration `20261007150000_creator_studio`, which is not applied to Supabase yet.**

---

## Latest change

### Export fixed, Studio redesigned ("Lavender pro"), and a stress and spike test (7 October 2026)

- **Load test report: [LOAD-TEST.md](LOAD-TEST.md).** It ran the production image sized like Render Starter (0.5 CPU, 512 MB), with 300 test users and the mock voice, against a throwaway database.
  - **Capacity:** about 305 requests a second.
  - **Errors:** none, from 25 to 400 users at once or in a spike from 20 to 500.
  - **Recovery:** within 5–10 s after the spike.
  - **The big finding:** the database 70 ms away (Render Singapore ↔ Supabase Tokyo, as deployed) cuts capacity to 12–17 requests a second, and slows every screen by about 0.5 s. **Put them in the same region.**
- **Fixed during the test:**
  - the backend crashing on start-up (a pg-boss setting)
  - the import queue: 300 at once now take **14 s**, not 5 minutes
  - **every rate limit could be bypassed** with a made-up `X-Forwarded-For`; now only the host's proxy is trusted (`TRUST_PROXY_HOPS`)
  - responses are gzipped: a 486-part script is **8.6 KB**, not 458 KB
- **Export fixes:**
  - An export whose server crashed or restarted stayed "Voicing part 3 of 10…" for up to 3 hours. It's now marked stopped after 5 quiet minutes and can be started again; offline downloads too.
  - An export whose audio files had gone missing failed on every retry. Missing parts are now made again **at no charge to the user**.
  - A daily-cap pause is now a final, explained failure.
  - All tested on the production image with real MP3s.
- **Studio, "Lavender pro"** (your choice):
  - The light brand is kept, with a studio feel added.
  - Each script opens on a session card: its length as a timecode, its voice, and an **arrangement bar** of all its parts.
  - Parts are **tracks** with their start time and **real waveform**, measured from the audio (`AudioBlob.peaks`). Parts not voiced yet show a dotted lane.
  - A **transport bar** plays the script in place, with a live timecode, the playing track lit, and Export.
  - The export sheet lists the files you'll get by name and ticks off each part while it works.
  - Studio home shows scripts as sessions with their length, and a "Studio time" meter.
- **Database:** the not-yet-applied migration `20261007150000_creator_studio` now also adds `AudioBlob.peaks`; it applies cleanly to an empty database.
- **Checked:** backend and app typecheck, app lint, and the tests above. **Not checked:** the new Studio screens on a phone.

---

## Previous three changes

### 1. Control over every part: redo one sentence, part voices, pauses, locks, find and replace (7 October 2026)

- "Fix one sentence" records just that sentence and splices it in, charged for that sentence only. Also a voice per part, a pause after a part, locked parts, find and replace with a cost preview, minutes used per script, and short captions, script text and single-part downloads in exports.

### 2. Changes so ListenUp earns money instead of losing it (7 October 2026)

- Free Expressive trial 15 → 5 minutes. Expressive voices go to Google directly when `GEMINI_API_KEY` is set (no 5.5% fee), with the half-price flex tier for exports, offline downloads and podcast episodes, and OpenRouter as the fallback. Yearly prices at about 10 months (Plus $39.99 / ৳1,490, Pro $89.99 / ৳3,990).
- Model at 2027 prices: −$717 → about +$170 a month at 20,000 users; break-even 4.2% → 0.6–1% of users paying.

### 3. Creator studio: fix one part, pronunciations, subtitles, long scripts, one API (7 October 2026)

- Studio is the script workspace (settings moved to Profile). Scripts of any length are split into parts; editing, re-taking, adding or deleting a part re-voices only that part, and the MP3 sheet shows what was saved.
- Pronunciations for the whole account, applied to every voice. SRT and VTT subtitles with every MP3, timed to the audio's pauses. Everything about a document now lives under `/documents/:id`. Migration `20261007150000_creator_studio` is not applied yet.

---

## Next updates left

### Your steps (I can't do these)

**The full release checklist is in [RELEASE.md](RELEASE.md).** In short:

- **Creator studio:**
  1. Run `pnpm db:deploy` to apply `20261007150000_creator_studio`, then deploy the backend **together with** a new app build (`npx expo run:android`); the API paths changed.
  2. On the phone, test:
     - New script (paste and file import)
     - editing a part, New take, adding and deleting parts
     - **Fix one sentence**: listen to whether the spliced sentence blends in, on an Expressive voice and on a Natural one
     - a character voice on one part, a pause, locking a part
     - find and replace
     - Pronunciations with "Hear it" (an Expressive, a Natural and a phone voice)
     - MP3 with SRT and with short lines in a video editor such as CapCut

- **From the load test (do these before launch):**
  1. **Put the API and the database in the same region**: a Supabase project in Singapore next to Render, or the API in Tokyo. About 10× more capacity, and every screen about 0.5 s faster.
  2. Set `DATABASE_POOL_MAX=10` on Render.
  3. Watch memory on Render Starter (472 of 512 MB at peak); move to Standard when traffic starts.
  4. Steps to re-run the test are at the end of [LOAD-TEST.md](LOAD-TEST.md).
- **Making money (7 October changes):**
  1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey) on a project with billing turned on, and set `GEMINI_API_KEY` on Render. Keep `OPENROUTER_API_KEY` too.
  2. After the first exports, check the server log for `Google flex speech failed`. If flex is always refused, exports still save the 5.5%.
  3. In Play Console, use the new yearly prices from [backend/BILLING.md](backend/BILLING.md): Plus $39.99 / ৳1,490, Pro $89.99 / ৳3,990.

- **Natural voices on the phone:**
  1. ✅ The package (v1) is built and in R2. Don't rebuild it; raise `VERSION` for a new one.
  2. Deploy the backend, then rebuild the development app (`npx expo run:android`), because it adds native code.
  3. On 2–3 phones, including a budget one: download, then compare speeds in the Voice lab.
  4. Get a licence check on espeak-ng (GPL-3.0), which sherpa-onnx includes. Or move phonemes to the server and drop espeak-ng from the app (proposed).

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


- **Kokoro on a server:** now only a backup for phones that can't run it. You chose OpenRouter for now, and your own server later.
- **The speed bar for voicing on the phone** (now speed test × playback speed ≤ 0.95). Check it on a budget phone.
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
| Creator basics left: Banglish to Bangla, commercial licence, no tag on paid exports | Subtitles, part edits and pronunciations are done | Small |
| Leave sherpa-onnx's unused C/C++ libraries out of the app | About 5 MB smaller per install | Small |
| Owner dashboard | Needed for the 60-day review | Small |
| Send to ListenUp by email | A daily habit, and it feeds the digest | Medium |
| Exam pack (spaced-repetition flashcards) | A reason for students to buy Plus | Medium |
| Home-screen widget | A daily reminder | Medium |
| Student or family plan | More paying users in South Asia | Medium |
| iOS and a web reader | Only after Android pays for itself | Large |

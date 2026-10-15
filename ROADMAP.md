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
| + | "Make it expressive" redesign: story styles, an AI director that knows the characters, and easy ways to add emotions | ✅ Built. Reworked 11 Oct: a marked line is voiced on its own, because directing it inside one request didn't work when measured. 13 Oct: whispers use the voice's own whisper mark, and angry, shouted, sad and frightened lines are measured and made again when they miss. Not yet heard on the phone |
| + | Character voices: each character reads their own lines, cast by AI, changeable in a Cast sheet (part of "Make it expressive") | ✅ Built 11 Oct. Reworked the same day for steadiness: even volume, one narrator voice where characters speak, one fixed manner per character, the whole book searched for its cast, exact timing at each voice change. Checked by an audio model, not yet heard on the phone |
| + | Kokoro on your own server for Natural voices, with OpenRouter as backup | ✅ Built and tested on your PC. Hosting not chosen |
| + | A new Voices page, the login sign-out fix, real app icons, EAS build profiles | ✅ Built. Release checklist in [RELEASE.md](RELEASE.md) |
| + | Natural voices on the phone: Kokoro-82M downloaded after install, free and unlimited | ✅ Built 7 Oct. Not yet tried on a phone; the voice package isn't uploaded yet |
| + | Interface upgrade: a plain home page, a new player page, faces for the voices, cover pictures in Explore | ✅ Built 12 Oct. Seen in a browser at phone size with stand-in data, not yet on a phone |
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
  - "say it yourself": record the line your way; AI listens once and the voice follows your feeling, speed and pauses
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
| `POST /documents` | Adds anything: `{ from: 'text' \| 'url' \| 'upload' \| 'digest' \| 'catalog', …, script? }` (replaces `/documents/text`, `/url`, `/uploads/:id/complete`, `/digest`) |
| `GET /catalog` | Explore's free classics, and which are on the listener's shelf |
| `POST /documents/uploads` | Signed upload link (step 1 of a file upload) |
| `GET /documents?view=shelf\|scripts` | The Soundshelf or Studio's scripts |
| `GET / PATCH / DELETE /documents/:id` | One document; `PATCH` also takes `script: true/false` |
| `GET /documents/:id/script` | Parts, voices, which parts are voiced, pronunciations (was `/reader`) |
| `POST /documents/:id/parts`, `PATCH / DELETE /documents/:id/parts/:index`, `POST …/parts/:index/retake` | Add, edit (text, emotions, own voice, pause after, lock), delete, new take |
| `POST /documents/:id/parts/:index/sentences/:sentence/retake` | Redo one sentence: only it is recorded again and spliced in |
| `POST /documents/:id/replace` | Find and replace; a preview of parts and cost unless `apply: true` |
| `GET /documents/:id/parts/:index/audio` | A part's audio (was `/playback/:id/chunks/:index/audio`) |
| `POST /documents/:id/parts/:index/direction` | "Say it like…" (was `/expressions/…/describe`) |
| `POST /documents/:id/parts/:index/delivery` | "Say it yourself": a recording of the words (base64). It's measured and listened to once and not kept; the measurements are kept with the document, and the voice is shaped to them (13 Oct) |
| `PUT /documents/:id/narration`, `POST /documents/:id/expressive`, `DELETE /documents/:id/expressions` | Story style, Make it expressive, remove emotions |
| `GET / POST /documents/:id/export` | MP3 + SRT + VTT, with what voicing it would cost |
| `GET / POST /documents/:id/offline`, `GET …/offline/manifest` | Offline downloads |
| `PUT /documents/:id/progress`, `/bookmarks`, `POST /documents/:id/voice-notes` | Listening |
| `GET / POST /documents/:id/study/:kind` | Summary and quiz |
| `GET / POST /pronunciations`, `PATCH / DELETE /pronunciations/:id`, `POST /pronunciations/preview` | Pronunciations |
| `GET /listening/stats` | Today's listening and streak (was `/playback/stats`) |

The old paths are gone, so the backend and app must be deployed together.

### Shorter gaps between paragraphs, and MP3s that save themselves (8 October)

- **Why the player paused after every paragraph:** each paragraph is its own audio file, and every file came with silence at both ends (Kokoro: about 0.34 s before and 0.24 s after, measured on 129 clips), plus the player's change of file. Voicing wasn't the cause: a paragraph takes about 7 s to voice and plays for about 30 s.
- **Your choice: fix the gaps, not streaming.** Streaming would have removed only the change of file, needed a rewrite of seeking and highlighting, and stalled the same way when voicing is slow. expo-audio's playlist player has no lock-screen controls, so it wasn't an option.
- **What changed:**
  - New clips keep only 60 ms of silence before the speech and 140 ms after (`lib/audio/trim.ts`), so a paragraph change is about 0.4 s, including the change of file.
  - Clips already stored are trimmed once with `pnpm audio:trim-silence --apply`. It cuts whole MP3 frames, so nothing is re-encoded.
  - MP3 exports put an even 0.6 s between parts, whether a clip was trimmed or not (`EXPORT_VERSION` 4).
  - Voice notes get 0.4 s before "Made with ListenUp".
  - The server voices the next two paragraphs side by side, not one after the other.
  - The app swaps in the next file before the screen updates, and lets go of preloaded files once they play. expo-audio kept every one in memory, about 18 MB an hour.
- **MP3 exports, a whole book at a time:**
  - An export runs in 10-minute steps, so it never meets the queue's time limit. Two exports of a 4,237-part book had ended with "job timed out".
  - A part the voice service fails on is tried 3 times. When one fails for good, nothing goes on voicing in the background (before, the other two voicing loops kept going, and each retry started more).
  - Export and download jobs send a heartbeat (pg-boss `heartbeatSeconds: 60`), so a job whose process died, for example in a deploy, is retried within a couple of minutes.
  - One stalled for 5 minutes also carries on in a new job, up to 5 times, unless it's only waiting its turn in the queue.
  - Offline downloads work the same way.
  - A voice host that stalls partway through sending the audio now counts as a timeout, so the other host is tried.
- **Your choice: the MP3 saves itself.**
  - Subtitles and "also save the script" are picked before "Make MP3", and the folder on first use.
  - The app follows the export wherever you are and saves the files the moment they're ready, with a "Saved" message.
  - If the app was closed, it saves on the next launch (`features/exports/lib/export-runner.ts`).
  - Studio's Export button shows the progress.
  - A push notification was the other option; it needs Firebase set up.

### Voices page, one level at a time (8 October)

- Your choice, "Level tabs": the language chips and an Expressive / Natural / Phone switch stay at the top, and only that level's voices scroll beneath (7 at most). It opens on the level of the current voice, which a dot marks.
- The same list is used on the Voices page, in the player's and Studio's voice sheets, and for a part's own voice.

### Explore: free classics (8 October)

- **Your choice:** Explore is a shelf of free, out-of-copyright classics. It was a voice sampler, which the Voices page now does better.
- **What's in it:** 18 titles (`modules/catalog/catalog.data.ts`).
  - Bangla: Kabuliwala, The Postmaster, Chhuti, Mahesh, Bilasi, Abol Tabol, Devdas, Kapalkundala.
  - English: The Tell-Tale Heart, The Gift of the Magi, The Happy Prince, The Fall of the House of Usher, Gitanjali, Alice, Sherlock Holmes, The Jungle Book, Frankenstein, Pride and Prejudice.
  - Short listens (under an hour) come first, as covers; books follow.
- **How a title is added:** "Listen" adds it to the shelf as a Book, waits until it's ready, and plays it.
  - The text is fetched from Project Gutenberg or Wikisource the first time anyone adds a title, cleaned (no licence header, contents or page numbers), and kept at `catalog/v1/<id>.txt`.
  - Everyone after that shares it, so the parts, and the audio, are the same for all.
  - Adding a title twice opens the first. If the source is down, the import retries, and "Listen" tries again.
- **Adding titles:** add an entry to the catalog and check the cleaned text. Only public-domain works (see BUSINESS.md, Policies).
- **Also fixed:** Node gave up on IPv4 after 250 ms and waited on unreachable IPv6, so far-away hosts like Gutenberg timed out. Connection attempts now get 1 s each (`config/network.ts`).
- "Meet the voices" stays at the bottom of Explore as a row of faces you can tap to hear.

### Explore Community and the monthly contest (8 October)

- **Your choices:**
  - Content: writings plus short AI voice clips.
  - Winners: picked automatically from hearts, with fraud rules.
  - Moderation: an AI check plus reports.
  - Prizes: the top 3 per language board win 60 / 30 / 15 Expressive minutes; you can set a theme each month.
- **Explore** has a Classics / Community switch. Community shows: a "you won" card, the contest card, Your posts, voice clips (tap to hear), and New writing.
- **Publishing a writing** (`modules/community`):
  - Done from the ⋯ menu of your own text: **Publish to Explore**.
  - Publishing makes a **frozen copy** owned by the writer and never shown on a shelf (`Publication.masterId`).
  - Every part is locked with the writer's pronunciations and has its voice fixed: a character voice, or the writer's voice for each language.
  - A background job (`community.publish`) runs the AI check (`moderation.ts`), then voices any missing parts from the writer's minutes.
- **Listening:**
  - `POST /documents { from: 'community', id }` gives the listener a copy (`Document.publicationId`) set to the writer's voice. Its parts give the same speech, so they reuse the shared audio.
  - Copies can't be exported, translated, re-read or published.
  - Unpublishing deletes the frozen copy, which deletes the publication, which deletes every copy.
- **Clips:**
  - The player's line sheet has **Post this line to Explore**. The clip is voiced like a voice note (`PlaybackService.voiceClip`) and keeps its `AudioBlob` while it's published.
  - Allowed from your own writing and from the classics (credited).
- **Hearts and the contest:**
  - A writing needs half of it, or 2 minutes, of real listening before it can be hearted (`PlaybackState.listenedSec`).
  - Boards are bn / en / other. A heart counts only from a confirmed-email account at least 7 days old when it hearted.
  - A winner needs 3 counted hearts.
  - The hourly `community.settle-contests` pays a day after the month ends (`ContestWin`, `bonusExpressiveSec`) and emails the winners.
- **Safety:**
  - Report: 7 reasons; 3 reports set it to HIDDEN.
  - Block writer, and unblock in Profile.
  - Community review in Profile for `ADMIN_EMAILS`: restore, remove (also off every shelf), re-publish a wrong rejection, and the month's theme.
  - Pen names are unique ignoring case.
  - The Community rules page is in Legal.
- **API:**

| Method | Path | What |
|---|---|---|
| GET | `/community?kind=writing\|clip&cursor=` | Newest live pieces, without blocked writers or ones you reported |
| GET | `/community/preview?documentId=&voiceId=` | Can it be published, what's left to voice, this month's contest |
| POST | `/community` | Publish `{ kind: 'writing', documentId, title, voiceId, contest, ownWork: true, penName? }` or `{ kind: 'clip', documentId, chunkIndex, start, end, voiceId?, penName? }` |
| GET | `/community/mine`, `/community/:id` | Your posts with their status; one piece (with `heartAfterSec`) |
| DELETE | `/community/:id` · POST `/community/:id/retry` | Unpublish · try again after FAILED |
| PUT/DELETE | `/community/:id/heart` | Heart / un-heart |
| POST | `/community/:id/report`, `/community/:id/block` | Report (reason, note) · block its writer |
| GET/DELETE | `/community/blocks`, `/community/blocks/:userId` | Blocked writers · unblock |
| GET/PUT | `/community/profile` | Pen name, rules accepted, `isAdmin` |
| GET | `/community/:id/audio` | A clip's audio link (counts a play) |
| GET | `/community/contest` · POST `/community/contest/wins/seen` | Theme, boards, your entry, last month's winners, unseen wins |
| GET/POST/PUT | `/community/review`, `/community/review/:id`, `/community/contests/:month/theme` | The team's review (ADMIN_EMAILS) |

### Margin fixes (9 October)

- Translation in reduced-price countries: Plus 250k and Pro 750k characters a month (`Allowance.translateChars` in `plan-catalog.ts`).
- Text AI counts in the daily caps:
  - `lib/openrouter.ts` asks for usage and calls a spend guard that `createUsageService()` registers (`usage/text-spend.ts`)
  - every call site passes `userId`
  - cost comes from OpenRouter's report plus 5.5%, or from a price table in `voice-pricing.ts`
- Free caps: 200 OCR pages and 8 digests a month (`monthlyOcrPages` and `monthlyDigests`, counted in `UsageMonth.ocrPages` and `digests`). The page check runs before the OCR starts.
- Ads give 3 Natural minutes, and invites 5 Expressive, in reduced-price countries (`AD_REWARD_MINUTES` and `INVITE_REWARD_MINUTES` per region).
  - Free users are placed by the phone's time zone: the app's `X-Time-Zone` header, saved by `plugins/time-zone.ts` to `User.timeZone`, read by `rewardRegionFor`.
  - The Plans screen uses the same region before a purchase.

### Home-screen widget (9 October)

- **Your choices:** the `react-native-android-widget` library, one resizable widget, and ▶ opens the app and plays. (Ads and the private podcast, from the same list, were built on 5 October.)
- **The widget, "Continue listening":**
  - small: ▶, the title and the percentage
  - larger: the title, author, time left, a progress bar, ▶, and a "Today's digest" row
  - otherwise "Nothing playing yet" (opens Explore) or "Sign in"
  - it follows the phone's light or dark mode
- **Code:**
  - `features/widget/continue-widget.tsx` (layout), `widget-task-handler.tsx` (draws it from the saved snapshot, also with the app closed), `widget-snapshot.ts` (`home-widget.json`), `home-widget.ts` (redraws it, and loads the library only when the build has it)
  - `use-home-widget-sync.ts` (in the app layout: the shelf's continue item); the sign-out in the auth store clears it
  - `index.ts` is the app entry now, and registers the task
- **Taps:** `listenup://listen?doc=<id>[&play=1]` and `?digest=1` go to `app/(app)/listen.tsx`, which opens the player with the shelf underneath. "Nothing playing yet" opens `listenup://explore`.

### Interface upgrade (12 October)

- **Your choices:** the player is an open page where tapping a line opens that line's tools; the voices get drawn faces; writers add their own cover pictures; the home page keeps Continue listening, Folders and the type filters.
- **Home (Soundshelf):** no greeting or large title. Search and the account picture are the top row. Then one filled violet card, folders as a row of pills, and the type filters with Sort beside them. Every item has a cover in its own colour with a mark for its type (`document-cover.tsx`). Today's digest moved to the Import page.
  - The card is the player on this page: it shows what's in the player, live. While it's in view the mini player stays away (`shelf-ui.store.ts`), so there's never two.
- **Player:**
  - The text is an open page, a line to a sentence (`transcript.tsx`). The line being read grows about a fifth larger on a violet band; lines are laid out narrower than the page so growing never re-wraps a word.
  - The page glides to each new line (`moveTo`, eased on the UI thread), from where each part's cell and each line report they sit.
  - The page is built from the line being read downward (the part before it above), placed while hidden and then shown, so it opens on the right line part-way into a document. Text that hasn't been drawn has no known height, and any of it above the line would push the line as it was measured. Earlier text comes in, eight parts at a time, on scrolling back to the top (or tapping **Earlier text** there); a jump far away builds the page again at the new place.
  - The line being read grows into the gaps around it and never pushes its neighbours, so nothing is laid out again while the voice moves. Lines are plain views until the voice reaches them.
  - The server sends the timing of the part being resumed with the document (`anchors` on that part in `GET /documents/:id/script`), so the right line is known before any audio is asked for; without it the page waits up to 0.7 s for the audio's timing.
  - Tap a line and its tools open under it (`line-tools.tsx`): Play, Feeling, Say it, and ⋯ (describe it, choose some words, voice note, post to Explore).
  - One panel under the page (`player-dock.tsx`): the progress bar, the playback buttons, and four named tools: the voice (the face of whoever is speaking), Feeling, Say it, Expressive.
  - "Say it yourself" opens in one tap from either place. Paint mode and word choosing put their tools in the same panel.
  - What a line or the panel is doing is kept in `store/player-ui.store.ts`.
- **Sheets (`action-sheet.tsx`):** they move up with the keyboard, rise over a fading backdrop, keep their contents while closing, and can be dragged down by their top.
- **Voices:** every built-in voice has a drawn face (`frontend/assets/voices`, made by `tools/voice-faces`). A voice the listener made wears their account picture. The faces show everywhere a voice does.
- **Explore:** a writing can have a cover picture.
  - `POST /community` takes `cover` (base64). `lib/image/cover.ts` checks it is a real JPEG, PNG or WebP, cuts it to 600×840 and saves it again as a JPEG under `covers/<user>/`.
  - The AI check looks at the cover with the text; a cover that fails is dropped and the writer is told in Your posts.
  - Community items carry `coverUrl`, a link that lasts a day. New writing is shown as covers, two to a row.
- **Voice switching:** choosing a voice after hearing its sample now starts playing in the new voice (it used to stay paused), and closing the list without choosing carries on. Changing a character's voice stops their line at once.

### Database migrations (applied to Supabase, except the last)

| Migration | Adds |
|---|---|
| `20261004200000_cost_controls` | `AudioBlob`, `SpendDay`, minutes per level in `UsageMonth`, and `billingCountry` and the trial and bonus minutes on `User` |
| `20261004210000_billing` | `planExpiresAt`, `planRenews`, `StudioPackPurchase` (each pack credited once) |
| `20261004220000_languages_growth_offline` | `UserPreference.voices` (copies and then drops `voiceEnId`/`voiceBnId`), `languageHint`, `keepClutter`, `translatedFromId`, `OfflineDownload` |
| `20261004230000_study_digest` | `StudyAid`, `Document.digestDay` |
| `20261005120000_ads_invites_podcast` | `AdReward`, `UsageMonth.bonusNaturalSec`, invite fields and `podcastToken` on `User`, `Document.podcastAddedAt` |
| `20261005150000_narration_style` | `Document.narrationStyle`, `narrationStrength`, `narrationBrief`, and `DocumentChunk.narration` |
| `20261007150000_creator_studio` | `Pronunciation`; on `Document`: `isScript`, `editedAt`, `voicedSec`; on `DocumentChunk`: `take`, `sentenceTakes`, `voiceId`, `pauseAfterMs`, `locked`, `lockedLexicon`; on `AudioClip`: `baseKey`, `sentenceTakes`; on `AudioBlob`: `pauses` |
| `20261008090000_waveform_peaks` | `AudioBlob.peaks` (Studio waveforms) |
| `20261008150000_community` | `Publication`, `PublicationVote`, `PublicationReport`, `UserBlock`, `Contest`, `ContestWin`; `penName`, `penNameKey`, `communityRulesAt` on `User`; `Document.publicationId`; `PlaybackState.listenedSec` |
| `20261009090000_margin_fixes` | `User.timeZone`; `UsageMonth.ocrPages`, `digests` |
| `20261011120000_own_voice` | `OwnVoice` (a listener's own voice and the recordings it was made from) |
| `20261012120000_publication_cover` | `Publication.coverKey` (a writing's cover picture) |
| `20261014120000_creator_studio` | `Document.studio`, `DocumentChunk.delivery`, `SpeakerVoice` |
| `20261015120000_security_fixes` | `User.emailKey` (one key per inbox, filled in for existing accounts) and `User.listenCreditedUntil`. **Not yet applied to Supabase** |
| `20261015180000_free_user_share` | `UserSpendDay` (each Free account's spending per day). **Not yet applied to Supabase** |

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
- [ ] **Home-screen widget (9 October):** make a new development build, then add the widget on the phone and try ▶, the title, Today's digest, resizing, dark mode and signing out.
- [ ] **Interface upgrade (12 October):** deploy the backend (its migration is applied) and reload the app, then go through the list in [CHANGES.md](CHANGES.md). In Play Console's Data safety form, add photos (cover pictures).
- [ ] **Community (8 October):**
  - deploy the backend (`20261008150000_community` is applied to Supabase)
  - set `ADMIN_EMAILS`
  - test publishing, clips, hearts, reports and blocks on the phone with two accounts
  - in Play Console, declare user-generated content and update Data safety
  - include the Community rules in the legal review

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
| Backend | `OPENROUTER_LISTEN_MODEL` | `google/gemini-3.8-flash` (the default): listens to a line you record in "Say it yourself"; must take audio |
| Backend (Render) | `GEMINI_API_KEY` | Google AI Studio key on a billed project. Expressive voices skip OpenRouter's fee; exports, downloads and podcast use half-price flex. `GEMINI_FLEX` (`true`) and `GEMINI_FLEX_TIMEOUT_MS` (`90000`) tune it. `GOOGLE_API_KEY` is read too. Tier 1: 100 speech requests a day per model. |
| Backend (Render) | `VERTEX_KEY` | Google Cloud service account JSON key (role Vertex AI User), as a Secret File path (`/etc/secrets/vertex-key.json`) or the JSON itself. Expressive voices are made through Vertex AI first, billed to the Cloud project's credits. `VERTEX_LOCATION` (`global`). |
| Backend | `KOKORO_URL` | Your Kokoro server, for example `http://kokoro:8880`. Leave it empty to use OpenRouter for Natural voices. |
| Backend | `KOKORO_MAX_IN_FLIGHT` | `2` (the default): requests your Kokoro server gets at once; the rest go to OpenRouter |
| Backend | `DATABASE_POOL_MAX`, `QUEUE_POOL_MAX` | `5` and `3` (the defaults). Supabase allows 15 connections in all. |
| Backend (Render) | `ADMIN_EMAILS` | Your email (comma-separated for more): Community review and the contest theme in Profile |
| Backend | `COMMUNITY_AI_CHECK` | `true` (the default). `false` skips the AI check before publishing (local tests only) |
| App | `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` | RevenueCat's public Google Play key. If it's empty, plans show "Available soon". |
| App | `EXPO_PUBLIC_ADMOB_BANNER_ID`, `EXPO_PUBLIC_ADMOB_REWARDED_ID` | AdMob ad unit IDs. If they're empty, development shows test ads and release builds show none. |

### On hold (your choice)

- **Phase 7, the launch kit:** store listing in six languages, keywords, screenshot captions, launch countries, a launch-week marketing calendar and the 60-day checks.
- **Statistics and an owner dashboard:** spending is already recorded per day and per model (`SpendDay`), so it can be built on top later.

### Built, not yet tried with Google

- **Your own voice (Pro), 11 October 2026.** A listener records a passage and a consent sentence, Google makes the voice, and it's chosen like any Expressive voice. Server: `backend/src/modules/own-voice`, `GET / POST / DELETE /own-voice`. App: `frontend/src/features/own-voice`. See [CHANGES.md](CHANGES.md).

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

**Creator edges** (9 October 2026): thirteen creator ideas, researched and split into seven phases, are in [CREATOR-EDGES.md](CREATOR-EDGES.md). Phase 1 starts by letting Studio pack buyers export without a subscription.

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
| **Student or family plan** | A cheaper yearly plan with student verification, or one plan shared by a household. Both raise the share of users who pay in South Asia. | Medium |
| **iOS and a web reader** | Only after Android pays for itself. The backend is ready; phone voices and payments need iOS-specific work. | Large |

---

## After launch: the 60-day check

Decide what's next from these numbers, not from guesses:

- **Share of users who pay.** The median for freemium apps is 2.1%, and 1.4% in India and Southeast Asia.
- **Hours listened per paying user**, split into Natural and Expressive.
- **Voice cost per paying user**, compared with what they pay after Google's 15%.
- **Users still active after 30 days.**

## Built 14 October 2026: creators

| Feature | Status |
|---|---|
| Your exports (every MP3, play, save again) | ✅ Built; not tried on a phone |
| Pitch, speed and tone per script, in the audio | ✅ Built; measured, not heard |
| Platform and narration type per script, length guide, templates (English and Bangla) | ✅ Built; not tried on a phone |
| Exports finished at the platform's loudness, default subtitles, AI-label rule | ✅ Built; measured on real exports |
| Voice translation (Pro) with the speaker's cloned voice | ✅ Built; consent step reached Google, no real voice made yet |
| Cloned voices (own and speaker) spoken through Vertex | ❓ Untested; needs a real voice first |


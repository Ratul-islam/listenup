# Changes

The latest change, the three before it, and what's left to build. Updated with every change (see [Claude.md](Claude.md)).

- **Business decisions:** [BUSINESS.md](BUSINESS.md)
- **Full build status:** [ROADMAP.md](ROADMAP.md)

> **Committed up to "added stdio"** (`3fa1e6a` on `main`, not pushed). Everything since isn't committed yet: the widget, the margin fixes, the Community, the Explore classics, the creator plan, the ten changes of 11 October, and the four changes of 12 October (the interface upgrade, the home page, the player's motion and fixes, and opening part-way into a document), the two changes of 13 October (the voices, and Say it yourself), the five changes of 14 October (the Google key, Vertex AI, "Door khullo", the creator features, and more voices), and the platform pages, the Studio banner and the two rounds of security fixes and crash reports of 15 October. **Every migration is applied to Supabase except `20261015120000_security_fixes` and `20261015180000_free_user_share` (15 October): apply them before running this backend** (see Your steps). The earlier ones include `20261011120000_own_voice` (11 October), `20261012120000_publication_cover` (12 October) and `20261014120000_creator_studio` (14 October).

---

## Latest change

### Crash reports with Sentry (15 October 2026)

- **What you said:** you want to put the app on Google Play today and need crash reports. You chose Sentry, for the app only, then sent the project's DSN. Of Sentry's suggested extras you chose a screen recording on crashes only, without personal data.

**What it does:**
- **Release builds send crash reports to Sentry:** JavaScript errors and native Android crashes, with what the app was doing just before (screens opened, requests to the server) and the phone's model, Android version and app version. Development builds never send any. The project's DSN is built into the app (`src/lib/crash-reports.ts`; a DSN only lets the app send reports, so it ships in every build anyway), and its organization and project ids are in `app.json`, so no EAS setting can be forgotten for them.
- **A short recording of the screen from before each crash** (Sentry's Session Replay, on crashes only): every text, picture and icon is hidden, so it shows where people tapped but not what they were reading. Nothing is recorded in normal use. Sentry's other suggestions are off: IP addresses and user details, recording 10% of all sessions, logs, and the feedback form.
- **No account details go with them:** no name, email or IP address. Links in the reports lose their query part, so signed storage links and podcast tokens never reach Sentry.
- **A screen that fails to draw no longer closes the app.** It shows "Something went wrong" with **Try again**, and the error is reported. Before, a drawing error closed the app with nothing recorded.
- **Readable crashes:** each release build uploads its source maps to Sentry, so reports show the real file and line, not the packed bundle. This needs a Sentry auth token in EAS (see Your steps); a release build without it fails at the upload unless `SENTRY_DISABLE_AUTO_UPLOAD=true` is set.
- **Privacy policy:** crash reports (and the masked recording) are added to "What we collect", and Sentry to "Who processes it". The Data safety list in [RELEASE.md](RELEASE.md) has the matching entries (crash logs, diagnostics, and app interactions).

**Checked:** type check and lint pass; Expo applies the Sentry plugin; an Android production bundle exports (10.8 MB) with the id that matches it to its source map. `@sentry/cli` is allowed to run its install script (`pnpm-workspace.yaml`), which downloads the tool that uploads source maps. **Not tried on a phone, and no report has reached Sentry yet:** reports come from release builds only.

**Not changed:** `expo-doctor` now says 9 Expo packages have newer patch versions (`expo` 57.0.26 → 57.0.30, `expo-router`, `@expo/ui` and others). They came out since the last check, not from this change; I left them alone on release day.

- **Files:** app `src/lib/crash-reports.ts`, `src/components/ui/crash-screen.tsx` (new); `index.ts`, `src/app/_layout.tsx`, `metro.config.js`, `app.json`, `package.json` (`@sentry/react-native` 7.11.0), `pnpm-workspace.yaml`, `.env.example`, `src/features/legal/content.ts`; `RELEASE.md`.

---

## Previous three changes

### 1. Security fixes, second round: the eight issues from the second review (15 October 2026)

- **PDFs** are read in a separate process, stopped past 320 MB or 90 seconds, so a small PDF can't crash the server.
- **A speaker's cloned voice** reads only the translation it was made for.
- **Each Free account has its own share of the daily Free budget** ($0.25, `FREE_USER_DAILY_SPEND_USD`), and signed-in limits count per account, not per IP address.
- **Google sign-in** links by the exact address (or Gmail spellings only). **Shared file names** are cleaned of `..` and slashes. **Per-email limits** count per email and IP together. **The Vertex key** is never logged, and **request logs** hide podcast tokens and link signatures.
- Migration `20261015180000_free_user_share`. A likely real RevenueCat secret was blanked in `backend/.env.example`.

### 2. Security fixes: the eight issues from the first review (15 October 2026)

- **Link import** checks the address it connects to, on every redirect. **EPUB and DOCX** unpack with hard limits, in a thread with its own memory limit.
- **One account per inbox** (Gmail dots and "+tags"), listening credited no faster than the clock, and same-inbox accounts can't reward each other through invites or hearts.
- **Sign-up and passwords:**
  - The password counts once the email code is entered.
  - Sign-up answers the same for every address.
  - Per-email limits on wrong passwords and emails sent (made per email and IP in the latest change).
- **Login tokens** end at once with their session. The **AI moderation** check fences off the writer's text and holds suspicious passes for review.
- **The OpenRouter key** is removed from the app folder and Expo's logs. Migration `20261015120000_security_fixes`.

### 3. A banner for creators at the top of Studio, and one page for social videos (15 October 2026)

- A full-width violet "For creators" banner under the Studio title, with the three platform icons, **Start creating**, and a small phone whose captions light up word by word. It replaces the three small "Make for" cards.
- It opens **Social videos**: three large tabs (TikTok, Reels, YouTube) at the top; switching changes the styles, tools and scripts below.

---

## Next updates left

### Your steps (I can't do these)

**The full release checklist is in [RELEASE.md](RELEASE.md).** In short:

- **Crash reports (15 October): one token before the release build.** The Sentry project's DSN, organization and project are already in the app.
  1. In the Sentry project's settings → Security & Privacy, turn on "Prevent storing of IP addresses".
  2. Make an organization auth token in Sentry (Settings → Auth Tokens) and add it to EAS's production environment as `SENTRY_AUTH_TOKEN`, a secret. The command is in [RELEASE.md](RELEASE.md) under "Sentry".
  3. Then build. Without the token, a release build stops at the source-map upload; to build without it for now, set `SENTRY_DISABLE_AUTO_UPLOAD=true` instead (reports still arrive, but show packed code). The same goes for a local release build (`expo run:android --variant release`).
  4. In Play Console's Data safety form, declare crash logs, diagnostics and app interactions (the entries are in RELEASE.md).

- **Security fixes, both rounds (15 October): apply the two migrations first.** Your backend running on your computer (`tsx watch`, on Supabase) has already reloaded with this code. Until the migrations are applied, anything that reads an account fails with "column users.emailKey does not exist".
  1. In `backend/`, run `pnpm db:deploy`. It applies `20261015120000_security_fixes` (two new columns on users, filled in for existing accounts) and `20261015180000_free_user_share` (one new table); nothing is removed. Or tell me to run it. Do the same before deploying to Render.
  2. Reload the app (no rebuild). You may be signed out once: tokens from before the change are refused, and the app refreshes into a new one.
  3. On the phone: sign up with a new address, enter the code, then sign out and sign in with that password. Then sign up again with an address that already has an account: you should get the "You already have an account" email, not a code.
  4. Optional: make a new OpenRouter key and put it in `backend/.env` and on Render. The old one was only in files on this computer, so this is low priority.
  5. Import a PDF of a book: it should read as before (a moment slower to start). A huge or broken one now says "too big or too complex" instead of stalling.
  6. If you use RevenueCat: the secret key that was in `backend/.env.example` is blanked there. Put it in `backend/.env` and on Render (RevenueCat → Project settings → API keys), and make a new one if that file was ever shared.

- **Studio banner and Social videos page (15 October):** no rebuild; the app only needs to reload.
  1. Open Studio: the violet banner should be the first thing under the title, edge to edge, with the caption on the little phone lighting up word by word. Tell me if the words or the size feel right for your creators.
  2. Tap it (or **Start creating**): **Social videos** opens on TikTok. Tap Reels, then YouTube: the tab fills with its colours and the styles below change.
  3. Try it in dark mode: the TikTok tab should still stand out.

- **Platform pages (15 October):** no rebuild; start the backend and reload the app.
  1. Studio, tap the banner; TikTok is already chosen. Tap **Storytime**, then **Start a script**: the template is filled in; change a few lines and create it.
  2. Back on Social videos, TikTok: **Caption, hashtags and title**, pick that script, **Write it for TikTok**, and try Copy all.
  3. **Subtitles**: pick it, **Make subtitles**, then look at the word-by-word preview and **Save subtitles**. Try it in CapCut.
  4. Switch to **YouTube** at the top and write a post for a Bangla script, to check the Bangla.

- **Creators (14 October, fourth change):** no rebuild; the app only needs to reload (shake, Reload).
  1. Studio, New script: pick **YouTube Shorts** and **Explainer**, tap **Start from a template**, fill a few lines, and create it. The length should show against Shorts' 3:00.
  2. On the script, tap the **Platform and sound** chip: try Energetic, 1.1× and −2, save, and play a part. Tell me if speed or pitch sounds processed. [The samples](https://claude.ai/artifact/QkNVaUwj5usrEwCRZV3n7a) are the same thing measured.
  3. Export it: the sheet should say the volume is set for YouTube Shorts and pick short subtitle lines. Try the MP3 in CapCut.
  4. Profile (or Studio), **Your exports**: play one, and save it again from ⋯.
  5. **Voice translation:** Studio, **Translate a recording**. Upload a minute or two of yourself speaking English, translate it into Bangla, and open the script. Then, as the speaker, tick the box, read the consent sentence and tap **Make the speaker's voice**. Tell me what Google says, and how it sounds. Do this after 15 October: the voice's speech goes through the API key, whose 100 a day the 14 October tests used up.
  6. Nothing to set on Render: ffmpeg is already in the image, and the migration is applied.

- **Vertex AI (14 October, second change):** no rebuild; restart the backend.
  1. **Check the credits pay for it.** In the Cloud console, Billing, then **My projects**: `gen-lang-client-0313385618` must be on the billing account that holds the $300. If it's on another one, Vertex is charged to that account's card. Billing, then **Credits**, shows how much is left and when it expires.
  2. Set a budget alert (Billing, then **Budgets & alerts**), say at $50, $150 and $250, so you hear before the credits run out.
  3. On Render: add the key as a **Secret File** named `vertex-key.json`, and set `VERTEX_KEY=/etc/secrets/vertex-key.json`.
  4. Play a story with Nova or Nusrat. The backend log shouldn't show `Vertex speech failed`.
  5. When the credits are close to running out, tell me: Vertex then costs the same as the key, and exports would be cheaper on the key's half-price flex tier at Tier 2.

- **Say it yourself (13 October, second change):** no rebuild needed; the app only needs to reload, and the backend to restart.
  1. Listen to [the samples](https://claude.ai/artifact/BYkyDeGiGHVjGWem5Sr24q) first. Tell me: does **After** follow the performance, is it still the same voice as **Before**, and is there any buzz or wobble?
  2. Play a story with Nusrat or Nova. Tap **Say it** under the page and record the line with a clear shape: a long stop in the middle, or the end rising like a question. Tap **Say it like this**. The message should end "with your timing and tune", and the part replays.
  3. Record the same line flat and fast, and again slowly. Each should come back at your pace.
  4. Select two or three words inside a sentence, tap **Say it**, and stretch them out. Only those words should change.
  5. Record a line in Banglish, with your own pauses. This is the case I could only test with a machine "performer".
  6. Record somewhere noisy, or very quietly. Either it follows you, or the message says the recording was too faint.
  7. The backend log has a line for each one ("a performed line by nusrat: take 2 of 3 shaped over 2.2 s…"). If one sounds wrong, send me that line.
  8. In Play Console's Data safety form, voice recordings were "collected, not stored". Measurements of how a line was said are now stored with the document: check the wording there still fits.

- **Voices (13 October):** the app needs a rebuild for the phone's Natural voices; everything else only needs the backend restarted.
  1. Restart the backend, and deploy it when you next can. `TTS_MODEL_TYPED` has a default, so there's nothing to set.
  2. Rebuild the app (`eas build`, or your usual dev build). Until then, Natural voices made on the phone stay quieter; nothing else waits on it.
  3. In `backend`, run `pnpm audio:level-natural`. It only reports (147 Natural files, 8.7 dB too quiet, and the 10 Natural samples on the Voices page). If that looks right, run `pnpm audio:level-natural --apply` to bring the stored ones up. It rewrites those files in your storage, so I left it to you. Nobody is charged for it.
  4. Open a "Make it expressive" story with Nusrat or Nova. Give one line the **Whisper** feeling and play it. Then in Studio open that part and tap **New take of the whole part** twice, listening each time. It should be whispered all three times. This is the fix I'm surest of.
  5. Give a line **Angry**, another **Sad**, another **Scared** (the plain chips, not a typed description). Tell me how many sound right out of, say, five each. That's the number I can't get without you.
  6. Give a line **Shout**. It should be clearly louder than the narration, not just different.
  7. Play "Raat tokhon almost 11টা." from the start. It's voiced again on the larger model (about 2 Expressive minutes). Tell me whether Rafi, Maya and the narrator keep a Bangla accent on lines like "Maybe… but ei time-e bus pawa tough". The last line of the story, which is all English, will still sound American.
  8. Listen to the gaps where the voice changes. If the replies now come too slowly, tell me; the three lengths are at the top of `render-plan.ts` (`GAP_CLAUSE_MS`, `GAP_SENTENCE_MS`, `GAP_PARAGRAPH_MS`).
  9. Play something with a Natural voice (Ivy), then switch to Nova. The volume should stay where it is.

- **Opening part-way in (12 October, fourth change):** no rebuild needed; the app only needs to reload, and the backend reloads on its own.
  1. Open a document you've heard a few minutes of. The text should fade in already on your line and not move. Press play: it should carry on from that line.
  2. Do the same with a book you're deep into, and with one you haven't started.
  3. Drag the bar far ahead, then far back. The text should cut to the new place and fade in on the right line.
  4. Scroll the text back up to its top. Earlier text should come in above with a short blink, and what you were looking at should stay where it was. Tap **Now reading** to come back.
  5. Watch a long sentence (five rows or more) being read. Tell me if its violet band sits too close to the lines around it.
  6. Tell me if the "large list that is slow to update" warning comes back, and what you were doing.
  7. Deploy the backend when you next can, so the app you ship gets the line's timing with the document.

- **Interface upgrade (12 October):** no rebuild needed; the app only needs to reload. Start the backend again so it picks up the cover code.
  1. Home: tap play on the violet card. It should turn to pause with the bar moving, and there should be no mini player. Scroll down: the mini player slides in and Import folds to a plus. Go to Explore: the mini player is there.
  2. Player: play a story for a minute. The line being read should grow smoothly without any word jumping to another line, and the page should glide to each new line. Tell me if the growth or the glide stutters; both are single numbers at the top of `transcript.tsx` (`GROW`, `GLIDE_MIN_MS`).
  3. Tap a line: its four buttons should rise under it. Try each. Tap the line again to close them.
  4. Tap a line, ⋯, **Describe how it should sound**. The sheet should sit above the keyboard with the box you type in visible. Type something and press Done on the keyboard. This is the fix I couldn't watch.
  5. Drag a sheet down by its top to close it. Open and close a few quickly.
  6. Tap **Say it** under the page, record the line, and tap Say it like this.
  7. Tap the voice's face, hear a sample with ▶, then choose that voice: it should start playing in the new voice by itself. Do it once more mid-sentence without a sample.
  8. Try Aa, a Bangla story, dark mode, and ⋯ then Paint feelings.
  9. Voices: look through the faces in each language. Tell me any you'd like redrawn.
  10. Explore: publish a short writing with a cover picture, then look at it in Community and in Your posts. Try a picture that breaks the rules (a phone number on it) to see it dropped.
  11. Tell me what feels off. The text's colours, the band's strength and where the line rests are single values at the top of `transcript.tsx`.
  12. In Play Console's Data safety form, add photos: cover pictures are collected and shown to others.

- **Say it yourself (11 October, tenth change):** no rebuild needed; the app only needs to reload. The backend reloads on its own.
  1. Play a story with an Expressive voice (Nusrat or Nova). Tap **Say it** under the page, or tap a line and then **Say it**.
  2. Record the line as a whisper and tap **Say it like this**. The toast shows what was heard, and the part replays with that line whispered.
  3. Record it again very slowly, then with a long stop in the middle. Check both come back.
  4. Record a different sentence: it should be refused.
  5. Tell me how close the feeling is on ordinary lines (sad, teasing, annoyed). That's the part I couldn't test without a person, and it decides whether the voice-changer route is worth opening an account for.
  6. Before deploying: `ffmpeg` must be in the server image (it already is, for "Your own voice"), and `OPENROUTER_LISTEN_MODEL` can stay at its default.

- **Character voices (11 October, eighth and ninth changes):** no rebuild needed. The backend reloads on its own.
  1. Open "Raat tokhon almost 11টা." and run **Make it expressive** again. This is needed: it gives Rafi and Maya their voices from the first line, and gives each their one manner.
  2. Listen from the start. Tell me: is the volume even, does each person keep one voice, and does the name above the line change when the voice does?
  3. In the second part, the line "Rafi ghure dekhe ekjon meye dariye ache." has a feeling you set yourself ("quiet and controlled anger"). In one test it made the narrator sound like a man. Remove it if you don't want it.
  4. Run **Make it expressive** on দেবদাস too. It finds nine more characters, and it stops characters reading the narration. It starts from part 1 only if your Expressive minutes cover the whole book (about 175 minutes); otherwise from the part you're on.
  5. Parts of the Banglish story are voiced again the first time you play them (the Bangla direction changed), which uses Expressive minutes.
  6. If a word is still missing, tell me the part and the word. The backend log says when a take came back too short or too long.

- **The player's text (11 October, seventh change):** no rebuild needed; the app only needs to reload.
  1. Open a story and watch the text follow for a minute: does the line being read stay in the same place, and is the step from one line to the next smooth?
  2. Scroll up, check **Now reading** appears with the arrow the right way, and tap it. Scroll away, tap a line and choose **Play** instead.
  3. Tap **Aa** (now in the top bar) through all four sizes, in English and in Bangla.
  4. Open a long book in the middle (দেবদাস, part 200 or so) and check it opens on the line being read, then scroll back several parts.
  5. Hold a line, drag the handles, give it a feeling. Then ⋯, Paint feelings, paint three lines, Done.
  6. Try dark mode.
  7. Tell me what feels off: sizes, spacing, how dim the heard lines are, where the line rests. Those are single numbers at the top of `transcript.tsx` and `text-size.ts`. (The page was rebuilt on 12 October; these checks still apply.)

- **Character voices (11 October, sixth change):** no rebuild needed. The backend already reloaded.
  1. Your Banglish story is still labelled English, so American voices read it. Fix that first: in `backend`, `pnpm text:relabel-languages`, then `--apply` (from the Banglish change, still not applied).
  2. Open the story at its start and run "Make it expressive" again. Then listen: each character should keep one voice through a conversation, and "Rafi bollo" should be the narrator's.
  3. Do the same on দেবদাস from part 1 and listen to the classroom scene (parts 4 to 15).
  4. Tell me how many lines still go to the wrong person. That decides whether "Who says this?" on a line is the next thing to build.
  5. Decide on emotions: build the listen-and-re-record check (about 1.8 times the voice cost on directed lines), or leave emotions as they are.

- **The notification bar (11 October):** this one needs a rebuild; it changes native code.
  1. In `frontend`, run `pnpm install` (it applies the patch; already done on this machine), then `npx expo run:android`.
  2. Play a document with several parts and pull down the notification: the bar should cover the whole document and keep moving from one part to the next.
  3. Drag the bar into a later part, and use the skip buttons across a part boundary: playback should follow.
  4. Try the same on the lock screen, with a Natural voice made on the phone, and with a phone voice.
  5. Tell me if the bar jumps for a moment when a new part starts. If it does, the fix is the order in which the new file and its place in the document are sent to the notification.

- **Your own voice (11 October):** no rebuild needed (the microphone permission was already in the app); the app only needs to reload.
  1. ✅ The Google key is in `backend/.env` (14 October). Restart the backend. Try this on 15 October or later: the 14 October test used the day's 100 requests for the voice model your own voice uses (other Expressive voices go through Vertex AI and aren't affected).
  2. Give your account Pro: in `backend`, `pnpm user:set-plan <your email> pro`.
  3. Profile, then **Your voice**: record the passage and the consent sentence in Bangla, and tap Make my voice. If Google refuses, tell me the error in the backend log; I couldn't test against Google.
  4. Voices, Bangla, Expressive: choose your voice and play a Bangla document. Tell me how it sounds; that decides whether Gemini is good enough or another provider is needed (about 2 to 3 times the cost).
  5. Try an emotion on a line, an MP3 export, and "Record it again".
  6. Set your plan back to Free and check the document falls back to Nusrat, then back to Pro.
  7. Delete the voice, and check in Google AI Studio that it's gone there too.
  8. Before deploying: the Docker image now installs `ffmpeg`, so it must be rebuilt, and `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) must be set on Render.
  9. On Tier 1, Google allows 10 requests a minute and 100 a day, shared by every listener's own voice. Don't offer "Your voice" to real users before Tier 2.

- **Banglish and mixed text (11 October):** no rebuild needed. The backend already reloaded.
  1. Top up the OpenRouter key (about $0.09 is left; with $0.50 or more I can also check audio by machine again).
  2. Fix your existing test text: in `backend`, run `pnpm text:relabel-languages` to see the preview, then `pnpm text:relabel-languages --apply`. Or just import the text again.
  3. Open "Raat tokhon almost 11টা." and listen: Nusrat should read it, and the Bangla words should sound Bangla. Tell me how it sounds; that decides whether the behind-the-scenes Bangla script step is needed.
  4. Import a Bangla text with English words in Bangla script ("আমি Google Chrome browser use করি।") and check one voice reads all of it.

- **Character voices (11 October):** no rebuild needed, the app only needs to reload.
  1. Top up the OpenRouter key first (about $0.10 is left).
  2. Open a story with dialogue on an Expressive voice and run "Make it expressive". The toast should say how many characters have their own voice.
  3. Listen to a conversation: quoted lines should be in the characters' voices and "he said" in the narrator's.
  4. More, then Character voices: change one character's voice and check the part replays in it. Try Automatic, and "Let the narrator read everything".
  5. Try a Bangla story with more than two characters of one gender, and tell me how the borrowed voices sound in Bangla. I couldn't test that.
  6. Tell me how often a line goes to the wrong character. If it's often, the next step is a "Who says this?" control on a line.

- **The player fixes (11 October):** no rebuild needed, the app only needs to reload.
  1. Top up the OpenRouter key first (about $0.12 is left), or Expressive voices will fall back to the phone voice.
  2. Open a story with an Expressive voice (Nova). Tap a line, then **Feeling**, pick 🤫 or 😠, and listen: only that line should change. A whisper is the clearest test.
  3. Watch the highlight through two or three parts. Tap a line and choose **Play**: each should start on that line.
  4. Change voice mid-sentence: it should stop at once, show "Switching to…", and carry on from the same line.
  5. Paint five lines quickly, tap Done, and check all five kept their colour and the part replays.
  6. With Ivy (Natural) reading, add a feeling: the note should offer "Use Nova".
  7. Run "Make it expressive" on a short story and check the toast says how many lines were directed.
  8. Tell me how the joins between runs sound. If the voice changes too much from line to line, the limit of 6 takes per part and the 4-word minimum are the two settings to adjust.

- **Home-screen widget (9 October):** rebuild the app (`npx expo prebuild --clean -p android`, then `npx expo run:android`; it adds native code). Then on the phone:
  1. long-press the home screen, open Widgets, and add ListenUp's "Continue listening"
  2. resize it small and large
  3. tap ▶ (it should open and play), the title (it should open paused), and Today's digest
  4. switch the phone to dark mode
  5. sign out and back in

- **Margin fixes (9 October):** deploy the backend and rebuild the app. Then on the phone, check that Free shows "3 more Natural minutes" after a rewarded ad in Bangladesh, and that the Plans screen shows the Bangladesh allowances. Nothing to set up; the migration is applied.

- **Community (8 October):**
  1. ✅ Its migration is applied to Supabase. Deploy the backend when you're ready; the one on Render keeps working meanwhile.
  2. Set `ADMIN_EMAILS` on Render to your account's email, so **Community review** shows in your Profile.
  3. Rebuild the app (`npx expo run:android`), then on the phone:
     - publish a story with the contest ticked
     - post a line as a clip, including one from a classic
     - on a second account: listen, heart, report and block
     - set the month's theme in Community review
  4. In Play Console, say the app has user-generated content (it has reporting, blocking and moderation) and update the Data safety form: pen names and published writing are visible to other users.
  5. Have the Community rules reviewed along with the Terms.

- **Explore (8 October):** open Explore on the phone, add a Bangla book (Devdas, the first fetch takes about 15 s) and an English short story, and check they play and show on the Soundshelf as Books.

- **Gaps and exports (8 October):**
  1. Deploy the backend, then run `pnpm audio:trim-silence` (a dry run) and `pnpm audio:trim-silence --apply` once. It rewrites the stored audio files in R2.
  2. Rebuild the app (`npx expo run:android`), then on the phone:
     - listen across a few paragraphs with a Natural and an Expressive voice
     - export a long script, close the app, reopen it later, and check the MP3 lands in your folder
  3. Start your local Kokoro server again (`KOKORO_URL`, `localhost:8880`, was down), or Natural voices go through OpenRouter, which keeps timing out.
  4. `backend/.env.example` now holds a real `REVENUECAT_SECRET_KEY`. That file is committed, so put the key back in `.env` only and blank it before committing.

- **Creator studio:**
  1. Deploy the backend **together with** a new app build (`npx expo run:android`); the API paths changed. The migrations are already applied.
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
  1. ✅ The key exists (14 October). Set it on Render as `GEMINI_API_KEY` or `GOOGLE_API_KEY`, and keep `OPENROUTER_API_KEY`. The savings only start at Tier 2 ($100 paid and 3 days after the first payment): Tier 1's 100 speech requests a day are a sliver of the app's use. Google's form for more: https://forms.gle/ETzX94k8jf7iSotH9
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

- **What a speaker's voice may say (15 October):** it now reads only its own translation, but a translation is an editable script, so its owner can still change the words the speaker's voice says there. Options: leave it (fixing translation mistakes stays easy); or let edited parts fall back to the usual voice; or make translations read-only once the speaker's voice exists. I'd let edited parts fall back. Say which.
- **The Free share (15 October):** each Free account may use $0.25 a day of the $2 Free budget (`FREE_USER_DAILY_SPEND_USD`). Lower means more accounts would be needed to use up the day; higher means fewer heavy Free users hit "used today's free AI". Say if you want another figure.

- **Cloned voices through Vertex (14 October):** your own voice and a speaker's voice can only be spoken through the API key, at 100 requests a day on your current tier. Vertex might speak them too (same Google project), which would lift that. It can only be tried once a real voice exists: after step 5 above, say so and I'll test it (a few cents).
- **Catching swapped words in Banglish (14 October):** the voice sometimes says a Bangla word for an English one ("door" became "dorja"). Each word can be fixed with a pronunciation in Bangla letters. Catching it automatically means a listening model writes down each Banglish take and it's made again when a word changed: about the voice's cost again on those parts. Say if you want it.
- **Banglish on the larger voice model (13 October):** it's on, at 1.5 times the voice cost for parts typed in English letters. Keep it if your story sounds steadier; otherwise set `TTS_MODEL_TYPED` to the usual model and tell me.
- **How many takes a feeling may cost (13 October):** up to 3 for a feeling you set, up to 2 for one the AI suggested. Three for both would lift angry and frightened lines to about 9 in 10 by my figures, and cost more on every "Make it expressive" story. Say if you want it.
- **Feelings as turns (14 October):** measured, and I recommend not building it now: it follows feelings about as often as today, sounds joined less often (3 in 28 clips against 9 in 30), but whispered the whole passage in Bangla every time, needs Google alone (100 requests a day on your tier), and makes the highlight's timing guesswork. [Listen](https://claude.ai/artifact/4wzDxPFJPyrc5C5cecDz7i). If the turn clips sound clearly better to you, the next step is turns for English feelings other than a whisper, once the key reaches Tier 2.
- **More sounds (13 October):** the voice also knows cry, chuckle, groan, scream, whimper, yawn, cough and a few more. Adding them means new buttons in the feeling sheet. Say which you'd use.
- **Happy, excited, calm and the other feelings that can't be measured (13 October):** they stay one take. I'd need a measure that holds up (pitch, most likely) before retakes are worth paying for.
- **Studio's header (12 October):** Home and Explore lost their large titles; Studio still has "Studio" and a subtitle above its cards. Say if it should match.
- **A faster voice switch (12 October):** the old voice stops at once, but the new one must voice the whole paragraph before it can start. Voicing only the rest of the paragraph first would start sooner; it would use some minutes twice when that paragraph is played again. Only worth it if the wait bothers you on the phone.
- **Say it yourself, if the samples sound processed (13 October):** the other way is a voice changer, which keeps your recording's sound and changes who is speaking. It copies everything, your accent included, but the result is an imitation of Nusrat or Nova, not their own audio, and it needs either a paid service (a new account, a few cents a line) or a server with a graphics card. Say so after listening and I'll test one.
- **Say it yourself with "Your own voice":** when your cloned voice reads the document, your recording could simply be the line. Not built.

- **Creator edges ([CREATOR-EDGES.md](CREATOR-EDGES.md)):** say go for Phase 1, and answer its nine decisions. The first is what pack buyers can do without a subscription; I recommend letting them export the scripts they voice.
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
| Community, next steps: a writer page ("more by this writer"), update a published writing without losing its hearts, a push notification when you win or your post goes live | Brings writers back and helps the contest grow | Small–Medium |
| Covers, next steps: add or change a cover from Your posts after publishing, and show the cover on the shelf for writings added from Explore | Today a cover can only be set when publishing | Small |
| Creator basics left: Banglish to Bangla, commercial licence, no tag on paid exports | Subtitles, part edits and pronunciations are done | Small |
| Leave sherpa-onnx's unused C/C++ libraries out of the app | About 5 MB smaller per install | Small |
| Owner dashboard (spending per feature is now recorded, text AI included) | Needed for the 60-day review, and to check real costs before January | Small |
| Send to ListenUp by email | A daily habit, and it feeds the digest | Medium |
| Exam pack (spaced-repetition flashcards) | A reason for students to buy Plus | Medium |
| Student or family plan | More paying users in South Asia | Medium |
| iOS and a web reader | Only after Android pays for itself | Large |

# ListenUp: business details and decisions

The single record of how ListenUp makes money and why: positioning, prices, limits, costs, payments, policies, and which decisions are still open.

- **Last updated:** 13 October 2026
- **Owner:** Ratul Islam
- **Build status:** see [ROADMAP.md](ROADMAP.md)
- **Change log:** see [CHANGES.md](CHANGES.md)
- **Margins (where you make and lose money):** see [MARGIN.md](MARGIN.md)
- **Competitors:** see [COMPETITORS.md](COMPETITORS.md)
- **Full research, with charts and a profit calculator:**
  - [Business plan](https://claude.ai/artifact/MmgEXTBY23RTpmvHVUWnLJ)
  - [Creator voiceover research](https://claude.ai/artifact/K7Soi8i3L8uPYaNXiuQsW8)

Each decision is marked:

| Mark | Meaning |
|---|---|
| ✅ Decided | You chose it and it's built into the app |
| 🟡 Proposed | Recommended, not yet confirmed or not built |
| ⏸ On hold | You chose to wait |
| ❓ Open | Needs your decision |

---

## 1. What ListenUp is

An Android app that reads documents aloud: PDFs (including scanned ones), photos, Word files, EPUBs, web articles, pasted text and notes. Audio is made on demand, a few sentences at a time, and cached on the server so replays cost nothing.

### Positioning ✅ Decided (4 October 2026)

- **Don't compete on English listening.** ElevenReader (ElevenLabs) and Speechify own their voice models and outspend everyone. ListenUp rents its voices, so it can't sell the same English voices for less.
- **Win on Bangla.** Global apps treat Bengali as one of 90 languages. ListenUp:
  - reads old Bijoy and SutonnyMJ PDFs correctly
  - switches voice sentence by sentence when Bangla and English are mixed
  - has Bangla voices with emotion
- **Sell to Bengali speakers everywhere, not only Bangladesh:**
  - Bangladesh
  - about 100 million in India, who pay on Play with UPI
  - the diaspora in the UK, US, Gulf countries and Malaysia, who pay at normal prices
- **Reach beyond Bengali** with Hindi, Spanish, Portuguese (Brazil), French, Italian, Japanese, Mandarin, Urdu and Indonesian (11 languages in all).
- **Pitch:** "It reads Bangla the way it's really written, in old PDFs and mixed with English, in voices that can laugh or sound sad, at a price that makes sense in Dhaka and Kolkata."

### Who it's for

- University students and job-exam candidates (BCS, bank jobs), listening to notes while commuting
- Older readers and people with poor eyesight or dyslexia
- Diaspora families
- Language learners
- Creators who need Bangla and English voiceovers (see section 7)

### Business model ✅ Decided

- **Subscriptions are the business.** Plus and Pro through Google Play.
- **Studio packs** are the high-margin add-on: one-time Expressive minutes for creators.
- **Ads are pocket money.** Free plan only. One ad view in Bangladesh pays for about one second of a Gemini voice, so ads never buy Expressive minutes.
- **Goal:** a small, low-investment business that a few hundred paying users make worthwhile.

---

## 2. Voices and what they cost

Three voice levels ✅ Decided. Costs include OpenRouter's 5.5% fee. Prices are coded in [`voice-pricing.ts`](backend/src/config/voice-pricing.ts).

| Level | Voice | Cost per hour of audio | Notes |
|---|---|---|---|
| Phone | Android's built-in voices | $0.00 | Free, offline, no emotions. Includes Bangla when installed. |
| Natural, on the phone | Kokoro-82M downloaded to the phone (165 MB, once) | $0.00 | ✅ Decided 7 Oct 2026. Free, unlimited, offline. Only on phones fast enough to keep up (a speed test after download). Not Japanese. |
| Natural, from the server | Kokoro (`hexgrad/kokoro-82m`) on OpenRouter | ~$0.03 | Phones without the download, slow phones, Japanese voices, MP3 exports, the podcast feed and voice notes. Good English and several other languages. No emotions, no Bangla. |
| Expressive | Gemini 3.8 Flash-Lite TTS, until 31 Dec 2026 | ~$0.58 | Emotions, HD Bangla, Urdu, Indonesian |
| Expressive | Gemini 3.8 Flash-Lite TTS, from 1 Jan 2027 | ~$1.16 | **Google doubles every Gemini TTS rate.** All margins below use this price. |
| Your own voice (Pro) | The same model, with a voice made from the listener's recording | Same as Expressive | ✅ Decided 11 Oct 2026. Counted as Expressive minutes. Made by Google directly only, so it needs `GEMINI_API_KEY`. |
| Expressive, for Bangla or Hindi typed in English letters | Gemini 3.8 Flash TTS (the larger model) | ~$0.87, and ~$1.74 from 1 Jan 2027 | ❓ On since 13 Oct 2026, yours to confirm. 1.5 times the usual model. It kept a Bangladeshi accent on lines mixed with English in 13 of 16 takes, against 8 of 16. Counted as ordinary Expressive minutes. `TTS_MODEL_TYPED` turns it off. |

- One hour of audio is about 52,000 English or 43,000 Bangla characters.
- Listening at 1.5× doesn't change the cost. Replaying cached audio is free.
- When two users play the same sentence in the same voice, it's made and paid for once (the shared `AudioBlob` cache).
- **Bangla defaults to the Expressive voice Nusrat.** Free users hear HD Bangla first, then fall back to the phone voice after their 5 trial minutes (15 until 7 October).
- Indian English voices (Arjun, Maya) stay on Kokoro, so they can't do emotions. Gemini kept an Indian accent only about a third of the time.
- **Natural voices on the phone** ✅ Decided 7 October 2026:
  - Downloaded from inside the app after install, never bundled with it.
  - Unlimited on every plan, Free included. Server Natural minutes stay as they are.
  - When the phone can't (no download, too slow, or it fails), the server voices them through OpenRouter, and later your own Kokoro server (`KOKORO_URL`).
  - Phone speed is unknown until it's tested on real phones. Mid-range and better phones are expected to keep up; budget phones may not.

---

## 3. Plans and prices

✅ Decided and built in [`plan-catalog.ts`](backend/src/modules/plans/plan-catalog.ts). Store prices are set in Play Console (not done yet). The app shows the store's local price.

| | Free | Plus | Pro |
|---|---|---|---|
| **Price, global** | $0 | $3.99/mo or $39.99/yr | $8.99/mo or $89.99/yr |
| **Price, Bangladesh** | ৳0 | ৳149/mo or ৳1,490/yr | ৳399/mo or ৳3,990/yr |
| Phone voices | Unlimited | Unlimited | Unlimited |
| Natural voices made on the phone | Unlimited | Unlimited | Unlimited |
| Natural voices from the server | 60 min a month | 40 h a month (reduced: 20 h) | 60 h a month (reduced: 40 h) |
| Expressive voices | 5 min, once (trial) | 90 min a month (reduced: 30 min) | 4 h a month (reduced: 90 min) |
| Translation | 30k characters a month | 1M characters a month (reduced: 250k) | 3M characters a month (reduced: 750k) |
| Reading scans and photos (OCR) | 200 pages a month | No cap | No cap |
| Daily digest | 8 a month | Every day | Every day |
| MP3 export and offline downloads | — | ✓ | ✓ |
| Private podcast feed | — | ✓ (moved from Pro on 5 Oct) | ✓ |
| Summaries and quizzes | — | ✓ | ✓ |
| Make it expressive (AI directs the story: style, strength, and each character in their own voice) | — | ✓ (Gemini 3.5 Flash-Lite) | ✓ (Gemini 3.8 Flash, a smarter director) |
| Add emotions yourself (mood bar, select text, paint, say it in your own words, or say the line yourself and the voice follows) | ✓ | ✓ | ✓ |
| Voice notes | ✓, ends with "Made with ListenUp" | ✓ | ✓ |
| Ads | Shelf banner, plus rewarded ads | None | None |
| Your own voice (made from a recording of you) | — | — | ✓ (11 Oct). Not in the UK, the EEA, Switzerland, India, Illinois or Texas |

- **Reduced allowances** apply to subscriptions bought in lower-price countries: BD, IN, PK, NP, LK, ID, PH, VN, NG, EG and KE. They're based on the user's Play country. Translation is reduced too (9 October 2026).
- **Before buying,** the Plans screen uses the phone's time zone in place of the Play country, so a listener in Bangladesh sees what ৳149 buys there.
- **AI text features count in the daily spending caps** (9 October 2026), alongside voices: reading scans, translation, digests, summaries, Make it expressive, and the community check.
- **Monthly allowances** reset on the 1st of each month. Free's Expressive minutes are a one-time trial.
- **Play product IDs:**
  - subscriptions `plus` and `pro`, each with base plans `monthly` and `yearly`
  - RevenueCat entitlements `plus` and `pro`

### Studio packs ✅ Decided

One-time purchases of Expressive minutes that never expire. They're used after the monthly minutes run out.

| Pack | Global | Bangladesh | Margin at 2027 cost, every minute used |
|---|---|---|---|
| `studio_30`: 30 minutes | $2.99 | ৳199 | 77% global, 58% Bangladesh |
| `studio_120`: 120 minutes | $9.99 | ৳699 | 73% global, 52% Bangladesh |

**Rule:** never sell Gemini audio for less than $1.40 (৳170) an hour.

### Margins at 2027 prices

What you keep after Google's 15% and the voice cost, before fixed costs.
- **Typical** means the user uses 35% of their allowance.
- **Heavy** means all of it.

| Plan | You receive a month | Typical margin | Heavy margin |
|---|---|---|---|
| Plus monthly, global | $3.39 | 68% | 9% |
| Plus yearly, global | $2.48 | 56% | −25% |
| Pro monthly, global | $7.64 | 69% | 13% |
| Pro yearly, global | $5.67 | 59% | −18% |
| Plus monthly, Bangladesh | $1.03 | 57% | −23% |
| Pro monthly, Bangladesh | $2.75 | 61% | −13% |

- Typical users pay for heavy ones.
- Bangladeshi users mostly listen on free phone voices, so real costs there should come in lower.
- Moving downloads and exports to Google's half-price Batch/Flex tier would raise every margin (section 11).

### Why the old plans were replaced

The first plans (Plus ৳299 and Pro ৳799, almost all on Gemini) lost money:
- Plus lost money after about 1.8 hours of listening a month at 2027 prices.
- A free user could cost up to $6.66 a month.

---

## 4. Keeping costs under control ✅ Built

- **Daily spending caps:**
  - `FREE_DAILY_SPEND_CAP_USD` (default $2) covers all free users together.
  - `FREE_USER_DAILY_SPEND_USD` (default $0.25, 15 October 2026) is one Free account's share of that a day, so one account can't pause free audio and AI for everyone. A Free user's heaviest real day (a month's minutes, OCR and translation at once) is about $0.30; a usual day is a few cents.
  - `DAILY_SPEND_CAP_USD` (default $25) covers everyone.
  - When a cap is hit, new audio pauses (`BUDGET_PAUSED`) and the app switches to phone voices.
- **Automatic fallback:** if minutes run out or the voice service fails, the phone voice takes over and playback continues.
- **Kokoro protection:**
  - 7-second limit per request, retried on a second host, 3 tries in all.
  - After 3 failures in a row, Kokoro is paused for 30 seconds.
- **Smaller files:** MP3s at 40 kbps (about 37% smaller). Unused audio is deleted daily.
- **New audio counts against the allowance:** MP3 exports, podcast episodes, downloads and every regenerated take all count.
- **Second takes for feelings are our cost** (13 October 2026). A voice follows a feeling in about half its takes, so the server measures the take and makes another when it missed:
  - Whisper: up to 3 takes. Angry, shouted, sad and frightened: up to 3 for a feeling the listener set, up to 2 for one the AI suggested.
  - The listener is charged for the audio they get, not for takes that weren't kept.
  - A part where half the lines have such a feeling made 1.2 to 1.4 times the speech it kept. Parts without them cost the same as before.
  - The daily spending caps count every take since this date; before, they counted only the one kept.
- **A recorded line ("Say it yourself") is three takes** (13 October 2026). The closest to the listener's performance is shaped to it; the other two are our cost. The listener is charged for one. The recording isn't kept; measurements of how the line was said are, with the document's files, and go when the document or the account does.
- **No AI listening check** ✅ Decided against, 13 October 2026. An audio model listening to every marked line would cost 3 to 4 times the voice price of those lines (not the 1.8 times first estimated), and it couldn't tell a feeling from the words: it passed a plainly read sad sentence as sad 9 times in 12.
- **No Bangla-script step for Banglish** ✅ Decided against, 13 October 2026. Typed Bangla is already pronounced right (1.0% of letters wrong, against 1.2% in Bangla script), and the accent on lines mixed with English didn't improve (10 of 24 takes, against 12 of 24 typed). The larger voice model is what helped.

---

## 5. Free plan, ads and invites ✅ Built

### Ads (Free only)

- One small banner on the shelf, after the third item, with "No ads with Plus".
- A rewarded ad gives **10 Natural minutes**, or **3 in reduced-price countries** (9 October 2026; there, a view earns about $0.00035 while 10 minutes cost up to $0.0057). At most **3 a day**. Never Expressive minutes.
- Free users have no Play country, so the phone's time zone places them (`Asia/Dhaka` → Bangladesh). Unknown counts as standard.
- Google's consent form appears where the law needs it (EU, UK). "Ad privacy choices" is in Studio.
- Rewards are verified by AdMob's signed server-side callback once `ADMOB_SSV=true`.
- What one ad view earns:

| Where | Per 1,000 views | One view buys (Natural) | One view buys (Expressive) |
|---|---|---|---|
| Bangladesh | ~$0.35 | ~37 seconds | ~1 second |
| India, Indonesia, Pakistan (rewarded) | $1–3 | 2–5 min | 3–9 seconds |
| US, UK (rewarded) | $15–30 | 26–53 min | 0.8–1.6 min |

### Invite a friend

- Both people get **10 Expressive minutes**, or **5** for a person in a reduced-price country (9 October 2026). Each person's own region decides theirs.
- The reward is given once the friend has confirmed their email and listened for **5 minutes**.
- Each person is rewarded for at most **10 invites**.
- Codes can be entered for **14 days** after signing up. A Play link carries the code through the install referrer.
- Own codes and circular invites are refused.
- **One account per inbox** (15 October 2026): another spelling of an email that has an account (a Gmail dot, a "+tag", googlemail.com) makes no new account, and older accounts that share an inbox can't use each other's codes. Listening counts no faster than the clock, so the 5 minutes can't be faked by repeating one report.
- **Cost:** at most about 39 cents per pair at 2027 prices (20 Expressive minutes), and about 19 cents today.

### Viral loops

- **Voice notes** on Free end with a spoken "Made with ListenUp".
- **Share to ListenUp** brings content in from any app.
- **Explore: free classics** ✅ Decided (8 October 2026). A hand-picked shelf of out-of-copyright stories and books in Bangla and English (Tagore, Sarat Chandra, Bankim, Sukumar Ray, Poe, Austen, Conan Doyle…). New users have something to hear before importing anything. Popular titles are cheap: everyone who adds one gets the same text, so its audio is made once per voice and shared.
- **Explore Community and the monthly writing contest** ✅ Decided and built (8 October 2026).
  - **What it is:** listeners publish their own writing, voiced the way they set it up (voice, emotions, pronunciations), and short AI voice clips (a line or paragraph, including credited lines from the classics). Others listen for free and heart them. Every published piece is a reason to share the app.
  - **The contest:**
    - One entry per writer a month.
    - Boards for Bangla, English and other languages.
    - The top 3 on each board win **60 / 30 / 15 Expressive minutes**. They never expire and have no cash value.
    - A heart counts only if the listener heard the piece (half of it, or 2 minutes), and their account has a confirmed email and is at least 7 days old.
    - Accounts on one inbox count as one heart together, and never for the writer's own inbox (15 October 2026).
    - A winner needs 3 hearts that count.
    - Prizes are paid a day after the month ends, so last-minute reports can be reviewed first.
    - You can set a theme each month.
  - **Cost:**
    - Prizes: at most 315 Expressive minutes a month (3 boards × 105). That's about $3 now and $6 at 2027 prices, and only when the minutes are used.
    - Voicing: the writer pays for any parts not yet voiced, from their own minutes, once. Listeners reuse that audio, so listening costs nothing.
    - The AI check costs about $0.001 per writing. A cover picture is looked at in the same check, for a small fraction of a cent more.
  - **Cover pictures** ✅ Decided (12 October 2026): writers add their own when they publish (optional). Titles without one, and the classics, keep the drawn cover. AI-painted covers were offered (about 4 cents a title) and not chosen.
  - **Limits:** 30,000 characters per writing, 5 writings and 10 clips a day per person.

---

## 6. Payments

### How purchases work ✅ Built

- Google Play Billing through **RevenueCat**.
- The server learns about purchases, renewals and cancellations from RevenueCat's webhook. An hourly job returns lapsed plans to Free.
- Studio packs are credited once per transaction.
- Setup steps are in [`backend/BILLING.md`](backend/BILLING.md).

### The Bangladesh payment problem ❓ Open

- **Google Play doesn't take bKash or Nagad.** Bangladesh isn't in Play's alternative-billing programs.
- Most Bangladeshis can't pay in the app. Some can pay with an international or dual-currency card, or with a Play gift card bought through bKash (Codashop).
- **Indian buyers (UPI) and diaspora buyers (cards) can pay.**
- Options:

| Option | Cost | Status |
|---|---|---|
| Play billing only | 15% fee | ✅ Built |
| Explain Play gift cards in your own Facebook and YouTube posts (not inside the app) | 15% | 🟡 Do from launch |
| bKash checkout on a website. The app may never link to it or mention it. | ~1.5–1.8% per payment. Needs a trade license and 1–3 weeks of approval | 🟡 After the creator beta |
| SSLCommerz (cards, bKash, Nagad) | From 2.5% per payment, plus ৳25,500 setup | Too early |

- A bKash checkout also saves Google's 15%. That is most of the gap between the Bangladesh and global margins.
- Check Play's payments policy again before launching it.

### Benchmark

Kabbik, a Bangla audiobook app, charges ৳40–50 a month or ৳420–450 a year, paid through bKash and Nagad. That's what Bangladeshi listeners are used to paying for audio.

---

## 7. Creators: Studio voiceovers

Researched 5 October 2026 ([full research](https://claude.ai/artifact/K7Soi8i3L8uPYaNXiuQsW8)). Status: 🟡 Proposed.

- **The price holds up.** Other tools charge $0.09–0.20 a minute; Studio packs are $0.10 a minute globally and about $0.05 in Bangladesh.
- **The real competitor is free:** CapCut's built-in voices. ListenUp wins only on:
  - emotion
  - Bangladeshi Bangla that sounds right
  - Bangla and English in one script
  - Bangla subtitles
- **Most likely payers:** Facebook shops (about 60,000 that sell regularly) making product Reels, then story and explainer channels, teachers, and Indian and diaspora creators.
- **Platform rules:**
  - YouTube doesn't block monetization for AI narration itself, only for mass-produced, templated content.
  - Meta asks people to label realistic AI audio.
  - Gemini's paid tier lets customers use the output commercially.
  - Kokoro is Apache 2.0. On the phone it runs through sherpa-onnx (Apache 2.0), which includes espeak-ng (GPL-3.0): see section 10.
- **Built 7 October 2026** ✅ (Studio is now the creator workspace):
  - scripts of any length, split into parts automatically
  - fix one part and only that part is voiced again (the rest is reused, and the export sheet shows how many minutes that saved)
  - "New take" for one part
  - pronunciations that every voice keeps using until they're changed
  - SRT and VTT subtitles with every MP3, timed to the audio's pauses, at no AI cost
- **Added later on 7 October:**
  - redo one sentence, charged for that sentence only
  - a voice per part, for characters
  - a pause after any part
  - locked parts
  - find and replace with a cost preview
  - minutes used shown on each script
  - short captions for Reels and Shorts, the script as text, and single-part downloads
  - every action that records audio shows its cost first ("fixed honesty")
- **What these do to the money:**
  - None of them adds a running cost. Subtitles are worked out on the server's CPU; pronunciations and edits only change which parts are voiced.
  - Editing a part saves the creator minutes but doesn't cost you anything extra: they could already re-paste a script, and identical parts were reused then too.
  - **Creators use more of their allowance than listeners.** Retakes, pronunciation fixes and re-exports all count as new audio. Treat creators as "heavy" users in the margin tables.
- **Plan:**
  1. Small builds first: ✅ a subtitle file (SRT and VTT), Banglish-to-Bangla typing, a commercial-use sentence in the Terms, and no "Made with ListenUp" tag on paid exports.
  2. A 30-day beta with 20 creators: 10 Facebook shops and 10 story or explainer channels, each given 60 free Expressive minutes.
  3. If at least 5 of the 20 would pay and payment is what stops the rest, add a bKash checkout on the web.
- **Revenue scenarios** (profit a month, from packs only):

| Scenario | Profit a month |
|---|---|
| Slow start | $75 |
| Working, with Indian and diaspora buyers | $500 |
| With a bKash checkout and repeat buyers | $1,800 |

---

## 8. Competitors

| App | Price | What it means for ListenUp |
|---|---|---|
| ElevenReader (ElevenLabs) | $11/mo or $99/yr unlimited; 10 h a month free | Can't be beaten on English quality or price |
| Speechify | $29/mo or $139/yr | Expensive, so there's room below it |
| @Voice Aloud Reader | Free with ads, $15 once to remove them | Proves the phone-voices-plus-ads model on Android |
| Android Reading mode, Chrome, Edge | Free | The real competitor for casual listeners |
| Kabbik | ৳40–50/mo | The local price benchmark |
| ElevenLabs (creators) | $6 for ~30 min, $22 for ~121 min | Creators pay ~$0.18–0.20 a minute; your cost is ~$0.02 |
| VoisLabs (West Bengal) | ₹299 for 18 min, ₹2,499 for 300 min | The closest creator product: Bangla subtitles, 48 tone presets |
| CapCut | Free inside the editor | The free alternative for creators |

---

## 9. Running costs and infrastructure

### Where things run ✅ Decided

| Part | Where | Cost |
|---|---|---|
| API and background jobs | One Docker image on **Render**, one Web Service with `RUN_WORKERS=true` on the paid Starter plan, so it never sleeps | $7/mo; $25 on Standard if memory runs short |
| Database | **Supabase** Postgres in Tokyo (ap-northeast-1), through the session pooler | Free to start, $25/mo on Pro |
| Audio and files | **Cloudflare R2**, bucket `tts` | Free up to 10 GB; an hour of MP3 is ~15–30 MB |
| Voices and text AI | **OpenRouter** | Prepay $20–50 and set a monthly limit on the key. Keep the key's limit high enough: Gemini voice needs at least $0.50 available, or every HD voice falls back to the phone voice. |
| Natural voices (Kokoro) | **On the phone** (the voice package is downloaded from R2), with the server as backup: OpenRouter for now, your own server (`KOKORO_URL`) later | $0 on the phone. The 165 MB package sits in R2, which charges nothing for downloads. Your own Kokoro server is optional: one Hetzner CAX21 (4 ARM cores, 8 GB) for the backend and Kokoro is about €10.49 a month. |
| Purchases | **RevenueCat** | Free at this size |
| Store | **Google Play** developer account | $25 once; Bangladesh is a supported seller country, paid in USD |
| Domain (privacy policy, links) | — | ~$12/yr |

**Launch budget:** about $35–60 the first month, then $10–60 a month plus voice usage.

A Vercel API plus a separate worker is still possible with the same image, but isn't used.

---

## 10. Policies and legal

- **Account closure** ✅: a 30-day grace period. Signing in within 30 days restores the account; after that a scheduled job erases it. Play requires deletion inside the app.
- **Terms and Privacy** ✅: drafted in the app, in one editable file. They cover ads (AdMob, advertising ID, consent), invites and the podcast link. **They need a legal review before release.**
- **Commercial use** 🟡: add one clear sentence to the Terms granting creators commercial use of exported audio.
- **Your own voice** ✅ (built 11 October 2026):
  - Your own voice only, recorded in the app: a passage, then Google's consent sentence, which Google checks is said by the same person. Adults only.
  - Private to the account: it can't be published in Explore or given to a character. It can be exported, since voiceovers are the point.
  - Not offered where Google doesn't offer it: the UK, the EEA, Switzerland, India, Illinois and Texas.
  - One voice per account, 5 recordings a month. When Pro ends it's kept and locked, not deleted.
  - Deletable at any time: the voice at Google, the two recordings, and the audio kept in it.
  - The Terms and Privacy pages cover it. **For the legal review:** a voice recording may count as biometric data in some countries.
- **AI labels** 🟡: a line on the export screen reminding creators to use the platform's AI label.
- **On-device voice licence** ❓: Kokoro and sherpa-onnx are Apache 2.0, but sherpa-onnx includes espeak-ng (GPL-3.0) to turn text into sounds. Have this checked before release. The app may need to show the licences, or a lawyer may advise another route.
- **Private podcast** ✅: the secret link is the only protection, and it can be replaced at any time. The feed is kept out of podcast directories.
- **Explore Community (user content)** ✅ (8 October 2026). There's a Community rules page in the app, and the Terms and Privacy pages cover it.
  - Moderation: an AI check of the text, and of the cover picture if there is one, before anything is published. A cover that breaks the rules is dropped and the writing goes out with a drawn cover. Report (7 reasons; 3 reports hide a piece until it's reviewed) and Block writer. The ListenUp team reviews in the app, for accounts in `ADMIN_EMAILS`, and sees the cover there.
  - Cover pictures (12 October 2026) are cut to a cover's shape and saved again as a new file, which drops what a phone adds to photos (place, time, camera). They are deleted when the writing is unpublished or the account is erased.
  - Writers: own work only, with an "I wrote this myself" tick. Unpublishing removes a piece from every listener's shelf. Listeners can't export, translate or republish someone else's writing.
  - **Before release:** declare user-generated content in Play Console, update the Data safety form (it now also has to list photos: cover pictures are collected and shown to other users), and include the Community rules in the legal review.
- **Voice profile pictures** ✅ Decided (12 October 2026): drawn faces, not photos or AI portraits. They are Lorelei by Lisa Wischofsky, released as CC0 1.0 (public domain), so there is nothing to pay or credit. AI-painted portraits were offered (about $2 for all 46) and not chosen.
- **Explore's classics** ✅: only works in the public domain in Bangladesh, India and the US (authors who died over 60 years ago, and works published before 1930). **Nazrul is not** (he died in 1976; protected until 2037). Texts come from Project Gutenberg (licence header and trademark removed) and Wikisource, credited with a link.

---

## 10b. Will ListenUp make money? (checked 7 October 2026)

At 2027 Gemini prices, confirmed again on 7 October: Flash-Lite TTS goes from $6 to $12 per million audio tokens. The model is in the conversation notes; the inputs are the margin tables in [MARGIN.md](MARGIN.md).

- **Each paying user earns money.** About $0.96 a month for a Bangla-first mix (60% reduced-price countries, 30% creators using their full allowance), and $1.39 for a global mix. That is a 41–45% margin after Google's 15% and the voices.
- **Before 7 October, the free plan lost more than the payers brought in.** Bangla defaults to the Expressive voice Nusrat, so almost every Bangla free user used the whole 15-minute trial: **$0.29 per new user** in 2027.
  - To pay for that, **4–5% of new users must become paying users**. The usual rate is 1.4–2.1%.
  - So growth in Bangladesh would have lost money from January 2027. The changes below fix that.
- **With a smaller trial, it makes money.** A 5-minute trial, or phone voices by default with HD Bangla one tap away, cuts the cost to about $0.03 per new user. Break-even then falls to **0.8–1.6% conversion**, below the usual rate.
- **Fixed costs** (~$33 a month with Supabase Pro) need about 25–35 paying users.
- **Losses on individual users** stay as in section 3: heavy yearly users, and heavy users in reduced-price countries, especially creators there who use all their Expressive minutes.
- **What was changed on 7 October to make money instead of losing it** ✅:
  1. **Free Expressive trial cut from 15 to 5 minutes.** At most about $0.10 per new user in 2027.
  2. **Google directly, with the half-price flex tier for MP3 exports, offline downloads and podcast episodes.** It skips OpenRouter's 5.5% everywhere. It needs `GEMINI_API_KEY` from a paid Google AI Studio account; without it, everything keeps going through OpenRouter. **14 Oct 2026:** the key is set, but a new paid project (Tier 1) gets 10 speech requests a minute and 100 a day per model, so almost all speech still goes through OpenRouter. The savings arrive at Tier 2 ($100 paid and 3 days after the first payment), and "Your own voice" (Google only) shouldn't be offered to users before then. **Later the same day:** Expressive voices now go through Vertex AI first, billed to the Cloud project and its ~$300 of credits (about 550 hours of audio at today's price, 270 after the 2027 doubling), at Google's price and without the 100-a-day limit. Once the credits are used, Vertex is cash at the same price as the key.
  3. **Yearly prices at about 10 months:** Plus $39.99 / ৳1,490, Pro $89.99 / ৳3,990. Set them in Play Console.
- **Result (same model, 2027 prices, Bangla-first mix, 2% of users paying):**

| | Before | After |
|---|---|---|
| Profit per paying user a month | $0.96 | $1.25 |
| Share of users who must pay to break even | 4.2% | 0.6–1% |
| Monthly profit at 5,000 users | −$204 | about +$18 |
| Monthly profit at 20,000 users | −$717 | about +$170 |

- **To grow beyond that:** Studio packs (52–77% margin), users outside Bangladesh (about 3× more per user), and a bKash checkout on the web.
- **Leaks closed on 9 October** (your answer to "is the price okay?": yes per paying user, but a few features could cost more than a user pays):
  - translation reduced in reduced-price countries (the −115% case is gone)
  - AI text counted in the daily caps
  - Free capped at 200 scanned pages and 8 digests a month
  - ads and invites smaller in reduced-price countries
- **Still open:** global Plus at $4.99 instead of $3.99. It's optional, and would raise the heavy-user margin from 9% to about 27%.

## 11. Open decisions and things on hold

| Item | Status | Notes |
|---|---|---|
| Your own voice for Pro | ✅ Built 11 Oct 2026 | Untested against Google (no key yet). Open: how it sounds in Bangla, and whether Google's region limits apply to apps on its API |
| Creator edges: 13 ideas in 7 phases ([CREATOR-EDGES.md](CREATOR-EDGES.md)) | 🟡 Proposed (9 Oct 2026) | Nine decisions are listed at the end. **Found:** Studio packs never expire, but MP3 export needs Plus or Pro, so "no subscription needed" isn't true yet |
| bKash checkout on the web | ❓ Open | Decide after the creator beta (section 7) |
| Launch kit (Phase 7): store listing in six languages, keywords, screenshots, launch countries, launch-week calendar | ⏸ On hold | |
| Community: writer pages, updating a published writing without losing its hearts, a push notification for wins and published posts | 🟡 Proposed | Built without them on 8 October 2026 |
| Statistics and owner dashboard | ⏸ On hold | Spend is already recorded per day and per model (`SpendDay`) |
| Auto-add new documents to the podcast | ❓ Open | Would spend users' minutes without asking |
| Indian English voices with emotions | ❓ Open | They stay on Kokoro for now |
| Natural voices on the phone | ✅ Built 7 Oct 2026 | Needs testing on real phones, including a budget one, and a licence check |
| Run Kokoro on your own server | 🟡 Later | Now only a backup for phones that can't run it; OpenRouter until then |
| Call Google directly, with Batch/Flex for downloads and exports | ✅ Built; key set 14 Oct 2026; Vertex AI first since the same day | Saves 5.5%, and half price for audio nobody is waiting on. The key's flex only at Tier 2 (Tier 1: 100 speech requests a day); Vertex has no such limit and runs on the Cloud credits |
| Student or family plan | 🟡 Proposed | Raises the share of users who pay in South Asia |
| Exam pack (spaced-repetition flashcards from quizzes) | 🟡 Proposed | A strong reason for students to buy Plus |
| Send to ListenUp by email | 🟡 Proposed | A daily habit, and it feeds the digest |
| iOS and a web reader | 🟡 Later | Only after Android pays for itself |

---

## 12. Risks

- **Gemini prices double on 1 January 2027.** Every margin and cap here already assumes it. Re-check prices before quoting margins.
- **Kokoro is unreliable on OpenRouter** (5 October 2026): both hosts often time out. The app falls back to phone voices. Natural voices on the phone avoid this for phones that can run them.
- **Budget phones** may be too slow for Natural voices on the phone, and many listeners in Bangladesh use them. They keep using the server and its monthly minutes.
- **Payments in Bangladesh** (section 6).
- **Free is good enough for many:** built-in readers for listeners, CapCut for creators.
- **Bigger players are moving in:** ElevenLabs v3 speaks Bengali, and VoisLabs targets Bangla creators.
- **Misuse:** scams and fake political audio. Your own voice is limited to the account that recorded it, needs a spoken consent that Google checks, and can't be published in Explore. Keep logs of who voiced what, and remove abusers.
- **Your own voice depends on Google alone.** No other provider can make it, Google holds 200 voices per project, and it isn't offered in the UK, the EEA, Switzerland or India, where much of the Bengali diaspora lives. If its Bangla isn't good enough, the backup (Cartesia) costs 2 to 3 times as much.
- **Platform labels:** Meta can cut reach for undisclosed AI audio, and YouTube demonetizes templated channels.

---

## 13. How to judge it: the 60-day check

After launch, decide from these numbers, not guesses:

- **Share of users who pay.** The freemium median is 2.1%, and 1.4% in India and Southeast Asia (RevenueCat 2026).
- **Hours listened per paying user**, split into Natural and Expressive.
- **Voice cost per paying user**, compared with what they pay after Google's 15%.
- **Users still active after 30 days.**
- **For creators:** minutes used per creator, how many bought after free minutes, and how many bought again.

## Creator features and voice translation (decided 14 October 2026)

- **Pitch, speed and tone are set per script and baked into the audio**, so MP3 exports and the podcast carry them (the user's choice over a playback-only setting). Speed 0.75× to 1.25×, pitch ±4 semitones; tone is a direction, so it works on Expressive voices only. Changing them re-voices the script's parts, at the listener's minutes.
- **A platform for each script** (YouTube, Shorts, TikTok, Reels, Facebook, podcast, audiobook) sets the kind of narration, a length guide, the export's loudness and subtitles, and a starter template. Platform loudness is the honest version of "sounds right without knowing what LUFS is" from CREATOR-EDGES.md idea 13.
- **Voice translation is Pro**, alongside "Your voice": a recording (one speaker, up to 10 minutes) is written down, translated and read in a copy of the speaker's voice, made only after the speaker reads Google's consent sentence in person. 20 a month per person. The Terms make a written exception to "record only your own voice" for it.
- **Speakers' voices are Google's 7-day stateless voices,** not stored ones, so they don't use the project's 200 stored voices; they're renewed from the kept recordings when used again.
- **Limit to know:** own and speaker voices are spoken only through the Gemini API key (100 speech requests a day on Tier 1). Until Tier 2 (or Vertex proves it can speak them), they can't carry real use.

## Platform pages in Studio (decided 15 October 2026)

- **A page each for TikTok, Reels with Facebook, and YouTube Shorts with YouTube** (the user's choice: cards inside Studio, not a new tab). Each has narration styles native to the platform, the post writer (caption, hashtags, title, tags) and subtitles in the platform's style, including a new word-by-word style.
- **The post writer is on every plan:** about $0.0005 a post in English and $0.002 in other languages, which use the stronger model because the small one misspelt Bangla. A reason to come back each time a video goes up, at almost no cost. Subtitles still need the MP3, so they stay Plus and Pro.
- Not chosen this time, and still open: an AI script writer from a topic, a video maker (MP4 with captions over a background), and a series splitter.


# ListenUp margins

Where ListenUp makes money, where it loses money, and how to fix the losses.

- **Prices checked:** 5 October 2026, on OpenRouter
- **Plans and limits:** as built in [`plan-catalog.ts`](backend/src/modules/plans/plan-catalog.ts)
- **Other business decisions:** [BUSINESS.md](BUSINESS.md)

**How to read this:**
- **Margin** is what you keep after Google Play's 15% and the cost of making the audio or text, before fixed costs like servers.
- **Typical** means a user uses 35% of their allowance. **Heavy** means they use all of it.
- Every margin uses the **2027 voice price**, because Google doubles Gemini TTS prices on 1 January 2027.
- Taka figures use ৳123 to the dollar.

---

## The short version

- **You make good money on:**
  - monthly subscriptions bought at global prices: 68–69% typical margin
  - Studio packs: 52–77%
  - anyone who listens on phone or Natural voices
- **You lose money on:**
  1. **Heavy users of yearly plans** and **heavy users in Bangladesh and other reduced-price countries.**
  2. **Translation.** It has the same allowance in every country, so a Bangladeshi Plus user can translate about $0.95 of text a month while paying you $1.03.
  3. **AI features with no limit:** OCR of scanned and Bijoy PDFs and the daily digest are open to every plan, including Free. They also **don't count toward the daily spending caps.** ("Make it expressive" is now Plus and Pro only, and sized to the listener's Expressive minutes.)
  4. **Rewarded ads in South Asia.** An ad view in Bangladesh earns about $0.00035, but its 10 Natural minutes cost up to $0.0057.
  5. **Invites in Bangladesh.** 20 Expressive minutes per pair (up to $0.39) probably cost more than the subscribers invites bring there.
  6. ✅ **Fixed 7 October: the Free Expressive trial.** Bangla defaults to Expressive, so nearly every Bangla free user used all 15 minutes: $0.29 each in 2027, which needed 4–5% of new users to pay. It's now 5 minutes (about $0.10 at most), and break-even is about 1%. See [BUSINESS.md, section 10b](BUSINESS.md#10b-will-listenup-make-money-checked-7-october-2026).
- **The biggest fixes:**
  - a 5-minute Free Expressive trial, or phone voices by default for Free Bangla
  - a lower translation allowance in reduced-price countries
  - text-AI spending counted in the daily caps
  - limits on AI features for Free
  - yearly prices closer to 10 months of the monthly price
  - a bKash checkout once creators prove they'll pay

---

## 1. What everything costs you

Prices include OpenRouter's 5.5% fee.

### Voices

| Voice level | Model | Per hour | Per minute |
|---|---|---|---|
| Phone | Android's built-in voices | $0 | $0 |
| Natural | Kokoro, $0.62 per million characters | $0.034 | $0.00057 |
| Expressive, until 31 Dec 2026 | Gemini 3.8 Flash-Lite TTS, $6 per million audio tokens | $0.58 | $0.0097 |
| **Expressive, from 1 Jan 2027** | same, price doubled | **$1.16** | **$0.0193** |

- Replaying audio that's already made costs nothing.
- When two users play the same sentence in the same voice, it's made once (the shared cache).

### Text AI (estimates)

Text uses Gemini 3.5 Flash-Lite ($0.30 per million input tokens, $2.50 per million output tokens). OCR uses Gemini 2.5 Flash-Lite ($0.10 in, $0.40 out).

These are estimates, assuming about 3–4 characters per token. Check them against the OpenRouter dashboard once real usage comes in.

| Feature | Who gets it | Limit today | Cost each time |
|---|---|---|---|
| Translation | All plans | 30k / 1M / 3M characters a month (same in every country) | **~$0.95 per million characters**, mostly output |
| Make it expressive | Plus and Pro (since 5 Oct) | Directs only as far as the user's Expressive minutes reach (at least 20k characters, at most 400k) | Plus (Flash-Lite): ~$0.03 per 90 minutes of audio directed. Pro (Gemini 3.8 Flash, $0.75 in / $3.75 out): ~$0.08 |
| Say it in your own words | All plans | 10 requests a minute | ~$0.0003 each |
| OCR (scanned and Bijoy PDFs, photos) | **All plans** | None | ~$0.0004 a page, so **~$0.12 for a 300-page book** |
| Daily digest | All plans | 1 a day | ~$0.005 to write, plus voicing (counted in the allowance) |
| Summary or quiz | Plus and Pro | None (each refresh is a new call) | ~$0.015 |

**Daily caps cover voices only.** `FREE_DAILY_SPEND_CAP_USD` ($2) and `DAILY_SPEND_CAP_USD` ($25) count speech alone. None of the costs in the table above are capped.

### Fixed costs

| Item | Per month |
|---|---|
| Render Starter (API and workers) | $7 |
| Supabase | $0 now, $25 on Pro |
| Cloudflare R2 | $0 up to 10 GB (an hour of audio at 40 kbps is about 18 MB) |
| Domain | ~$1 |
| Google Play account | $25 once |
| **Total** | **about $8 a month now, $33 with Supabase Pro** |

---

## 2. Subscriptions

### What you receive

| Plan | Price | You receive a month after Play's 15% |
|---|---|---|
| Plus monthly, global | $3.99 | $3.39 |
| Plus yearly, global | $39.99 (was $34.99) | $2.83 |
| Pro monthly, global | $8.99 | $7.64 |
| Pro yearly, global | $89.99 (was $79.99) | $6.37 |
| Plus monthly, Bangladesh | ৳149 | $1.03 |
| Plus yearly, Bangladesh | ৳1,490 (was ৳1,299) | $0.86 |
| Pro monthly, Bangladesh | ৳399 | $2.76 |
| Pro yearly, Bangladesh | ৳3,990 (was ৳3,499) | $2.30 |

### Voice cost per plan, 2027

| Plan | Allowance | Typical cost | Heavy cost |
|---|---|---|---|
| Plus, standard | 40 h Natural + 90 min Expressive | $1.08 | $3.10 |
| Plus, reduced | 20 h Natural + 30 min Expressive | $0.44 | $1.26 |
| Pro, standard | 60 h Natural + 4 h Expressive | $2.34 | $6.67 |
| Pro, reduced | 40 h Natural + 90 min Expressive | $1.08 | $3.10 |

Expressive is about half to two-thirds of the heavy cost, although it's under a tenth of the minutes.

### Margins, voices only

| Plan | Typical margin | Heavy margin |
|---|---|---|
| Plus monthly, global | ✅ 68% | 🟡 9% |
| Plus yearly, global | ✅ 62% | 🟡 −10% |
| Pro monthly, global | ✅ 69% | 🟡 13% |
| Pro yearly, global | ✅ 63% | 🟡 −5% |
| Plus monthly, Bangladesh | ✅ 57% | 🔴 −22% |
| Plus yearly, Bangladesh | ✅ 49% | 🔴 −47% |
| Pro monthly, Bangladesh | ✅ 61% | 🔴 −12% |
| Pro yearly, Bangladesh | ✅ 53% | 🔴 −35% |

### Margins with translation fully used as well

| Plan | Heavy cost (voices + translation) | Heavy margin |
|---|---|---|
| Plus monthly, global | $3.10 + $0.95 = $4.05 | 🔴 −19% |
| Pro monthly, global | $6.67 + $2.85 = $9.52 | 🔴 −25% |
| Plus monthly, Bangladesh | $1.26 + $0.95 = $2.21 | 🔴 **−115%** |
| Pro monthly, Bangladesh | $3.10 + $2.85 = $5.95 | 🔴 **−116%** |

Few people will translate a whole million characters every month. But nothing stops one from doing it, and a Bangladeshi Plus user who does costs you twice what they pay.

**Today's prices (until 31 December 2026):** Expressive costs half as much, so every heavy margin is better. For example, Plus monthly global is 34% heavy, and Plus monthly Bangladesh is 6%. The losses above start in January.

---

## 3. Studio packs

| Pack | Price | You keep (15%) | Audio cost if every minute is used (2027) | Margin |
|---|---|---|---|---|
| 30 min, global | $2.99 | $2.54 | $0.58 | ✅ 77% |
| 120 min, global | $9.99 | $8.49 | $2.32 | ✅ 73% |
| 30 min, Bangladesh | ৳199 | $1.38 | $0.58 | ✅ 58% |
| 120 min, Bangladesh | ৳699 | $4.83 | $2.32 | ✅ 52% |

- **Retakes don't hurt these margins:** every newly made second counts against the pack.
- **Enroll in Play's 15% fee tier for one-time products.** Subscriptions are always 15%, but one-time products pay 30% unless you enroll in the 15% tier (for the first $1M a year). At 30%, the Bangladesh packs drop to 49% (30 min) and 42% (120 min).

---

## 4. Free users

What a free user can cost you each month:

| Item | Cost |
|---|---|
| Natural voices, 60 min | $0.034 |
| Expressive trial, 5 min **once** (15 until 7 October) | $0.10 in 2027 ($0.05 today), once per new user |
| Translation, 30k characters | ~$0.03 |
| Daily digest every day | ~$0.15, plus voicing |
| Rewarded ads, 3 a day × 10 Natural min (if every minute is used) | up to ~$0.51 |
| OCR | **no limit:** ~$0.04 per 100 scanned pages |

- **A typical free user** costs a few cents a month after the trial.
- **A free user who uses everything** costs about **$0.75 a month or more.**
- **What a free user earns you** from ads in Bangladesh: about $0.01–0.05 a month.
- **Expressive trial:** at 2027 prices, 1,000 new sign-ups cost about **$290**. Bangla starts on the Expressive voice, so every Bangla user uses it.
- **The free daily cap** ($2 a day, about $60 a month) limits voice spending for all free users together, but not the text-AI costs.

### Ads

| Where the viewer is | One rewarded view earns | Its 10 Natural minutes cost | Result |
|---|---|---|---|
| Bangladesh | ~$0.00035 | up to $0.0057 | 🔴 You lose about $0.005 per view |
| India, Pakistan, Indonesia | ~$0.001–0.003 | up to $0.0057 | 🔴 You lose up to $0.005 per view |
| US, UK | ~$0.015–0.030 | up to $0.0057 | ✅ You gain $0.01–0.025 per view |

In Bangladesh, one view pays for about **37 seconds** of Natural audio. The loss per view is tiny, but rewarded ads there are a cost of keeping free users, not a source of income.

### Invites

- **Cost:** 20 Expressive minutes per successful pair, at most **$0.39** in 2027 ($0.19 today), and only once the friend has verified their email and listened for 5 minutes.
- **What it buys:** an active new user. Whether that pays off depends on where they live. Assuming a paying user stays 6 months at typical use:

| Where | Profit from one 6-month Plus subscriber | Invited users who must become one, to pay back $0.39 |
|---|---|---|
| Global | $13.86 | about 1 in 36 |
| Bangladesh | $3.54 | about 1 in 9 |

- Freemium apps convert about 1.4–2.1% of users. So **in Bangladesh, invites probably cost more than the subscribers they bring.** Treat them as a growth bet, and measure them.
- The real cost is lower when invited users don't use all their Expressive minutes.

---

## 5. Where you make money: your advantages

1. **Phone voices cost nothing.** Every free user and every user past their allowance listens at $0, unlimited. A listening app can't get cheaper than that.
2. **Natural voices are almost free.** 40 hours of Kokoro costs $1.36, so you can be generous with hours, which matters for whole books.
3. **The shared cache.** Popular documents, the digest's text and repeated sentences are paid for once across all users.
4. **Monthly global and diaspora subscribers** leave 68–69% at typical use.
5. **Studio packs** leave 52–77% even if every minute is used.
6. **Every heavy feature counts against the allowance:** MP3 export, offline downloads and podcast episodes, so they can't run up costs past the plan.
7. **Play's fee is 15%,** not 30%, on subscriptions.
8. **Small fixed costs:** about $8–33 a month.
   - **Break-even:** about **15 global Plus subscribers** at typical use, or about **56 Bangladesh Plus subscribers.**

### Profit per subscriber at typical use (2027)

| Plan | Profit a month |
|---|---|
| Plus monthly, global | $2.31 |
| Pro monthly, global | $5.30 |
| Plus monthly, Bangladesh | $0.59 |
| Pro monthly, Bangladesh | $1.68 |
| Studio 120 pack, global (one-time) | $6.17 |

**One global Pro subscriber is worth about 9 Bangladesh Plus subscribers.** That's why the plan sells Bangla to Bengali speakers worldwide, not only in Bangladesh.

---

## 6. How to fix the losses

In order of value for effort.

| # | Fix | Where | What it saves |
|---|---|---|---|
| 1 | **A lower translation allowance in reduced-price countries:** for example 250k characters on Plus and 750k on Pro | `monthlyTranslateChars` in `plan-catalog.ts`, made per region like the voice allowances | Ends the −115% case. Translation's worst case in Bangladesh drops from $0.95 to ~$0.24 on Plus. |
| 2 | **Count text-AI spending in the daily caps:** record every `chatCompletion` cost in `SpendDay`, like speech | `lib/openrouter.ts`, `budget.service.ts` | A bad day can't exceed the cap. You also see what each feature really costs. |
| 3 | **Limit AI features on Free:** about 200 OCR pages a month, a digest every few days. (*Done for "Make it expressive": Plus and Pro only.*) | expressions, ingestion, documents services | Removes Free's unlimited costs. Tagging a whole book is wasted on Free, which only has 5 Expressive minutes. |
| 4 | ✅ **Done (5 Oct): Make it expressive only where it's heard.** It now directs only as far as the user's remaining Expressive minutes reach | `runAuto` in `expressions.service.ts` | Cuts most of the cost of each run |
| 5 | ✅ **Decided 7 October: yearly plans at about 10 months:** Plus $39.99 / ৳1,490, Pro $89.99 / ৳3,990 (in [BILLING.md](backend/BILLING.md)) | Play Console, when you create the subscriptions | Typical yearly margins rise by 6–8 points. Heavy yearly losses shrink. |
| 6 | **Rewarded ads by region:** keep 10 minutes in high-paying countries and give 3 minutes in reduced-price countries, or accept them as a cost of keeping users and measure whether they raise retention | `AD_REWARD_MINUTES` in `constants.ts` | Cuts the South Asia ad loss by about 70% |
| 7 | **Invite rewards by region:** 5 Expressive minutes each in reduced-price countries, or Natural minutes instead | `INVITE_REWARD_MINUTES` in `constants.ts` | Halves the invite cost where it doesn't pay back |
| 8 | **Enroll in Play's 15% fee tier** before selling Studio packs | Play Console | Keeps pack margins at 52–77% instead of 42–72% |
| 9 | ✅ **Built 7 October: Google directly, with the half-price flex tier** for MP3 exports, offline downloads and podcast episodes. Needs `GEMINI_API_KEY`. | `lib/gemini.ts`, the speech provider | Expressive drops from $1.16 to $1.10 an hour for listening, and to ~$0.55 for exports when flex answers. If Google doesn't offer flex for speech, exports still save the 5.5%. |
| 10 | **A bKash checkout on the web** (after the creator beta) | New web page | Saves Google's 15% on Bangladeshi payments, and lets most Bangladeshis pay at all |
| 11 | ✅ **Built (5 Oct): run Kokoro yourself.** `KOKORO_URL`, with OpenRouter as backup. Hosting not chosen. | A server with 4–8 GB of RAM (€10.49 a month on Hetzner CAX21, shared with the backend) | Cheaper than OpenRouter only past about 350–700 hours of Natural audio a month. The main gain now is reliability. |
| 12 | **Keep Bangla on phone voices after the trial,** and only offer Expressive Bangla as the paid upgrade | Already the behaviour after the trial | Keeps free Bangla listening at $0 |

**Before 1 January 2027:**
- Do fixes 1–4. They're small changes.
- Watch real usage on an owner dashboard (on hold). If typical paid use is above 35% of the Expressive allowance, cut Expressive minutes in reduced countries before the price doubles.

---

## 7. Numbers to watch after launch

- Expressive minutes used per paying user, by country (the main cost driver)
- Translation characters per user, by country
- Text-AI spending per feature, once fix 2 is in
- How many free users watch rewarded ads, and whether they stay longer or upgrade
- Share of yearly vs monthly subscribers, and their usage
- Revenue per paying user, by country

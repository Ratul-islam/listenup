# Creator edges: research and build plan

Thirteen ideas to make ListenUp Studio the better choice for creators: what's already built, what research says about each one, and a phased plan to build the rest.

- **Researched:** 9 October 2026. The editor hand-off pack and platform loudness were added later the same day.
- **Status:** 🟡 Proposed. Nothing here is built yet, and each phase waits for your go-ahead.
- **Related:** [BUSINESS.md](BUSINESS.md) (section 7, creators), [COMPETITORS.md](COMPETITORS.md), [ROADMAP.md](ROADMAP.md), [MARGIN.md](MARGIN.md)

Competitors' prices and platform rules change often. Check them again before using them in marketing.

---

## In short

- **About a third of this is already built.** Fixing one sentence, typed directions, free voices on the phone, and Studio packs that never expire all exist. Those ideas mainly need finishing and promoting.
- **Some of the pitch doesn't hold up.** ElevenLabs already gives two free regenerations in Studio and lets creators re-voice only the words they select. "Big companies won't copy this" is not a safe line. The claims ListenUp can make are below.
- **One gap breaks a headline today.** Studio packs never expire, but MP3 export needs Plus or Pro (`exports.service.ts`). Someone who buys a pack without subscribing can voice a script but can't download it. Fixing that is the first build.
- **A bigger problem than model updates:** Gemini voices drift *between requests*. Google has acknowledged this for the 3.8 TTS models. A "voice that never changes" needs a match check on every take, not only a pinned model.
- **Music and effects files need music first.** ListenUp has no music or sound-effects layer, only vocal sounds (laugh, sigh, breath) inside the voice. The rest of the editor hand-off pack can come much earlier: one voice track per character, and a timeline file that opens in Premiere and DaVinci Resolve.
- **Loudness: CapCut already levels clips and lowers music under speech,** so the edge is narrower than "almost nobody does this". It still matters when ListenUp's file is the final audio: YouTube turns loud videos down to about −14 LUFS but never turns quiet ones up. Today's exports aren't levelled at all, and parts in different voices or takes can differ in volume.

---

## The thirteen ideas at a glance

| # | Idea | What's built today | Is the edge real? | Phase |
|---|---|---|---|---|
| 1 | Free drafts, pay for the final take | Natural voices on the phone are free and unlimited, and so are phone voices. Edits only charge the parts that changed. | 🟡 Partly. ElevenLabs gives 2 free regenerations. Make it stronger with free unlimited drafts and **free redos when a take is broken** | 1, 2 |
| 2 | Minutes that never expire, no subscription | ✅ Packs never expire. ❌ Export needs Plus | ✅ Yes, once pack buyers can export | 1 |
| 3 | Fix one word | ✅ Redo one sentence, spliced in. ✅ Pronunciations | 🟡 ElevenLabs lets you select words. Win on price and Bangla | 1, 4, 7 |
| 4 | Directions in plain words | ✅ Mostly: "say it in your own words", story styles, AI story brief | ✅ Finish it as a creator tool | 1 |
| 5 | "Less robotic" slider | Breath, sigh and laugh tags exist. Exports put an even 0.6 s between parts | ✅ Yes, as sound quality, never as hiding AI | 4 |
| 6 | A voice that never changes | ❌ The model comes from one server setting; changing it changes everyone's voice | ✅ Locked for good on Natural voices; Expressive voices stay locked only while Google offers the model | 2 |
| 7 | Monetization safety check | ❌ Only an AI check on Community posts | ✅ Few tools do this | 1, 3 |
| 8 | Licence record for each export | ❌. The Terms still lack the commercial-use sentence | ✅ Yes, after a legal review | 3 |
| 9 | Retention hints on the script | ❌ | ✅ Yes, and mostly free to run | 1 |
| 10 | Client approval links | ❌ (there's no web page yet) | ✅ Yes: the client's comment lands on a part, and only that part is redone | 5 |
| 11 | Editor hand-off pack: separate voice, music and effects files, plus a timing map | 🟡 Subtitles, single parts and the script as text. No music or effects, and no timeline file | ✅ Yes: the voice tracks and timing map first, music and effects later | 4, 7 |
| 12 | Works offline | ✅ Mostly: phone voices, Natural on the phone, offline listening | 🟡 The gaps are Studio (needs internet) and Bangla (Kokoro has none) | 6 |
| 13 | Loudness right for each platform | ❌ Parts are joined as they are, with nothing levelled | 🟡 CapCut has it inside the editor. Real for audio published as it comes out of ListenUp | 4, 7 |

---

## Each idea, checked

### 1. Free drafts, pay only for the final take

**Today:**
- Natural voices on the phone and Android's phone voices are free and unlimited on every plan.
- Studio charges only for parts and sentences that changed, and shows the cost before recording.
- Replaying audio already made is free.

**Research:**
- ElevenLabs Studio gives **up to two free regenerations** of a paragraph or selection, as long as the text, voice and settings haven't changed. Its playground has a similar two-free rule.
- Creators complain most about paying for **broken** takes. One review: re-voicing a 590-character line 8 times "doesn't make sense … this is not the end user's fault".

**Verdict:** "Every retake costs credits elsewhere" is no longer true of the market leader. A stronger, honest claim:
- **Drafts are free and unlimited.** Voice the whole script on the phone to check the words, order, timing and pronunciations. Only the final take uses Expressive minutes.
- **Broken takes are redone free.** If a take is cut off, switches voice or skips words, the redo costs nothing.

**Watch out:** a draft won't sound like the final. Natural voices have no emotions, and Bangla drafts use Android's voice, because Kokoro has no Bangla. The app has to say so plainly.

**Running cost:**
- Drafts: none.
- One free retake per unchanged part, capped at 10% of the month's Expressive minutes. At 2027 prices ($1.16 an hour), the worst case is about **$0.46 a month for Pro, $0.17 for Plus, and $0.06 for reduced-price Plus**: about 5–6% of what each pays after Google's cut.
- Broken-take redos depend on how often takes break. Google reports voice switches in about 0.1% of audio-only output; cap redos per part.

### 2. Minutes that never expire, no subscription required

**Today:** Studio packs (30 minutes for $2.99, 120 for $9.99) never expire, and anyone can buy them, Free users included. Contest prizes and invite rewards don't expire either. But **MP3 export needs Plus or Pro**, so a Free pack buyer can't download what they made.

**Research:**
- ElevenLabs rolls unused credits over for at most two months, only while you stay subscribed, and pay-as-you-go credits expire after 12 months.
- Murf users report that unused monthly minutes disappear.

**Verdict:** a real headline, once pack buyers can export.

**Build:**
- Let pack holders export the scripts they voice.
- Put "Minutes that never expire. No subscription needed." on the Plans screen, in Studio and on the store listing.

**Keep:** the margin rule (never sell Gemini audio below $1.40 an hour) holds; packs sit at 52–77% margin.

### 3. Fix one word, not the whole line

**Today:**
- Redo one sentence: only that sentence is recorded again and spliced in at the pauses around it (`lib/audio/splice.ts`), and only its seconds are charged.
- Pronunciations exist, but changing one re-voices **every part** that contains the word.

**Research:**
- ElevenLabs Studio already lets creators "select one or more words that you want to regenerate".
- Gemini returns no word timings, and its voice can change between requests (see idea 6), so a word recorded on its own may not match the words around it.
- Word timings can come from forced alignment. torchaudio's MMS aligner covers more than 1,100 languages, Bengali included.

**Verdict:** not unique, but ListenUp can do it cheaper and in Bangla. Build it in three steps, and ship each only if it sounds right:
1. **Pronunciation fixes re-voice only the sentences that contain the word**, using the existing sentence splice. Small, no new technology.
2. **Fix a phrase:** re-voice the shortest stretch between pauses around the word (commas leave small pauses), using the same splice.
3. **True one-word fix:** record the whole sentence again, so the word keeps its natural tone, then cut out only that word using forced alignment. Charge for the sentence's seconds. Ship only if a blind listening test can't hear the join.

### 4. Directions in plain words

**Today:** mostly built.
- "Say it in your own words", typed or spoken, turns a description into a direction.
- Marks can carry a direction ("as the captain roaring over the storm").
- Story styles, plus an AI story brief that knows the characters.

**Research:**
- Gemini TTS takes style instructions in plain language. The 3.1 and later models also take 200+ inline tags such as `[whispers]`.
- Google's guide warns that **long style paragraphs are the most common cause of voice drift**. Keep notes short.

**Build:**
- A **director's note** on each part and on the whole script, shown on the track.
- Short notes are used as written; longer ones go through the AI rewrite.
- Saved notes ("my channel's tone") and an editable story brief.

**Running cost:** none for short notes. AI rewrites already count in the daily spending caps.

### 5. A "less robotic" slider

**Today:**
- Vocal sounds (`<breath>`, `<sigh>`, `<laugh>`) exist for Expressive voices.
- Clip silence is trimmed tightly (60/140 ms) so listening flows. Exports put an even 0.6 s between parts.

**Research:**
- Flat, even timing is the clearest sign of a synthetic voice. Varied pauses and light breaths help most.
- One vendor claims robotic voices lose 10–25% of early viewers. It's their claim, not a study.

**Verdict:** a real improvement, sold as **sound quality, never as hiding AI**:
- Gemini audio is reported to carry Google's SynthID watermark. Processing must not try to remove it.
- Disclosure reminders (idea 7) stay on.
- Don't market "undetectable".

**Build:** a "Natural feel" setting (Off, Light, More) applied when exporting, so it costs nothing and can be changed without re-voicing:
- pauses that vary with punctuation and paragraphs, instead of an even 0.6 s
- quiet breaths before some sentences, from a small sample library recorded or licensed once; this works for Natural voices too
- a low room tone under the whole track

**Needs first:** better export quality (Phase 4). Adding room tone to a 40 kbps MP3 and encoding it again makes it worse.

### 6. A voice that never changes

**Today:** the Expressive model is one server setting (`TTS_MODEL_MULTILINGUAL`). Changing it changes every user's voice. Old audio stays cached until something is re-voiced.

**Research:**
- Google lists the stable models `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts` with no shutdown date. Shutdown dates are announced ahead of time.
- **The bigger risk is drift.** Developers report that a Gemini voice can sound different between separate requests, and switch tone partway through long audio. Google acknowledged this for 3.8 Flash and Flash-Lite TTS. ListenUp's own tests found the same in October: voicing lines separately made the voice audibly change.
- Kokoro's weights are open and are stored on the phone and on your own server, so a Natural voice can stay exactly the same for good.
- Speaker-embedding models (for example ECAPA-TDNN) score how alike two voices sound. Above 0.8 is very likely the same speaker.

**Build:**
- **Channel voices:** a saved set of voice, exact model ID, short style note, speed, pronunciations and a 20-second reference sample. Scripts use a channel voice, and its model ID is stored with it instead of following the server setting.
- **Honest labels:**
  - Natural: "Locked for good".
  - Expressive: "Locked while Google offers this model. We'll tell you months before it changes."
- **Voice match check:** every new Expressive take is compared with the channel's reference. A poor match is redone automatically and free. If it keeps failing, the creator is told.

**Running cost:** the check runs on the server's processor, with no per-use fee. Run it in the worker, because Render Starter peaked at 472 of 512 MB in the load test.

### 7. Monetization safety check

**Research:**
- **YouTube:**
  - On 15 July 2025, YouTube renamed "repetitious content" to "inauthentic content". It demonetizes mass-produced, templated videos, such as word-for-word text-to-speech over stock slides. AI narration on its own is not the problem.
  - YouTube asks for its "altered or synthetic content" label on realistic content that could be mistaken for real. Cloning your own voice for voiceovers is exempt.
  - Whether a stock AI narrator needs the label isn't spelled out, so ListenUp should remind and link, not decide.
- **TikTok:** realistic synthetic voices need a label.
- **Meta:**
  - Ads with AI audio must be labelled.
  - Since June 2026, Meta adds its "AI info" label automatically when a file carries C2PA Content Credentials.
- **Copy checks:** a web plagiarism check costs about $0.11–0.15 for a 1,500-word script at Originality.ai's prices.

**Build:** a "Check script" panel with traffic-light hints, never "you're safe":
- **Copied text, at no cost:**
  - the script came from a web link, or is a translation of one
  - it matches a classic in Explore or someone's Community writing
- **Copied text, paid (optional):** a web check, for Pro, or paid per check.
- **Repetition:**
  - how alike this script is to your own earlier scripts
  - the same opening and closing lines used again and again
  - many near-identical exports in a week
- **Disclosure:** at export, one line per platform (YouTube, TikTok, Facebook, Instagram) on when a label is needed, with a link to the rule.

### 8. A licence record for every export

**Research:**
- Google's Gemini API terms don't claim ownership of output and allow commercial use. Kokoro is Apache 2.0.
- Purely AI-made audio may not be protected by copyright (US). So the record proves **where the audio came from and that commercial use is allowed**, not copyright.
- Android's phone voices have no clear terms for publishing recordings, so parts in a phone voice are left out of the record and flagged.
- C2PA Content Credentials can be embedded in MP3 and WAV files. Doing so makes Meta label the audio as AI automatically.

**Build:**
- **With each paid export:** a licence file (`licence.html` and `licence.json`) holding:
  - a record ID and the date
  - the account (pen name or a masked email)
  - the file's SHA-256 fingerprint and its length
  - the voices and model per part, and the plan at the time
  - the Terms clause that grants commercial use
- **A public check page:** `/verify/:id` confirms the record, and whether a file matches it.
- **Needs first:** the commercial-use sentence in the Terms (still open in BUSINESS.md, section 10) and a legal review.

**Decision:** whether to also embed C2PA (see "Decisions for you").

### 9. Retention hints on the script

**Research** (creator blogs, not studies):
- The most common pattern is a steep drop in the first 10–30 seconds. About 65% still watching at 30 seconds is called healthy.
- Narration runs about 140–150 words a minute. A hook should land in 0–10 seconds, about 20–25 words.
- Slow intros are named as the main watch-time killer for faceless channels.

**Build:** in the same "Check script" panel, rules only, at no AI cost:
- **Opening:** the first 25 words (does it promise or ask something?), and stock lines like "In this video we will…".
- **Long sentences:** over about 25 words; Bangla gets its own limit.
- **Slow parts, measured from the real audio:** words a minute per part, compared with the creator's own average. ListenUp already knows each part's length, which most script tools don't.
- **Other checks:** long pauses, parts over 40 seconds, and repeated words.

**Later, optional:** "Punch up my opening": 3 AI rewrites, Plus and Pro, counted in the daily caps.

**Design:** hints go in one quiet panel and as a thin underline on a part, not as badges everywhere (calm design).

### 10. Client approval links for freelancers

**Research:**
- Audio review tools (Whyp, Filestage, Soneam, VoiceDeck) already offer a link where a client listens without an account, comments on a moment and approves a version.
- On Fiverr, basic voiceover gigs have dropped in price and often promise "unlimited revisions", so every revision eats the freelancer's credits.

**Edge:** a client's comment lands on a **part**. The freelancer fixes only that part (and pays only for it), and the same link plays the new version with the changed parts marked. The generic tools can't redo the audio.

**Build:**
- This is ListenUp's first web page. The server renders it, like the podcast feed's public links: `/review/:token`.
- The client hears the parts, comments on a part with a name only, and approves a version.
- In Studio, comments show on each part's track. "Send update" makes version 2 on the same link.
- Safety: links can be withdrawn, expire, are hidden from search engines, and comments are rate-limited.
- Download before approval only if the freelancer allows it.

**Running cost:** none beyond storage. Playing cached audio costs nothing, and R2 doesn't charge for downloads.

### 11. Editor hand-off pack: separate files and a timing map

**The idea:** export voice, music and effects as separate files, plus a timing map of every line, so creators who finish in Premiere or DaVinci Resolve can drop it straight in.

**Today:**
- No music or sound effects, so only the voice can be handed off.
- Exports are a 40 kbps mono MP3, SRT, VTT, short captions, the script as text, and single parts.
- ListenUp already knows when every sentence starts and ends (`sentenceTimes` in `lib/subtitles.ts`, used for subtitles and sentence redos). A timing map needs no new measuring.

**Research:**
- **Timeline files:**
  - Premiere imports the older Final Cut Pro 7 XML, but not modern Final Cut XML.
  - DaVinci Resolve imports timelines from XML and EDL, and its markers from an EDL (Timelines → Import → Timeline Markers from EDL). Special characters in marker names can fail there.
  - OpenTimelineIO (OTIO), the newer open format, works in Resolve, but Premiere's support was still in beta in 2025.
  - **A Final Cut Pro 7 XML timeline is the one file both editors open.**
- **Music licences:** standard royalty-free licences cover finished videos, but usually not handing music to an app's users. That needs an app licence (for example TunePocket's streaming licence), an AI music service whose output is cleared for commercial use (Loudly, Mubert), or CC0 sets.

**Build in two steps:**
1. **The hand-off pack, voice only (Phase 4).** One folder:
   - `voice-<character>.wav` for each voice in the script: 48 kHz (what video editors use; the voices are made at 24 kHz), padded with silence so every track lines up from zero
   - `timeline.xml` (Final Cut Pro 7 XML): each line as its own clip on its character's track, at the right time, with a marker on each part. It opens as a ready-made sequence in Premiere and Resolve.
   - `markers.edl` for Resolve's marker import
   - `lines.csv`: start, end, part, sentence, character and text, for any other tool or a spreadsheet
   - the subtitles (SRT, VTT and short captions), as today
   - a short `README.txt` with the import steps for Premiere, Resolve and CapCut
2. **Music and sound-effects files (Phase 7):** once music beds and sound effects exist, add `music.wav` and `sfx.wav` on their own tracks in the same timeline, plus the finished mix (see idea 13).

**Watch out:**
- A timeline file points at its audio files by path, so the editor may ask once to locate the folder. Test this in Premiere and Resolve on Windows and Mac before release.
- The hand-off pack only works with better stored quality (below).

**Quality note:** WAV made from a 40 kbps MP3 isn't better. Keep a high-quality copy of Studio parts (FLAC, or 128 kbps MP3) as they're voiced. At about 1.5 MB a minute, 1,000 hours of creator audio is about 90 GB: **about $1.35 a month on R2**.

### 12. Works offline

**Today:**
- Phone voices work offline on every plan.
- Natural voices run on the phone, unlimited.
- Plus and Pro can download for offline listening.

**Gaps:**
- **Studio needs internet:** scripts are stored on the server, and exports are made there.
- **No good offline Bangla voice:** Kokoro has no Bangla, so offline Bangla means Android's voice, which often isn't installed.

**Research:**
- Meta's MMS Bangla voice can't be used: its licence is non-commercial (CC-BY-NC).
- Bangla VITS voices on Hugging Face are under Apache 2.0 (`nahidbrur/tts_bn_vits_male`) or reported as MIT (`SYSPIN/vits_Bengali_Female`), and sherpa-onnx can run Bangla VITS. Their quality is unknown.
- The espeak-ng (GPL) question for on-phone voices is still open.

**Build:**
- **Offline Studio:** write and edit scripts on the phone with no connection, voice them with phone voices, export on the phone, and sync when back online.
- **Export on the phone:** Android's built-in encoder makes M4A. MP3 needs an encoder library.
- **Test the Bangla VITS voices** with the audio judge. Add one only if it passes, and only after the licence check.

### 13. Loudness right for each platform

**The idea:** balance the voice against the music automatically, and set the final volume to what YouTube, TikTok or Facebook expects, so videos don't sound quieter than others in the feed.

**Today:**
- An export joins each part's MP3 frames as they are, without measuring or changing the volume (`exports.service.ts`).
- Parts made in different voices, in Natural and Expressive, or as a spliced sentence can differ in volume within one file.
- The server has no audio tools beyond MP3 decoding and encoding, and no ffmpeg.

**Research:**
- **YouTube** turns videos louder than about −14 LUFS down, and **never turns quieter videos up**. A voiceover at −18 LUFS plays noticeably quieter than its neighbours.
- **TikTok, Instagram and Facebook** publish no official target. Guides mostly say −14 LUFS; some say −10 to −12 for TikTok and Reels.
- **Peaks:** about −1 dBTP (true peak) is the usual ceiling, so the platform's re-encoding doesn't distort.
- **Podcasts:** Apple asks for −16 LUFS, ±1, with true peak at most −1 dBFS. This matters for the private podcast feed.
- **Voice against music:** keep music at least 10 LU below speech (about −16 LUFS for speech and −24 to −26 for music when mixing).
- **CapCut already has "Normalize loudness" and automatic ducking** (music lowered under speech). Creators who finish in CapCut can level the audio there.

**Verdict:** worth building, but sell it honestly as **"sounds right without knowing what LUFS is"**, not as something no one else does. It matters most when ListenUp's file is the final audio: voice-only Reels and Shorts, the podcast feed, voice notes, and anything a creator uploads without remixing. Levelling parts to match each other helps every export.

**Build in two steps:**
1. **Voice levelling (Phase 4):**
   - every part brought to the same loudness, so voices, takes and spliced sentences match
   - the whole file set to a target, with a true-peak limit:

     | Preset | Loudness | Peak |
     |---|---|---|
     | Video: YouTube, TikTok, Reels, Facebook (default) | −14 LUFS | −1 dBTP |
     | Podcast (also used for the podcast feed) | −16 LUFS | −1 dBTP |
     | For mixing in an editor (the hand-off pack) | −16 LUFS | −3 dBTP, leaving room for music |

   - the export sheet shows one plain line, for example "Volume set for YouTube and TikTok", with the preset behind a tap
2. **Voice against music (Phase 7):** once music exists, the music is lowered under speech automatically and kept at least 10 LU below the voice, then the mix is set to the preset.

**Needs:**
- Decoding, adjusting and re-encoding each export, instead of joining frames as they are. Better stored quality (idea 11) keeps that re-encoding from making the sound worse.
- A loudness tool. **Recommended: add ffmpeg to the Docker image** and use its two-pass `loudnorm` filter, which follows the EBU R128 standard and has true-peak limiting built in. Writing our own meter and limiter in TypeScript would avoid the larger image, but a good limiter is hard to get right.
- Run it in the worker, not the API.

**Running cost:** server processor time only. A static ffmpeg build makes the Docker image roughly 80 MB larger.

---

## Phases

Ordered by value for effort. Each phase builds on the one before, and stops for your review.

| Phase | What | Ideas | Effort | New running cost |
|---|---|---|---|---|
| 1 | Quick wins on what's built | 2, 1 (drafts), 4, 3 (step 1), 9, 7 (disclosure) | Small items | None |
| 2 | Fair takes and locked voices | 1 (free redos), 6 | Medium | Capped free retakes |
| 3 | Proof and safety | 8, 7 (full check) | Medium, plus a legal review | Optional paid copy check |
| 4 | Pro sound | 13 (voice levelling), 11 (hand-off pack, voice only), 5, 3 (step 2), better export quality | Medium | About $1–2 a month of storage |
| 5 | Client approval links | 10 | Medium to large | None |
| 6 | Offline Studio | 12 | Large | None |
| 7 | Bigger bets, research first | Music and effects, 11 (music and effects files), 13 (voice against music), 3 (step 3) | Large | Music licence |

### Phase 1: quick wins on what's built

1. **No subscription needed.** Pack holders can export MP3, subtitles and the script for the scripts they voice. The copy on Plans, Studio and the store listing reads "Minutes that never expire. No subscription needed."
2. **Free drafts.**
   - A Draft switch in Studio voices the script with on-phone voices, free and unlimited.
   - "Make final" voices it in Expressive, and shows the cost first.
   - Drafts are labelled as having no emotions.
3. **Director's notes:**
   - a note on each part and on the whole script
   - short notes used exactly as written
   - saved notes, and an editable story brief
4. **Pronunciation fixes re-voice only the sentences** that contain the word, not whole parts.
5. **Check script panel, first version:**
   - retention hints: opening, long sentences, slow parts measured from the audio, long pauses
   - a disclosure reminder for each platform at export

**Done when:**
- a Free account that bought a pack can export a script
- a pronunciation fix charges only the sentences it changed
- the panel shows hints on a test script in English and in Bangla

### Phase 2: fair takes and locked voices

1. **Take check:** after each Expressive take, the server checks its length against the text and looks for long silences inside the speech. A take that fails is redone automatically and free, up to 2 times per part. "Report a bad take" gives a free redo after the same check.
2. **One free retake per part** when nothing changed, within 24 hours, capped at 10% of the month's Expressive minutes. The cap is your decision.
3. **Channel voices:**
   - a saved voice, model ID, style note, speed, pronunciations and reference sample
   - scripts use one
   - labels: "Locked for good" on Natural, "Locked while Google offers this model" on Expressive
4. **Voice match check:** a speaker-embedding model in the worker compares new takes with the reference, and redoes poor matches free.
5. **Needs a migration.** Apply it to Supabase only with your go-ahead.

**Done when:**
- a cut-off take is redone without charging
- changing the server's model setting leaves a channel voice's scripts on their pinned model
- the match check tells a different voice apart from the right one in a test

### Phase 3: proof and safety

**Before building:** add the commercial-use sentence to the Terms, and have the licence wording reviewed.

1. **Licence record** with every paid export, plus the public `/verify/:id` page. Parts in a phone voice are left out and flagged.
2. **Check script, full version:**
   - copied text, at no cost: imported from a link, a translation of one, or matching a classic or Community writing
   - repetition across your own scripts, the same openings and endings, and export volume
   - an optional paid web check (your decision)
3. **C2PA Content Credentials** in exports, if you choose them.

**Done when:**
- an export's licence file verifies on the public page
- a script imported from a link is flagged as copied

### Phase 4: pro sound

1. **Better stored quality** for Studio parts (FLAC or 128 kbps), and WAV export.
2. **Loudness:**
   - exports are decoded, levelled and encoded again, instead of joined as they are
   - every part is brought to the same loudness
   - presets: Video (−14 LUFS, the default), Podcast (−16 LUFS, also used for the podcast feed), and For mixing (−16 LUFS with room for music)
   - ffmpeg's `loudnorm` in the worker (your decision)
3. **Editor hand-off pack, voice only:**
   - one 48 kHz WAV per character
   - `timeline.xml` (Final Cut Pro 7 XML) for Premiere and Resolve
   - `markers.edl`, `lines.csv` and the subtitles
   - a short README with the import steps
4. **"Natural feel"** (Off, Light, More) at export: varied pauses, breaths from a sample library, and room tone. Loudness is set after it.
5. **Fix a phrase:** re-voice the stretch between pauses around a word.

**Done when:**
- a Video export measures −14 LUFS (±1) with peaks no higher than −1 dBTP, and a script that mixes voices and takes sounds even
- `timeline.xml` opens in Premiere and in Resolve with every line on its character's track at the right time, and the voice tracks also line up in CapCut
- "Natural feel" sounds better in a blind A/B listening test, including on Bangla

### Phase 5: client approval links

1. The `/review/:token` web page: listen, comment on a part, approve a version.
2. Comments on part tracks in Studio, and "Send update" makes a new version on the same link.
3. Withdraw a link, expiry, no search-engine indexing, comment rate limits, and download only if allowed.
4. Plan access is your decision (Pro only, or Plus with a few links).

**Done when:** a client with no account comments from a laptop browser, the freelancer fixes that part, and the link plays version 2 with the change marked.

### Phase 6: offline Studio

1. Scripts written, edited and voiced on the phone with no connection, using phone voices; they sync later.
2. Export on the phone (M4A built in; MP3 with an encoder library).
3. Test the Bangla VITS voices for quality and licence. Add one only if it passes the audio judge.
4. Settle the espeak-ng GPL question first, since this phase leans on voices running on the phone.

**Done when:** in airplane mode, a script is written, voiced and exported in English, and in Bangla if a voice passes.

### Phase 7: bigger bets, research first

1. **Music and sound effects:** pick a licence source, then add music beds and a small sound-effects set.
2. **Voice against music:** the music is lowered under speech automatically and kept at least 10 LU below the voice, then the finished mix is set to the export's loudness preset.
3. **The full hand-off pack:** `music.wav` and `sfx.wav` on their own tracks in the same timeline, plus the finished mix.
4. **True one-word fix:** a test of forced alignment (MMS aligner) on English and Bangla takes. Ship only if a blind test can't hear the join.

---

## Decisions for you

These change what gets built. Defaults are my recommendations.

| # | Decision | Recommended |
|---|---|---|
| 1 | What pack buyers can do without a subscription | Export the scripts they voice (MP3, subtitles, script). Not summaries, the podcast feed or offline listening. |
| 2 | Size of the free-retake allowance | 1 retake per unchanged part, capped at 10% of the month's Expressive minutes |
| 3 | Paid web copy check | Pro only at first; the free checks for everyone |
| 4 | Embed C2PA Content Credentials in exports | Not at first. Offer it as an option after the licence record ships (it makes Meta label the audio as AI). |
| 5 | Client approval links: which plans | Pro, plus 3 active links on Plus |
| 6 | Keep a high-quality copy of Studio parts | Yes, FLAC (about $1.35 a month per 1,000 hours) |
| 7 | Music source (Phase 7) | Decide after Phase 4. Compare an app licence with an AI music service. |
| 8 | Monthly Expressive minutes rolling over (like ElevenLabs' 2 months) | No for now. Packs already never expire, and rollover makes the heavy-user margins in MARGIN.md worse. |
| 9 | Loudness tool (Phase 4) | Add ffmpeg to the Docker image and use its `loudnorm` filter, in the worker. Our own TypeScript meter and limiter is the alternative: a smaller image, but harder to get right. |

---

## Running costs at a glance

At 2027 Gemini prices (about $1.16 an hour, or $0.019 a minute):

| Feature | Cost |
|---|---|
| Free drafts, retention hints, free copy checks, repetition checks, disclosure reminders, director's notes | None |
| One free retake per part, capped at 10% | At most $0.46 a month for Pro, $0.17 for Plus, and $0.06 for reduced-price Plus |
| Free redo of broken takes | Small and unknown; capped at 2 per part |
| Voice match check | Server processor only (run in the worker) |
| Paid web copy check | About $0.11–0.15 per 1,500-word script |
| High-quality copy of Studio parts | About $1.35 a month per 1,000 hours stored |
| Client approval links | None (R2 doesn't charge for downloads) |
| Loudness levelling | Server processor only (run in the worker). A static ffmpeg build makes the Docker image roughly 80 MB larger. |
| Editor hand-off pack | None beyond the high-quality copy above |
| Music licence | Not known yet (Phase 7) |

---

## Sources

**Competitors and credits**
- [ElevenLabs: does it cost credits to regenerate in Studio?](https://elevenlabs.io/docs/help-center/product/content-production/studio/does-it-cost-credits-to-regenerate-in-studio), [ElevenLabs: do I use quota on every generation?](https://elevenlabs.io/docs/help-center/account/general/do-i-use-quota-on-every-generation)
- [ElevenLabs credit rollover (third-party summary)](https://gptprompts.ai/elevenlabs-answers/do-elevenlabs-credits-roll-over), [ElevenLabs app reviews](https://marlvel.ai/apps/elevenlabs-ai-voice-generator/reviews), [Murf hidden costs (CostBench)](https://costbench.com/software/ai-voice-tools/murf-ai/hidden-costs/)

**Gemini voices**
- [Gemini API deprecations](https://ai.google.dev/gemini-api/docs/deprecations), [Gemini speech generation guide](https://ai.google.dev/gemini-api/docs/speech-generation), [Gemini 3.1 Flash TTS audio tags](https://ecorpit.com/gemini-3-1-flash-tts-build-guide-audio-tags-cost-2026/)
- [Gemini 3.8 TTS voice consistency issue](https://discuss.ai.google.dev/t/gemini-3-8-tts-voice-consistency-issue/186103), [Gemini 3.1 Flash TTS voice identity changes between requests](https://discuss.ai.google.dev/t/gemini-3-1-flash-tts-preview-voice-identity-changes-between-separate-requests/179498)
- SynthID in Gemini audio: [Gemini 3.1 Flash TTS launch](https://www.resultsense.com/news/2026-04-16-gemini-3-1-flash-tts-voice-model-launch), [Gemini 2.5 native audio](https://learn.aisingapore.org/2025/06/gemini-2-5s-native-audio-capabilities/)
- [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms), [What Gemini's terms say about output](https://terms.law/ai-output-rights/gemini/)

**Platform rules**
- [YouTube: disclosing altered or synthetic content](https://support.google.com/youtube/answer/14328491), [YouTube's 2026 AI rules (Clippie)](https://clippie.ai/blog/ai-videos-banned-youtube-2026-rules), [YouTube AI monetization rules (Boss Wallah)](https://bosswallah.com/blog/creator-hub/youtube-ai-monetization-rules-2026-new-policy-every-creator-must-know/)
- [TikTok AI content policy (Cinerads)](https://www.cinerads.com/blog/tiktok-ai-content-policy), [AI ad disclosure on Meta, TikTok and YouTube (Cinerads)](https://www.cinerads.com/blog/ai-ad-disclosure-requirements), [Cross-platform AI labelling, 2026 (AuditSocials)](https://www.auditsocials.com/blog/cross-platform-ai-content-labeling-requirements-2026-meta-google-tiktok-youtube-comparison)

**Audio technology**
- [C2PA for WAV, MP3, M4A and FLAC (c2pa_audio)](https://pub.dev/packages/c2pa_audio)
- [torchaudio CTC forced alignment](https://docs.pytorch.org/audio/2.4.0/tutorials/ctc_forced_alignment_api_tutorial.html)
- [SpeechBrain ECAPA speaker verification](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb), [ECAPA-TDNN and x-vectors in multi-speaker TTS](https://arxiv.org/pdf/2506.20190)

**Sound and retention**
- [How to make an AI voice less robotic (AnySpeech)](https://anyspeech.io/blog/how-to-make-ai-voice-sound-less-robotic), [Making AI voices sound human (Resemble)](https://www.resemble.ai/ai-voice-sound-human/)
- [Keeping viewers past 30 seconds (Alan Spicer)](https://alanspicer.com/youtube-audience-retention-keep-viewers-watching/), [Why viewers drop off after 30 seconds (NarrationBox)](https://narrationbox.com/blog/why-viewers-drop-off-after-30-seconds-youtube), [Watch-time mistakes on faceless channels (Virvid)](https://virvid.ai/blog/mistakes-killing-watch-time-faceless-2026)

**Client review**
- [Whyp for voice actors](https://whyp.it/for/voice-actors), [Filestage for audio](https://filestage.io/audio/), [Soneam](https://www.producthunt.com/products/soneam), [VoiceDeck](https://peerpush.com/p/voicedeck), [Best Fiverr gigs 2026](https://unil.ink/ua/blog/best-fiverr-gigs-2026)

**Loudness**
- [YouTube's loudness target (Frame.io)](https://workflow.frame.io/guide/loudness-for-youtube), [YouTube turns loud videos down, not quiet ones up (Creative Video Tips)](https://creativevideotips.com/tutorials/the-secret-to-youtube-loudness)
- [Social media loudness targets (Opus)](https://opus.pro/blog/best-loudness-normalizers), [LUFS guide for social media (Film and Flow)](https://filmandflow.beehiiv.com/p/the-ultimate-lufs-guide-perfect-audio-for-social-media)
- [Loudness for podcasters, Apple's −16 LUFS (Podnews)](https://podnews.net/article/lufs-lkfs-for-podcasters)
- [Mixing voice with background music (Blackmagic forum)](https://forum.blackmagicdesign.com/viewtopic.php?p=1148074), [Background ducking for clear speech (research paper)](https://cris.fau.de/publications/221136558)
- [CapCut loudness normalization](https://www.capcut.com/tools/loudness-normalization), [What CapCut's "Normalize loudness" does (Hollyland)](https://store.hollyland.com/blogs/creator-hub/what-does-normalize-loudness-do-in-capcut)

**Editor timelines**
- [Premiere Pro OTIO import and export (Adobe beta forum)](https://community.adobe.com/t5/premiere-pro-beta-discussions/now-in-beta-otio-import-and-export/m-p/14985932), [Premiere imports Final Cut 7 XML, not modern FCPXML (Adobe forum)](https://community.adobe.com/t5/premiere-pro-ideas/premiere-import-xml-is-outdated-final-cut-no-longer-supported/idi-p/13528893)
- [Importing timeline markers from EDL into DaVinci Resolve (editingtools.io)](https://editingtools.io/guides/convert-livenotes-to-resolve-marker)

**Music and copy checks**
- [Royalty-free music in apps (TunePocket)](https://www.tunepocket.com/can-i-legally-stream-royalty-free-music-and-sound-effects-in-my-app/), [AI music APIs for developers (Sonilo)](https://sonilo.com/blog/guides/ai-music-apis-for-developers-royalty-free-apps-games-video)
- [Originality.ai pricing](https://hastewire.com/blog/originalityai-pricing-plans-costs-and-features-explained), [Copyleaks pricing](https://www.casrai.org/guides/copyleaks-pricing)

**Bangla voices on the phone**
- [Meta MMS-TTS (CC-BY-NC)](https://huggingface.co/facebook/mms-tts), [Bangla VITS male (Apache 2.0)](https://huggingface.co/nahidbrur/tts_bn_vits_male), [Bangla VITS female (SYSPIN)](https://huggingface.co/SYSPIN/vits_Bengali_Female/tree/main)

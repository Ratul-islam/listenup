import type { PlatformId } from './studio-catalog.js'

/**
 * Narration styles native to each platform, offered on its page in Studio: what the style is,
 * how the voice says it (a direction and a pace), how long it usually runs, and a template to
 * fill in (English and Bangla; the parts in [brackets] are the creator's). A style replaces the
 * generic kind of narration when it's picked.
 */
export interface FormatDef {
  label: string
  /** One line on what it is, as the page shows it */
  about: string
  /** The platform it's made for (its length limit, loudness and subtitles) */
  platform: PlatformId
  /** The direction the voice is given for the whole script */
  style: string
  speed: number
  /** The length it usually runs, in seconds */
  lengthSec: [number, number]
  templates: { en: string; bn: string }
}

export const FORMATS = {
  storytime: {
    label: 'Storytime',
    about: 'A true story told straight to the viewer, hooked from the first line.',
    platform: 'tiktok',
    style: 'like someone telling a gripping true story to a friend, natural and animated',
    speed: 1.05,
    lengthSec: [45, 90],
    templates: {
      en: `So this actually happened to me [when].

I was [where], and [what you were doing].

Then [the thing that went wrong, or strange].

And you won't believe what [someone] said next: "[the line]".

[How it ended.]

Has anything like this ever happened to you?`,
      bn: `এটা সত্যিই আমার সাথে ঘটেছিল, [কবে]।

আমি তখন [কোথায়], [কী করছিলাম]।

হঠাৎ [যা ভুল বা অদ্ভুত হলো]।

আর তারপর [কে] যা বলল, বিশ্বাস করবেন না: "[কথাটা]"।

[কীভাবে শেষ হলো।]

আপনার সাথে কখনো এমন হয়েছে?`,
    },
  },
  pov: {
    label: 'POV',
    about: 'The viewer is placed in a moment they know, spoken to directly.',
    platform: 'tiktok',
    style: 'intimate and immediate, as if talking straight to the viewer',
    speed: 1,
    lengthSec: [15, 30],
    templates: {
      en: `POV: you [the situation everyone knows].

You [the first thing you do].

Then you realise [the twist].

[The line that makes them laugh or nod.]`,
      bn: `ধরুন, আপনি [সবার চেনা পরিস্থিতি]।

আপনি প্রথমে [প্রথম যা করেন]।

তারপর হঠাৎ বুঝলেন, [মোড় ঘোরানো ব্যাপারটা]।

[শেষ লাইন, যেটায় দর্শক হাসবে বা মাথা নাড়বে।]`,
    },
  },
  facts: {
    label: 'Did you know?',
    about: 'One surprising fact, explained fast.',
    platform: 'tiktok',
    style: 'curious and punchy, like sharing a surprising fact',
    speed: 1.1,
    lengthSec: [20, 40],
    templates: {
      en: `Did you know [the surprising fact]?

It's because [the reason, in one sentence].

In fact, [one more detail that makes it stick].

Follow for one fact like this every day.`,
      bn: `আপনি কি জানেন, [অবাক করা তথ্যটা]?

কারণ [এক বাক্যে কারণটা]।

আসলে, [মনে রাখার মতো আরও একটা তথ্য]।

এমন একটা করে তথ্য রোজ পেতে ফলো করুন।`,
    },
  },
  reddit: {
    label: 'Reddit story',
    about: 'A post read aloud, from the title to the twist.',
    platform: 'tiktok',
    style: 'clear, steady storytelling with a hint of drama, like a narrated Reddit post',
    speed: 1.1,
    lengthSec: [60, 120],
    templates: {
      en: `[The post's title, as a question.]

So, some background. I'm [age and who you are], and [the other person] is [who they are].

Last week, [what happened].

I said [what you said], and they [how they reacted].

Now [who] is saying I'm wrong. So, am I?`,
      bn: `[পোস্টের শিরোনাম, প্রশ্ন হিসেবে।]

একটু পেছনের কথা বলি। আমি [বয়স আর পরিচয়], আর [অন্যজন] হলেন [তাঁর পরিচয়]।

গত সপ্তাহে [যা ঘটল]।

আমি বললাম [আপনি যা বললেন], আর উনি [কী প্রতিক্রিয়া দেখালেন]।

এখন [কে] বলছে আমিই ভুল। তাহলে, আমি কি ভুল?`,
    },
  },
  top3: {
    label: 'Top 3',
    about: 'A quick countdown, best saved for last.',
    platform: 'tiktok',
    style: 'energetic and punchy, counting down',
    speed: 1.1,
    lengthSec: [30, 60],
    templates: {
      en: `3 [things] you need to try [when or why].

Number 3: [name]. [Why, in one line.]

Number 2: [name]. [Why.]

And number 1: [name]. [Why it wins.]

Which one are you trying first?`,
      bn: `[কখন বা কেন] যে ৩টি [জিনিস] অবশ্যই চেষ্টা করবেন।

৩ নম্বরে: [নাম]। [এক লাইনে কেন।]

২ নম্বরে: [নাম]। [কেন।]

আর ১ নম্বরে: [নাম]। [কেন এটাই সেরা।]

কোনটা আগে চেষ্টা করবেন?`,
    },
  },
  tip: {
    label: 'Quick tip',
    about: 'One useful trick in under 30 seconds.',
    platform: 'tiktok',
    style: 'quick, confident and friendly',
    speed: 1.1,
    lengthSec: [15, 30],
    templates: {
      en: `Stop [the common mistake]. Do this instead.

[The tip, in one or two steps.]

That's it. [The result they'll get.]

Save this for later.`,
      bn: `[সাধারণ ভুলটা] আর করবেন না। বরং এটা করুন।

[টিপসটা, এক-দুই ধাপে।]

ব্যস। [কী ফল পাবেন।]

পরে কাজে লাগবে, সেভ করে রাখুন।`,
    },
  },
  aesthetic: {
    label: 'Aesthetic voiceover',
    about: 'Soft narration over a vlog, travel or day-in-my-life video.',
    platform: 'reels',
    style: 'soft, calm and dreamy, unhurried',
    speed: 0.9,
    lengthSec: [20, 45],
    templates: {
      en: `[A small moment from the day, described softly.]

Lately I've been [what you've been doing, or feeling].

[One detail: a smell, a sound, the light.]

Maybe that's enough for today.`,
      bn: `[দিনের একটা ছোট মুহূর্ত, নরম করে বলা।]

ইদানীং আমি [কী করছি বা কেমন লাগছে]।

[একটা খুঁটিনাটি: একটা গন্ধ, একটা শব্দ, আলোটা।]

আজকের জন্য হয়তো এটুকুই যথেষ্ট।`,
    },
  },
  motivational: {
    label: 'Motivational',
    about: 'A push to keep going, said with conviction.',
    platform: 'reels',
    style: 'inspiring and uplifting, with conviction',
    speed: 1,
    lengthSec: [20, 45],
    templates: {
      en: `[A hard truth, said plainly.]

You don't need [what they think they need].

You need [the real thing].

[One small step they can take today.]

Start now.`,
      bn: `[একটা কঠিন সত্য, সোজাসুজি।]

আপনার [যা দরকার বলে ভাবছেন] দরকার নেই।

দরকার [আসল জিনিসটা]।

[আজই নেওয়া যায় এমন একটা ছোট পদক্ষেপ।]

এখনই শুরু করুন।`,
    },
  },
  promo: {
    label: 'Brand or product',
    about: 'Show what you sell, and why it’s worth it.',
    platform: 'reels',
    style: 'warm, upbeat and persuasive',
    speed: 1.05,
    lengthSec: [15, 30],
    templates: {
      en: `[The problem your customer has, as a question?]

Meet [product]: [what it does, in one line].

[The best thing about it.] [A detail that makes it believable.]

[The offer.] Order now, link in bio.`,
      bn: `[আপনার ক্রেতার সমস্যাটা, প্রশ্ন হিসেবে?]

পরিচিত হোন [পণ্য]-এর সাথে: [এক লাইনে কী করে]।

[এর সবচেয়ে ভালো দিক।] [বিশ্বাস করার মতো একটা তথ্য।]

[অফার।] এখনই অর্ডার করুন, লিংক বায়োতে।`,
    },
  },
  howto: {
    label: 'Recipe or how-to',
    about: 'Step by step, so it can be followed along.',
    platform: 'reels',
    style: 'clear and friendly, step by step',
    speed: 1,
    lengthSec: [30, 60],
    templates: {
      en: `Here's how to make [what] in [time].

You'll need [the few things].

First, [step one].

Then [step two].

Finally, [step three]. And that's it.`,
      bn: `[কত সময়ে] [কী] বানাবেন, দেখুন।

লাগবে [অল্প কয়েকটা জিনিস]।

প্রথমে, [প্রথম ধাপ]।

তারপর [দ্বিতীয় ধাপ]।

সবশেষে, [তৃতীয় ধাপ]। ব্যস, হয়ে গেল।`,
    },
  },
  shortsFact: {
    label: 'Shorts: fact or explainer',
    about: 'One idea explained before the swipe.',
    platform: 'shorts',
    style: 'curious and punchy, like sharing a surprising fact',
    speed: 1.1,
    lengthSec: [30, 60],
    templates: {
      en: `Why does [thing] [do what it does]?

Most people think [the common belief]. But actually, [the truth].

Here's how it works: [the explanation, in two sentences].

So next time you [see it], you'll know.`,
      bn: `[জিনিসটা] কেন [এমন করে]?

বেশিরভাগ মানুষ ভাবেন [প্রচলিত ধারণা]। কিন্তু আসলে, [সত্যিটা]।

ব্যাপারটা এভাবে কাজ করে: [দুই বাক্যে ব্যাখ্যা]।

তাহলে এরপর [দেখলে], আপনি জানবেন।`,
    },
  },
  documentary: {
    label: 'Documentary',
    about: 'A longer story told with weight and detail.',
    platform: 'youtube',
    style: 'like a calm, authoritative documentary narrator',
    speed: 0.95,
    lengthSec: [300, 1200],
    templates: {
      en: `[An image to open with: a place, a moment or a fact.]

[The subject, and why it matters today.]

It began [when and where].

[The first chapter: what happened, with one detail people won't know.]

[The second chapter: what changed, and who was involved.]

Today, [where things stand now].

[A closing thought for the viewer to carry with them.]`,
      bn: `[শুরুর একটা ছবি: একটা জায়গা, একটা মুহূর্ত বা একটা তথ্য।]

[বিষয়টা কী, আর আজ কেন তা গুরুত্বপূর্ণ।]

এর শুরু [কখন, কোথায়]।

[প্রথম অধ্যায়: কী ঘটেছিল, এমন একটা খুঁটিনাটিসহ যা অনেকে জানে না।]

[দ্বিতীয় অধ্যায়: কী বদলাল, আর কারা জড়িত ছিল।]

আজ, [এখনকার অবস্থা]।

[দর্শকের মনে থেকে যাওয়ার মতো একটা শেষ কথা।]`,
    },
  },
  tutorial: {
    label: 'Tutorial',
    about: 'Teach a skill, one step at a time.',
    platform: 'youtube',
    style: 'clear, patient and friendly, step by step',
    speed: 1,
    lengthSec: [180, 900],
    templates: {
      en: `In this video, I'll show you how to [what] in [how many] steps, even if [the worry they have].

Before we start, you'll need [what].

Step one: [what to do, and why].

Step two: [what to do]. A common mistake here is [the mistake], so [how to avoid it].

Step three: [what to do].

And that's it. If you get stuck, tell me in the comments.`,
      bn: `এই ভিডিওতে দেখাবো কীভাবে [কত] ধাপে [কী] করবেন, এমনকি যদি [দর্শকের দুশ্চিন্তা]।

শুরুর আগে লাগবে [কী]।

প্রথম ধাপ: [কী করবেন, আর কেন]।

দ্বিতীয় ধাপ: [কী করবেন]। এখানে অনেকে [ভুলটা] করেন, তাই [কীভাবে এড়াবেন]।

তৃতীয় ধাপ: [কী করবেন]।

ব্যস। কোথাও আটকে গেলে কমেন্টে জানান।`,
    },
  },
  essay: {
    label: 'Video essay',
    about: 'An argument built up point by point.',
    platform: 'youtube',
    style: 'thoughtful and engaging, like a video essayist building an argument',
    speed: 1,
    lengthSec: [480, 1500],
    templates: {
      en: `[A question that sounds simple, but isn't.]

Most people would say [the easy answer]. I used to think that too.

But [the first piece of evidence against it].

And then there's [the second piece].

So what's really going on? [Your argument.]

[What it means for the viewer.]`,
      bn: `[একটা প্রশ্ন, যেটা শুনতে সহজ, কিন্তু আসলে নয়।]

বেশিরভাগ মানুষ বলবেন [সহজ উত্তরটা]। আমিও তাই ভাবতাম।

কিন্তু [উল্টো দিকের প্রথম প্রমাণ]।

আর তারপর আছে [দ্বিতীয় প্রমাণ]।

তাহলে আসলে কী হচ্ছে? [আপনার যুক্তি।]

[দর্শকের কাছে এর মানে কী।]`,
    },
  },
  review: {
    label: 'Review',
    about: 'An honest verdict, with the good and the bad.',
    platform: 'youtube',
    style: 'honest and energetic, like a trusted reviewer',
    speed: 1.05,
    lengthSec: [180, 720],
    templates: {
      en: `I've been using [product] for [how long]. Here's my honest review.

First, what it is: [one line].

What I love: [the best thing], and [the second best].

What I don't: [the biggest problem].

Who it's for: [who]. Who should skip it: [who].

My verdict: [score or one line].`,
      bn: `[কতদিন] ধরে [পণ্য] ব্যবহার করছি। এই হলো আমার সৎ রিভিউ।

প্রথমে, এটা কী: [এক লাইনে]।

যা ভালো লেগেছে: [সবচেয়ে ভালো দিক], আর [দ্বিতীয়টা]।

যা ভালো লাগেনি: [সবচেয়ে বড় সমস্যা]।

কাদের জন্য: [কারা]। কারা এড়িয়ে যাবেন: [কারা]।

আমার রায়: [স্কোর বা এক লাইন]।`,
    },
  },
} as const satisfies Record<string, FormatDef>

export type FormatId = keyof typeof FORMATS

/** The platform pages in Studio, and which platforms and styles each covers */
export const PAGES = {
  tiktok: { label: 'TikTok', about: 'Short vertical videos. Up to 10 minutes for most accounts; most land at 15 to 60 seconds.', platforms: ['tiktok'], formats: ['storytime', 'pov', 'facts', 'reddit', 'top3', 'tip'] },
  meta: { label: 'Reels and Facebook', about: 'Short vertical videos for Instagram and Facebook. Reels up to 3 minutes reach people who don’t follow you.', platforms: ['reels', 'facebook'], formats: ['aesthetic', 'motivational', 'promo', 'howto', 'storytime'] },
  youtube: { label: 'YouTube', about: 'Shorts up to 3 minutes, and long videos with no limit.', platforms: ['shorts', 'youtube'], formats: ['shortsFact', 'top3', 'documentary', 'tutorial', 'essay', 'review'] },
} as const satisfies Record<string, { label: string; about: string; platforms: PlatformId[]; formats: FormatId[] }>

export type PageId = keyof typeof PAGES

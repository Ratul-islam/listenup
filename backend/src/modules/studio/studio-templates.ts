import type { NarrationTypeId } from './studio-catalog.js'

/**
 * A ready structure for each kind of narration, to fill in: a hook, the body, a close. The parts
 * in square brackets are for the creator to replace. A blank line starts a new paragraph, which
 * the voice reads with a longer pause.
 */
export const TEMPLATES: Record<NarrationTypeId, { en: string; bn: string }> = {
  explainer: {
    en: `Have you ever wondered [the question your video answers]?

In the next [two] minutes, you'll learn [what they'll get out of it].

First, [the first idea, in one or two sentences].

Second, [the second idea]. For example, [a quick example].

And finally, [the third idea].

So, to sum up: [the answer in one sentence]. If this helped, follow for more.`,
    bn: `আপনি কি কখনো ভেবেছেন [আপনার ভিডিও যে প্রশ্নের উত্তর দেবে]?

আগামী [দুই] মিনিটে আপনি জানবেন [দর্শক কী পাবেন]।

প্রথমত, [প্রথম কথাটা, এক-দুই বাক্যে]।

দ্বিতীয়ত, [দ্বিতীয় কথাটা]। যেমন, [একটা ছোট উদাহরণ]।

আর সবশেষে, [তৃতীয় কথাটা]।

তাহলে এক কথায়: [উত্তরটা এক বাক্যে]। ভালো লাগলে ফলো করুন।`,
  },
  storytelling: {
    en: `[Set the scene: where and when, in one sentence.]

[Introduce your main character and what they want.]

But then, [the moment everything changes].

[What they did about it.]

[The turning point, slowed down: what they saw, heard or felt.]

And in the end, [how it turned out].

[One line about what it meant.]`,
    bn: `[দৃশ্যটা সাজান: কোথায়, কখন, এক বাক্যে।]

[মূল চরিত্রকে চেনান, আর সে কী চায়।]

কিন্তু তারপর, [যে মুহূর্তে সব বদলে গেল]।

[সে তখন কী করল।]

[চরম মুহূর্তটা, ধীরে: সে কী দেখল, শুনল বা অনুভব করল।]

আর শেষে, [কী হলো]।

[এর মানে কী, এক লাইনে।]`,
  },
  documentary: {
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
  news: {
    en: `[The headline, in one sentence.]

[What happened, where and when.]

[Who is involved, and what they said.]

[Why it matters to the listener.]

[What happens next.]

That's the update for [today]. [Your name or channel], signing off.`,
    bn: `[শিরোনাম, এক বাক্যে।]

[কী ঘটেছে, কোথায়, কখন।]

[কারা জড়িত, আর তাঁরা কী বলেছেন।]

[শ্রোতার কাছে এর গুরুত্ব কী।]

[এরপর কী হবে।]

[আজকের] খবর এ পর্যন্তই। [আপনার নাম বা চ্যানেল]।`,
  },
  promo: {
    en: `[A question your customer is already asking themselves?]

Meet [product or offer]: [what it does, in one line].

[The biggest benefit.] [The second benefit.] [A detail that makes it believable.]

[Who it's for.]

[The offer: price, discount or deadline.]

[What to do now: visit, order, call.] [Where.]`,
    bn: `[আপনার ক্রেতা নিজেকে যে প্রশ্নটা করছেন?]

পরিচিত হোন [পণ্য বা অফার]-এর সাথে: [এক লাইনে এটা কী করে]।

[সবচেয়ে বড় সুবিধা।] [দ্বিতীয় সুবিধা।] [বিশ্বাস করার মতো একটা তথ্য।]

[এটা কাদের জন্য।]

[অফার: দাম, ছাড় বা শেষ তারিখ।]

[এখনই কী করবেন: ভিজিট, অর্ডার, কল।] [কোথায়।]`,
  },
  motivational: {
    en: `[A hard truth, said plainly.]

[The moment your listener is in right now.]

But here's the thing: [the shift in thinking].

[A short story or example of someone who did it.]

[One small step they can take today.]

[A last line to remember.]`,
    bn: `[একটা কঠিন সত্য, সোজাসুজি।]

[আপনার শ্রোতা এখন যে অবস্থায় আছেন।]

কিন্তু আসল কথা হলো: [ভাবনার যে বদল দরকার]।

[এমন কারো ছোট গল্প বা উদাহরণ, যিনি পেরেছেন।]

[আজই নেওয়া যায় এমন একটা ছোট পদক্ষেপ।]

[মনে রাখার মতো শেষ একটা লাইন।]`,
  },
  review: {
    en: `Here are the [five] best [things] for [who or what], ranked.

Number [five]: [name]. [Why it's on the list, in one line.] [One catch.]

Number [four]: [name]. [Why.]

Number [three]: [name]. [Why.]

Number [two]: [name]. [Why.]

And number one: [name]. [Why it wins.]

Which one would you pick? Tell me in the comments.`,
    bn: `[কী বা কার জন্য] সেরা [পাঁচটি] [জিনিস], র‍্যাঙ্কিং অনুযায়ী।

[পাঁচ] নম্বরে: [নাম]। [কেন তালিকায়, এক লাইনে।] [একটা দুর্বলতা।]

[চার] নম্বরে: [নাম]। [কেন।]

তিন নম্বরে: [নাম]। [কেন।]

দুই নম্বরে: [নাম]। [কেন।]

আর এক নম্বরে: [নাম]। [কেন এটাই সেরা।]

আপনি কোনটা নিতেন? কমেন্টে জানান।`,
  },
  conversational: {
    en: `Hey, welcome back. Today I want to talk about [topic].

So, [how this came up: something that happened to you].

[Your first thought about it.]

And honestly? [Your opinion, said the way you'd say it to a friend.]

[A question you're still thinking about.]

Anyway, that's me for today. [How to reach you], and I'll see you next time.`,
    bn: `আসসালামু আলাইকুম, আবার স্বাগতম। আজ কথা বলব [বিষয়] নিয়ে।

তো, [এটা কীভাবে মাথায় এলো: আপনার সাথে ঘটা কিছু]।

[এ নিয়ে আপনার প্রথম ভাবনা।]

আর সত্যি বলতে? [আপনার মতামত, বন্ধুকে যেভাবে বলতেন।]

[যে প্রশ্নটা নিয়ে আপনি এখনো ভাবছেন।]

যাই হোক, আজ এ পর্যন্তই। [কীভাবে যোগাযোগ করবেন], আবার দেখা হবে।`,
  },
  calm: {
    en: `Find a comfortable place, and let your shoulders drop.

Breathe in slowly... and let it go.

[Describe a calm place: what you see, one detail at a time.]

[What you hear there, soft and far away.]

[What you feel: warmth, the air, the ground beneath you.]

There's nowhere you need to be right now.

Breathe in... and out.`,
    bn: `আরাম করে বসুন বা শুয়ে পড়ুন, কাঁধটা ঢিলে করে দিন।

ধীরে শ্বাস নিন... আর ছেড়ে দিন।

[একটা শান্ত জায়গার বর্ণনা: কী দেখছেন, একটা একটা করে।]

[সেখানে কী শুনছেন, মৃদু, দূরে।]

[কী অনুভব করছেন: উষ্ণতা, বাতাস, নিচের মাটি।]

এই মুহূর্তে আপনার কোথাও যাওয়ার নেই।

শ্বাস নিন... আর ছাড়ুন।`,
  },
}

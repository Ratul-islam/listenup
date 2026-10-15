/**
 * DRAFT Terms of Service and Privacy Policy, written to match what the app
 * actually does. Have them reviewed by someone qualified before release, and
 * set SUPPORT_EMAIL to a real inbox.
 */
export const SUPPORT_EMAIL = 'SUPPORT_EMAIL';
export const LAST_UPDATED = '11 October 2026';

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export type LegalDocId = 'terms' | 'privacy' | 'community';

export const LEGAL: Record<LegalDocId, LegalDoc> = {
  terms: {
    title: 'Terms of service',
    intro: 'These terms cover your use of ListenUp, an app that reads your documents, articles and notes aloud. By creating an account you agree to them.',
    sections: [
      {
        title: 'Your account',
        paragraphs: [
          'You need an account to use ListenUp, and you must be at least 13 years old. Keep your password private; you are responsible for activity on your account.',
        ],
      },
      {
        title: 'Your content',
        paragraphs: [
          'Everything you import stays yours. You give us permission to process it only so we can provide the app: reading the text, turning it into speech and keeping it on your Soundshelf.',
          'Only import material you have the right to use. Do not import anything illegal, or content that infringes someone else’s rights.',
        ],
      },
      {
        title: 'AI processing',
        paragraphs: [
          'To read scans and photos and to create speech, the text or images involved are sent to AI services through OpenRouter. These systems can make mistakes, such as misreading a word or mispronouncing a name, so check anything important against the original.',
        ],
      },
      {
        title: 'Your own voice',
        paragraphs: [
          'On the Pro plan you can make a voice from a recording of yourself. Record only your own voice, and only if you are 18 or older. Recording anyone else here is not allowed, even with their permission, and we may remove a voice or close an account that does. (To hear someone else’s words in another language, use voice translation, below.)',
          'Your voice is private to your account. It can read your documents and make audio you save or share yourself, but it can’t be published in Explore. It isn’t offered in the UK, the European Economic Area, Switzerland, India, or the US states of Illinois and Texas. If your Pro plan ends, the voice is kept but reads nothing until you’re back on Pro. You can delete it at any time.',
        ],
      },
      {
        title: 'Voice translation',
        paragraphs: [
          'On the Pro plan you can upload a recording of someone speaking and hear it translated, read by a copy of their voice. Their voice is copied only after that person reads Google’s consent sentence into your phone themselves, and Google checks it is the same person. Upload only recordings you have the right to use, and copy a voice only when its owner agrees, is present, and is 18 or older. We may remove a translation or close an account that breaks this.',
          'A copied voice reads only the translation it was made for, is private to your account, and can’t be published in Explore. It isn’t offered where your own voice isn’t (see above). Deleting the translation deletes the copy of the voice.',
        ],
      },
      {
        title: 'Plans and limits',
        paragraphs: [
          'Each plan includes a monthly amount of listening. The Free plan resets on the 1st of each month. Paid plans, when available, are billed through Google Play and can be cancelled there. We may change plans or limits, and will tell you in the app before a change affects you.',
          'The Free plan shows ads. Watching an optional rewarded ad adds Natural-voice minutes, a few times a day. Minutes from invites are given once a friend who joined with your code has confirmed their email and listened for a few minutes; accounts made only to collect them may lose those minutes.',
          'The private podcast feed (Plus and Pro) is reached through a secret link. Anyone who has the link can listen to the episodes in it, so keep it to yourself; you can replace it with a new one at any time.',
        ],
      },
      {
        title: 'Fair use',
        paragraphs: [
          'Do not misuse the service: no attempts to break or overload it, no automated scraping, and no using its voices to impersonate real people or to deceive anyone.',
        ],
      },
      {
        title: 'Publishing in Explore',
        paragraphs: [
          'You can publish writing you wrote yourself, and short voice clips, to the Community in Explore, under a pen name. What you publish stays yours. Publishing lets ListenUp show it there and lets other listeners hear it and keep it on their Soundshelf until you unpublish it.',
          'Everything published must follow the Community rules. We check it before it appears, and we may take down anything that breaks them and stop accounts that keep breaking them from publishing. Contest prizes are listening minutes with no cash value, and we may withhold them from entries or hearts that break the rules.',
        ],
      },
      {
        title: 'Closing your account',
        paragraphs: [
          'You can close your account at any time in Profile. It is permanently deleted 30 days later, together with your documents, audio and history. Signing in during those 30 days restores it. We may suspend accounts that break these terms.',
        ],
      },
      {
        title: 'The service',
        paragraphs: [
          'We work to keep ListenUp available and accurate, but it is provided as it is, without guarantees. To the extent the law allows, we are not liable for indirect losses arising from its use. Nothing here limits rights you have under the law where you live.',
        ],
      },
      {
        title: 'Changes and contact',
        paragraphs: [`We may update these terms and will tell you in the app when we do. Questions: ${SUPPORT_EMAIL}.`],
      },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    intro: 'This explains what ListenUp collects, why, who helps us process it, and how you can delete it.',
    sections: [
      {
        title: 'What we collect',
        paragraphs: [
          'Account details: your name, email address and, if you use Google sign-in, your Google profile name and picture.',
          'What you import: files, links, pasted text and photos of pages, the text we extract from them, and the audio we create.',
          'How you listen: progress, bookmarks, emotions you add to lines, listening minutes and streaks, and your settings.',
          'Sign-in records: the device and network address of each signed-in session, so you can sign out everywhere.',
          'Crash reports: when the app crashes or a screen fails to open, a report of the error, what the app was doing just before it (such as the screens opened and the requests made to our server), and your phone’s model, Android version and app version. They also include a short recording of the screen from just before the crash, with all text, pictures and icons hidden, so it shows where you tapped but not what you were reading. Nothing is recorded when the app doesn’t crash. We don’t add your name or email address to crash reports.',
          'Invites: your invite code, who invited you, and how many friends joined with your code.',
          'Explore’s Community: what you publish (and its cover picture, if you add one), your pen name, the hearts you give, and any reports you make or writers you block. A cover picture is cut to size and saved again without the details a phone adds to photos, such as where and when it was taken.',
          'Your own voice, if you make one: the two recordings you read aloud (a passage and a consent sentence), the voice made from them, and when you gave your consent.',
          'Voice translation, if you use it: the recording you upload is listened to once and then deleted. We keep what was said and its translation (as a script), 25 seconds of the recording and the speaker’s consent sentence, so the copy of their voice can be renewed each week. They are deleted with the translation, or with your account.',
          'A line you record to show how it should sound (“Say it yourself”): the recording is listened to once and not kept. We keep the direction written from it, and measurements of how you said it (the timing, the pitch and loudness of your voice, and a coarse outline of each sound), so the line can be voiced that way again. They are deleted with the document, or with your account.',
        ],
      },
      {
        title: 'How we use it',
        paragraphs: [
          'To run ListenUp: to read your content aloud, remember where you are, show your progress and keep your account secure. We do not sell your data, and what you import is never used for ads.',
          'On the Free plan, Google AdMob shows ads and may use your device’s advertising ID and approximate location to choose them and measure them. Where the law requires it (for example in the EU and UK), the app asks for your consent first, and you can change your choice in Studio under “Ad privacy choices”. Paid plans show no ads.'
        ],
      },
      {
        title: 'Who processes it',
        paragraphs: [
          'OpenRouter, and the AI model providers it routes requests to, receive the text and images needed to read pages and create speech, and any line you record to show how it should sound. An email provider sends your sign-in and reset codes. Our hosting and storage providers keep the data on our behalf.',
          'For voice translation, the recording you upload goes to OpenRouter and the AI model it routes to (Google’s Gemini), which writes it down and translates it. If the speaker agrees to a copy of their voice, 25 seconds of the recording and their consent sentence go to Google (the Gemini API), which makes the copy, checks the consent is the same person, and creates the speech in it.',
          'If you make your own voice, your two recordings are sent to Google (the Gemini API). Google makes the voice, checks that the consent sentence is spoken by the same person, keeps the voice for us, and creates the speech in it. We keep the recordings privately so the voice can be renewed.',
          'Google Play and RevenueCat handle purchases and subscriptions; we receive your plan, renewal date and store country, never your payment details. Google AdMob shows ads on the Free plan.',
          'Sentry receives crash reports, so we can find and fix what went wrong.',
        ],
      },
      {
        title: 'What others can see',
        paragraphs: [
          'Only what you publish in Explore, under your pen name, with its hearts and listens. Your name, email and everything else stay private. Reports you make are seen only by the ListenUp team, and the writer is never told who reported them.',
        ],
      },
      {
        title: 'Keeping it safe',
        paragraphs: [
          'Passwords are stored as one-way hashes. Your sign-in on this phone is kept in its secure storage, and files are only available through short-lived private links.',
        ],
      },
      {
        title: 'Keeping and deleting it',
        paragraphs: [
          'We keep your data while your account is open. You can delete any document at any time. When you close your account, everything is permanently deleted after 30 days, unless you sign in again before then.',
          'Deleting your own voice erases the voice at Google, your two recordings, and the audio we keep in that voice. Audio you have already saved to your phone or shared stays where you put it.',
          'Deleting a voice translation erases its script, the 25 seconds of the recording, the consent sentence and the audio in the copied voice. Google keeps a copied voice for at most 7 days and then discards it.',
        ],
      },
      {
        title: 'Children',
        paragraphs: ['ListenUp is not meant for children under 13, and we do not knowingly collect their data.'],
      },
      {
        title: 'Changes and contact',
        paragraphs: [`We will tell you in the app if this policy changes. Questions or requests: ${SUPPORT_EMAIL}.`],
      },
    ],
  },

  community: {
    title: 'Community rules',
    intro: 'Explore’s Community is where listeners share their own stories, poems and favourite lines. These rules keep it a good place to listen.',
    sections: [
      {
        title: 'Share your own work',
        paragraphs: [
          'Publish only what you wrote yourself. Don’t post books, poems, song lyrics or articles by someone else.',
          'Lines from Explore’s free classics are welcome as clips: they’re out of copyright and are credited to their authors.',
          'A cover picture must be yours to use, and it follows the rules below like the writing does: no nudity, gore, hate symbols, private details, ads, phone numbers or links.',
        ],
      },
      {
        title: 'Not allowed',
        paragraphs: [
          'Hate or harassment: attacking people for their religion, caste, ethnicity, nationality, gender, sexuality or disability, or bullying a real person.',
          'Sexual content: anything sexual involving a minor, or explicit sex.',
          'Violence: real threats, or encouraging violence, terrorism or self-harm.',
          'Private details: phone numbers, home addresses, ID numbers or other personal information about anyone.',
          'Spam: ads, selling, scams, links, or posting the same thing again and again.',
        ],
      },
      {
        title: 'Welcome',
        paragraphs: ['Fiction of every kind, including sad, scary or dark stories. Romance without explicit sex. Religion and politics, discussed respectfully. Mild swearing.'],
      },
      {
        title: 'How we keep it safe',
        paragraphs: [
          'An AI check reads everything, and looks at any cover picture, before it’s published. A cover that doesn’t fit the rules is left out, and the writing is published with a drawn cover instead. Anyone can report a piece or block a writer. A piece reported by several listeners is hidden until the ListenUp team looks at it.',
          'We take down what breaks these rules, from Explore and from every listener’s shelf, and tell the writer why. Accounts that keep breaking them may lose the ability to publish.',
        ],
      },
      {
        title: 'Unpublishing',
        paragraphs: ['You can unpublish anything you published at any time, from Your posts. It leaves Explore and every listener’s shelf.'],
      },
      {
        title: 'The monthly contest',
        paragraphs: [
          'Each writer can enter one writing a month. Bangla, English and other languages each have a board, and the top three on each win 60, 30 or 15 Expressive minutes, given a day after the month ends. They never expire and have no cash value.',
          'A heart counts once the listener has heard the writing (half of it, or two minutes) and their account has a confirmed email and is at least a week old. A winner needs at least three hearts that count. Entries that break these rules, and hearts from accounts made to vote, don’t count.',
        ],
      },
    ],
  },
};

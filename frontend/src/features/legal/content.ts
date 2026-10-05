/**
 * DRAFT Terms of Service and Privacy Policy, written to match what the app
 * actually does. Have them reviewed by someone qualified before release, and
 * set SUPPORT_EMAIL to a real inbox.
 */
export const SUPPORT_EMAIL = 'SUPPORT_EMAIL';
export const LAST_UPDATED = '4 October 2026';

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL: Record<'terms' | 'privacy', LegalDoc> = {
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
          'Invites: your invite code, who invited you, and how many friends joined with your code.',
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
          'OpenRouter, and the AI model providers it routes requests to, receive the text and images needed to read pages and create speech. An email provider sends your sign-in and reset codes. Our hosting and storage providers keep the data on our behalf.',
          'Google Play and RevenueCat handle purchases and subscriptions; we receive your plan, renewal date and store country, never your payment details. Google AdMob shows ads on the Free plan.',
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
};

import { onDeviceVoice } from '@/features/on-device/on-device-voice';
import { phoneVoice } from '@/modules/phone-voice';

import { voicesApi, type Voice } from '../api/voices.api';

const PREVIEW_TEXT: Record<Voice['language'], string> = {
  en: "Hi, I'm here to read your articles, notes and books aloud, whenever you're ready.",
  bn: 'আমি আপনার লেখা, নোট আর বই পড়ে শোনাতে প্রস্তুত। যখন খুশি শুরু করুন।',
  hi: 'नमस्ते, मैं आपके लेख, नोट्स और किताबें पढ़कर सुनाने के लिए तैयार हूँ। जब चाहें, शुरू करें।',
  es: 'Hola, estoy aquí para leerte en voz alta tus artículos, notas y libros, cuando quieras.',
  pt: 'Olá, estou aqui para ler em voz alta seus artigos, notas e livros, quando você quiser.',
  fr: 'Bonjour, je suis là pour vous lire à voix haute vos articles, notes et livres, quand vous voulez.',
  it: 'Ciao, sono qui per leggerti ad alta voce articoli, appunti e libri, quando vuoi.',
  ja: 'こんにちは。あなたの記事やメモ、本を、いつでも読み上げます。',
  zh: '你好，我可以随时为你朗读文章、笔记和书籍。',
  ur: 'السلام علیکم، میں جب چاہیں آپ کے مضامین، نوٹس اور کتابیں پڑھ کر سنا سکتی ہوں۔',
  id: 'Halo, saya siap membacakan artikel, catatan, dan buku Anda kapan saja.',
};

/** Audio to preview a voice: phone voices (and Natural ones once downloaded) are voiced on this device, the rest come from the server */
export function previewUri(voice: Voice) {
  if (voice.tier === 'phone') return phoneVoice.synthesize(PREVIEW_TEXT[voice.language], voice.language).then((clip) => clip.uri);
  const speaker = voice.tier === 'natural' ? onDeviceVoice.speakerFor(voice.id) : null;
  if (speaker) {
    return onDeviceVoice
      .synthesize(PREVIEW_TEXT[voice.language], speaker)
      .then((clip) => clip.uri)
      .catch(() => voicesApi.preview(voice.id));
  }
  return voicesApi.preview(voice.id);
}

/** The phone has no voice for that language (e.g. Bangla isn't downloaded yet) */
export const isMissingPhoneVoice = (error: unknown) => (error as { code?: string } | null)?.code === 'VOICE_MISSING';

/** Toast for a missing phone voice, with a shortcut to Android's voice downloads */
export const missingPhoneVoiceToast = {
  label: "Your phone doesn't have this language's voice yet",
  description: 'Download it in Android’s text-to-speech settings. It’s free.',
  actionLabel: 'Get voice',
  onActionPress: ({ hide }: { hide: (ids?: string | string[] | 'all') => void }) => {
    phoneVoice.openInstallVoiceData();
    hide('all');
  },
};

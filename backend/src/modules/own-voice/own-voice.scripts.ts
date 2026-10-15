import type { Lang } from '../ingestion/text/language.js'

/** What the speaker reads to make their voice */
export interface VoiceScript {
  language: Lang
  /** About 20 seconds read aloud: the recording the voice is made from */
  reading: string
  /** Google's consent sentence, which it checks is said word for word by the same speaker */
  consent: string
}

/**
 * One script per language Google has a consent sentence for. The consent
 * sentences are Google's own (ai.google.dev/gemini-api/docs/voice-replication),
 * copied word for word: don't reword them, and check them against that page
 * when it changes. Urdu has none, so Urdu speakers read another language.
 */
export const VOICE_SCRIPTS: VoiceScript[] = [
  {
    language: 'en',
    reading:
      'On quiet mornings I like to read a few pages before the day begins. Some stories make me laugh out loud, and others leave me thinking for hours. I read slowly, the way I would to a friend sitting beside me, pausing at the commas and letting each sentence finish before the next one starts. This is how I sound when I read.',
    consent: 'I am the owner of this voice and I consent to Google using this voice to create a synthetic voice model.',
  },
  {
    language: 'bn',
    reading:
      'ভোরবেলা চারদিক যখন শান্ত থাকে, তখন আমি কয়েক পাতা বই পড়তে ভালোবাসি। কোনো গল্প পড়ে হেসে ফেলি, আবার কোনো গল্প অনেকক্ষণ ভাবায়। আমি ধীরে ধীরে পড়ি, যেন পাশে বসা কোনো বন্ধুকে শোনাচ্ছি। প্রতিটি বাক্য শেষ করে একটু থামি, তারপর পরেরটা শুরু করি। পড়ার সময় আমার কণ্ঠ ঠিক এমনই শোনায়।',
    consent: 'আমি এই ভয়েসের মালিক এবং আমি একটি সিন্থেটিক ভয়েস মডেল তৈরি করতে এই ভয়েস ব্যবহার করে Google-এর সাথে সম্মতি দিচ্ছি।',
  },
  {
    language: 'hi',
    reading:
      'सुबह जब चारों ओर शांति होती है, तब मुझे किताब के कुछ पन्ने पढ़ना अच्छा लगता है। कुछ कहानियाँ मुझे हँसा देती हैं, और कुछ देर तक सोचने पर मजबूर कर देती हैं। मुझे धीरे-धीरे पढ़ना पसंद है, जैसे पास बैठे किसी दोस्त को सुनाना हो। हर वाक्य के बाद थोड़ा रुकना, फिर अगला शुरू करना। पढ़ते समय मेरी आवाज़ ऐसी ही सुनाई देती है।',
    consent: 'मैं इस आवाज का मालिक हूं और मैं सिंथेटिक आवाज मॉडल बनाने के लिए Google को इस आवाज का उपयोग करने की सहमति देता हूं',
  },
  {
    language: 'es',
    reading:
      'En las mañanas tranquilas me gusta leer unas páginas antes de que empiece el día. Algunas historias me hacen reír en voz alta, y otras me dejan pensando durante horas. Leo despacio, como si le leyera a un amigo sentado a mi lado, haciendo una pausa en cada coma y dejando que cada frase termine antes de empezar la siguiente. Así sueno cuando leo.',
    consent: 'Soy el propietario de esta voz y doy mi consentimiento para que Google la utilice para crear un modelo de voz sintética.',
  },
  {
    language: 'pt',
    reading:
      'Nas manhãs tranquilas, gosto de ler algumas páginas antes de o dia começar. Algumas histórias me fazem rir em voz alta, e outras me deixam pensando por horas. Leio devagar, como se estivesse lendo para um amigo sentado ao meu lado, fazendo uma pausa em cada vírgula e deixando cada frase terminar antes de começar a próxima. É assim que eu soo quando leio.',
    consent: 'Eu sou o proprietário desta voz e autorizo o Google a usá-la para criar um modelo de voz sintética.',
  },
  {
    language: 'fr',
    reading:
      'Les matins calmes, j’aime lire quelques pages avant que la journée commence. Certaines histoires me font rire aux éclats, et d’autres me font réfléchir pendant des heures. Je lis lentement, comme si je lisais à un ami assis à côté de moi, en marquant une pause à chaque virgule et en laissant chaque phrase se terminer avant de commencer la suivante. Voilà ma voix quand je lis.',
    consent: "Je suis le propriétaire de cette voix et j'autorise Google à utiliser cette voix pour créer un modèle de voix synthétique.",
  },
  {
    language: 'it',
    reading:
      'Nelle mattine tranquille mi piace leggere qualche pagina prima che inizi la giornata. Alcune storie mi fanno ridere di gusto, altre mi lasciano a pensare per ore. Leggo lentamente, come se leggessi a un amico seduto accanto a me, facendo una pausa a ogni virgola e lasciando che ogni frase finisca prima di iniziare la successiva. Questa è la mia voce quando leggo.',
    consent: 'Sono il proprietario di questa voce e acconsento che Google la utilizzi per creare un modello di voce sintetica.',
  },
  {
    language: 'ja',
    reading:
      '静かな朝には、一日が始まる前に本を数ページ読むのが好きです。声を出して笑ってしまう物語もあれば、何時間も考えさせられる物語もあります。隣に座っている友だちに読み聞かせるように、ゆっくりと読みます。読点で少し間をおき、一つの文を読み終えてから次の文を始めます。これが、本を読むときの私の声です。',
    consent: '私はこの音声の所有者であり、Googleがこの音声を使用して音声合成モデルを作成することを承認します。',
  },
  {
    language: 'zh',
    reading:
      '在安静的早晨，我喜欢在一天开始之前读上几页书。有些故事会让我笑出声来，有些故事会让我思考很久。我读得很慢，就像读给坐在身边的朋友听一样。每读完一句，我会稍微停一下，然后再开始下一句。这就是我读书时的声音。',
    consent: '我是此声音的拥有者并授权谷歌使用此声音创建语音合成模型',
  },
  {
    language: 'id',
    reading:
      'Di pagi yang tenang, saya suka membaca beberapa halaman sebelum hari dimulai. Ada cerita yang membuat saya tertawa keras, dan ada juga yang membuat saya berpikir berjam-jam. Saya membaca perlahan, seperti membacakan untuk teman yang duduk di samping saya, berhenti sejenak di setiap koma dan membiarkan setiap kalimat selesai sebelum memulai kalimat berikutnya. Beginilah suara saya saat membaca.',
    consent: 'Saya pemilik suara ini dan saya menyetujui Google menggunakan suara ini untuk membuat model suara sintetis.',
  },
]

export const scriptFor = (language: string) => VOICE_SCRIPTS.find((s) => s.language === language)

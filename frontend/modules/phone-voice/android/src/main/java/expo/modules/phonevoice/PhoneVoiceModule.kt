package expo.modules.phonevoice

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Cached audio unused for this long is deleted
private const val CACHE_MAX_AGE_MS = 14L * 24 * 60 * 60 * 1000

// WAV is uncompressed (~170 MB per hour), so the oldest files go beyond this size
private const val CACHE_MAX_BYTES = 300L * 1024 * 1024

// Unfinished files older than this were left by an interrupted synthesis
private const val STALE_PART_MS = 10L * 60 * 1000

// The cache is trimmed after this many new clips (and when the engine starts)
private const val PRUNE_EVERY = 20

// Identifies our speech-recognition request among activity results
private const val RECOGNIZE_REQUEST = 4127

// Countries preferred when a language has several voices
// (Android still reports Indonesian with its old code, "in")
private val PREFERRED_COUNTRY = mapOf(
  "bn" to "BD", "en" to "US", "hi" to "IN", "es" to "ES", "pt" to "BR", "fr" to "FR",
  "it" to "IT", "ja" to "JP", "zh" to "CN", "ur" to "PK", "id" to "ID", "in" to "ID",
)

/**
 * The phone's own text-to-speech voices, written to WAV files so the app's
 * audio player can play them like any other clip (background playback,
 * lock-screen controls, seeking, speed). They cost nothing and work offline.
 * Files are cached by voice and text.
 */
class PhoneVoiceModule : Module() {
  private var engine: TextToSpeech? = null
  private var ready = false
  private val waiting = mutableListOf<(TextToSpeech?) -> Unit>()
  private val pending = ConcurrentHashMap<String, Pending>()
  private var clipsSincePrune = 0
  private var recognizing: Promise? = null
  // setVoice + synthesizeToFile must not interleave between threads
  private val synthLock = Any()

  private class Pending(val tmp: File, val file: File, val promise: Promise)

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Android context is not available")

  private val cacheDir: File by lazy { File(context.cacheDir, "phone-voice").apply { mkdirs() } }

  private val listener = object : UtteranceProgressListener() {
    override fun onStart(utteranceId: String) {}

    override fun onDone(utteranceId: String) {
      val p = pending.remove(utteranceId) ?: return
      if (!p.tmp.renameTo(p.file)) {
        p.tmp.delete()
        p.promise.reject("SYNTHESIS_FAILED", "Couldn't save the phone voice's audio.", null)
        return
      }
      p.promise.resolve(clipInfo(p.file))
      if (++clipsSincePrune >= PRUNE_EVERY) {
        clipsSincePrune = 0
        pruneCache()
      }
    }

    @Deprecated("Deprecated in Java")
    override fun onError(utteranceId: String) = fail(utteranceId, -1)

    override fun onError(utteranceId: String, errorCode: Int) = fail(utteranceId, errorCode)

    private fun fail(utteranceId: String, errorCode: Int) {
      val p = pending.remove(utteranceId) ?: return
      p.tmp.delete()
      p.promise.reject("SYNTHESIS_FAILED", "The phone voice couldn't read this (error $errorCode).", null)
    }
  }

  /** Runs `block` with the started engine, or null if this phone has none */
  private fun withEngine(block: (TextToSpeech?) -> Unit) {
    var runNow = false
    var start = false
    synchronized(this) {
      when {
        ready -> runNow = true
        else -> {
          waiting.add(block)
          start = engine == null
        }
      }
    }
    if (runNow) return block(engine)
    if (!start) return

    // The engine binds to a service and reports back on the main thread
    Handler(Looper.getMainLooper()).post {
      lateinit var created: TextToSpeech
      created = TextToSpeech(context) { status ->
        val ok = status == TextToSpeech.SUCCESS
        val callbacks: List<(TextToSpeech?) -> Unit>
        synchronized(this) {
          ready = ok
          if (!ok) {
            created.shutdown()
            engine = null
          }
          callbacks = waiting.toList()
          waiting.clear()
        }
        if (ok) {
          created.setOnUtteranceProgressListener(listener)
          pruneCache()
        }
        callbacks.forEach { it(if (ok) created else null) }
      }
      synchronized(this) { engine = created }
    }
  }

  private fun usable(voice: Voice) = !voice.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)

  private fun voicesOf(tts: TextToSpeech): Set<Voice> = try {
    tts.voices ?: emptySet()
  } catch (e: Exception) {
    emptySet()
  }

  /** The requested voice, else the best installed one for the language (offline first) */
  private fun pickVoice(tts: TextToSpeech, language: String, voiceId: String?): Voice? {
    val voices = voicesOf(tts)
    if (voiceId != null) voices.firstOrNull { it.name == voiceId && usable(it) }?.let { return it }

    val lang = Locale.forLanguageTag(language).language
    val country = PREFERRED_COUNTRY[lang]
    val best = voices
      .filter { it.locale.language == lang && usable(it) }
      .sortedWith(
        compareBy<Voice>({ it.isNetworkConnectionRequired }, { if (it.locale.country == country) 0 else 1 }, { -it.quality }),
      )
      .firstOrNull()
    if (best != null) return best

    // Some engines don't list voices; fall back to the language's default voice
    val result = tts.setLanguage(Locale.forLanguageTag(language))
    return if (result >= TextToSpeech.LANG_AVAILABLE) tts.voice else null
  }

  private fun cacheKey(voice: String, text: String): String {
    val digest = MessageDigest.getInstance("SHA-1").digest("$voice\u0000$text".toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }
  }

  /** Drops stale and old files, then the least recently played until the cache fits */
  private fun pruneCache() {
    val now = System.currentTimeMillis()
    cacheDir.listFiles()?.forEach { f ->
      val stalePart = f.name.endsWith(".part") && f.lastModified() < now - STALE_PART_MS
      if (stalePart || f.lastModified() < now - CACHE_MAX_AGE_MS) f.delete()
    }
    val clips = cacheDir.listFiles()?.filter { it.name.endsWith(".wav") }?.sortedBy { it.lastModified() } ?: return
    var total = clips.sumOf { it.length() }
    for (f in clips) {
      if (total <= CACHE_MAX_BYTES) break
      total -= f.length()
      f.delete()
    }
  }

  private fun clipInfo(file: File) = mapOf("uri" to Uri.fromFile(file).toString(), "durationMs" to WavFile.durationMs(file))

  override fun definition() = ModuleDefinition {
    Name("PhoneVoice")

    /** Installed voices: id (engine voice name), BCP-47 language, quality 100–500, needsNetwork */
    AsyncFunction("getVoicesAsync") { promise: Promise ->
      withEngine { tts ->
        if (tts == null) return@withEngine promise.resolve(mapOf("engine" to null, "voices" to emptyList<Any>()))
        val voices = voicesOf(tts).filter { usable(it) }.map {
          mapOf(
            "id" to it.name,
            "language" to it.locale.toLanguageTag(),
            "quality" to it.quality,
            "needsNetwork" to it.isNetworkConnectionRequired,
          )
        }
        promise.resolve(mapOf("engine" to tts.defaultEngine, "voices" to voices))
      }
    }

    /** Reads `text` into a WAV file; resolves { uri, durationMs } */
    AsyncFunction("synthesizeAsync") { text: String, language: String, voiceId: String?, promise: Promise ->
      withEngine { tts ->
        if (tts == null) return@withEngine promise.reject("ENGINE_UNAVAILABLE", "This phone has no text-to-speech engine.", null)
        val voice = pickVoice(tts, language, voiceId)
          ?: return@withEngine promise.reject("VOICE_MISSING", "This phone has no voice for this language yet.", null)

        val file = File(cacheDir, cacheKey(voice.name, text) + ".wav")
        if (file.length() > 44) {
          file.setLastModified(System.currentTimeMillis())
          return@withEngine promise.resolve(clipInfo(file))
        }

        val id = UUID.randomUUID().toString()
        val tmp = File(cacheDir, "$id.part")
        pending[id] = Pending(tmp, file, promise)
        val result = synchronized(synthLock) {
          tts.setVoice(voice)
          tts.synthesizeToFile(text, Bundle(), tmp, id)
        }
        if (result != TextToSpeech.SUCCESS) {
          pending.remove(id)
          tmp.delete()
          promise.reject("SYNTHESIS_FAILED", "The phone voice couldn't read this.", null)
        }
      }
    }

    /** Joins WAV files with the same format into one; resolves { uri, durationMs } */
    AsyncFunction("concatAsync") { uris: List<String>, promise: Promise ->
      try {
        val files = uris.map { File(Uri.parse(it).path ?: it) }
        val out = File(cacheDir, cacheKey("concat", files.joinToString("|") { it.name }) + ".wav")
        WavFile.concat(files, out)
        promise.resolve(clipInfo(out))
      } catch (e: Exception) {
        promise.reject("CONCAT_FAILED", e.message ?: "Couldn't join the audio.", e)
      }
    }

    /** Opens the system screen for downloading voices (e.g. Bangla); false if there's none */
    Function("openInstallVoiceData") {
      val intents = listOf(Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA), Intent("com.android.settings.TTS_SETTINGS"))
      intents.any { intent ->
        try {
          context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          true
        } catch (e: Exception) {
          false
        }
      }
    }

    /**
     * Listens with the phone's speech recognition (Google's dialog) and
     * resolves the words heard, or null if the listener cancelled
     */
    AsyncFunction("recognizeAsync") { language: String?, prompt: String?, promise: Promise ->
      val activity = appContext.currentActivity
        ?: return@AsyncFunction promise.reject("NO_ACTIVITY", "Voice search isn't available right now.", null)
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        if (language != null) putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
        if (prompt != null) putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
      }
      recognizing?.resolve(null)
      recognizing = promise
      try {
        activity.startActivityForResult(intent, RECOGNIZE_REQUEST)
      } catch (e: ActivityNotFoundException) {
        recognizing = null
        promise.reject("RECOGNITION_UNAVAILABLE", "This phone has no speech recognition.", e)
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      if (payload.requestCode != RECOGNIZE_REQUEST) return@OnActivityResult
      val promise = recognizing ?: return@OnActivityResult
      recognizing = null
      val heard = if (payload.resultCode == Activity.RESULT_OK) {
        payload.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
      } else {
        null
      }
      promise.resolve(heard)
    }

    OnDestroy {
      pending.values.forEach { it.promise.reject("ENGINE_STOPPED", "The phone voice stopped.", null) }
      pending.clear()
      engine?.shutdown()
      engine = null
      ready = false
    }
  }
}

/** Minimal reader/writer for the PCM WAV files Android's speech engines write */
private object WavFile {
  private class Info(val format: ByteArray, val byteRate: Int, val dataOffset: Long, val dataSize: Long)

  private fun read(file: File): Info {
    RandomAccessFile(file, "r").use { f ->
      val riff = ByteArray(12)
      f.readFully(riff)
      var format: ByteArray? = null
      while (f.filePointer + 8 <= f.length()) {
        val id = ByteArray(4).also { f.readFully(it) }.toString(Charsets.US_ASCII)
        val size = Integer.reverseBytes(f.readInt()).toLong() and 0xffffffffL
        if (id == "fmt ") {
          format = ByteArray(size.toInt()).also { f.readFully(it) }
          if (size % 2 == 1L) f.skipBytes(1)
        } else if (id == "data") {
          val fmt = format ?: throw IllegalStateException("WAV file has no format")
          val byteRate = ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN).getInt(8)
          // Streaming writers may leave the size as 0; then the data runs to the end
          val available = f.length() - f.filePointer
          val dataSize = if (size in 1..available) size else available
          return Info(fmt, byteRate, f.filePointer, dataSize)
        } else {
          f.seek(f.filePointer + size + (size and 1))
        }
      }
      throw IllegalStateException("WAV file has no audio")
    }
  }

  fun durationMs(file: File): Long = try {
    val info = read(file)
    if (info.byteRate > 0) info.dataSize * 1000 / info.byteRate else 0
  } catch (e: Exception) {
    0
  }

  fun concat(files: List<File>, out: File) {
    require(files.isNotEmpty()) { "Nothing to join" }
    val infos = files.map(::read)
    val format = infos.first().format
    require(infos.all { it.format.contentEquals(format) }) { "The clips have different audio formats" }
    val total = infos.sumOf { it.dataSize }

    FileOutputStream(out).use { o ->
      val header = ByteBuffer.allocate(20 + format.size).order(ByteOrder.LITTLE_ENDIAN)
      header.put("RIFF".toByteArray()).putInt((4 + 8 + format.size + 8 + total).toInt()).put("WAVE".toByteArray())
      header.put("fmt ".toByteArray()).putInt(format.size).put(format)
      o.write(header.array())
      o.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).put("data".toByteArray()).putInt(total.toInt()).array())
      files.zip(infos).forEach { (file, info) ->
        RandomAccessFile(file, "r").use { f ->
          f.seek(info.dataOffset)
          val buf = ByteArray(64 * 1024)
          var left = info.dataSize
          while (left > 0) {
            val n = f.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
            if (n < 0) break
            o.write(buf, 0, n)
            left -= n
          }
        }
      }
    }
  }
}

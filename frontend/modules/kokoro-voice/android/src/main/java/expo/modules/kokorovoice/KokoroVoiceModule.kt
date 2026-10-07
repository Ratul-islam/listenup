package expo.modules.kokorovoice

import android.content.Context
import android.net.Uri
import android.os.StatFs
import android.os.SystemClock
import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipInputStream

// Cached audio unused for this long is deleted
private const val CACHE_MAX_AGE_MS = 14L * 24 * 60 * 60 * 1000

// WAV is uncompressed (~170 MB per hour), so the oldest files go beyond this size
private const val CACHE_MAX_BYTES = 300L * 1024 * 1024

// Unfinished files older than this were left by an interrupted synthesis
private const val STALE_PART_MS = 10L * 60 * 1000

// The cache is trimmed after this many new clips
private const val PRUNE_EVERY = 20

// The model takes ~400 MB of memory, so it's let go after this long without speaking
private const val IDLE_RELEASE_MS = 3L * 60 * 1000

// Free space left on the phone after installing
private const val SPACE_MARGIN_BYTES = 100L * 1024 * 1024

private const val PROGRESS_EVERY_MS = 250L

private const val BENCHMARK_RUNS = 2

// About 6 seconds of speech: long enough for a steady speed, short enough to wait for
private const val BENCHMARK_TEXT =
  "The library was quiet that afternoon. She found a seat by the window, opened the book, and started reading the first chapter."

/**
 * espeak-ng language for each Kokoro voice, by its first letter: American and
 * British English, Spanish, French, Hindi, Italian and Brazilian Portuguese.
 * Chinese voices read Chinese with the package's lexicon; "en-us" covers any
 * Latin words in it.
 */
private val LANG_BY_PREFIX = mapOf(
  'a' to "en-us", 'b' to "en", 'e' to "es", 'f' to "fr", 'h' to "hi", 'i' to "it", 'p' to "pt-br", 'z' to "en-us",
)

private val VERSION_DIR = Regex("v(\\d+)")

private class KokoroException(code: String, message: String, cause: Throwable? = null) : CodedException(code, message, cause)

/**
 * Kokoro-82M on the phone (sherpa-onnx), for Natural voices that cost nothing
 * and work offline. The package (~165 MB) is downloaded after install, never
 * shipped in the app. Clips are written to WAV files and cached by voice and
 * text, like the phone voices, so the app's player treats them like any clip.
 */
class KokoroVoiceModule : Module() {
  // Loading, speaking and releasing the model happen one at a time on this thread
  private val worker = Executors.newSingleThreadScheduledExecutor()
  private val downloader = Executors.newSingleThreadExecutor()
  private val cancelled = AtomicBoolean(false)

  @Volatile private var downloading = false

  @Volatile private var pkg: Installed? = null
  private var pkgRead = false

  // Only touched on the worker thread
  private var tts: OfflineTts? = null
  private var loaded: Loaded? = null
  private var releaseTask: ScheduledFuture<*>? = null
  private var clipsSincePrune = 0

  // Chosen in the app (the speed check, or the test screen); null means automatic
  @Volatile private var preferredThreads: Int? = null

  @Volatile private var preferredProvider = "cpu"

  private class Installed(val version: Int, val dir: File, val speakers: List<String>)

  private data class Loaded(val version: Int, val threads: Int, val provider: String, val loadMs: Long)

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Android context is not available")

  // Not backed up to the user's Google account: it's large and can be downloaded again
  private val rootDir: File by lazy { File(context.noBackupFilesDir, "kokoro") }

  private val cacheDir: File by lazy { File(context.cacheDir, "kokoro-voice").apply { mkdirs() } }

  /** The newest fully unpacked package, if any */
  private fun installed(): Installed? {
    synchronized(this) {
      if (pkgRead) return pkg
      pkgRead = true
      val dir = rootDir.listFiles()
        ?.filter { it.isDirectory && VERSION_DIR.matches(it.name) && File(it, ".ready").exists() }
        ?.maxByOrNull { it.name.drop(1).toInt() }
      pkg = dir?.let { d ->
        val speakers = try {
          File(d, "speakers.txt").readLines().map { it.trim() }.filter { it.isNotEmpty() }
        } catch (e: IOException) {
          emptyList()
        }
        if (speakers.isEmpty()) null else Installed(d.name.drop(1).toInt(), d, speakers)
      }
      return pkg
    }
  }

  private fun forgetInstalled() = synchronized(this) { pkgRead = false }

  private fun defaultThreads(): Int = (Runtime.getRuntime().availableProcessors() / 2).coerceIn(1, 4)

  private fun status(): Map<String, Any?> {
    val p = installed()
    return mapOf(
      "installed" to (p != null),
      "version" to p?.version,
      "speakers" to (p?.speakers ?: emptyList<String>()),
      "downloading" to downloading,
      "threads" to (preferredThreads ?: defaultThreads()),
      "cores" to Runtime.getRuntime().availableProcessors(),
    )
  }

  // --- The model ---------------------------------------------------------------

  /** The loaded model, loading (or reloading with new settings) as needed. Worker thread only. */
  private fun engine(threads: Int? = null, provider: String? = null): OfflineTts {
    val p = installed() ?: throw KokoroException("NOT_INSTALLED", "Natural voices aren't downloaded on this phone.")
    val wantThreads = threads ?: preferredThreads ?: defaultThreads()
    val wantProvider = provider ?: preferredProvider
    val current = tts
    val l = loaded
    if (current != null && l != null && l.version == p.version && l.threads == wantThreads && l.provider == wantProvider) return current

    release()
    val start = SystemClock.elapsedRealtime()
    val dir = p.dir.path
    val config = OfflineTtsConfig(
      model = OfflineTtsModelConfig(
        kokoro = OfflineTtsKokoroModelConfig(
          model = "$dir/model.onnx",
          voices = "$dir/voices.bin",
          tokens = "$dir/tokens.txt",
          dataDir = "$dir/espeak-ng-data",
          lexicon = "$dir/lexicon-zh.txt",
          dictDir = "$dir/dict",
        ),
        numThreads = wantThreads,
        provider = wantProvider,
      ),
      // No rule FSTs: the Chinese ones would rewrite numbers in every language.
      // The app writes Chinese numbers out before speaking instead.
      maxNumSentences = 1,
    )
    val created = try {
      OfflineTts(config = config)
    } catch (e: Throwable) {
      throw KokoroException("LOAD_FAILED", "Natural voices couldn't start on this phone.", e)
    }
    tts = created
    loaded = Loaded(p.version, wantThreads, wantProvider, SystemClock.elapsedRealtime() - start)
    return created
  }

  /** Frees the model's memory. Worker thread only. */
  private fun release() {
    releaseTask?.cancel(false)
    releaseTask = null
    tts?.release()
    tts = null
    loaded = null
  }

  private fun releaseLater() {
    releaseTask?.cancel(false)
    releaseTask = worker.schedule({ release() }, IDLE_RELEASE_MS, TimeUnit.MILLISECONDS)
  }

  private fun generate(engine: OfflineTts, text: String, sid: Int, speaker: String, speed: Float) =
    engine.generateWithConfig(text, GenerationConfig(sid = sid, speed = speed, extra = mapOf("lang" to (LANG_BY_PREFIX[speaker.first()] ?: "en-us"))))

  private fun speakerId(p: Installed, speaker: String): Int {
    val sid = p.speakers.indexOf(speaker)
    if (sid < 0) throw KokoroException("VOICE_MISSING", "This voice isn't in the download on this phone.")
    return sid
  }

  private fun synthesize(text: String, speaker: String, speed: Float): Map<String, Any> {
    val p = installed() ?: throw KokoroException("NOT_INSTALLED", "Natural voices aren't downloaded on this phone.")
    val sid = speakerId(p, speaker)
    val file = File(cacheDir, cacheKey("v${p.version}", speaker, speed.toString(), text) + ".wav")
    if (file.length() > 44) {
      file.setLastModified(System.currentTimeMillis())
      return clipInfo(file, WavFile.durationMs(file), 0)
    }

    val engine = engine()
    val start = SystemClock.elapsedRealtime()
    val audio = generate(engine, text, sid, speaker, speed)
    val elapsed = SystemClock.elapsedRealtime() - start
    releaseLater()
    // e.g. only symbols, which turn into no sounds
    if (audio.samples.isEmpty()) throw KokoroException("NOTHING_TO_SAY", "There's nothing here the voice can say.")

    val tmp = File(cacheDir, "${UUID.randomUUID()}.part")
    WavFile.write(tmp, audio.samples, audio.sampleRate)
    if (!tmp.renameTo(file)) {
      tmp.delete()
      throw KokoroException("SYNTHESIS_FAILED", "Couldn't save the voice's audio.")
    }
    if (++clipsSincePrune >= PRUNE_EVERY) {
      clipsSincePrune = 0
      pruneCache()
    }
    return clipInfo(file, audio.samples.size * 1000L / audio.sampleRate, elapsed)
  }

  /** How fast this phone speaks: seconds of work per second of audio (below 1 is faster than real time) */
  private fun benchmark(threads: Int?, provider: String?): Map<String, Any> {
    val p = installed() ?: throw KokoroException("NOT_INSTALLED", "Natural voices aren't downloaded on this phone.")
    val speaker = if ("af_heart" in p.speakers) "af_heart" else p.speakers.first()
    val sid = speakerId(p, speaker)
    val engine = engine(threads, provider)
    val l = loaded!!
    // The first run sets ONNX Runtime up, so it isn't timed. The best of two
    // timed runs counts, since the phone may be busy with something else.
    generate(engine, "Hello there.", sid, speaker, 1f)
    var elapsed = Long.MAX_VALUE
    var audioMs = 0L
    repeat(BENCHMARK_RUNS) {
      val start = SystemClock.elapsedRealtime()
      val audio = generate(engine, BENCHMARK_TEXT, sid, speaker, 1f)
      elapsed = minOf(elapsed, SystemClock.elapsedRealtime() - start)
      audioMs = audio.samples.size * 1000L / audio.sampleRate.coerceAtLeast(1)
    }
    releaseLater()
    if (audioMs == 0L) throw KokoroException("SYNTHESIS_FAILED", "The voice on this phone couldn't read the test sentence.")
    return mapOf(
      "rtf" to elapsed.toDouble() / audioMs,
      "elapsedMs" to elapsed,
      "audioMs" to audioMs,
      "loadMs" to l.loadMs,
      "threads" to l.threads,
      "provider" to l.provider,
    )
  }

  private fun cacheKey(vararg parts: String): String {
    val digest = MessageDigest.getInstance("SHA-1").digest(parts.joinToString("\u0000").toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }
  }

  private fun clipInfo(file: File, durationMs: Long, elapsedMs: Long) =
    mapOf("uri" to Uri.fromFile(file).toString(), "durationMs" to durationMs, "elapsedMs" to elapsedMs)

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

  // --- Download and install ------------------------------------------------------

  private var lastProgressAt = 0L

  private fun progress(phase: String, done: Long, total: Long, force: Boolean = false) {
    val now = SystemClock.elapsedRealtime()
    if (!force && now - lastProgressAt < PROGRESS_EVERY_MS) return
    lastProgressAt = now
    sendEvent("onProgress", mapOf("phase" to phase, "done" to done.toDouble(), "total" to total.toDouble()))
  }

  private fun checkCancelled() {
    if (cancelled.get()) throw KokoroException("CANCELLED", "The download was stopped.")
  }

  private fun install(url: String, version: Int, sha256: String, bytes: Long, unpackedBytes: Long) {
    rootDir.mkdirs()
    // Partial downloads of other versions are of no use now
    rootDir.listFiles()?.filter { it.name.endsWith(".zip.part") && it.name != "v$version.zip.part" }?.forEach { it.delete() }

    val zip = File(rootDir, "v$version.zip")
    val part = File(rootDir, "v$version.zip.part")
    if (!zip.exists()) {
      val needed = (bytes - part.length()).coerceAtLeast(0) + unpackedBytes + SPACE_MARGIN_BYTES
      if (StatFs(rootDir.path).availableBytes < needed) {
        throw KokoroException("NO_SPACE", "Free up about ${needed / 1_000_000} MB on your phone, then try again.")
      }
      fetch(url, part, bytes)
      progress("verifying", 0, bytes, force = true)
      if (!sha256Of(part).equals(sha256, ignoreCase = true)) {
        part.delete()
        throw KokoroException("CHECKSUM", "The download was damaged. Please try again.")
      }
      if (!part.renameTo(zip)) throw KokoroException("INSTALL_FAILED", "Couldn't save the download.")
    }

    val tmp = File(rootDir, "v$version.tmp")
    unpack(zip, tmp, unpackedBytes)
    if (!File(tmp, "model.onnx").exists() || !File(tmp, "speakers.txt").exists()) {
      tmp.deleteRecursively()
      zip.delete()
      throw KokoroException("INSTALL_FAILED", "The download is missing files. Please try again.")
    }
    // The old model may be in use: let it go before its files are deleted
    worker.submit { release() }.get()
    val dir = File(rootDir, "v$version")
    dir.deleteRecursively()
    if (!tmp.renameTo(dir)) throw KokoroException("INSTALL_FAILED", "Couldn't install the voices.")
    File(dir, ".ready").createNewFile()
    rootDir.listFiles()?.filter { it.name != dir.name }?.forEach { it.deleteRecursively() }
    forgetInstalled()
  }

  /** Downloads to `part`, resuming where an earlier attempt stopped */
  private fun fetch(url: String, part: File, total: Long) {
    var have = part.length()
    if (have > total) {
      part.delete()
      have = 0
    }
    if (have == total && total > 0) return

    val conn = URL(url).openConnection() as HttpURLConnection
    conn.connectTimeout = 15_000
    conn.readTimeout = 30_000
    if (have > 0) conn.setRequestProperty("Range", "bytes=$have-")
    try {
      val code = conn.responseCode
      val append = when (code) {
        HttpURLConnection.HTTP_PARTIAL -> true
        HttpURLConnection.HTTP_OK -> false
        else -> throw KokoroException("DOWNLOAD_FAILED", "The download didn't start (error $code). Please try again.")
      }
      if (!append) have = 0
      conn.inputStream.use { input ->
        FileOutputStream(part, append).use { out ->
          val buf = ByteArray(256 * 1024)
          progress("downloading", have, total, force = true)
          while (true) {
            checkCancelled()
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            have += n
            progress("downloading", have, total)
          }
        }
      }
      progress("downloading", have, total, force = true)
      if (have != total) throw KokoroException("DOWNLOAD_FAILED", "The download stopped early. Please try again.")
    } finally {
      conn.disconnect()
    }
  }

  private fun sha256Of(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buf = ByteArray(256 * 1024)
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        digest.update(buf, 0, n)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun unpack(zip: File, into: File, total: Long) {
    into.deleteRecursively()
    into.mkdirs()
    val base = into.canonicalPath + File.separator
    var done = 0L
    progress("unpacking", 0, total, force = true)
    ZipInputStream(BufferedInputStream(FileInputStream(zip), 1 shl 16)).use { zin ->
      val buf = ByteArray(256 * 1024)
      while (true) {
        val entry = zin.nextEntry ?: break
        val out = File(into, entry.name)
        if (!out.canonicalPath.startsWith(base)) throw KokoroException("INSTALL_FAILED", "The download isn't a voice package.")
        if (entry.isDirectory) {
          out.mkdirs()
          continue
        }
        out.parentFile?.mkdirs()
        FileOutputStream(out).use { o ->
          while (true) {
            checkCancelled()
            val n = zin.read(buf)
            if (n < 0) break
            o.write(buf, 0, n)
            done += n
            progress("unpacking", done, total)
          }
        }
      }
    }
    progress("unpacking", total, total, force = true)
  }

  /** Runs `block` on `executor` and settles the promise with its result */
  private fun runOn(executor: java.util.concurrent.Executor, promise: Promise, fallbackCode: String, fallbackMessage: String, block: () -> Any?) {
    executor.execute {
      try {
        promise.resolve(block())
      } catch (e: CodedException) {
        promise.reject(e)
      } catch (e: Throwable) {
        promise.reject(fallbackCode, e.message ?: fallbackMessage, e)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("KokoroVoice")

    Events("onProgress")

    /** Whether the package is installed, its version and voices */
    Function("getStatus") { status() }

    /** Threads (null: automatic) and ONNX Runtime provider ("cpu", "xnnpack", "nnapi") for speaking from now on */
    Function("setOptions") { threads: Int?, provider: String? ->
      preferredThreads = threads?.coerceIn(1, 8)
      preferredProvider = provider ?: "cpu"
    }

    /** Downloads (resuming a stopped download), checks and unpacks the package; progress comes as onProgress events */
    AsyncFunction("downloadAsync") { url: String, version: Int, sha256: String, bytes: Double, unpackedBytes: Double, promise: Promise ->
      if (downloading) return@AsyncFunction promise.reject("BUSY", "The voices are already downloading.", null)
      downloading = true
      cancelled.set(false)
      downloader.execute {
        try {
          install(url, version, sha256, bytes.toLong(), unpackedBytes.toLong())
          promise.resolve(status())
        } catch (e: CodedException) {
          promise.reject(e)
        } catch (e: IOException) {
          promise.reject("NETWORK", "The download stopped. Check your connection, then try again.", e)
        } catch (e: Throwable) {
          promise.reject("INSTALL_FAILED", e.message ?: "Couldn't install the voices.", e)
        } finally {
          downloading = false
        }
      }
    }

    /** Stops a download; it resumes from there next time */
    Function("cancelDownload") { cancelled.set(true) }

    /** Deletes the package and its cached audio */
    AsyncFunction("removeAsync") { promise: Promise ->
      cancelled.set(true)
      runOn(worker, promise, "REMOVE_FAILED", "Couldn't remove the voices.") {
        release()
        rootDir.deleteRecursively()
        cacheDir.listFiles()?.forEach { it.delete() }
        forgetInstalled()
        status()
      }
    }

    /** Loads the model ahead of the first clip, so playback starts sooner */
    AsyncFunction("warmUpAsync") { promise: Promise ->
      runOn(worker, promise, "LOAD_FAILED", "Natural voices couldn't start on this phone.") {
        engine()
        releaseLater()
        loaded?.loadMs
      }
    }

    /** Reads `text` with a Kokoro voice into a WAV file; resolves { uri, durationMs, elapsedMs } */
    AsyncFunction("synthesizeAsync") { text: String, speaker: String, speed: Double, promise: Promise ->
      runOn(worker, promise, "SYNTHESIS_FAILED", "The voice on this phone couldn't read this.") {
        synthesize(text, speaker, speed.toFloat())
      }
    }

    /** Times a test sentence; resolves { rtf, elapsedMs, audioMs, loadMs, threads, provider } */
    AsyncFunction("benchmarkAsync") { threads: Int?, provider: String?, promise: Promise ->
      runOn(worker, promise, "SYNTHESIS_FAILED", "The speed check didn't finish.") { benchmark(threads, provider) }
    }

    /** Frees the model's memory now (it also goes after a few idle minutes) */
    AsyncFunction("releaseAsync") { promise: Promise ->
      runOn(worker, promise, "RELEASE_FAILED", "Couldn't free the voice's memory.") {
        release()
        null
      }
    }

    OnDestroy {
      cancelled.set(true)
      worker.execute { release() }
      worker.shutdown()
      downloader.shutdown()
    }
  }
}

/** Minimal 16-bit PCM WAV reader and writer */
private object WavFile {
  fun write(file: File, samples: FloatArray, sampleRate: Int) {
    val dataBytes = samples.size * 2
    FileOutputStream(file).use { out ->
      val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
      header.put("RIFF".toByteArray()).putInt(36 + dataBytes).put("WAVE".toByteArray())
      header.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
      header.putInt(sampleRate).putInt(sampleRate * 2).putShort(2).putShort(16)
      header.put("data".toByteArray()).putInt(dataBytes)
      out.write(header.array())
      val block = ByteBuffer.allocate(64 * 1024).order(ByteOrder.LITTLE_ENDIAN)
      for (s in samples) {
        if (!block.hasRemaining()) {
          out.write(block.array(), 0, block.position())
          block.clear()
        }
        block.putShort((s.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
      }
      out.write(block.array(), 0, block.position())
    }
  }

  /** Length of a file this object wrote (44-byte header, 16-bit mono) */
  fun durationMs(file: File): Long = try {
    FileInputStream(file).use { input ->
      val header = ByteArray(44)
      if (input.read(header) != 44) return 0
      val sampleRate = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN).getInt(24)
      if (sampleRate > 0) (file.length() - 44) / 2 * 1000 / sampleRate else 0
    }
  } catch (e: IOException) {
    0
  }
}

package fr.azk.pocket

import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

internal object RemoteFiles {
    private fun allowed(url: URL): Boolean =
        url.protocol == "https" &&
            url.userInfo == null &&
            (url.port == -1 || url.port == 443) &&
            (url.host in
                setOf(
                    "api.github.com",
                    "github.com",
                    "release-assets.githubusercontent.com",
                    "objects.githubusercontent.com",
                    "huggingface.co",
                ) || url.host.endsWith(".hf.co") || url.host.endsWith(".huggingface.co"))

    private fun connect(address: String, range: String?): HttpURLConnection {
        var url = URL(address)
        repeat(6) {
            require(allowed(url)) { "Download URL not allowed" }
            val c =
                (url.openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = false
                    connectTimeout = 15000
                    readTimeout = 30000
                    setRequestProperty("User-Agent", "Mochi")
                    setRequestProperty("Accept", "application/vnd.github+json")
                    if (range != null) {
                        setRequestProperty("Range", range)
                        setRequestProperty("Accept-Encoding", "identity")
                    }
                }
            val code = c.responseCode
            if (code in 300..399) {
                val next = c.getHeaderField("Location")
                c.disconnect()
                require(next != null)
                url = URL(url, next)
            } else {
                if (code !in 200..299) {
                    c.disconnect()
                    throw IllegalStateException("HTTP $code")
                }
                return c
            }
        }
        error("Too many redirects")
    }

    fun open(address: String): HttpURLConnection = connect(address, null)

    fun json(address: String): String {
        val c = open(address)
        return try {
            c.inputStream.use { input ->
                val out = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    require(out.size() + n <= 2_000_000) { "Response too large" }
                    out.write(buffer, 0, n)
                }
                out.toString("UTF-8")
            }
        } finally {
            c.disconnect()
        }
    }

    fun hash(file: File): String {
        val d = MessageDigest.getInstance("SHA-256")
        file.inputStream().use {
            val b = ByteArray(65536)
            while (true) {
                val n = it.read(b)
                if (n < 0) break
                d.update(b, 0, n)
            }
        }
        return d.digest().joinToString("") { "%02x".format(it) }
    }

    /**
     * The GitHub CDN throttles one connection hard: this 75 MB asset measures
     * ~26 KB/s on a single stream but ~419 KB/s across sixteen parallel range
     * requests of the same file. Splitting the download is therefore the
     * difference between a minute and an hour, with no third-party mirror.
     */
    private const val LANES = 16
    private const val MIN_LANE = 512L * 1024L

    fun download(
        url: String,
        destination: File,
        size: Long,
        sha: String,
        cancel: AtomicBoolean,
        progress: (Long) -> Unit,
    ) {
        require(size in 1..500_000_000 && sha.matches(Regex("[0-9a-f]{64}")))
        require(destination.parentFile!!.usableSpace > size + 16_000_000) { "Not enough storage" }
        val partial = File(destination.parentFile, destination.name + ".partial")
        partial.delete()
        try {
            val lanes = if (size >= LANES * MIN_LANE) LANES else 1
            try {
                if (lanes > 1) chunks(url, partial, size, cancel, lanes, progress)
                else single(url, partial, size, cancel, progress)
            } catch (e: RangeUnavailable) {
                partial.delete()
                single(url, partial, size, cancel, progress)
            }
            if (cancel.get()) throw CancellationException()
            require(partial.length() == size && hash(partial) == sha) {
                "Integrity check failed"
            }
            check(partial.renameTo(destination)) { "Unable to save file" }
        } finally {
            partial.delete()
        }
    }

    /** The server ignored our Range header; fall back to one plain stream. */
    private class RangeUnavailable : Exception()

    private fun single(
        url: String,
        target: File,
        size: Long,
        cancel: AtomicBoolean,
        progress: (Long) -> Unit,
    ) {
        val c = open(url)
        try {
            require(c.contentLengthLong < 0 || c.contentLengthLong == size) {
                "Unexpected file size"
            }
            var count = 0L
            c.inputStream.use { input ->
                target.outputStream().use { output ->
                    val b = ByteArray(65536)
                    while (true) {
                        if (cancel.get()) throw CancellationException()
                        val n = input.read(b)
                        if (n < 0) break
                        count += n
                        require(count <= size) { "File too large" }
                        output.write(b, 0, n)
                        progress(count)
                    }
                }
            }
            require(count == size) { "Unexpected file size" }
        } finally {
            c.disconnect()
        }
    }

    private fun chunks(
        url: String,
        target: File,
        size: Long,
        cancel: AtomicBoolean,
        lanes: Int,
        progress: (Long) -> Unit,
    ) {
        target.delete()
        RandomAccessFile(target, "rw").use { it.setLength(size) }
        val step = size / lanes
        val total = AtomicLong(0)
        val failure = AtomicReference<Exception?>(null)
        val threads =
            (0 until lanes).map { lane ->
                val start = lane.toLong() * step
                val end = if (lane == lanes - 1) size - 1 else (lane + 1).toLong() * step - 1
                Thread {
                    try {
                        val c = connect(url, "bytes=$start-$end")
                        if (c.responseCode != HttpURLConnection.HTTP_PARTIAL) {
                            c.disconnect()
                            throw RangeUnavailable()
                        }
                        c.inputStream.use { input ->
                            RandomAccessFile(target, "rw").use { file ->
                                file.seek(start)
                                val b = ByteArray(65536)
                                var at = start
                                while (at <= end) {
                                    if (cancel.get()) throw CancellationException()
                                    val want = minOf(b.size.toLong(), end - at + 1).toInt()
                                    val n = input.read(b, 0, want)
                                    if (n < 0) throw RangeUnavailable()
                                    file.write(b, 0, n)
                                    at += n
                                    progress(total.addAndGet(n.toLong()))
                                }
                            }
                        }
                        c.disconnect()
                    } catch (e: Exception) {
                        failure.compareAndSet(null, e)
                    }
                }.apply {
                    isDaemon = true
                    start()
                }
            }
        threads.forEach { it.join() }
        failure.get()?.let { throw it }
        if (cancel.get()) throw CancellationException()
        progress(size)
    }
}

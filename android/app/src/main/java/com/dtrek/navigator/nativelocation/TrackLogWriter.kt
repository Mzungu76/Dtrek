package com.dtrek.navigator.nativelocation

import android.content.Context
import java.io.File
import java.io.FileWriter
import org.json.JSONObject

/**
 * Appends every accepted fix to a JSONL file on disk, one session at a time.
 *
 * Why this exists (spec §13, §15.8): the whole point of the foreground
 * service is that tracking must survive the screen turning off and the
 * WebView/JS layer being suspended or killed by the OS. If fixes only lived
 * in memory inside the plugin bridge, a WebView kill would silently drop
 * whatever happened while it was gone. Writing every fix to disk as it
 * arrives means the recorded track survives even a process restart; the JS
 * layer can always ask "what happened since I was last listening"
 * (NativeLocationPlugin#getPendingFixes) instead of trusting that it caught
 * every event live.
 *
 * Deliberately not a database: one FileWriter appending JSON-per-line is
 * enough for a single active tracking session and avoids pulling in Room/
 * SQLite for what is, at most, a few thousand small rows per hike.
 */
class TrackLogWriter(context: Context, sessionId: String) {
    private val file: File = File(context.filesDir, "nav_track_$sessionId.jsonl")
    private var writer: FileWriter? = null

    @Synchronized
    fun append(fix: LocationFix) {
        if (writer == null) writer = FileWriter(file, true)
        writer?.apply {
            write(fix.toJson().toString())
            write("\n")
            flush()
        }
    }

    @Synchronized
    fun close() {
        writer?.close()
        writer = null
    }

    /** Fixes with ts strictly greater than [sinceTs] — used by the JS layer to catch up after a resume. */
    fun readSince(sinceTs: Long): List<LocationFix> {
        if (!file.exists()) return emptyList()
        return file.readLines()
            .mapNotNull { line -> runCatching { LocationFix.fromJson(JSONObject(line)) }.getOrNull() }
            .filter { it.ts > sinceTs }
    }

    fun delete() {
        close()
        file.delete()
    }
}

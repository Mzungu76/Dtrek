package com.dtrek.navigator.nativelocation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.dtrek.navigator.MainActivity
import com.dtrek.navigator.R
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Foreground Service (type "location") wrapping the Fused Location
 * Provider. This is the piece of §1/§13 of the spec that the old
 * `navigator.geolocation.watchPosition()`-based tracker structurally could
 * not provide: as a foreground service it keeps running with the screen
 * off, the app backgrounded, and the WebView paused/killed by the OS — the
 * three conditions that stopped GPS acquisition before.
 *
 * The service does not know about routes, trails, or navigation state. Its
 * only job is: acquire fixes at the cadence implied by the current
 * [LocationMode], persist every one to disk immediately (so the track
 * survives even if nobody is listening), and hand them to whichever
 * NativeLocationPlugin instance is currently attached — or buffer them if
 * none is (JS side torn down / not yet resumed).
 */
class LocationForegroundService : Service() {

    interface FixListener {
        fun onFix(fix: LocationFix)
        fun onError(message: String)
    }

    companion object {
        const val ACTION_START = "com.dtrek.navigator.nativelocation.action.START"
        const val ACTION_STOP = "com.dtrek.navigator.nativelocation.action.STOP"
        const val ACTION_SET_MODE = "com.dtrek.navigator.nativelocation.action.SET_MODE"
        const val EXTRA_MODE = "mode"
        const val EXTRA_SESSION_ID = "sessionId"

        private const val NOTIFICATION_CHANNEL_ID = "dtrek_navigation"
        private const val NOTIFICATION_ID = 4471

        // Fixes queued here when no plugin/listener is attached (WebView torn
        // down mid-hike); drained via NativeLocationPlugin#getPendingFixes.
        // Capped so a very long unattended stretch can't grow this unbounded —
        // the on-disk TrackLogWriter is the durable record; this is only a
        // short-term relay buffer.
        private const val PENDING_BUFFER_CAP = 500
        val pendingFixes = ConcurrentLinkedQueue<LocationFix>()

        @Volatile var listener: FixListener? = null
        @Volatile var lastFix: LocationFix? = null
        @Volatile var isRunning: Boolean = false
            private set
        @Volatile var currentMode: LocationMode = LocationMode.TREKKING
            private set
        @Volatile var currentSessionId: String? = null
            private set
    }

    private lateinit var fusedClient: FusedLocationProviderClient
    private var trackLog: TrackLogWriter? = null
    private var locationCallback: LocationCallback? = null

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        createNotificationChannel()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val mode = LocationMode.fromWire(intent.getStringExtra(EXTRA_MODE))
                val sessionId = intent.getStringExtra(EXTRA_SESSION_ID) ?: UUID.randomUUID().toString()
                startTracking(mode, sessionId)
            }
            ACTION_SET_MODE -> {
                val mode = LocationMode.fromWire(intent.getStringExtra(EXTRA_MODE))
                if (isRunning) applyMode(mode)
            }
            ACTION_STOP -> stopTracking()
        }
        // START_STICKY: if the OS kills the process under memory pressure while a
        // hike is actively being tracked, the service (and its notification) come
        // back — losing the record of a real hike mid-trail is worse than the cost
        // of an occasional unwanted restart. stopTracking() calls stopSelf()
        // explicitly, so a deliberate stop is never turned back on.
        return START_STICKY
    }

    private fun startTracking(mode: LocationMode, sessionId: String) {
        currentMode = mode
        currentSessionId = sessionId
        trackLog?.close()
        trackLog = TrackLogWriter(applicationContext, sessionId)

        val notification = buildNotification(mode)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        registerLocationUpdates(mode)
        isRunning = true
    }

    private fun applyMode(mode: LocationMode) {
        currentMode = mode
        registerLocationUpdates(mode)
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID, buildNotification(mode))
    }

    private fun registerLocationUpdates(mode: LocationMode) {
        locationCallback?.let { fusedClient.removeLocationUpdates(it) }

        val spec = mode.toRequestSpec()
        val request = LocationRequest.Builder(spec.intervalMs)
            .setMinUpdateIntervalMillis(spec.minUpdateIntervalMs)
            .setPriority(spec.priority)
            .setWaitForAccurateLocation(false)
            .build()

        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { handleLocation(it) }
            }
        }
        locationCallback = callback

        try {
            fusedClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            listener?.onError("Location permission missing: ${e.message}")
        }
    }

    private fun handleLocation(location: Location) {
        val fix = LocationFix.fromLocation(location)
        lastFix = fix
        trackLog?.append(fix)

        val current = listener
        if (current != null) {
            current.onFix(fix)
        } else {
            pendingFixes.add(fix)
            while (pendingFixes.size > PENDING_BUFFER_CAP) pendingFixes.poll()
        }
    }

    private fun stopTracking() {
        locationCallback?.let { fusedClient.removeLocationUpdates(it) }
        locationCallback = null
        trackLog?.close()
        trackLog = null
        isRunning = false
        currentSessionId = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION") stopForeground(true)
        }
        stopSelf()
    }

    override fun onDestroy() {
        locationCallback?.let { fusedClient.removeLocationUpdates(it) }
        trackLog?.close()
        isRunning = false
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            getString(R.string.nav_notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.nav_notification_channel_description)
            setShowBadge(false)
        }
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }

    /**
     * Persistent notification required by Android for any foreground
     * service, and the honest signal to the user that GPS tracking is
     * active in the background (spec §15 asks us never to hide what's
     * really happening) — tapping it returns to the live navigation screen.
     */
    private fun buildNotification(mode: LocationMode): Notification {
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT
        val contentIntent = PendingIntent.getActivity(this, 0, tapIntent, pendingIntentFlags)

        val modeLabel = when (mode) {
            LocationMode.BATTERY_SAVE -> getString(R.string.nav_mode_battery_save)
            LocationMode.TREKKING -> getString(R.string.nav_mode_trekking)
            LocationMode.NAVIGATION -> getString(R.string.nav_mode_navigation)
            LocationMode.EMERGENCY -> getString(R.string.nav_mode_emergency)
        }

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle(getString(R.string.nav_notification_title))
            .setContentText(modeLabel)
            .setSmallIcon(R.drawable.ic_notification_navigation)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(contentIntent)
            .build()
    }
}

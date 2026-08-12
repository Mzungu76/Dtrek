package com.dtrek.navigator.nativelocation

import android.location.Location
import com.getcapacitor.JSObject
import org.json.JSONObject

/**
 * The native fix shape, matching what the spec asks for (§1): latitude,
 * longitude, altitude, accuracy, speed, bearing, timestamp — plus whatever
 * extra GNSS quality signal is cheaply available from the platform
 * `Location` object, so the JS Position Engine can use it for quality
 * gating without a second round trip to the OS.
 */
data class LocationFix(
    val lat: Double,
    val lon: Double,
    val altitudeM: Double?,
    val accuracyM: Float?,
    val verticalAccuracyM: Float?,
    val speedMs: Float?,
    val speedAccuracyMs: Float?,
    val bearingDeg: Float?,
    val bearingAccuracyDeg: Float?,
    val ts: Long,
    val elapsedRealtimeNanos: Long,
    val provider: String?,
    val mock: Boolean,
) {
    fun toJs(): JSObject = JSObject().apply {
        put("latitude", lat)
        put("longitude", lon)
        if (altitudeM != null) put("altitude", altitudeM)
        if (accuracyM != null) put("accuracy", accuracyM.toDouble())
        if (verticalAccuracyM != null) put("verticalAccuracy", verticalAccuracyM.toDouble())
        if (speedMs != null) put("speed", speedMs.toDouble())
        if (speedAccuracyMs != null) put("speedAccuracy", speedAccuracyMs.toDouble())
        if (bearingDeg != null) put("bearing", bearingDeg.toDouble())
        if (bearingAccuracyDeg != null) put("bearingAccuracy", bearingAccuracyDeg.toDouble())
        put("timestamp", ts)
        put("provider", provider ?: "fused")
        put("mock", mock)
    }

    fun toJson(): JSONObject = JSONObject().apply {
        put("lat", lat)
        put("lon", lon)
        put("altitudeM", altitudeM)
        put("accuracyM", accuracyM)
        put("verticalAccuracyM", verticalAccuracyM)
        put("speedMs", speedMs)
        put("speedAccuracyMs", speedAccuracyMs)
        put("bearingDeg", bearingDeg)
        put("bearingAccuracyDeg", bearingAccuracyDeg)
        put("ts", ts)
        put("elapsedRealtimeNanos", elapsedRealtimeNanos)
        put("provider", provider)
        put("mock", mock)
    }

    companion object {
        fun fromLocation(location: Location): LocationFix = LocationFix(
            lat = location.latitude,
            lon = location.longitude,
            altitudeM = if (location.hasAltitude()) location.altitude else null,
            accuracyM = if (location.hasAccuracy()) location.accuracy else null,
            verticalAccuracyM = if (hasVerticalAccuracy(location)) location.verticalAccuracyMeters else null,
            speedMs = if (location.hasSpeed()) location.speed else null,
            speedAccuracyMs = if (hasSpeedAccuracy(location)) location.speedAccuracyMetersPerSecond else null,
            bearingDeg = if (location.hasBearing()) location.bearing else null,
            bearingAccuracyDeg = if (hasBearingAccuracy(location)) location.bearingAccuracyDegrees else null,
            ts = location.time,
            elapsedRealtimeNanos = location.elapsedRealtimeNanos,
            provider = location.provider,
            mock = isMockLocation(location),
        )

        fun fromJson(json: JSONObject): LocationFix = LocationFix(
            lat = json.getDouble("lat"),
            lon = json.getDouble("lon"),
            altitudeM = json.optDouble("altitudeM").takeIf { !it.isNaN() },
            accuracyM = json.optDouble("accuracyM").takeIf { !it.isNaN() }?.toFloat(),
            verticalAccuracyM = json.optDouble("verticalAccuracyM").takeIf { !it.isNaN() }?.toFloat(),
            speedMs = json.optDouble("speedMs").takeIf { !it.isNaN() }?.toFloat(),
            speedAccuracyMs = json.optDouble("speedAccuracyMs").takeIf { !it.isNaN() }?.toFloat(),
            bearingDeg = json.optDouble("bearingDeg").takeIf { !it.isNaN() }?.toFloat(),
            bearingAccuracyDeg = json.optDouble("bearingAccuracyDeg").takeIf { !it.isNaN() }?.toFloat(),
            ts = json.getLong("ts"),
            elapsedRealtimeNanos = json.optLong("elapsedRealtimeNanos"),
            provider = json.optString("provider", null),
            mock = json.optBoolean("mock", false),
        )

        // API 26+ (minSdk here is 24) guards below are required since these Location fields didn't exist pre-26.
        private fun hasVerticalAccuracy(l: Location) =
            android.os.Build.VERSION.SDK_INT >= 26 && l.hasVerticalAccuracy()
        private fun hasSpeedAccuracy(l: Location) =
            android.os.Build.VERSION.SDK_INT >= 26 && l.hasSpeedAccuracy()
        private fun hasBearingAccuracy(l: Location) =
            android.os.Build.VERSION.SDK_INT >= 26 && l.hasBearingAccuracy()

        /** Flags GPS spoofed/mocked fixes (dev tools, spoofing apps) — surfaced to the Position Engine's quality gate, never silently trusted. */
        private fun isMockLocation(l: Location): Boolean =
            if (android.os.Build.VERSION.SDK_INT >= 31) l.isMock else @Suppress("DEPRECATION") l.isFromMockProvider
    }
}

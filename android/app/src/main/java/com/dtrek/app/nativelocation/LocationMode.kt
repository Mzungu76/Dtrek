package com.dtrek.app.nativelocation

import com.google.android.gms.location.Priority

/**
 * Battery-aware tracking profiles (spec §12). The Position/Navigation
 * engines on the JS side pick a mode based on speed, GPS quality, proximity
 * to a junction/deviation, battery level and trail criticality; the native
 * service only knows how to translate a mode into a concrete fix cadence and
 * FusedLocationProviderClient priority — no policy lives here.
 */
enum class LocationMode(val wireValue: String) {
    BATTERY_SAVE("battery_save"),
    TREKKING("trekking"),
    NAVIGATION("navigation"),
    EMERGENCY("emergency");

    companion object {
        fun fromWire(value: String?): LocationMode =
            values().firstOrNull { it.wireValue == value } ?: TREKKING
    }
}

data class LocationRequestSpec(
    val intervalMs: Long,
    val minUpdateIntervalMs: Long,
    val priority: Int,
)

/**
 * Interval/priority per mode. NAVIGATION and EMERGENCY favor reliability
 * over battery per spec §12 ("Durante Navigation/Emergency privilegiare
 * affidabilità rispetto al consumo").
 */
fun LocationMode.toRequestSpec(): LocationRequestSpec = when (this) {
    LocationMode.BATTERY_SAVE -> LocationRequestSpec(
        intervalMs = 10_000,
        minUpdateIntervalMs = 5_000,
        priority = Priority.PRIORITY_BALANCED_POWER_ACCURACY,
    )
    LocationMode.TREKKING -> LocationRequestSpec(
        intervalMs = 4_000,
        minUpdateIntervalMs = 2_000,
        priority = Priority.PRIORITY_HIGH_ACCURACY,
    )
    LocationMode.NAVIGATION -> LocationRequestSpec(
        intervalMs = 1_500,
        minUpdateIntervalMs = 1_000,
        priority = Priority.PRIORITY_HIGH_ACCURACY,
    )
    LocationMode.EMERGENCY -> LocationRequestSpec(
        intervalMs = 1_000,
        minUpdateIntervalMs = 500,
        priority = Priority.PRIORITY_HIGH_ACCURACY,
    )
}

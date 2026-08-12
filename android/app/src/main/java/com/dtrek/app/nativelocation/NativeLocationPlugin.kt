package com.dtrek.app.nativelocation

import android.Manifest
import android.content.Intent
import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * JS-facing bridge for the native location engine (spec §1). Deliberately
 * thin: all it does is (a) manage the two-step Android permission dance for
 * fine + background location, (b) start/stop/reconfigure the
 * LocationForegroundService, and (c) relay fixes to JS as `fix` events plus
 * expose a catch-up path (`getPendingFixes`) for when the WebView was torn
 * down. No smoothing, no route logic, no decisions about trust — that's the
 * Position/Navigation Engine's job on the JS side (kept there deliberately,
 * so it stays pure TS and testable/mockable independent of Android).
 */
@CapacitorPlugin(
    name = "NativeLocation",
    permissions = [
        Permission(
            alias = "location",
            strings = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION],
        ),
        Permission(
            alias = "backgroundLocation",
            strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION],
        ),
        Permission(
            alias = "notifications",
            strings = [Manifest.permission.POST_NOTIFICATIONS],
        ),
    ],
)
class NativeLocationPlugin : Plugin(), LocationForegroundService.FixListener {

    override fun load() {
        super.load()
        // Late attach: if the service was already running (e.g. the JS layer
        // reloaded while a hike was in progress), start receiving fixes again
        // immediately instead of waiting for the next start() call.
        if (LocationForegroundService.isRunning) LocationForegroundService.listener = this
    }

    override fun onFix(fix: LocationFix) {
        notifyListeners("fix", fix.toJs())
    }

    override fun onError(message: String) {
        val err = JSObject().put("message", message)
        notifyListeners("error", err)
    }

    @PluginMethod
    fun checkPermissions(call: PluginCall) {
        super.checkPermissions(call)
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        // Requesting fine+background together is rejected outright on API 30+
        // (the OS forces a separate follow-up request for "Allow all the
        // time"), so this only ever asks for foreground `location` up front;
        // the caller must invoke requestBackgroundLocationPermission()
        // afterwards, from its own explicit UI step, once it has explained to
        // the user why continuous background tracking is needed.
        requestPermissionForAlias("location", call, "locationPermsCallback")
    }

    @PermissionCallback
    private fun locationPermsCallback(call: PluginCall) {
        checkPermissions(call)
    }

    @PluginMethod
    fun requestBackgroundLocationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Pre-Android 10: foreground location permission already implies background access.
            checkPermissions(call)
            return
        }
        requestPermissionForAlias("backgroundLocation", call, "backgroundLocationPermsCallback")
    }

    @PermissionCallback
    private fun backgroundLocationPermsCallback(call: PluginCall) {
        checkPermissions(call)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (getPermissionState("location") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Location permission not granted — call requestPermissions() first")
            return
        }

        LocationForegroundService.listener = this
        val mode = LocationMode.fromWire(call.getString("mode", "trekking"))
        val sessionId = call.getString("sessionId")

        val intent = Intent(context, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_START
            putExtra(LocationForegroundService.EXTRA_MODE, mode.wireValue)
            if (sessionId != null) putExtra(LocationForegroundService.EXTRA_SESSION_ID, sessionId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }

        val result = JSObject().put("sessionId", LocationForegroundService.currentSessionId ?: sessionId)
        call.resolve(result)
    }

    @PluginMethod
    fun setMode(call: PluginCall) {
        val mode = call.getString("mode")
        if (mode == null) {
            call.reject("mode is required")
            return
        }
        val intent = Intent(context, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_SET_MODE
            putExtra(LocationForegroundService.EXTRA_MODE, mode)
        }
        context.startService(intent)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val intent = Intent(context, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_STOP
        }
        context.startService(intent)
        if (LocationForegroundService.listener === this) LocationForegroundService.listener = null
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val result = JSObject()
            .put("isRunning", LocationForegroundService.isRunning)
            .put("mode", LocationForegroundService.currentMode.wireValue)
            .put("sessionId", LocationForegroundService.currentSessionId)
        call.resolve(result)
    }

    @PluginMethod
    fun getLastFix(call: PluginCall) {
        val fix = LocationForegroundService.lastFix
        call.resolve(JSObject().put("fix", fix?.toJs()))
    }

    /**
     * Drains fixes buffered while no JS listener was attached (WebView
     * suspended/killed mid-hike) — the resume/catch-up path required by
     * spec §13 ("Alla riapertura dell'interfaccia deve sincronizzarsi con
     * lo stato corrente del Navigation Engine").
     */
    @PluginMethod
    fun getPendingFixes(call: PluginCall) {
        val fixes = JSArray()
        var fix = LocationForegroundService.pendingFixes.poll()
        while (fix != null) {
            fixes.put(fix.toJs())
            fix = LocationForegroundService.pendingFixes.poll()
        }
        call.resolve(JSObject().put("fixes", fixes))
    }

    override fun handleOnDestroy() {
        if (LocationForegroundService.listener === this) LocationForegroundService.listener = null
        super.handleOnDestroy()
    }
}

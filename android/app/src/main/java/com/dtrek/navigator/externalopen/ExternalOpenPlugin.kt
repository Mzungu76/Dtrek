package com.dtrek.navigator.externalopen

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Opens a URL via a plain `Intent.ACTION_VIEW`, not `@capacitor/browser`'s Custom Tabs
 * (lib/native/mainAppLinks.ts openMainApp()). Deliberate: a Custom Tab stays bound to the
 * calling app's own UI chrome and never goes through Android's normal app-link resolution, so it
 * can never hand off to Dtrek's installed PWA (WebAPK) even when one is present on the device — a
 * plain ACTION_VIEW intent goes through the same resolution any other app's outbound link does,
 * which is what actually lets Android offer/default to the installed PWA instead of a browser tab.
 *
 * Local plugin (not an npm package) — same reason as NativeLocationPlugin: this is one Android
 * intent call, not worth its own published plugin.
 */
@CapacitorPlugin(name = "ExternalOpen")
class ExternalOpenPlugin : Plugin() {

    @PluginMethod
    fun open(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) {
            call.reject("Missing 'url'")
            return
        }
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            activity.startActivity(intent)
            call.resolve(JSObject().put("opened", true))
        } catch (e: ActivityNotFoundException) {
            call.reject("No app can handle this URL", e)
        }
    }
}

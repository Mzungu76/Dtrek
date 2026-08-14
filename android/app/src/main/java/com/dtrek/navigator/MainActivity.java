package com.dtrek.navigator;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.Toast;
import com.dtrek.navigator.nativelocation.NativeLocationPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private View offlineGate;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (non-npm) plugin — must be registered before super.onCreate()
        // so the bridge picks it up during its own init.
        registerPlugin(NativeLocationPlugin.class);
        super.onCreate(savedInstanceState);

        // super.onCreate() already started the WebView loading capacitor.config.ts's
        // server.url — on a device with genuinely no connectivity that load will just hang or
        // error, and (see that file's own comment on why there's no bundled webDir) there is
        // nothing local to fall back to on the very first launch, before anything has ever been
        // cached. showOfflineGate() only covers that one case; a slow-but-present connection
        // still goes through the WebView's own load exactly as before.
        if (!hasValidatedInternet()) showOfflineGate();
    }

    private boolean hasValidatedInternet() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true; // fail open — never block startup over a lookup we can't perform
        Network network = cm.getActiveNetwork();
        NetworkCapabilities caps = network != null ? cm.getNetworkCapabilities(network) : null;
        return caps != null
            && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    /**
     * A plain native View added ON TOP of the WebView via addContentView — not a replacement
     * screen, and deliberately not touching the Bridge's own WebViewClient or the JS bridge
     * several native features (NativeLocationPlugin, geolocation) depend on. The WebView keeps
     * loading underneath; the moment connectivity is confirmed (manual retry tap or the
     * NetworkCallback below firing automatically) this is torn down and the WebView is reloaded.
     */
    private void showOfflineGate() {
        offlineGate = getLayoutInflater().inflate(R.layout.activity_offline_gate, null);
        addContentView(offlineGate, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        Button retry = offlineGate.findViewById(R.id.offline_gate_retry);
        retry.setOnClickListener(v -> {
            if (hasValidatedInternet()) {
                dismissOfflineGate();
            } else {
                Toast.makeText(this, R.string.offline_gate_still_offline, Toast.LENGTH_SHORT).show();
            }
        });

        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            networkCallback = new ConnectivityManager.NetworkCallback() {
                // onAvailable fires once a network satisfies the request below, but validation
                // (actually reaching the internet, not just an interface being up) can complete
                // slightly later — reported via onCapabilitiesChanged, not a second onAvailable.
                // Checking both is what actually catches "just got validated internet" reliably.
                @Override
                public void onAvailable(Network network) {
                    runOnUiThread(() -> { if (hasValidatedInternet()) dismissOfflineGate(); });
                }

                @Override
                public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                    if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                        runOnUiThread(MainActivity.this::dismissOfflineGate);
                    }
                }
            };
            // NET_CAPABILITY_VALIDATED deliberately NOT requested here — it describes a
            // network's current state, not something a NetworkRequest is allowed to filter on;
            // ConnectivityManager throws IllegalArgumentException if you try. Request the
            // (requestable) INTERNET capability and check VALIDATED from the callbacks above.
            NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
            cm.registerNetworkCallback(request, networkCallback);
        }
    }

    private void dismissOfflineGate() {
        if (offlineGate == null) return;
        ((ViewGroup) offlineGate.getParent()).removeView(offlineGate);
        offlineGate = null;
        unregisterNetworkCallback();
        getBridge().reload();
    }

    private void unregisterNetworkCallback() {
        if (networkCallback == null) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            try { cm.unregisterNetworkCallback(networkCallback); } catch (IllegalArgumentException ignored) {}
        }
        networkCallback = null;
    }

    @Override
    protected void onDestroy() {
        unregisterNetworkCallback();
        super.onDestroy();
    }
}

package com.dtrek.navigator;

import android.os.Bundle;
import com.dtrek.navigator.nativelocation.NativeLocationPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (non-npm) plugin — must be registered before super.onCreate()
        // so the bridge picks it up during its own init.
        registerPlugin(NativeLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

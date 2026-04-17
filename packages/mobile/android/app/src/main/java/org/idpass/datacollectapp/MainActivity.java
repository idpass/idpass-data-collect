package org.idpass.datacollectapp;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import org.idpass.datacollectapp.BuildConfig;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricCapturePlugin.class);
        super.onCreate(savedInstanceState);
        // Prevent screenshots, screen recording, and the task-switcher snapshot
        // from capturing app content. Only in release builds so QA can use
        // screen mirroring tools (e.g., Vysor) during testing.
        if (!BuildConfig.DEBUG) {
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );
        }
    }
}

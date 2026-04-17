package org.idpass.datacollectapp;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricCapturePlugin.class);
        super.onCreate(savedInstanceState);
        // Prevent screenshots, screen recording, and the task-switcher snapshot
        // from capturing app content. Only in release builds so QA can use
        // screen mirroring tools (e.g., Vysor) during testing.
        boolean isDebug = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!isDebug) {
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );
        }
    }
}

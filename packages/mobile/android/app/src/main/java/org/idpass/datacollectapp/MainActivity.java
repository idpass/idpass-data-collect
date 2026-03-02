package org.idpass.datacollectapp;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BiometricCapturePlugin.class);
        super.onCreate(savedInstanceState);
        // Prevent screenshots, screen recording, and the task-switcher snapshot
        // from capturing app content. This is the Android-level complement to
        // the CSS blur applied in JS (which fires too late for the OS snapshot).
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }
}

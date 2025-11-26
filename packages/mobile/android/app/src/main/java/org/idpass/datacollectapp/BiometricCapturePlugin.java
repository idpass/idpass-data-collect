package org.idpass.datacollectapp;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.util.Log;
import java.nio.charset.StandardCharsets;
import java.util.List;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Iterator;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "BiometricCapture")
public class BiometricCapturePlugin extends Plugin {

    private static final String TAG = "BiometricCapturePlugin";

    @PluginMethod
    public void launchCapture(PluginCall call) {
        String action = call.getString("action");
        if (action == null || action.isEmpty()) {
            call.reject("Action is required");
            return;
        }

        Intent intent = new Intent(action);
        intent.addCategory(Intent.CATEGORY_DEFAULT);

        JSObject extras = call.getObject("extras");
        String requestPayload = null;
        if (extras != null) {
            Iterator<String> keys = extras.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                try {
                    Object value = extras.get(key);
                    if (value instanceof String) {
                        intent.putExtra(key, (String) value);
                    } else if (value instanceof Integer) {
                        intent.putExtra(key, (Integer) value);
                    } else if (value instanceof Boolean) {
                        intent.putExtra(key, (Boolean) value);
                    } else if (value instanceof Double) {
                        intent.putExtra(key, (Double) value);
                    }
                    if ("request".equals(key) && value instanceof String) {
                        requestPayload = (String) value;
                    }
                } catch (JSONException e) {
                    Log.e(TAG, "Error processing extra: " + key, e);
                }
            }
        }

        if (requestPayload != null) {
            intent.putExtra("input", requestPayload.getBytes(StandardCharsets.UTF_8));
        }

        // Verify that the intent can be resolved before attempting to start activity
        PackageManager packageManager = getActivity().getPackageManager();
        List<ResolveInfo> activities = packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);

        if (activities == null || activities.isEmpty()) {
            Log.e(TAG, "No activity found to handle intent action: " + action);
            call.reject("No application found to handle biometric capture. Please ensure the Biometric Capture App (BCA) is installed.");
            return;
        }

        Log.d(TAG, "Found " + activities.size() + " activity(ies) to handle action: " + action);

        try {
            startActivityForResult(call, intent, "handleCaptureResult");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start activity for action: " + action, e);
            call.reject("Failed to launch biometric capture: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void handleCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            Log.w(TAG, "handleCaptureResult called with null PluginCall");
            return;
        }

        int resultCode = result.getResultCode();
        Log.d(TAG, "Capture result received with code: " + resultCode);

        if (resultCode == android.app.Activity.RESULT_OK) {
            Intent data = result.getData();
            JSObject ret = new JSObject();

            if (data != null && data.getExtras() != null) {
                Bundle bundle = data.getExtras();
                Log.d(TAG, "Processing " + bundle.size() + " extras from result");

                for (String key : bundle.keySet()) {
                    Object value = bundle.get(key);
                    if (value == null) {
                        continue;
                    }

                    if (value instanceof String || value instanceof Integer || value instanceof Boolean || value instanceof Double) {
                        ret.put(key, value);
                    } else if (value instanceof byte[]) {
                        // Handle byte array responses (e.g., raw JSON from BCA)
                        String decoded = new String((byte[]) value, StandardCharsets.UTF_8);
                        ret.put(key, decoded);
                        Log.d(TAG, "Decoded byte[] extra for key: " + key);
                    } else if (value instanceof android.net.Uri) {
                        // Handle Uri responses (e.g., FileProvider URI from BCA capture)
                        android.net.Uri uri = (android.net.Uri) value;
                        ret.put(key, uri.toString());
                        Log.d(TAG, "Stored Uri extra for key: " + key + " -> " + uri.toString());

                        // Attempt to read content from the URI if it's a content URI
                        if ("content".equals(uri.getScheme())) {
                            try {
                                java.io.InputStream inputStream = getActivity().getContentResolver().openInputStream(uri);
                                if (inputStream != null) {
                                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                                    byte[] buffer = new byte[4096];
                                    int bytesRead;
                                    while ((bytesRead = inputStream.read(buffer)) != -1) {
                                        baos.write(buffer, 0, bytesRead);
                                    }
                                    inputStream.close();
                                    String content = baos.toString(StandardCharsets.UTF_8.name());
                                    ret.put(key + "Data", content);
                                    Log.d(TAG, "Read content from URI for key: " + key);
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "Failed to read content from URI: " + uri, e);
                            }
                        }
                    } else {
                        ret.put(key, value.toString());
                        Log.d(TAG, "Converted " + value.getClass().getSimpleName() + " to string for key: " + key);
                    }
                }
            } else {
                Log.w(TAG, "Result OK but no extras in intent data");
            }

            call.resolve(new JSObject().put("result", ret));
        } else if (resultCode == android.app.Activity.RESULT_CANCELED) {
            // Check if there's error information in the result
            Intent data = result.getData();
            String errorMessage = "Capture was canceled";

            if (data != null && data.getExtras() != null) {
                Bundle bundle = data.getExtras();
                // Try to extract error response from BCA
                byte[] response = bundle.getByteArray("response");
                if (response != null) {
                    errorMessage = new String(response, StandardCharsets.UTF_8);
                    Log.d(TAG, "Error response from BCA: " + errorMessage);
                }
            }

            call.reject(errorMessage);
        } else {
            call.reject("Activity failed with unexpected result code: " + resultCode);
        }
    }
}

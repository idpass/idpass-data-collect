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
        // Enforce explicit package to prevent malicious apps from intercepting biometric capture requests
        intent.setPackage("io.idpass.bca");

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

                // First pass: process all extras normally
                for (String key : bundle.keySet()) {
                    Object value = bundle.get(key);
                    if (value == null) {
                        continue;
                    }

                    try {
                        if (value instanceof String) {
                            ret.put(key, (String) value);
                            Log.d(TAG, "Added String extra: " + key);
                        } else if (value instanceof Integer) {
                            ret.put(key, (Integer) value);
                        } else if (value instanceof Boolean) {
                            ret.put(key, (Boolean) value);
                        } else if (value instanceof Double) {
                            ret.put(key, (Double) value);
                        } else if (value instanceof byte[]) {
                            String decoded = new String((byte[]) value, StandardCharsets.UTF_8);
                            ret.put(key, decoded);
                            Log.d(TAG, "Decoded byte[] extra for key: " + key);
                        } else if (value instanceof android.net.Uri) {
                            android.net.Uri uri = (android.net.Uri) value;
                            ret.put(key, uri.toString());
                            Log.d(TAG, "Stored Uri extra for key: " + key + " -> " + uri.toString());

                            // Read content from URI
                            String content = readContentFromUri(uri);
                            if (content != null) {
                                ret.put(key + "Data", content);
                                Log.d(TAG, "Read content from URI for key: " + key + ", length: " + content.length());
                            }
                        } else {
                            ret.put(key, value.toString());
                            Log.d(TAG, "Converted " + value.getClass().getSimpleName() + " to string for key: " + key);
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Error processing extra: " + key, e);
                    }
                }

                // Second pass: handle BCA-specific URI references stored as strings
                // BCA may send "response_uri" or "fingerprint_images_uri" as string URIs
                handleBcaUriReferences(bundle, ret);

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
                // Use safe extraction to avoid ClassCastException with LazyValue
                errorMessage = extractErrorFromBundle(bundle, errorMessage);
            }

            call.reject(errorMessage);
        } else {
            call.reject("Activity failed with unexpected result code: " + resultCode);
        }
    }

    /**
     * Safely extract error information from a Bundle.
     * Handles various data types including byte[], String, Uri, and LazyValue.
     * 
     * @param bundle The bundle to extract from
     * @param defaultMessage Default message if extraction fails
     * @return Extracted error message or default
     */
    private String extractErrorFromBundle(Bundle bundle, String defaultMessage) {
        String errorMessage = defaultMessage;

        // Try multiple keys that BCA might use for error responses
        String[] errorKeys = {"response", "error", "errorMessage", "message"};

        for (String key : errorKeys) {
            if (!bundle.containsKey(key)) {
                continue;
            }

            try {
                Object value = bundle.get(key);
                if (value == null) {
                    continue;
                }

                if (value instanceof byte[]) {
                    String decoded = new String((byte[]) value, StandardCharsets.UTF_8);
                    if (!decoded.isEmpty()) {
                        errorMessage = parseErrorJson(decoded);
                        Log.d(TAG, "Extracted error from byte[] key '" + key + "': " + errorMessage);
                        break;
                    }
                } else if (value instanceof String) {
                    String strValue = (String) value;
                    if (!strValue.isEmpty()) {
                        errorMessage = parseErrorJson(strValue);
                        Log.d(TAG, "Extracted error from String key '" + key + "': " + errorMessage);
                        break;
                    }
                } else if (value instanceof android.net.Uri) {
                    // Try to read content from URI
                    android.net.Uri uri = (android.net.Uri) value;
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
                                if (!content.isEmpty()) {
                                    errorMessage = parseErrorJson(content);
                                    Log.d(TAG, "Extracted error from URI key '" + key + "': " + errorMessage);
                                    break;
                                }
                            }
                        } catch (Exception e) {
                            Log.w(TAG, "Failed to read error from URI: " + uri, e);
                        }
                    }
                } else {
                    // For other types (including LazyValue), try toString
                    String strValue = value.toString();
                    if (strValue != null && !strValue.isEmpty() && !strValue.contains("LazyValue")) {
                        errorMessage = parseErrorJson(strValue);
                        Log.d(TAG, "Extracted error from " + value.getClass().getSimpleName() + " key '" + key + "': " + errorMessage);
                        break;
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Error extracting from key '" + key + "': " + e.getMessage());
            }
        }

        return errorMessage;
    }

    /**
     * Parse error message from JSON if applicable, otherwise return as-is.
     * Handles BCA error response format: {"errorCode": "102", "errorMessage": "Device not ready"}
     */
    private String parseErrorJson(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }

        // Check if it looks like JSON
        String trimmed = value.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                JSONObject json = new JSONObject(trimmed);
                
                // Try to extract error message from various JSON formats
                if (json.has("errorMessage")) {
                    String msg = json.optString("errorMessage", "");
                    String code = json.optString("errorCode", "");
                    if (!msg.isEmpty()) {
                        return code.isEmpty() ? msg : "[" + code + "] " + msg;
                    }
                }
                if (json.has("message")) {
                    return json.optString("message", value);
                }
                if (json.has("error")) {
                    Object errorObj = json.get("error");
                    if (errorObj instanceof JSONObject) {
                        JSONObject errJson = (JSONObject) errorObj;
                        return errJson.optString("errorMessage", errJson.optString("message", value));
                    }
                    return errorObj.toString();
                }
            } catch (JSONException e) {
                // Not valid JSON, return as-is
                Log.d(TAG, "Value is not valid JSON: " + e.getMessage());
            }
        }

        return value;
    }

    /**
     * Read content from a content URI.
     */
    private String readContentFromUri(android.net.Uri uri) {
        if (uri == null || !"content".equals(uri.getScheme())) {
            return null;
        }

        try {
            java.io.InputStream inputStream = getActivity().getContentResolver().openInputStream(uri);
            if (inputStream != null) {
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    baos.write(buffer, 0, bytesRead);
                }
                inputStream.close();
                return baos.toString(StandardCharsets.UTF_8.name());
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to read content from URI: " + uri, e);
        }
        return null;
    }

    /**
     * Handle BCA-specific URI references that may be stored as string values.
     * BCA sends "response_uri" and "fingerprint_images_uri" as string URIs when data is large.
     */
    private void handleBcaUriReferences(Bundle bundle, JSObject ret) {
        // Handle response_uri -> responseData
        String responseUri = bundle.getString("response_uri");
        if (responseUri != null && !responseUri.isEmpty()) {
            Log.d(TAG, "Found response_uri: " + responseUri);
            try {
                android.net.Uri uri = android.net.Uri.parse(responseUri);
                String content = readContentFromUri(uri);
                if (content != null) {
                    ret.put("responseData", content);
                    Log.d(TAG, "Read responseData from URI, length: " + content.length());
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to read response_uri", e);
            }
        }

        // Handle fingerprint_images_uri -> fingerprintImages
        String fingerprintImagesUri = bundle.getString("fingerprint_images_uri");
        if (fingerprintImagesUri != null && !fingerprintImagesUri.isEmpty()) {
            Log.d(TAG, "Found fingerprint_images_uri: " + fingerprintImagesUri);
            try {
                android.net.Uri uri = android.net.Uri.parse(fingerprintImagesUri);
                String content = readContentFromUri(uri);
                if (content != null) {
                    ret.put("fingerprintImages", content);
                    Log.d(TAG, "Read fingerprintImages from URI, length: " + content.length());
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to read fingerprint_images_uri", e);
            }
        }

        // Handle direct fingerprint_images (when small enough to be in extras directly)
        String fingerprintImages = bundle.getString("fingerprint_images");
        if (fingerprintImages != null && !fingerprintImages.isEmpty() && !ret.has("fingerprintImages")) {
            ret.put("fingerprintImages", fingerprintImages);
            Log.d(TAG, "Added direct fingerprintImages, length: " + fingerprintImages.length());
        }

        // Handle direct response (when small enough to be in extras directly)
        String response = bundle.getString("response");
        if (response != null && !response.isEmpty() && !ret.has("responseData")) {
            ret.put("responseData", response);
            Log.d(TAG, "Added direct responseData, length: " + response.length());
        }
    }
}

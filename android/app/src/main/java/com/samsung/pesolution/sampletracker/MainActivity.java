package com.samsung.pesolution.sampletracker;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.concurrent.Executor;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUI();
        requestNecessaryPermissions();
        configureWebViewForCameraAndBiometrics();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    private void requestNecessaryPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO
                }, PERMISSION_REQUEST_CODE);
            }
        }
    }

    private void configureWebViewForCameraAndBiometrics() {
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            
            // Enable Camera / Microphone WebRTC Permission requests in WebView
            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        request.grant(request.getResources());
                    });
                }
            });

            // Inject Native Biometric JavaScript Interface
            webView.addJavascriptInterface(new AndroidBiometricInterface(this, webView), "AndroidNativeBiometric");
        }
    }

    public static class AndroidBiometricInterface {
        private final MainActivity activity;
        private final WebView webView;

        public AndroidBiometricInterface(MainActivity activity, WebView webView) {
            this.activity = activity;
            this.webView = webView;
        }

        @JavascriptInterface
        public boolean isBiometricAvailable() {
            BiometricManager biometricManager = BiometricManager.from(activity);
            int canAuthenticate = biometricManager.canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK
            );
            return canAuthenticate == BiometricManager.BIOMETRIC_SUCCESS;
        }

        @JavascriptInterface
        public void authenticate(final String title, final String subtitle, final String callbackId) {
            activity.runOnUiThread(() -> {
                Executor executor = ContextCompat.getMainExecutor(activity);
                BiometricPrompt biometricPrompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        super.onAuthenticationError(errorCode, errString);
                        String customMsg;
                        switch (errorCode) {
                            case BiometricPrompt.ERROR_NO_BIOMETRICS:
                                customMsg = "Sensor sidik jari belum didaftarkan pada perangkat ini. Silakan atur dan daftarkan Sidik Jari di menu Pengaturan Keamanan HP Anda terlebih dahulu.";
                                break;
                            case BiometricPrompt.ERROR_HW_NOT_PRESENT:
                                customMsg = "Perangkat ini tidak dilengkapi sensor sidik jari.";
                                break;
                            case BiometricPrompt.ERROR_HW_UNAVAILABLE:
                                customMsg = "Sensor sidik jari sedang sibuk atau tidak tersedia.";
                                break;
                            case BiometricPrompt.ERROR_USER_CANCELED:
                            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
                                customMsg = "Perekaman / verifikasi sidik jari dibatalkan oleh pengguna.";
                                break;
                            case BiometricPrompt.ERROR_LOCKOUT:
                            case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                                customMsg = "Terlalu banyak percobaan gagal. Sensor sidik jari terkunci sementara.";
                                break;
                            default:
                                String raw = errString.toString();
                                if (raw.toLowerCase().contains("face") || raw.toLowerCase().contains("unlock")) {
                                    customMsg = "Sensor sidik jari belum didaftarkan pada perangkat ini. Silakan atur Sidik Jari di Pengaturan HP Anda.";
                                } else {
                                    customMsg = raw;
                                }
                                break;
                        }
                        sendResult(callbackId, false, customMsg);
                    }

                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        super.onAuthenticationSucceeded(result);
                        sendResult(callbackId, true, "AUTH_SUCCESS");
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        super.onAuthenticationFailed();
                    }
                });

                BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title != null && !title.isEmpty() ? title : "Verifikasi Sidik Jari")
                    .setSubtitle(subtitle != null && !subtitle.isEmpty() ? subtitle : "Sentuh sensor sidik jari perangkat")
                    .setNegativeButtonText("Batal")
                    .build();

                biometricPrompt.authenticate(promptInfo);
            });
        }

        private void sendResult(final String callbackId, final boolean success, final String message) {
            activity.runOnUiThread(() -> {
                String safeMsg = message.replace("'", "\\'");
                String js = "if (window.__onNativeBiometricResult) { window.__onNativeBiometricResult('" + callbackId + "', " + success + ", '" + safeMsg + "'); }";
                webView.evaluateJavascript(js, null);
            });
        }
    }
}

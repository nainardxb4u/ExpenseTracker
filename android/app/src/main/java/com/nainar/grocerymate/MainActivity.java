package com.nainar.grocerymate;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#145C3A"));
        getWindow().setNavigationBarColor(Color.parseColor("#FFFFFF"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F2F5F3"));
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);
        applySystemBarPadding();
        webView.requestApplyInsets();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setTextZoom(100);

        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                showJsDialog(message, result, false);
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                showJsDialog(message, result, true);
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    private void applySystemBarPadding() {
        float density = getResources().getDisplayMetrics().density;
        int minBottom = Math.round(40 * density);
        webView.setPadding(0, 0, 0, minBottom);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(true);
            webView.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.navigationBars());
                int bottom = Math.max(minBottom, bars.bottom + Math.round(24 * density));
                bottom = Math.max(bottom, ime.bottom);
                v.setPadding(0, 0, 0, bottom);
                return insets;
            });
        } else {
            webView.setFitsSystemWindows(true);
        }
    }

    private void showJsDialog(String message, JsResult result, boolean confirm) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setMessage(message)
                .setCancelable(true)
                .setOnCancelListener(dialog -> result.cancel())
                .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm());
        if (confirm) {
            builder.setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel());
        }
        builder.show();
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(function(){var ids=['pickerBackdrop','modalBackdrop'];"
                        + "for(var i=0;i<ids.length;i++){var m=document.getElementById(ids[i]);"
                        + "if(m&&m.classList.contains('show')){m.classList.remove('show');return '1';}}"
                        + "return '0';})()",
                value -> {
                    if ("\"1\"".equals(value)) {
                        return;
                    }
                    MainActivity.super.onBackPressed();
                });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            if (webView.getParent() instanceof ViewGroup) {
                ((ViewGroup) webView.getParent()).removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

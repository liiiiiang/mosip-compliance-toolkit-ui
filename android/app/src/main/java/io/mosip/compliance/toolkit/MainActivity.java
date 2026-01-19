package io.mosip.compliance.toolkit;

import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 启用 WebView 控制台日志输出到 logcat
        // 这样 console.log() 就能在 adb logcat 中看到了
        Bridge bridge = this.getBridge();
        if (bridge != null) {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                // 配置 WebView 设置以忽略 CORS 检查
                WebSettings webSettings = webView.getSettings();
                webSettings.setJavaScriptEnabled(true);
                webSettings.setDomStorageEnabled(true);
                webSettings.setAllowUniversalAccessFromFileURLs(true);
                webSettings.setAllowFileAccessFromFileURLs(true);
                webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                
                // 注意：不覆盖 WebViewClient，让 Capacitor 的 Bridge 处理所有请求
                // 这样可以确保本地文件正确加载
                
                webView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                        // 将 console 消息输出到 Android logcat
                        android.util.Log.d("WebView", 
                            String.format("%s -- From line %d of %s",
                                consoleMessage.message(),
                                consoleMessage.lineNumber(),
                                consoleMessage.sourceId()));
                        return true;
                    }
                });
                
                android.util.Log.d("MainActivity", "WebView CORS bypass settings configured");
            }
        }
    }
    
    @Override
    public void onResume() {
        super.onResume();
        // 确保 WebView 设置已应用
        Bridge bridge = this.getBridge();
        if (bridge != null) {
            WebView webView = bridge.getWebView();
            if (webView != null) {
                android.util.Log.d("MainActivity", "onResume - WebView URL: " + webView.getUrl());
            }
        }
    }
}

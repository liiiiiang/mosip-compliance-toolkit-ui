package io.mosip.compliance.toolkit;

import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
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
                webSettings.setAllowUniversalAccessFromFileURLs(true);
                webSettings.setAllowFileAccessFromFileURLs(true);
                webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                
                // 设置自定义 WebViewClient 来处理 CORS
                webView.setWebViewClient(new WebViewClient() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                        // 允许所有请求，不拦截（这样可以绕过 CORS 检查）
                        return super.shouldInterceptRequest(view, request);
                    }
                    
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        // 允许所有 URL 加载
                        return false;
                    }
                });
                
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
}

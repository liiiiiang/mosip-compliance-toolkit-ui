package io.mosip.compliance.toolkit;

import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.os.Build;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;

public class MainActivity extends BridgeActivity {
    private WebViewClient originalWebViewClient;
    
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
                
                // 延迟设置 WebViewClient，确保 Capacitor Bridge 已经初始化完成
                webView.post(new Runnable() {
                    @Override
                    public void run() {
                        // 保存原始的 WebViewClient（Capacitor 的 Bridge 设置的）
                        originalWebViewClient = webView.getWebViewClient();
                        
                        // 创建自定义 WebViewClient 来拦截 CORS 预检请求
                        webView.setWebViewClient(new CORSBypassWebViewClient(originalWebViewClient));
                        
                        android.util.Log.d("MainActivity", "WebView CORS bypass WebViewClient configured");
                    }
                });
                
                android.util.Log.d("MainActivity", "WebView CORS bypass settings configured");
            }
        }
    }
    
    /**
     * 自定义 WebViewClient 用于绕过 CORS 检查
     * 拦截 OPTIONS 预检请求并返回允许的 CORS 响应
     */
    private static class CORSBypassWebViewClient extends WebViewClient {
        private final WebViewClient originalClient;
        
        public CORSBypassWebViewClient(WebViewClient originalClient) {
            this.originalClient = originalClient;
        }
        
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            // 拦截 OPTIONS 预检请求（CORS preflight）
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                String method = request.getMethod();
                String url = request.getUrl().toString();
                
                android.util.Log.d("CORSBypass", "Intercepting request: " + method + " " + url);
                
                // 如果是 OPTIONS 预检请求，返回允许的 CORS 响应
                if ("OPTIONS".equalsIgnoreCase(method)) {
                    android.util.Log.d("CORSBypass", "Handling OPTIONS preflight request for: " + url);
                    
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "*");
                    headers.put("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
                    headers.put("Access-Control-Allow-Headers", "Content-Type, Authorization, authorization, accessToken, X-Requested-With");
                    headers.put("Access-Control-Allow-Credentials", "true");
                    headers.put("Access-Control-Max-Age", "3600");
                    
                    return new WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        200,
                        "OK",
                        headers,
                        new ByteArrayInputStream("".getBytes())
                    );
                }
            }
            
            // 对于其他请求，使用原始的 WebViewClient 处理
            // 这样可以确保 Capacitor 的 Bridge 功能正常工作
            if (originalClient != null) {
                return originalClient.shouldInterceptRequest(view, request);
            }
            
            return super.shouldInterceptRequest(view, request);
        }
        
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (originalClient != null) {
                return originalClient.shouldOverrideUrlLoading(view, request);
            }
            return super.shouldOverrideUrlLoading(view, request);
        }
        
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            if (originalClient != null) {
                originalClient.onPageStarted(view, url, favicon);
            } else {
                super.onPageStarted(view, url, favicon);
            }
        }
        
        @Override
        public void onPageFinished(WebView view, String url) {
            if (originalClient != null) {
                originalClient.onPageFinished(view, url);
            } else {
                super.onPageFinished(view, url);
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

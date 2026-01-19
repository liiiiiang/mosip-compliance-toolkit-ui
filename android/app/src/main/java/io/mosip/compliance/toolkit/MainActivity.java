package io.mosip.compliance.toolkit;

import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
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
            }
        }
    }
}

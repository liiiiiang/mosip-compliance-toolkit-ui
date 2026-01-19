import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Platform } from '@capacitor/core';

/**
 * 日志服务 - 确保日志能输出到 Android logcat
 * 
 * 使用方法：
 * 1. 注入 LoggerService
 * 2. 使用 this.logger.debug() 替代 console.log()
 * 
 * 在 Android 中，日志会输出到 logcat
 * 在浏览器中，日志会输出到浏览器控制台
 */
@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  private isAndroid = Capacitor.getPlatform() === 'android';

  /**
   * 输出调试日志
   */
  debug(...args: any[]): void {
    const message = this.formatMessage(args);
    console.log(message);
    
    // 在 Android 中，通过 window.console 确保输出到 logcat
    if (this.isAndroid) {
      // 使用 console.log 并确保输出到 logcat
      // Android WebView 会自动将 console.log 输出到 logcat
      // 但需要确保 WebView 启用了日志
      console.log(message);
    }
  }

  /**
   * 输出错误日志
   */
  error(...args: any[]): void {
    const message = this.formatMessage(args);
    console.error(message);
    
    if (this.isAndroid) {
      console.error(message);
    }
  }

  /**
   * 输出警告日志
   */
  warn(...args: any[]): void {
    const message = this.formatMessage(args);
    console.warn(message);
    
    if (this.isAndroid) {
      console.warn(message);
    }
  }

  /**
   * 格式化消息
   */
  private formatMessage(args: any[]): string {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }
}

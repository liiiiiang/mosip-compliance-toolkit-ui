# Android 日志查看指南

## ⚠️ 重要说明

**`console.log()` 在 Android 中默认不会直接输出到 `adb logcat`！**

在 Capacitor/Ionic 应用中：
- 在**浏览器**中运行时：`console.log()` 输出到浏览器开发者工具控制台
- 在**Android 原生应用**中运行时：`console.log()` **默认不会**输出到 logcat

## 解决方案

### ✅ 方案 1：修改 MainActivity（已实现）⭐ **推荐**

我已经修改了 `MainActivity.java`，添加了 WebChromeClient 来捕获 console 消息并输出到 logcat。

**现在可以直接使用：**
```bash
# 查看所有日志
adb logcat

# 过滤包含 [DEBUG] 的日志
adb logcat | grep "\[DEBUG\]"

# 或者使用标签过滤（WebView 日志会使用 "WebView" 标签）
adb logcat | grep "WebView"
```

### ✅ 方案 2：使用 Chrome DevTools 远程调试（无需修改代码）

这是最简单的方法，不需要修改代码：

#### 步骤：
1. **连接设备**
   ```bash
   adb devices
   ```

2. **打开 Chrome DevTools**
   - 在 Chrome 浏览器地址栏输入：`chrome://inspect`
   - 确保设备已连接并启用 USB 调试
   - 在 "Remote Target" 下找到你的应用
   - 点击 "inspect"

3. **查看 Console**
   - 在打开的 DevTools 窗口中，切换到 "Console" 标签
   - 所有 `console.log()` 输出都会显示在这里
   - 可以实时查看，支持过滤和搜索

4. **查看 Network**
   - 切换到 "Network" 标签可以查看所有 HTTP 请求
   - 包括 validateToken 请求的详细信息

**优点：**
- ✅ 无需修改代码
- ✅ 可以查看完整的 Console 输出
- ✅ 可以查看 Network 请求
- ✅ 可以调试 JavaScript
- ✅ 可以查看 localStorage

**缺点：**
- ❌ 需要 Chrome 浏览器
- ❌ 需要 USB 连接

### ✅ 方案 3：安装 @capacitor/console 插件（可选）

如果需要更强大的日志功能，可以安装官方插件：

```bash
npm install @capacitor/console
npx cap sync
```

然后在代码中使用：
```typescript
import { Console } from '@capacitor/console';

Console.log({ text: 'Debug message' });
```

## 当前配置状态

### ✅ 已完成的配置

1. **MainActivity.java 已修改**
   - 添加了 WebChromeClient
   - 所有 console 消息会输出到 logcat，标签为 "WebView"

2. **日志格式**
   - 所有调试日志都标记为 `[DEBUG]`
   - 便于过滤和查找

### 📝 查看日志的方法

#### 方法 1：使用 adb logcat（推荐）

```bash
# 1. 查看所有 WebView console 日志
adb logcat | grep "WebView"

# 2. 查看包含 [DEBUG] 的日志
adb logcat | grep "\[DEBUG\]"

# 3. 查看特定服务的日志
adb logcat | grep -E "AndroidKeycloakService|AuthInterceptor|AuthService"

# 4. 实时查看并保存到文件
adb logcat | tee debug.log | grep "\[DEBUG\]"
```

#### 方法 2：使用 Chrome DevTools（最简单）

1. 打开 `chrome://inspect`
2. 找到你的应用，点击 "inspect"
3. 在 Console 标签中查看所有日志

#### 方法 3：使用 Android Studio Logcat

1. 打开 Android Studio
2. 连接设备
3. 在底部 "Logcat" 窗口中查看日志
4. 可以过滤、搜索、保存日志

## 日志标签说明

### WebView 标签
- **标签名：** `WebView`
- **内容：** 所有 `console.log()` 的输出
- **格式：** `message -- From line X of source`

### 应用标签
- **标签名：** 应用包名相关
- **内容：** 原生 Android 日志

## 验证日志是否正常工作

### 测试步骤：

1. **连接设备**
   ```bash
   adb devices
   ```

2. **清除旧日志**
   ```bash
   adb logcat -c
   ```

3. **启动日志监控**
   ```bash
   adb logcat | grep -E "WebView|\[DEBUG\]"
   ```

4. **打开应用并执行登录**
   - 应该能看到大量 `[DEBUG]` 标记的日志
   - 如果看不到，说明日志配置有问题

5. **检查关键日志**
   ```bash
   # 应该能看到类似这样的日志：
   WebView: [DEBUG] AndroidKeycloakService: Setting up Keycloak
   WebView: [DEBUG] IAM_URL: ...
   WebView: [DEBUG] Token saved to localStorage
   ```

## 常见问题

### Q1: 为什么看不到日志？

**可能原因：**
1. MainActivity 修改未生效
   - 需要重新编译 APK：`npx cap sync android` 然后重新构建
2. 日志被过滤掉了
   - 尝试：`adb logcat` 查看所有日志
3. 设备未正确连接
   - 检查：`adb devices`

### Q2: 日志太多怎么办？

**解决方案：**
```bash
# 只查看包含 [DEBUG] 的日志
adb logcat | grep "\[DEBUG\]"

# 只查看特定服务
adb logcat | grep "AndroidKeycloakService"

# 只查看错误
adb logcat | grep -E "ERROR|WARNING"
```

### Q3: 如何保存日志到文件？

```bash
# 保存所有日志
adb logcat > all_logs.txt

# 保存并实时显示
adb logcat | tee logs.txt | grep "\[DEBUG\]"

# 只保存特定标签
adb logcat -s WebView > webview_logs.txt
```

### Q4: Chrome DevTools 中看不到应用？

**解决方案：**
1. 确保设备已连接：`adb devices`
2. 确保应用正在运行
3. 在设备上启用 USB 调试
4. 尝试刷新 `chrome://inspect` 页面
5. 检查是否有 "Discover USB devices" 选项需要启用

## 推荐工作流程

### 开发调试时：
1. 使用 **Chrome DevTools**（`chrome://inspect`）
   - 方便查看 Console 和 Network
   - 可以调试 JavaScript

### 生产环境或无法使用 DevTools 时：
1. 使用 **adb logcat**
   - 通过 USB 连接设备
   - 使用 grep 过滤日志
   - 保存日志到文件

### 快速排查问题时：
```bash
# 一键查看所有调试日志
adb logcat -c && adb logcat | grep "\[DEBUG\]"
```

## 总结

✅ **现在可以使用：**
- `adb logcat | grep "\[DEBUG\]"` - 查看所有调试日志
- `adb logcat | grep "WebView"` - 查看 WebView console 日志
- Chrome DevTools (`chrome://inspect`) - 完整的调试体验

🎯 **推荐：**
- 日常开发：使用 Chrome DevTools
- 问题排查：使用 adb logcat + grep 过滤

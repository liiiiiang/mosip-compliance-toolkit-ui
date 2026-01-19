# Android 登录循环问题调试指南

## 问题描述
Android APK 安装后，打开应用 → 跳转浏览器登录 → 登录成功跳回APK → 又触发跳转浏览器，形成无限循环。

## 可能原因分析

### 1. **Token 保存和 Cookie 同步时机问题** ⚠️ **最可能**
- 登录成功后，token 保存到 localStorage
- 页面立即 reload，但此时 Cookie 可能还未同步完成
- validateToken 请求时，Cookie 中没有 token，返回 401
- 401 触发 showHomePage，再次登录

### 2. **localStorage.clear() 清除了刚保存的 token** ⚠️
- onAuthSuccess 保存 token 后 reload
- reload 时 HTTP 拦截器可能检测到某些错误
- 调用 showHomePage，清除 localStorage
- 导致刚保存的 token 被清除

### 3. **isLoggingIn 状态丢失** ⚠️
- isLoggingIn 是内存状态，页面 reload 后重置为 false
- reload 后检测认证失败，但 isLoggingIn 已经是 false
- 触发再次登录

### 4. **validateToken 请求时机过早**
- reload 后立即检查认证状态
- 此时 Cookie 可能还未设置完成
- 导致认证失败

## 已添加的解决方案

### 1. 防止循环机制
- 添加 `android_keycloak_login_completed` 标记到 localStorage
- 登录完成后设置标记和时间戳
- HTTP 拦截器检查标记，10秒内不触发登录
- 避免刚登录完立即触发再次登录

### 2. 延迟 reload
- onAuthSuccess 后延迟 500ms 再 reload（原来 200ms）
- 确保 token 保存和持久化完成

### 3. 保留登录标记
- showHomePage 清除 localStorage 时，保留登录完成标记
- 防止标记被意外清除

## ⚠️ 重要：日志查看说明

**`console.log()` 在 Android 中默认不会输出到 logcat！**

我已经修改了 `MainActivity.java` 来捕获 console 消息。现在可以使用以下方法查看日志：

### 方法 1：使用 adb logcat（推荐）

```bash
# 查看所有 WebView console 日志（包含我们的 [DEBUG] 日志）
adb logcat | grep "WebView"

# 或者直接过滤 [DEBUG] 标记
adb logcat | grep "\[DEBUG\]"
```

### 方法 2：使用 Chrome DevTools（最简单）⭐

1. 在 Chrome 地址栏输入：`chrome://inspect`
2. 连接设备并启用 USB 调试
3. 找到你的应用，点击 "inspect"
4. 在 Console 标签中查看所有日志

**详细说明请查看：`LOG_VIEWING_GUIDE.md`**

---

## 调试方法（使用 ADB）

### 步骤 1：连接设备
```bash
# 查看已连接的设备
adb devices

# 如果设备未识别，启用USB调试
# 在设备上：设置 → 关于手机 → 连续点击版本号7次
# 然后：设置 → 开发者选项 → 启用USB调试
```

### 步骤 2：查看实时日志
```bash
# 方法 A：查看 WebView console 日志（推荐）
adb logcat | grep "WebView"

# 方法 B：过滤包含 DEBUG 的日志（我们的日志都标记为 [DEBUG]）
adb logcat | grep "\[DEBUG\]"

# 方法 C：查看所有日志，然后手动过滤
adb logcat

# 清除旧日志，只查看新日志
adb logcat -c && adb logcat | grep "\[DEBUG\]"
```

### 步骤 3：特定关键词过滤
```bash
# 只查看登录相关日志
adb logcat | grep -E "AndroidKeycloakService|AuthInterceptor|AuthService"

# 查看 HTTP 请求日志
adb logcat | grep -E "validateToken|HTTP ERROR|401|403"

# 查看 token 相关日志
adb logcat | grep -E "ACCESS_TOKEN|token|Token"
```

### 步骤 4：完整日志保存到文件
```bash
# 保存所有日志到文件
adb logcat > android_debug.log

# 保存并实时显示
adb logcat | tee android_debug.log | grep -i "\[DEBUG\]"
```

### 步骤 5：关键日志点追踪

#### 登录流程追踪
查看以下关键日志序列：
```
1. [DEBUG] AndroidKeycloakService: login() CALLED
2. [DEBUG] AndroidKeycloakService: Starting login process
3. [DEBUG] AndroidKeycloakService: onAuthSuccess CALLED
4. [DEBUG] Token saved to localStorage
5. [DEBUG] EXECUTING PAGE RELOAD
6. [DEBUG] AndroidKeycloakService: Setting up Keycloak (reload后)
7. [DEBUG] AuthService.isAuthenticated() CALLED
8. [DEBUG] validateToken URL: ...
9. [DEBUG] AuthInterceptor: validateToken RESPONSE
```

#### 循环检测点
查找以下模式：
```
# 如果看到这个序列，说明发生了循环：
[DEBUG] EXECUTING PAGE RELOAD
[DEBUG] AuthInterceptor: HTTP ERROR (401或403)
[DEBUG] Triggering showHomePage (Android mode)...
[DEBUG] AndroidKeycloakService: login() CALLED
```

### 步骤 6：检查 localStorage 状态
```bash
# 通过 Chrome DevTools (需要启用远程调试)
# 1. 在 Chrome 地址栏输入: chrome://inspect
# 2. 确保设备已连接并启用 USB 调试
# 3. 找到你的应用，点击 "inspect"
# 4. 在 Console 中执行：
localStorage.getItem('accessToken')
localStorage.getItem('android_keycloak_login_completed')
localStorage.getItem('android_keycloak_login_timestamp')
```

### 步骤 7：网络请求追踪
```bash
# 查看所有 HTTP 请求
adb logcat | grep -E "validateToken|SERVICES_BASE_URL"

# 查看请求状态码
adb logcat | grep -E "Status:|401|403|200"
```

## 关键日志分析清单

### ✅ 正常流程应该看到的日志
1. `[DEBUG] AndroidKeycloakService: onAuthSuccess CALLED`
2. `[DEBUG] Token saved to localStorage, verification: SUCCESS`
3. `[DEBUG] Login completion flag set to prevent loop`
4. `[DEBUG] EXECUTING PAGE RELOAD`
5. `[DEBUG] Login completion flag active - this is a fresh reload after login`
6. `[DEBUG] AuthInterceptor: validateToken RESPONSE` (status: 200)
7. `[DEBUG] validateToken SUCCESS - has response object`

### ❌ 问题流程可能看到的日志
1. `[DEBUG] EXECUTING PAGE RELOAD`
2. `[DEBUG] AuthInterceptor: HTTP ERROR` (status: 401 或 403)
3. `[DEBUG] Token in localStorage at error time: NOT_EXISTS` ⚠️ **关键问题**
4. `[DEBUG] Triggering showHomePage (Android mode)...`
5. `[DEBUG] Clearing sessionStorage, localStorage, and cookies...` ⚠️ **可能清除了token**

### 🔍 需要重点检查的日志
1. **Token 保存验证**
   - `[DEBUG] Token saved to localStorage, verification: SUCCESS/FAILED`
   - `[DEBUG] Token in localStorage before reload: EXISTS/NOT_EXISTS`

2. **Token 在错误时的状态**
   - `[DEBUG] Token in localStorage at error time: EXISTS/NOT_EXISTS`
   - `[DEBUG] Token for accessToken header: EXISTS/NOT_EXISTS`

3. **循环防护标记**
   - `[DEBUG] Login completion flag: true/false`
   - `[DEBUG] WARNING: Auth error detected but login was just completed!`

4. **Cookie 设置**
   - `[DEBUG] Cookie set successfully` 或 `[DEBUG] ERROR setting cookie`

## 常见问题和解决方案

### 问题1：Token 在 reload 后丢失
**检查日志：**
```
[DEBUG] Token in localStorage before reload: EXISTS
[DEBUG] Token in localStorage after clear: NOT_EXISTS
```
**解决方案：** showHomePage 不应该在刚登录后立即清除 localStorage

### 问题2：Cookie 未设置成功
**检查日志：**
```
[DEBUG] ERROR setting cookie: ...
```
**解决方案：** 检查 CapacitorCookies 插件是否正确安装和配置

### 问题3：validateToken 返回 401，但 token 存在
**检查日志：**
```
[DEBUG] Token for accessToken header: EXISTS
[DEBUG] AuthInterceptor: HTTP ERROR (status: 401)
```
**解决方案：** 可能是后端未正确解析 accessToken header，检查 nginx 配置

### 问题4：循环防护未生效
**检查日志：**
```
[DEBUG] Login completion flag: (missing)
[DEBUG] Triggering showHomePage (Android mode)...
```
**解决方案：** 标记可能被清除，检查 localStorage.clear() 调用

## 调试命令快速参考

```bash
# 1. 实时查看所有调试日志
adb logcat | grep "\[DEBUG\]"

# 2. 只看登录相关
adb logcat | grep -E "AndroidKeycloakService|login|Login"

# 3. 只看 HTTP 相关
adb logcat | grep -E "AuthInterceptor|HTTP|validateToken"

# 4. 只看错误
adb logcat | grep -E "ERROR|WARNING|401|403"

# 5. 保存完整日志
adb logcat > debug_full.log

# 6. 清除日志缓冲区
adb logcat -c

# 7. 查看应用包名（如果需要过滤特定应用）
adb shell pm list packages | grep compliance
```

## 下一步

根据日志输出，重点关注：
1. Token 是否成功保存并在 reload 后仍然存在
2. Cookie 是否成功设置
3. validateToken 请求时的 token 状态
4. 循环防护标记是否正常工作
5. 是否有其他组件清除了 localStorage

如果问题仍然存在，请提供完整的日志输出以便进一步分析。

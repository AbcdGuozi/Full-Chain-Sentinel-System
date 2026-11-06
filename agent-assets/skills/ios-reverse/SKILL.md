---
name: ios-reverse
description: "iOS IPA 结构、Mach-O、Info.plist、Framework 与 Simulator 只读逆向方法。"
---

# iOS IPA 逆向审阅

适用：已授权的 IPA、企业分发测试包、Xcode Simulator 测试构建。默认只做静态解析与 Simulator 只读观察；不越狱、不注入 dylib、不重签生产包、不导出真实 Keychain 或用户数据。

上级边界：[non-destructive-testing.md](../non-destructive-testing.md)。本文所有命令都作用于本地副本或已授权测试设备。

## 1. 基线与 IPA 结构

```bash
umask 077
mkdir -p work/ios && cd work/ios
shasum -a 256 target.ipa | tee ipa.sha256
unzip -l target.ipa | sed -n '1,80p'
unzip -q target.ipa -d ipa_out
APP="ipa_out/Payload/$(ls ipa_out/Payload | head -1)"
echo "$APP"
```

| 路径 | 内容 | 审阅价值 |
|---|---|---|
| `Payload/<Name>.app/` | 主应用 bundle | 可执行文件、Info.plist、资源 |
| `.app/Info.plist` | 应用配置 | ATS、URL Scheme、权限说明、后台模式 |
| `.app/<Name>` | Mach-O 主程序 | 架构、加密状态、依赖、符号 |
| `.app/Frameworks/` | 动态框架 | 第三方 SDK、加密库、Flutter/RN |
| `.app/PlugIns/` | Extension | 独立 entitlement 与共享容器 |
| `.app/_CodeSignature/` | 代码签名资源 | 完整性校验 |
| `.app/embedded.mobileprovision` | 描述文件 | 分发类型、Team、设备限制、Entitlement |
| `SwiftSupport/` | Swift 运行库（部分分发） | Swift 版本与兼容性 |

| 要确认 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|
| Bundle 身份 | `plutil -p Info.plist` 的 `CFBundleIdentifier`、`CFBundleShortVersionString`、`CFBundleVersion` | bundle id、版本、构建号 | 与授权资产不一致 |
| 架构 | `lipo -info <Name>` 或 `otool -hv` | arm64 / arm64e / x86_64 | 只有模拟器切片却被当作真机结论 |
| 分发类型 | `security cms -D -i embedded.mobileprovision` 后查看 `ProvisionsAllDevices`、`ProvisionedDevices`、`ExpirationDate` | 类型、过期时间、Team 类别 | 描述文件过期或与包不匹配 |
| 完整性 | 对比官方渠道哈希与本地哈希 | 两个哈希与采集时间 | 哈希不一致且无法解释 |

描述文件含 Team ID、设备 UDID 等信息。证据中只保留“企业/开发/App Store、是否过期、是否含设备限制”，不要贴完整 plist。

## 2. 签名、Entitlement 与 FairPlay

```bash
codesign -dv --verbose=4 "$APP" 2>&1 | sed -n '1,40p'
codesign -d --entitlements :- "$APP" 2>/dev/null | sed -n '1,120p'
security cms -D -i "$APP/embedded.mobileprovision" > profile.plist 2>/dev/null
plutil -p profile.plist | sed -n '1,80p'
otool -l "$APP/$(basename "$APP" .app)" | grep -A5 LC_ENCRYPTION_INFO
```

| 检查点 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|
| 签名链 | `codesign -dv` 的 Authority、TeamIdentifier、Timestamp | 签名主体类别、Team、是否带时间戳 | 需要重签才能继续 |
| Entitlement | `codesign -d --entitlements` | `application-identifier`、`keychain-access-groups`、`aps-environment`、`com.apple.developer.associated-domains`、App Groups | 需要修改 entitlement |
| FairPlay 加密 | `LC_ENCRYPTION_INFO(_64)` 的 `cryptid`；`1` 表示仍有加密 | cryptid 值、架构 | 需要脱壳/解密 App Store 二进制 |
| 是否可执行分析 | `class-dump` 是否能产出头文件；`nm` 是否有符号 | 成功/失败与原因 | 二进制加密且无授权解密副本 |
| 描述文件能力 | `get-task-allow`、`beta-reports-active`、设备列表 | 是否可调试、分发范围 | 需要调试生产签名包 |

`cryptid=1` 时，`class-dump`、`nm`、`strings` 的结果可能为空或只有元数据。正确做法是向应用所有者索取**已授权的解密测试构建**；不要对 App Store 应用使用脱壳工具。

重签名会改变代码签名、Entitlement、Keychain Access Group、推送环境、Associated Domains 和 App Group 归属，可能导致登录态、推送、共享容器全部失效，也可能违反分发条款。只有在所有者提供测试证书、明确授权且使用测试构建时才考虑；本文不提供重签命令。

## 3. Info.plist 关键项

```bash
PLIST="$APP/Info.plist"
plutil -p "$PLIST" | grep -nE 'NSAppTransportSecurity|NSAllowsArbitraryLoads|NSExceptionDomains|CFBundleURLTypes|CFBundleURLSchemes|LSApplicationQueriesSchemes|UIFileSharingEnabled|LSSupportsOpeningDocumentsInPlace|UIBackgroundModes|NSUserTrackingUsageDescription'
```

| 关键项 | 风险含义 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|---|
| `NSAppTransportSecurity` | ATS 是否放宽 | 查看 `NSAllowsArbitraryLoads`、`NSAllowsArbitraryLoadsInWebContent`、`NSExceptionDomains` | 布尔值、例外域类别、最低 TLS 版本 | 需要抓取真实明文流量 |
| `CFBundleURLTypes` | 自定义 URL Scheme 入口 | 列出 scheme、role、参数处理类 | scheme 名与是否校验来源 | 需要打开真实第三方 App |
| `LSApplicationQueriesSchemes` | 应用可探测哪些 App | 列出 scheme | scheme 类别与数量 | 需要实际探测设备安装情况 |
| `UIFileSharingEnabled` | iTunes/Finder 文件共享 | 读取布尔值 | 是否开启、共享目录 | 需要导出真实文件 |
| `LSSupportsOpeningDocumentsInPlace` | 原地打开文档 | 读取布尔值 | 是否开启 | 需要访问真实文档 |
| `UIBackgroundModes` | 后台能力 | 列出 `audio`、`location`、`fetch` 等 | 模式列表 | 需要长时间后台采集 |
| 权限说明 | 相机、定位、通讯录等用途 | 读取 `NS*UsageDescription` | 是否存在说明、是否与功能匹配 | 需要触发真实权限弹窗 |

ATS 只约束 `URLSession`/`NSURLConnection` 等高层 API；原生 socket、部分 WebView 内容和第三方网络库可能不受同一配置约束。不要把“ATS 已开启”直接等同于“全链路加密”。

## 4. 本地存储与数据位置

优先在 Simulator + 合成数据下观察。真机沙箱数据不通过越狱、SSH 或备份提取。

```bash
# 仅 Simulator：定位应用数据容器（只读）
CONTAINER="$(xcrun simctl get_app_container booted <bundle-id> data)"
echo "$CONTAINER"
find "$CONTAINER" -maxdepth 3 -type f \( -name '*.plist' -o -name '*.sqlite*' -o -name '*.realm' -o -name '*.db' \) | sed -n '1,80p'
```

| 存储 | 位置/接口 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|---|
| `NSUserDefaults` | `Library/Preferences/<bundle>.plist` | `plutil -p` 查看键名与类型；只看合成账号数据 | 键名、类型、是否含敏感类别 | 出现真实 PII |
| Keychain | `SecItemAdd`/`SecItemCopyMatching`；Entitlement 的 access group | 静态查看调用点、`kSecAttrAccessible` 类别、access group | 服务名、可访问性级别、是否同步 iCloud | 需要导出真实 Keychain |
| SQLite/CoreData | `Library/Application Support/`、`Documents/` | `sqlite3 -readonly <db> '.tables'` 只看结构 | 表名、字段名、是否加密 | 需要查询真实记录 |
| Realm | `*.realm` | 查看文件存在性、是否加密配置 | 路径、加密标志 | 需要打开真实库 |
| 文件/缓存 | `Documents/`、`Library/Caches/` | 列文件名与大小，不读内容 | 目录结构、敏感文件类别 | 需要导出文件 |
| Cookie | `HTTPCookieStorage` | 静态查看属性；测试账号下观察 | 是否 `Secure`、`HttpOnly`、过期策略 | 需要读取真实会话 |
| 日志 | `os_log`、`NSLog`、第三方日志 | Simulator 下按进程过滤；只记类别 | 是否输出凭据/PII 类别 | 日志出现真实数据 |
| 后台快照 | `Library/SplashBoard` 等 | 测试构建下观察是否含敏感页面 | 是否存在快照、是否脱敏 | 需要读取真实用户快照 |

Keychain 的 `kSecAttrAccessible` 级别（如 `WhenUnlocked`、`AfterFirstUnlock`、`ThisDeviceOnly`）决定备份与锁屏可访问性。静态能看到常量，不代表运行时一定使用；结论要注明“配置观察”还是“运行观察”。

## 5. 越狱检测识别

```bash
BIN="$APP/$(basename "$APP" .app)"
strings -a -n 6 "$BIN" | grep -Ei 'cydia|substrate|jailbreak|/bin/bash|/usr/sbin/sshd|frida|cycript|checkra1n|unc0ver|palera1n' | head -40
```

常见检测点：`/Applications/Cydia.app`、`/bin/bash`、`/usr/sbin/sshd`、`cydia://`、`fork()`、`stat`/`access` 路径探测、`canOpenURL`、环境变量、`dyld` 镜像扫描、调试器附加检测。

| 结论 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|
| 存在检测逻辑 | 字符串 + 调用点交叉确认 | 检测方法类别、所在类/函数 | 需要越狱设备验证 |
| 检测覆盖不完整 | 静态列出检测项，与已知绕过面对比 | 缺失的检测类别 | 需要实际绕过 |
| 检测可被触发 | 只在授权测试设备观察日志 | 触发条件与提示行为 | 需要修改设备或注入 |

只记录“检测是否存在、覆盖哪些面”。不提供越狱、绕过检测、隐藏注入的步骤。若必须越狱才能继续，停止并交技术指导。

## 6. Swift / Objective-C 符号恢复

```bash
BIN="$APP/$(basename "$APP" .app)"

# Objective-C 类/方法（仅对未加密或有符号的二进制有效）
class-dump -H -o headers "$BIN" 2>&1 | sed -n '1,20p'

# Mach-O 符号与 Swift 还原
nm -nm "$BIN" 2>/dev/null | sed -n '1,40p'
nm -gU "$BIN" 2>/dev/null | awk '{print $3}' | xcrun swift-demangle | sed -n '1,60p'

# 字符串与协议/类名线索
strings -a -n 6 "$BIN" | grep -E '^_?_?\$s|^_Tt|^_OBJC_CLASS_' | head -40
```

| 目标 | 方法 | 证据 | 局限 |
|---|---|---|---|
| Objective-C 类 | `class-dump`、`otool -ov` | 类名、方法签名、属性 | 加密/剥离符号时失效 |
| Swift 类/方法 | `swift-demangle`、`nm`、`strings` | demangle 后的类型与方法名 | 泛型/闭包/内联会丢失 |
| 协议与 witness table | `nm`、Ghidra/Hopper 交叉引用 | 协议名、实现关系 | 需要二进制分析经验 |
| 字符串常量 | `strings`、`otool -v -s __TEXT __cstring` | 常量类别与地址 | 可能被加密或拆分 |
| 调用关系 | Hopper/Ghidra/IDA 交叉引用 | 调用图与关键分支 | 反编译结果需动态印证 |

Swift 的符号通常以 `$s` 或 `_$s` 开头，`class-dump` 对纯 Swift 类支持有限。先用 `swift-demangle` 还原可读名，再回到反汇编确认调用关系。符号恢复只用于理解逻辑，不用于构造利用链。

## 7. 动态观察边界（Simulator）

```bash
# 启动已安装的测试构建（仅限 Simulator 与授权构建）
xcrun simctl launch booted <bundle-id>

# 只按进程过滤日志；先确认不会输出真实账号数据
xcrun simctl spawn booted log stream --level debug --predicate 'process == "<AppName>"'
```

| 检查点 | 怎么验证 | 证据 | 停止条件 |
|---|---|---|---|
| 启动行为 | Simulator 启动测试构建 | 启动成功/失败、崩溃日志 | 崩溃涉及真实数据 |
| 网络请求 | 仅观察测试账号的请求类别；不导入信任锚 | 协议、端点类别、TLS 是否启用 | 需要绕过固定或抓取真实会话 |
| 本地写入 | 运行前后对比测试容器文件列表 | 新增文件类别与路径 | 新增文件含真实 PII |
| 日志泄露 | 只记录字段类别与脱敏片段 | 日志位置、字段类别 | 出现完整手机号/身份证号 |
| 后台快照 | 测试页面进入后台后查看快照目录 | 是否存在、是否含敏感内容 | 需要读取真实用户快照 |

Simulator 没有 Secure Enclave、真实 Keychain 硬件保护、真实推送环境和多数越狱检测。Simulator 上的“未发现问题”不能推出真机安全。

## 8. 证据模板

```text
资产：<授权编号> / <bundle id> / <版本 (构建号)>
构建：<IPA SHA-256> / <签名 Team> / <FairPlay cryptid>
环境：<iPhone 型号> / iOS <版本> / <越狱状态> 或 <Simulator 型号与运行时>
工具：codesign <版本> / otool <版本> / class-dump <版本> / jadx 不适用
观察：<Info.plist 键或存储项> = <脱敏值>
方法：静态读取 <文件>；Simulator 仅启动测试构建
结论：已确认 / 待复核 / 未验证
停止点：<是否因 FairPlay、越狱检测、需导出真实数据而未继续>
```

## 9. 常见误判

- IPA 里有 `embedded.mobileprovision` 不等于可调试；要看 `get-task-allow` 与签名。
- `cryptid=0` 只说明该切片未加密，不代表有符号或可读。
- ATS 例外存在，不代表实际请求走了例外域。
- Keychain 里“有数据”不等于“可被其他 App 读取”；access group 与 entitlement 决定边界。
- Simulator 容器可读，不等于真机沙箱可读。
- 重签名成功不等于功能可用；推送、Keychain、App Group 往往一起失效。

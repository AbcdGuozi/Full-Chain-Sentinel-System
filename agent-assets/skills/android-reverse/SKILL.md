---
name: android-reverse
description: "Android APK/AAB 解包、反编译、smali 修改、重打包与 native 分析路径。"
---

# Android APK 逆向审阅

适用：已授权的 APK/AAB 产物、测试设备或模拟器。默认只做静态审阅与只读元数据查询；不重打包、不篡改、不安装来路不明的包、不 root 设备。

上级边界：[non-destructive-testing.md](../non-destructive-testing.md)。本文命令中的输出目录均为新建目录，不使用 `-f` 覆盖已有文件。

## 1. 先建立不可变基线

```bash
umask 077
mkdir -p work/android && cd work/android
shasum -a 256 target.apk | tee apk.sha256
unzip -l target.apk | sed -n '1,60p'
aapt2 dump badging target.apk | sed -n '1,25p'
```

| 要确认 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|
| 包身份 | `aapt2 dump badging` 的 `package:` 行 | 包名、versionCode、versionName、min/targetSdk | 包名与授权资产不一致 |
| 文件完整性 | SHA-256 前后两次一致 | 哈希、文件大小、采集时间 | 哈希变化但无法解释 |
| 是否为拆分包 | 检查 `split`、`base.apk`、`config.*.apk` | 分包列表与 ABI/密度 | 缺少 base 或关键 split |
| 是否 AAB | 输入为 `.aab` 时不能直接按 APK 处理 | 用 bundletool 生成的测试产物及版本 | 只有商店分发的未知构建 |

AAB 不是直接安装单元。若授权范围是 AAB，先记录 `bundletool` 版本与生成参数，再对其产出的 APK 集做静态分析；不要用来源不明的“通用 APK”替代。

## 2. APK 结构与只读解包

| 路径 | 内容 | 审阅价值 |
|---|---|---|
| `AndroidManifest.xml` | 编译后的二进制 Manifest | 组件、权限、SDK、备份/调试/网络安全配置 |
| `classes*.dex` | Dalvik 字节码，可能多 dex | 业务逻辑、硬编码、第三方 SDK |
| `res/` | 编译资源 | 字符串、XML 配置、图片中的信息 |
| `resources.arsc` | 资源索引 | 字符串与配置映射 |
| `assets/` | 原样打包资源 | 配置、证书、模型、H5、密钥材料 |
| `lib/<abi>/` | 原生库 | 加壳、加密、协议、反调试 |
| `META-INF/` | v1 签名与摘要 | 签名方案与证书 |
| `kotlin/`、`okhttp3/` 等 | 第三方库元数据 | 依赖与版本，可用于已知问题比对 |

```bash
# 反编译资源与 Manifest（输出到新目录）
apktool d -o apk_out target.apk

# 反编译 dex 为 Java 近似源码；--no-res 只处理代码
jadx -d jadx_out --no-res target.apk

# 只读查看关键 XML
xmllint --format apk_out/AndroidManifest.xml | sed -n '1,160p'
```

`apktool` 与 `jadx` 的输出是“近似还原”，不是原始源码。变量名、行号、控制流可能失真；结论要回到 smali 或字节码核对。

验证：同一可疑点至少在 Manifest/资源与代码两处交叉确认。
证据：反编译工具版本、输出路径、类名/方法名/资源 ID。
什么时候停：反编译产物包含真实用户数据或生产密钥时，停止扩散，仅保留定位信息。

## 3. Manifest 关键项

先格式化，再逐项核对。下面命令只读：

```bash
grep -nE 'android:(exported|debuggable|allowBackup|usesCleartextTraffic|networkSecurityConfig|grantUriPermissions|protectionLevel)' \
  apk_out/AndroidManifest.xml
```

| 关键项 | 风险含义 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|---|
| `android:exported` | 组件可被其他应用调用；Android 12+ 含 intent-filter 的组件必须显式声明 | 列出所有 `exported="true"` 的 Activity/Service/Receiver/Provider，并关联 `intent-filter` | 组件名、类型、权限、filter 的 action/category/data | 需要实际调用才能判断且会改变状态 |
| `intent-filter` | 定义外部可达入口与隐式跳转 | 检查 action、category、`data` scheme/host/path | filter 摘要与所在组件 | 需要构造恶意 Intent 或触发业务操作 |
| `android:allowBackup` | 允许 adb/云备份带走应用数据 | 读取 application 属性与 `backupAgent`、`fullBackupContent`、`dataExtractionRules` | 布尔值、规则文件、排除项 | 需要执行备份/恢复 |
| `android:debuggable` | 可调试构建，攻击者可附加调试器 | 读取 application 属性；再用 `dumpsys package` 交叉确认 | 布尔值、构建类型、签名 | 需要在生产包上附加调试器 |
| `networkSecurityConfig` | 自定义信任锚、明文策略、证书固定 | 读取属性指向的 `res/xml/*.xml`，检查 `trust-anchors`、`cleartextTrafficPermitted`、`pin-set` | 配置文件路径、域类别、是否含用户 CA | 需要导入 CA 或绕过固定 |
| `usesCleartextTraffic` | 允许 HTTP 明文 | 读取 application 属性；targetSdk 28+ 默认 false | 布尔值、实际端点协议 | 需要抓取真实明文流量 |
| `grantUriPermissions` + Provider | 可授予临时 URI 访问 | 检查 Provider 的 `exported`、`authorities`、`path-permission` | authority、路径规则、权限 | 需要访问真实文件或目录穿越 |
| 自定义权限 `protectionLevel` | 权限是否可被第三方申请 | 检查 `permission` 声明与 `uses-permission` | 权限名、级别、所属包 | 需要提权或静默授权 |

补充检查：

```bash
# 已安装包的只读元数据（需已连接授权测试设备）
adb shell pm list packages | grep -i <package-fragment>
adb shell dumpsys package <package> | sed -n '1,120p'

# 查看导出的组件（不同系统版本输出字段可能不同）
adb shell dumpsys package <package> | grep -nE 'exported|permission|authority'
```

不要用 `am start`、`am broadcast`、`content query` 逐个探测导出组件。静态清单只能证明“声明可导出”，不能证明“可被滥用”；需要动态验证时，必须使用专用测试构建、合成数据，并由技术指导逐项批准。

## 4. 签名与完整性

```bash
apksigner verify --verbose --print-certs target.apk
keytool -printcert -jarfile target.apk
```

`keytool` 只能读取 v1 签名；v2/v3-only 包以 `apksigner` 输出为准。

| 检查点 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|
| 签名方案 | `apksigner verify --verbose` 的 v1/v2/v3/v4 行 | 方案组合、是否通过 | 校验失败但包仍在使用 |
| 证书身份 | `--print-certs` 的 DN、SHA-256、有效期 | 证书摘要与有效期 | 证书为公开测试证书或已过期 |
| 调试证书 | DN 含 `Android Debug`、CN 为 `androiddebugkey` | 证书 DN + 哈希 | 生产包使用调试签名 |
| 证书轮换 | v3 的 lineage 信息 | 新旧证书摘要 | 轮换链无法解释 |
| 重打包迹象 | 签名与官方渠道不一致；`META-INF` 多套残留 | 官方渠道包哈希 + 本地包哈希 | 需要重签才能继续 |
| 应用自校验 | 搜索 `GET_SIGNATURES`、`GET_SIGNING_CERTIFICATES`、`signatures`、`MessageDigest` 的调用点 | 校验位置、比较对象、失败行为 | 需要绕过校验 |

结论写法：区分“签名自校验缺失”（代码未校验签名）与“包被篡改”（哈希/签名不一致）。前者是设计问题，后者是供应链事件，处理路径不同。

## 5. 加固与混淆识别

只做识别，不做脱壳。先看结构，再看行为。

```bash
# 原生库与体积
unzip -l target.apk | grep -E 'lib/|assets/' | sed -n '1,80p'

# dex 数量与异常命名
unzip -l target.apk | grep -E 'classes[0-9]*\.dex'

# 常见加固/壳特征（仅字符串匹配，可能误报）
unzip -p target.apk classes.dex | strings -a -n 8 | \
  grep -Ei 'jiagu|packer|stub|bangcle|ijiami|secneo|nagain|tencent|qihoo|baidu' | head -30
```

| 现象 | 可能含义 | 验证方式 | 证据 | 停止条件 |
|---|---|---|---|---|
| `classes.dex` 很小、`assets/` 有大二进制 | 壳或动态加载 | 对比 dex 数量、assets 熵、Application 类 | 文件清单与大小 | 需要脱壳 |
| `lib/*/libjiagu*`、`libshella*` 等 | 常见加固 | 库名、导出符号、加载顺序 | 库名与加载链 | 需要绕过完整性校验 |
| 类名大量 `a.a.a`、单字母包 | 混淆（R8/ProGuard） | 映射文件是否随包提供 | 混淆程度与保留类 | 需要还原业务语义才能定性 |
| 运行时才出现的 dex/so | 动态加载 | 静态清单 + 只读进程映射 | 加载路径与哈希 | 需要 dump 内存 |
| 反调试字符串/端口检测 | 运行时防护 | 字符串与导入表；必要时观察日志 | 检测点类别 | 需要隐蔽对抗 |

加固识别只回答“是否加固、可能哪一类、对审阅有什么影响”。不提供脱壳、内存 dump、绕过检测的步骤。若加固导致无法静态确认，结论写“未验证”，不要猜测。

## 6. 常见硬编码位置

按命中率排序，先定位再判断：

| 位置 | 怎么找 | 证据 | 什么时候停 |
|---|---|---|---|
| `res/values/strings.xml` | `apktool` 输出中搜索 `key`、`secret`、`token`、`url` | 资源名、值类别、是否明文 | 出现真实密钥/令牌 |
| `assets/` 配置 | `find apk_out/assets -type f`，按扩展名与体积筛选 | 文件路径、键名、是否加密 | 需要解密生产配置 |
| `BuildConfig` | jadx 中搜索 `BuildConfig`、`API_KEY` | 字段名与构建类型 | 值为生产凭据 |
| dex 字符串 | `strings` 统计命中，不直接打印全部 | 类名、命中类别、计数 | 命中真实 PII |
| 原生库 | `strings lib*.so` 搜索 URL、算法名、私钥头 | 库名、偏移、字符串类别 | 需要逆向算法才能继续 |
| `google-services.json` | 检查是否随包分发 | 项目编号类别、API key 是否存在 | 需要调用云端接口 |
| 网络配置 | `res/xml/network_security_config.xml` | 域名类别、信任锚、pin | 需要导入 CA |

安全搜索方式：先统计，再在隔离目录查看单条命中，报告只写类别与脱敏片段。

```bash
# 只统计命中数量和类别，不把潜在秘密直接打到终端历史
unzip -p target.apk classes.dex | strings -a -n 8 | \
  grep -Eic 'password|passwd|secret|api[_-]?key|access[_-]?token|jdbc:|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY'
```

不要把 `strings` 全量输出贴进报告。命中后按“文件/类 → 键名 → 是否明文 → 是否可用于生产”四列记录；值本身不落报告。

## 7. 资源与 WebView 补充

| 检查点 | 怎么验证 | 证据 | 停止条件 |
|---|---|---|---|
| `WebView` 调试开关 | 搜索 `setWebContentsDebuggingEnabled`、`WebView.setWebContentsDebuggingEnabled` | 调用点与 Build 条件 | 需要在生产包开启调试 |
| `addJavascriptInterface` | 搜索调用点与接口注解 | 接口名、暴露方法、调用来源 | 需要实际调用桥接方法 |
| `setAllowFileAccess` / `setAllowUniversalAccessFromFileURLs` | 搜索设置调用 | 布尔值与加载来源 | 需要加载真实本地文件 |
| 深度链接 | Manifest 的 `VIEW` + `BROWSABLE` + scheme/host | scheme/host/path 与参数处理类 | 需要构造真实跳转 |
| 备份规则 | `fullBackupContent` / `dataExtractionRules` | 包含/排除路径 | 需要执行备份 |

## 8. 证据模板

```text
资产：<授权编号> / <包名> / <versionName> (<versionCode>)
构建：<SHA-256> / <签名证书 SHA-256>
环境：<设备型号> / Android <版本> / <root 状态> / <模拟器或真机>
工具：apktool <版本> / jadx <版本> / aapt2 <版本>
观察：<组件或配置项> = <脱敏值>
方法：静态读取 <文件>:<行/偏移>；未运行目标
结论：已确认 / 待复核 / 未验证
停止点：<是否因需动态调用/需绕过保护而未继续>
```

## 9. 常见误判

- `exported="true"` 不等于漏洞：还要看是否受权限保护、是否处理敏感数据、是否可被第三方触发。
- `allowBackup="true"` 不等于可导出：云备份、设备加密、备份规则都会影响。
- 混淆不等于加固：R8 只改名字，不隐藏 dex 结构。
- `usesCleartextTraffic="false"` 不保证所有流量都加密：WebView、原生库、第三方 SDK 可能各自配置。
- 证书固定配置存在，不代表运行时一定执行；需要运行时观察才能确认，但观察不等于绕过。

---
name: harmony-next
description: "鸿蒙 NEXT HAP/HSP 包结构、ArkTS 字节码、Ability 与 hdc 只读分析。"
---

# 鸿蒙 NEXT（HAP/HSP）逆向审阅

适用：已授权的 HarmonyOS NEXT 应用包（`.hap`/`.hsp`/`.app`）与专用测试设备。默认只做静态解析与 `hdc` 只读查询；不安装来路不明的包、不修改系统、不读取应用沙箱中的真实数据。

上级边界：[non-destructive-testing.md](../non-destructive-testing.md)。鸿蒙工具链迭代快，本文命令以**本机 SDK 的实际帮助输出**为准；无法确认版本的结论标为“未验证”。

## 1. 包结构

| 层级 | 文件/目录 | 内容 | 审阅价值 |
|---|---|---|---|
| App Pack | `*.app` | 一个应用的分发包，含多个 HAP/HSP 与 `pack.info` | 整体版本、模块组成 |
| HAP | `entry.hap` / `feature.hap` | 应用模块，含代码、资源、配置 | 入口与功能模块 |
| HSP | `shared.hsp` | 动态共享包，提供共享代码/资源 | 依赖关系、共享库暴露 |
| 配置 | `module.json` | 由 `module.json5` 编译而来 | Ability、权限、导出、设备类型 |
| 应用级配置 | `app.json`（App Pack 根目录；单 HAP 可能不含） | 由 `AppScope/app.json5` 编译而来 | bundleName、版本、debug 标志、API 版本 |
| 字节码 | `ets/modules.abc` | ArkTS 编译产物 | 业务逻辑、字符串、类/方法名 |
| 原生库 | `libs/<abi>/*.so` | C/C++ 库 | 加密、协议、加固 |
| 资源 | `resources.index`、`resources/`、`rawfile/` | 资源索引与原样文件 | 配置、证书、H5、文案 |
| 签名 | `META-INF/`、签名块 | 签名与摘要 | 完整性与分发来源 |

```bash
umask 077
mkdir -p work/harmony && cd work/harmony
shasum -a 256 target.hap | tee hap.sha256
unzip -l target.hap | sed -n '1,80p'
unzip -q target.hap -d hap_out

# module.json 通常是 JSON 文本；不同 SDK 可能压缩/编码，先看文件类型
file hap_out/module.json
python3 -m json.tool hap_out/module.json | sed -n '1,160p'
```

| 要确认 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|
| 包身份 | `app.json` 的 `bundleName`、`versionCode`、`versionName` | bundle、版本、API 版本 | 与授权资产不一致 |
| 模块类型 | `module.json` 的 `type`（`entry`/`feature`/`shared`） | 模块名、类型、依赖 | 缺少 entry 或依赖不明 |
| 是否 debug 构建 | `app.json` 的 `debug` 字段与签名类型 | 布尔值、签名来源 | 生产包使用 debug |
| 是否含原生库 | `libs/` 列表与 ABI | 库名、架构 | 需要反汇编原生库 |
| 是否含 H5/配置 | `resources/rawfile/` 列表 | 文件类别与路径 | 包含真实令牌 |

`.app` 是分发容器，不是单个 HAP。若输入是 `.app`，先列出内部 HAP/HSP，再分别分析；不要假设所有模块共享同一签名与权限。

## 2. 签名与完整性

```bash
# 找到本机 SDK 中的签名工具（路径随 DevEco Studio 版本变化）
: "${DEVECO_SDK:?请先设置 DevEco SDK 路径}"
find "$DEVECO_SDK" -name 'hap-sign-tool.jar' -maxdepth 8 2>/dev/null | head

# 校验签名并导出证书链/Profile（输出到本地工作目录）
java -jar hap-sign-tool.jar verify-app \
  -inFile target.hap \
  -outCertChain verify.cer \
  -outProfile verify.p7b
```

| 检查点 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|
| 签名是否有效 | `verify-app` 返回码与输出 | 成功/失败、错误类别 | 校验失败但包已安装 |
| 证书主体 | 导出的 `verify.cer` 用 `keytool -printcert -file` 查看 | 颁发者、有效期、证书 SHA-256 | 证书过期/自签且无解释 |
| Profile 范围 | `verify.p7b` 中的 bundle-name、distribution-type、validity、ACL | 分发类型、有效期、受限权限类别 | Profile 与包不匹配 |
| 调试标志 | `app.json` 的 `debug` + Profile 的调试类型 | 是否可调试 | 需要调试生产签名包 |
| 一致性 | 官方渠道包与本地包哈希/签名对比 | 两个哈希与证书摘要 | 无法解释的差异 |

鸿蒙应用市场上的包可能由市场重新签名，开发者证书与安装包证书不一定相同。判断“是否官方分发”要结合来源、证书链和 Profile，而不是只看证书 CN。签名校验只读；重签、改 Profile、改 ACL 均不在本文范围。

## 3. module.json / app.json 关键项

先确认字段名。不同 API 版本的 schema 可能新增或调整字段，以下为常见项：

| 字段 | 位置 | 风险含义 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|---|---|
| `bundleName` | `app.json` | 应用唯一标识 | JSON 读取 | 值 | 与授权不符 |
| `versionCode`/`versionName` | `app.json` | 版本基线 | JSON 读取 | 值 | 版本不可追溯 |
| `debug` | `app.json` | 可调试构建 | JSON 读取 + 签名 | 布尔值 | 生产包为 true |
| `minAPIVersion`/`targetAPIVersion` | `app.json` | 兼容范围 | JSON 读取 | API 值 | 与设备不符 |
| `abilities[].exported` | `module.json` | Ability 可被其他应用拉起 | 列出所有 `exported: true` | Ability 名、类型 | 需要实际拉起 |
| `abilities[].skills` | `module.json` | 外部可达的 Want 匹配规则 | 查看 `actions`、`entities`、`uris` | action/entity/scheme/host | 需要构造真实 Want |
| `extensionAbilities[].exported` | `module.json` | 扩展 Ability 对外暴露 | 列出类型（`form`、`service`、`dataShare`、`fileShare` 等） | 类型、名称、权限 | 需要访问真实数据 |
| `requestPermissions` | `module.json` | 申请的系统/用户授权 | 列出 `name`、`reason`、`usedScene` | 权限名、授权类型、使用场景 | 需要触发真实授权 |
| `dependencies` | `module.json` | 模块/HSP 依赖 | 列出依赖模块名 | 依赖图 | 依赖来源不明 |
| `metadata` | `module.json` | 扩展配置（卡片、快捷方式等） | 查看键名与资源引用 | 键名、资源路径 | 需要实际调用扩展 |

```bash
# 列出导出能力与权限（字段名以本机 schema 为准）
python3 - <<'PY'
import json
m = json.load(open('hap_out/module.json'))
print('module:', m.get('name'), m.get('type'))
for a in m.get('abilities', []):
    print('ability:', a.get('name'), 'exported=', a.get('exported'), 'skills=', a.get('skills'))
for e in m.get('extensionAbilities', []):
    print('extension:', e.get('name'), 'type=', e.get('type'), 'exported=', e.get('exported'))
for p in m.get('requestPermissions', []):
    print('permission:', p.get('name'), 'reason=', bool(p.get('reason')))
PY
```

**静态 `exported: true` 只是暴露面**，不等于可利用。不要用 `aa start` 逐个拉起导出 Ability；需要动态验证时，必须使用专用测试构建、合成数据，并由技术指导逐项批准。带 `dataShare`/`fileShare` 的扩展尤其要确认是否受权限保护，但不要实际读取真实文件。

## 4. 权限与数据存储

### 4.1 权限

| 类型 | 例子 | 怎么验证 | 证据 | 停止条件 |
|---|---|---|---|---|
| system_grant | `ohos.permission.INTERNET` | `requestPermissions` 声明 + 安装时授权 | 权限名、类型 | 需要修改系统授权 |
| user_grant | `ohos.permission.LOCATION`、`ohos.permission.CAMERA` | 声明 + 运行时弹窗逻辑 | 权限名、触发场景 | 需要真实用户授权 |
| 受限/ACL | 通讯录、后台任务等 | Profile 的 `acls` 与权限清单 | ACL 类别、是否获批 | 需要申请受限权限 |
| 跨设备 | 分布式数据/设备协同 | 权限与 `distributedKVStore` 配置 | 是否启用、同步范围 | 需要跨设备访问 |

权限名随 API 版本变化（例如媒体读取权限在不同版本有调整）。以本机 SDK 的 `module.json5` schema 和权限列表为准；不确定时写“权限名待核对”，不要凭记忆断言。

### 4.2 数据存储

| 存储 | 典型位置/接口 | 怎么验证 | 证据 | 什么时候停 |
|---|---|---|---|---|
| Preferences | 应用沙箱 `.../haps/<module>/preferences/` | 静态查看键名与调用点；测试构建内由应用自身导出摘要 | 键名、是否加密、访问级别 | 需要读取真实沙箱 |
| RelationalStore | 沙箱 `.../database/`，SQLite 系 | 静态查看建表语句与字段名 | 表名、字段类别、是否加密 | 需要查询真实记录 |
| 分布式 KV | `distributedKVStore` | 查看同步配置与权限 | 是否跨设备、同步范围 | 需要跨设备验证 |
| 文件 | 沙箱 `files/`、`cache/` | 测试构建内列目录与大小 | 文件类别、路径 | 需要导出文件 |
| 日志 | `hilog` | `hdc shell hilog` 按进程/域过滤；只记类别 | 是否输出凭据/PII | 日志含真实数据 |
| 剪贴板/截图 | 系统能力 | 测试构建下观察 | 是否含敏感内容 | 需要读取真实内容 |

```bash
# 只读设备与日志查询；命令可用性随 SDK 版本变化
hdc list targets
hdc shell param get const.product.model
hdc shell param get const.product.software.version
hdc shell hilog -h

# 已安装包的元数据（先确认 bm 子命令）
hdc shell bm help
hdc shell bm dump -n <bundleName>
```

应用沙箱通常不允许 `hdc shell` 直接读取。不要尝试提权、改目录权限或 `hdc file recv` 整个沙箱。需要验证存储内容时，使用所有者提供的测试构建，让应用自身输出**字段名/长度/是否加密**的摘要，或仅在 Simulator/测试设备上用合成数据观察。

## 5. 与 Android 的差异

| 维度 | Android | HarmonyOS NEXT | 对测试的影响 |
|---|---|---|---|
| 包格式 | APK/AAB，`classes*.dex` | HAP/HSP/App Pack，`modules.abc` | 不能套用 apktool/jadx 流程 |
| 运行时 | ART/Dalvik，Java/Kotlin | ArkCompiler/ArkTS + 原生 | 反编译工具与符号体系不同 |
| 组件模型 | Activity/Service/Receiver/Provider + Intent | Ability/ExtensionAbility + Want | `skills` 对应 `intent-filter`，语义不完全相同 |
| 清单 | `AndroidManifest.xml`（二进制） | `module.json`（JSON）+ `app.json` | 可直接 JSON 解析，但 schema 版本敏感 |
| 权限 | 普通/危险/签名权限 | system_grant/user_grant + ACL | 受限权限需 Profile ACL |
| 签名 | v1/v2/v3，apksigner | HAP 签名、证书链 + Profile | 工具体系不同，市场可能重签 |
| 调试 | adb、debuggable | hdc、debug 标志、调试签名 | 命令与权限模型不同 |
| 生态 | GMS 可选 | 无 GMS，AppGallery | 第三方 SDK 与推送差异 |
| 数据 | SharedPreferences/SQLite | Preferences/RelationalStore/分布式 KV | 分布式同步是额外暴露面 |
| 逆向工具 | apktool/jadx/Frida | DevEco、`ark_disasm`、hdc；Frida 支持有限 | 工具成熟度低，结论更依赖静态证据 |

不要因为“都是移动端”就把 Android 的 Manifest 检查表直接套到 HAP。`exported`、`skills`、`requestPermissions` 的默认值和匹配规则要以鸿蒙文档与本机 schema 为准。

## 6. 字节码与符号

```bash
# 先看 abc 中的可读字符串与模块名（只读）
strings -a -n 6 hap_out/ets/modules.abc | sed -n '1,80p'

# 若 SDK 提供 ark_disasm，可反汇编为文本；路径与参数随版本变化
find "$DEVECO_SDK" -name 'ark_disasm' -type f 2>/dev/null | head
# ark_disasm <input.abc> <output.txt>
```

| 目标 | 方法 | 证据 | 局限 |
|---|---|---|---|
| 模块/类名 | `strings`、`ark_disasm` | 模块名、类名、方法名 | 可能被混淆/裁剪 |
| 字符串常量 | `strings`、资源文件 | 常量类别与位置 | 可能加密或拆分 |
| 控制流 | `ark_disasm` + 手工分析 | 调用关系与分支 | 反编译成熟度低，耗时长 |
| 原生逻辑 | `strings`、Ghidra/IDA | 库名、导出符号、调用点 | 需要 ABI 与加载知识 |
| 资源引用 | `resources.index`、`rawfile/` | 资源 ID 与文件 | 编译后 ID 需映射 |

ArkTS 的 `.abc` 不是 JVM 字节码，`jadx` 不适用。当前公开的反编译/反混淆工具成熟度低于 Android，很多结论只能到“字符串/调用点/配置”级别。无法还原时标“未验证”，不要用猜测补全业务逻辑。

## 7. 工具链现状与版本时效

| 工具 | 用途 | 版本敏感点 | 验证方式 |
|---|---|---|---|
| DevEco Studio | 构建、签名、调试、查看 module.json5 | 与 SDK/API 版本绑定 | 记录 IDE 版本与 SDK 路径 |
| `hdc` | 设备连接、shell、日志、安装 | 子命令随版本变化 | `hdc -v`、`hdc shell bm help`、`hdc shell aa help` |
| `hap-sign-tool.jar` | 签名/验签 | 参数与 JDK 版本相关 | `java -jar hap-sign-tool.jar -h` |
| `ark_disasm` | `.abc` 反汇编 | 随 ArkCompiler 版本变化 | 先在小样本上确认输出 |
| Frida | 运行时观察 | 鸿蒙支持有限，常需特定构建/设备 | 先确认目标进程与注入可行性 |

截至 2026-10，HarmonyOS NEXT 的 API、DevEco Studio 与签名工具仍在快速迭代。本文不绑定具体 API 号；每次任务开始记录：

```text
DevEco Studio: <版本>
SDK: <路径与 API 版本>
hdc: <hdc -v>
设备: <型号> / <系统版本> / <开发者模式状态>
包: <bundleName> / <versionName> (<versionCode>) / <SHA-256>
```

无法确认的字段或命令，结论写“未验证”，并给出需要所有者提供的最小信息（例如 SDK 版本、测试构建、Profile 类型）。

## 8. 证据模板与停止条件

```text
资产：<授权编号> / <bundleName> / <版本 (versionCode)>
构建：<HAP SHA-256> / <证书 SHA-256> / <Profile 分发类型>
环境：<设备型号> / HarmonyOS <版本> / <API 版本> / <debug 或 release>
工具：DevEco <版本> / hdc <版本> / hap-sign-tool <版本>
观察：<exported Ability 或权限或存储项> = <脱敏值>
方法：静态读取 module.json/app.json；hdc 仅查询元数据
结论：已确认 / 待复核 / 未验证
停止点：<是否因需要拉起 Ability、读取沙箱、跨设备访问而未继续>
```

立即停止：

- 需要安装非授权包、改系统配置、提权或读取应用沙箱。
- 需要真实账号、真实 PII、生产分布式数据。
- 需要重签、改 Profile/ACL、绕过应用市场完整性校验。
- 工具版本无法确认，却要据此给出“可利用”结论。
- 需要跨设备协同/分布式数据实际访问才能继续。

## 9. 常见误判

- `exported: true` 不等于无权限保护；还要看 `skills` 匹配条件、权限与参数校验。
- HAP 里的 `module.json` 可读，不等于 `module.json5` 原文可读；编译期会做字段归一化。
- 市场分发包的证书与开发者证书不同，不能仅凭 CN 判断伪造。
- `debug: false` 不代表没有调试接口；原生库和测试后门仍需单独确认。
- Preferences/RelationalStore 在沙箱内，不等于其他应用可读；跨应用访问要看 Extension 与权限。
- 分布式 KV 启用不等于数据自动同步到所有设备；还要看同步策略、权限与账号边界。

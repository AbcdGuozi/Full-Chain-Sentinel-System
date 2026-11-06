---
name: frida-methodology
description: "Frida 运行时观察方法论：注入点选择、Hook 设计、SSL Pinning 与证据留存。"
---

# Frida 运行时观察方法论

适用：运行在专用测试设备或测试构建上的应用。Frida 会向目标进程注入代码、改变内存中的方法实现，属于**注入型动态分析**，不是默认步骤。默认先做静态审阅；只有静态无法回答“运行时是否调用、参数规模、校验点在哪里”时才进入本文。

上级边界：[non-destructive-testing.md](../non-destructive-testing.md)。本文只提供**观察型**脚本：记录调用、长度、指纹与回溯，不修改返回值、不替换业务逻辑、不隐藏注入痕迹。

## 1. 工作原理

| 组件 | 作用 | 对证据的影响 |
|---|---|---|
| `frida-server` | 运行在测试设备上的注入服务，通常经 USB 连接 | 需要设备 root 或调试权限；会留下进程/端口痕迹 |
| `frida-gadget` | 嵌入测试构建的注入库，无需 root | 需要重打包或由构建方集成，改变签名 |
| Agent (JS) | 在目标进程内由 GumJS 执行 | 脚本本身可被应用检测；异常会导致进程崩溃 |
| `Interceptor` | 替换函数入口/出口，执行回调 | 观察型实现应原样调用原函数并返回原结果 |
| `Java` / `ObjC` bridge | 枚举类、方法、实例，调用原方法 | 受混淆、类加载器、Swift/OC 运行时影响 |
| `Stalker` | 指令级跟踪 | 开销大，易触发超时/崩溃，默认不用 |
| `send()` | 把事件传回宿主 | 只传摘要，不传明文秘密 |

验证：`frida --version` 与设备端 `frida-server --version` 主版本一致；`frida-ps -Uai` 能看到目标包。
证据：Frida 版本、脚本 SHA-256、设备型号/系统、目标包版本、启动方式（attach/spawn）。
什么时候停：无法确认测试设备归属、需要注入生产进程、需要绕过完整性/反调试才能加载。

## 2. 风险控制

必须同时满足：

- 使用专用测试账号与合成数据；不使用真实患者、客户或员工数据。
- 应用所有者知晓注入可能导致崩溃、卡顿、日志异常和完整性告警。
- 不修改返回值、不伪造认证、不绕过证书固定、不导出密钥或数据库。

风险与对应控制：

| 风险 | 表现 | 控制 |
|---|---|---|
| 进程崩溃 | App 启动即退出、白屏 | 先只加载空脚本；逐段启用 hook |
| 被应用检测 | 提示“环境异常”、主动退出 | 记录检测点；不实现隐藏/对抗，改用测试构建 |
| 数据泄露到宿主 | `send()` 把明文密码/PII 传到终端或日志 | 只传长度、字段名、FNV 指纹；不传原文 |
| 改变业务行为 | hook 实现未正确调用原函数 | 观察型模板必须 `return this.original(...)` |
| 合规问题 | 注入生产包、绕过保护、抓取第三方数据 | 立即停止并上报 |

脚本注入不是“隐身”的。应用可能检查 `/proc/self/maps`、线程名（`gmain`、`gum-js-loop`）、默认端口 27042、`frida-server` 进程名、`ptrace` 状态或调试属性。发现检测时，正确动作是记录检测类别并停止，不是加更多隐藏插件。

## 3. attach 与 spawn

```bash
# 列出可附加的应用（USB 设备）
frida-ps -Uai

# attach 到已运行进程（按名称或 PID）
frida -U -n "<AppName>" -l observe.js
frida -U -p <pid> -l observe.js

# spawn：从进程启动前加载脚本，适合早于 Application 初始化的 hook
frida -U -f <bundle-id> -l observe.js --no-pause

# 如果当前 CLI 不支持 --no-pause，去掉该参数，在 REPL 中执行 %resume
```

| 模式 | 适用 | 证据 | 停止条件 |
|---|---|---|---|
| attach | 应用已启动、只需观察稳定期调用 | 进程启动时间、attach 时间、PID | 进程已是生产会话且含真实数据 |
| spawn | 需要在类加载/SSL 初始化前 hook | spawn 参数、脚本加载顺序 | spawn 导致启动崩溃且无法定位 |
| gadget | 无 root 的测试构建 | 构建方集成说明、签名变化 | 需要自行重签生产包 |

spawn 模式下，脚本在 `Java.perform` 中注册 hook；如果目标使用多进程或 isolated process，主进程的 hook 不会覆盖子进程。先确认实际处理业务的进程，再决定是否附加。

## 4. 三个最小观察脚本

以下脚本可直接保存为 `.js`，用 `frida -U -f <bundle-id> -l <script>.js` 加载。脚本只读：不修改返回值，不写文件，不发网络请求。

### 4.1 枚举模块与导出符号

```js
// frida-modules.js — 只读枚举模块/导出，按关键字过滤
'use strict';

const KEYWORDS = ['ssl', 'crypto', 'sqlite', 'flutter', 'hermes', 'react'];

function emit(event, extra) {
  send(Object.assign({ event: event, ts: Date.now() }, extra || {}));
}

try {
  const modules = Process.enumerateModules();
  emit('modules_total', { count: modules.length });

  for (const m of modules) {
    const lower = m.name.toLowerCase();
    if (!KEYWORDS.some(function (k) { return lower.includes(k); })) continue;

    emit('module', {
      name: m.name,
      base: m.base.toString(),
      size: m.size,
      path: m.path
    });

    try {
      const exports = Module.enumerateExports(m.name);
      for (const e of exports.slice(0, 300)) {
        emit('export', {
          module: m.name,
          name: e.name,
          type: e.type,
          address: e.address.toString()
        });
      }
    } catch (err) {
      emit('export_error', { module: m.name, message: String(err) });
    }
  }
} catch (err) {
  emit('fatal', { message: String(err) });
}
```

用途：确认 TLS/加密/数据库/跨平台运行时由哪个库实现，为后续 hook 选点。`slice(0, 300)` 防止一次输出过大；需要更多时按关键字缩小范围，不要全量导出。

### 4.2 观察加解密调用（Java）

```js
// frida-crypto-observe.js — 只记录算法、长度与内容指纹，不记录明文
'use strict';

function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= (bytes[i] & 0xff);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

if (typeof Java === 'undefined' || !Java.available) {
  send({ event: 'skip', reason: 'Java bridge unavailable' });
} else {
  Java.perform(function () {
    const Cipher = Java.use('javax.crypto.Cipher');

    Cipher.doFinal.overload('[B').implementation = function (input) {
      const output = this.doFinal(input);
      send({
        event: 'cipher_doFinal',
        algorithm: this.getAlgorithm(),
        inputLen: input.length,
        inputFnv: fnv1a(input),
        outputLen: output.length,
        outputFnv: fnv1a(output)
      });
      return output;
    };

    const MessageDigest = Java.use('java.security.MessageDigest');
    MessageDigest.digest.overload('[B').implementation = function (input) {
      const output = this.digest(input);
      send({
        event: 'digest',
        algorithm: this.getAlgorithm(),
        inputLen: input.length,
        inputFnv: fnv1a(input),
        outputLen: output.length
      });
      return output;
    };

    send({
      event: 'ready',
      hooks: ['Cipher.doFinal([B)', 'MessageDigest.digest([B)']
    });
  });
}
```

用途：判断业务是否在本地做加密/摘要、调用频率、输入输出规模，以及同一明文是否被重复处理。指纹只用于**同一会话内比对**，不是密码学哈希，不能还原内容。若必须看字符串参数，只在合成数据下临时打印，并在证据中脱敏；不要把真实账号、令牌传回宿主。

补充：`Cipher.doFinal` 还有 `([B, int, int)` 等重载；需要覆盖时按 `Cipher.doFinal.overloads` 逐个注册，保持“调用原方法并返回原结果”。

### 4.3 观察 TLS 校验是否被调用（不绕过）

```js
// frida-tls-observe.js — 记录校验调用；不改变信任结果
'use strict';

function emit(payload) {
  send(Object.assign({ event: 'tls', ts: Date.now() }, payload));
}

if (typeof Java !== 'undefined' && Java.available) {
  Java.perform(function () {
    try {
      const SSLContext = Java.use('javax.net.ssl.SSLContext');
      SSLContext.init.overload(
        '[Ljavax.net.ssl.KeyManager;',
        '[Ljavax.net.ssl.TrustManager;',
        'java.security.SecureRandom'
      ).implementation = function (keyManagers, trustManagers, secureRandom) {
        emit({
          hook: 'SSLContext.init',
          keyManagers: keyManagers ? keyManagers.length : 0,
          trustManagers: trustManagers ? trustManagers.length : 0
        });
        return this.init(keyManagers, trustManagers, secureRandom);
      };
    } catch (err) {
      emit({ hook: 'SSLContext.init', error: String(err) });
    }

    try {
      const Pinner = Java.use('okhttp3.CertificatePinner');
      Pinner.check.overloads.forEach(function (overload) {
        overload.implementation = function () {
          const args = Array.prototype.slice.call(arguments);
          emit({
            hook: 'CertificatePinner.check',
            argc: args.length,
            argTypes: overload.argumentTypes.map(function (t) { return t.className; })
          });
          return overload.call(this, ...args);
        };
      });
    } catch (err) {
      emit({ hook: 'CertificatePinner.check', error: String(err) });
    }
  });
}

if (typeof ObjC !== 'undefined' && ObjC.available) {
  ['SecTrustEvaluateWithError', 'SecTrustEvaluate'].forEach(function (name) {
    const address = Module.findExportByName('Security', name) ||
      Module.findExportByName(null, name);
    if (!address) {
      emit({ hook: name, error: 'not found' });
      return;
    }
    Interceptor.attach(address, {
      onEnter: function (args) {
        emit({ hook: name, trust: args[0].toString() });
      }
    });
  });
}
```

用途：确认应用是否走到系统信任评估、是否使用 OkHttp `CertificatePinner`。事件出现不等于固定生效，事件缺失也不等于没有固定（可能在原生库或自定义 TrustManager 中实现）。

**本模板不绕过证书固定。** 若观察到固定导致测试抓包失败，正确结论是“存在固定迹象，需静态确认实现”，然后停止；不要替换 `checkServerTrusted` 返回值、不要注入自签 CA、不要改 `SSLContext`。绕过固定会破坏完整性假设，且可能掩盖真实风险。

## 4.4 证书固定的判定与绕过（仅测试构建）

> 前置条件：明确的应用版本、测试账号、非生产数据。只对测试构建执行；绕过成功后只观察流量，不导出业务数据，不修改服务端状态。

**先判定固定类型，再决定脚本。**

| 现象 | 常见实现 | 观察点 |
|---|---|---|
| 只信任内置 CA，安装代理证书后仍失败 | `TrustManager` / `X509TrustManager` 自定义 | `checkServerTrusted` |
| OkHttp 报告 `Certificate pinning failure` | `CertificatePinner` | `okhttp3.CertificatePinner.check` |
| 使用 TrustKit / 自研 pin 配置 | 配置化 pin 集 | `TrustKit` 初始化、`setSSLSocketFactory` |
| 原生网络库（cronet、BoringSSL） | 原生层校验 | `SSL_CTX_set_verify`、`X509_verify_cert` |
| 仅 iOS | `URLSessionDelegate`、`SecTrustEvaluate` | `SecTrustEvaluateWithError` |

**Android：替换应用内 TrustManager（最小实现）。**

```javascript
// 仅用于测试构建；不落盘凭据，不修改业务数据
Java.perform(function () {
  var X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
  var SSLContext = Java.use("javax.net.ssl.SSLContext");
  var TrustManager = Java.registerClass({
    name: "com.hah.agent.TrustAll",
    implements: [X509TrustManager],
    methods: {
      checkClientTrusted: function () {},
      checkServerTrusted: function () {},
      getAcceptedIssuers: function () { return []; }
    }
  });
  var context = SSLContext.getInstance("TLS");
  context.init(null, [TrustManager.$new()], null);
  var factory = context.getSocketFactory();
  var OkHttpClient = Java.use("okhttp3.OkHttpClient");
  OkHttpClient.$init.overload().implementation = function () {
    this.$init();
    this.sslSocketFactory(factory, TrustManager.$new());
    return this;
  };
  console.log("[hah] TrustManager replaced for authorized test build");
});
```

- OkHttp 还需处理 `CertificatePinner.check`：hook 后只记录 `hostname` 与 pin 集，返回空实现即可。
- 原生固定无法用上面的 Java 脚本覆盖，需在 `SSL_CTX_set_verify` 层观察；先记录，再决定是否继续。
- 每次绕过都要记录脚本 SHA-256、目标版本、时间和操作人，作为证据的一部分。

**iOS：只 hook 校验结果，不重建整个 TLS 栈。**

```javascript
if (ObjC.available) {
  var SecTrustEvaluateWithError = Module.findExportByName(null, "SecTrustEvaluateWithError");
  if (SecTrustEvaluateWithError) {
    Interceptor.attach(SecTrustEvaluateWithError, {
      onLeave: function (retval) {
        console.log("[hah] SecTrustEvaluateWithError ->", retval);
        retval.replace(ptr(1)); // 仅测试构建
      }
    });
  }
}
```

**停止条件**：需要越狱/root 才能继续、需要修改生产包、需要绕过服务端风控、绕过导致真实用户数据可见、或固定绕过失败两次以上 → 停止并记录“未能验证”，不要用其他手段强行打穿。

## 5. 参数与回溯的观察写法

| 需求 | 写法 | 证据 | 注意 |
|---|---|---|---|
| 字符串参数 | 只记录长度、是否为空、首尾字符类别 | 长度与类别 | 不打印完整值 |
| 字节数组 | 长度 + FNV 指纹 + 前 4 字节十六进制 | 长度、指纹 | 可能是密钥/明文 |
| 调用来源 | `Thread.backtrace(this.context, Backtracer.ACCURATE)` 后 `DebugSymbol.fromAddress` | 模块+偏移 | 符号可能缺失 |
| 调用频率 | 计数器 + 首次/末次时间 | 次数、时间窗 | 高频 hook 会拖慢应用 |
| 返回值类型 | `onLeave` 中读 `retval` | 类型/长度 | 观察型不修改 `retval` |

示例（仅记录，不改返回值）：

```js
const target = Module.findExportByName(null, '<export>');
if (target) {
  Interceptor.attach(target, {
    onEnter: function (args) {
      this.started = Date.now();
      send({ event: 'enter', arg0: args[0].toString() });
    },
    onLeave: function (retval) {
      send({ event: 'leave', retval: retval.toString(), ms: Date.now() - this.started });
    }
  });
}
```

## 6. 反调试与检测：识别，不对抗

| 检测面 | 常见表现 | 怎么确认 | 处理 |
|---|---|---|---|
| 进程/端口 | 默认 27042、`frida-server` 名称 | 应用退出时机与注入时机吻合 | 记录；改用所有者提供的测试构建 |
| 线程名 | `gmain`、`gum-js-loop`、`pool-frida` | 崩溃日志或应用提示 | 不实现线程隐藏 |
| 内存映射 | `/proc/self/maps` 含 `frida`、`linjector` | 只在测试设备观察 | 停止注入 |
| `ptrace`/调试 | `TracerPid` 非 0、`PT_DENY_ATTACH` | 应用拒绝启动或退出 | 不用反反调试 |
| 完整性 | 签名/校验和变化 | 重打包后立即失败 | 不重签生产包 |
| 环境 | root/越狱、模拟器属性 | 启动即提示环境异常 | 记录环境差异 |

发现检测后的可选路径只有三条：改用所有者提供的**关闭了该检测的测试构建**、改用纯静态审阅、缩小到不触发检测的观察点。本文不提供隐藏 Frida、伪造 `maps`、绕过 `ptrace` 或篡改检测结果的脚本。

## 7. 失败排查

| 现象 | 先查什么 | 命令/证据 | 下一步 |
|---|---|---|---|
| `unable to connect to remote frida-server` | USB、设备授权、server 是否运行 | `frida-ps -U`、`adb devices` | 重启 server；确认版本 |
| `Failed to spawn: unable to find process` | 包名是否正确、是否已安装 | `frida-ps -Uai`、`pm list packages` | 用 bundle id 而非显示名 |
| `java.lang.ClassNotFoundException` | 类是否被混淆、是否在子进程 | `Java.available`、类名来源 | 换 hook 点或静态确认 |
| `TypeError: not a function` | 重载不匹配 | `Java.use(...).method.overloads` | 指定参数类型 |
| 脚本加载后无事件 | hook 太晚、进程不对、类加载器不同 | 先枚举模块/进程 | spawn 提前加载 |
| 应用启动即崩溃 | hook 实现递归/签名不匹配 | 空脚本对照 | 逐段禁用 hook |
| `Script destroyed` | 进程退出、脚本异常 | `frida` 日志 | 缩小脚本 |
| 抓包仍失败 | 固定在原生层/自定义 TrustManager | 静态 strings/依赖 | 记录“固定迹象”，不绕过 |
| 设备端 permission denied | server 权限/SELinux | server 启动日志 | 仅测试设备可调整 |

版本不一致是最常见的失败原因：CLI 与设备端 `frida-server` 的主版本必须匹配；Android 设备还要匹配 ABI（arm64/arm/x86_64）。升级前记录旧版本，避免“换了版本但证据不可复现”。

## 8. 证据与停止条件

```text
资产：<bundle id> / <版本>
环境：<设备型号> / <系统版本> / <root 或越狱状态> / <测试构建>
工具：Frida CLI <版本> / frida-server <版本> / 脚本 SHA-256
方法：spawn 或 attach；仅观察，不修改返回值
观察：<hook 点> 调用 <n> 次；参数长度 <n>；指纹 <fnv>；回溯 <模块+偏移>
结论：已确认 / 待复核 / 未验证
停止点：<检测触发 / 需要绕过固定 / 出现真实数据 / 进程崩溃>
```

立即停止：脚本需要修改返回值才能继续、需要绕过证书固定或反调试、需要注入生产进程、需要导出密钥/数据库、日志出现真实 PII、应用或设备不是测试对象。

## 9. 在 Full-Chain 中的使用方式

Full-Chain 已把 frida-server 推送、隧道和脚本执行封装成工具。不要手工在设备上追加对抗脚本；用工具的白名单脚本。

### 9.1 Android

1. `droid_frida_setup`：推送并启动 `frida-server`。设备必须已 root，DroidBridge 在线。
2. `droid_frida_ps applications=true`：确认包名和进程名。
3. `droid_frida`：一次注入多个脚本，例如：
   `["anti_frida_bypass", "ssl_pinning_bypass", "okhttp_log"]`
   - `mode: "spawn"` 用于在 Application 初始化前 Hook。
   - `mode: "attach"` 用于已运行进程。
   - `timeoutMs` 控制观察时长，默认有上限。
4. `droid_unpack`：加固 APK 的内存 dex dump；先确认壳没有把 dex 放到只执行内存。

### 9.2 iOS

1. `ios_frida_setup`：启动设备端 frida-server 并建立隧道。
2. `ios_frida_ps applications=true`：拿 bundle identifier。
3. `ios_frida`：按同样方式传入脚本列表、`mode` 和 `target`。
4. 解密或重打包前先确认设备与测试构建，证据写入 `evidence/ios/`。

### 9.3 内置脚本

`anti_frida_bypass`、`ssl_pinning_bypass`、`okhttp_log`、`crypto_log`、`native_ssl_bypass`、`flutter_bypass`、`root_detection_bypass`、`dex_dump`。

- 先用观察型脚本：`okhttp_log`、`crypto_log`。
- 只有测试构建需要看固定/反调试行为时，才使用 `ssl_pinning_bypass`、`anti_frida_bypass`。
- 不要在一次注入里叠加无关脚本；先确认一个假设。

### 9.4 证据与停止

- 记录：设备型号、系统版本、包名、脚本名、attach/spawn、开始时间、超时、工具返回的关键输出。
- 不记录：真实账号、Cookie、Token、明文密码、业务数据。
- 停止：进程反复崩溃、应用提示环境异常、需要注入生产包、需要导出真实用户数据时停止。
- 高风险绕过只用于确认漏洞存在，不用于持久化或绕过许可。

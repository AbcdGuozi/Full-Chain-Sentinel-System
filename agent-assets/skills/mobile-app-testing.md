---
name: mobile-app-testing
description: "Android、iOS、鸿蒙 NEXT 客户端测试索引，覆盖静态审阅、运行时观察与证据整理。"
---

# 移动端 App 测试（索引）

本页是入口索引。执行边界以 [non-destructive-testing.md](non-destructive-testing.md) 为准；先做静态审阅和只读元数据查询，需要运行时观察或 Frida 验证时在测试设备上按工具白名单脚本执行，确认后停止。历史资料中的真实数据导出和业务破坏不转成自动化 payload。

## 文档索引

- [Android 逆向](android-reverse/SKILL.md)：APK 结构、apktool/jadx/strings、Manifest 关键项、签名、加固、硬编码。
- [iOS 逆向](ios-reverse/SKILL.md)：IPA 结构、class-dump/otool、Info.plist、Keychain/NSUserDefaults/数据库、越狱检测、FairPlay。
- [Frida 方法论](frida-methodology/SKILL.md)：attach/spawn、三个观察型脚本、反调试识别、失败排查。
- [Windows 客户端逆向](client-software-re/SKILL.md)：静态依赖、Process Monitor、配置解密、内存、协议、数据库取证边界。
- [鸿蒙 NEXT](harmony-next/SKILL.md)：HAP/HSP、签名、Ability 暴露、权限与存储、工具链时效。

## 通用执行顺序

1. 记录授权资产、包哈希、版本、设备与工具版本。
2. 静态解析清单/签名/资源/字符串，列出暴露面与可疑点。
3. 仅在测试设备或模拟器做运行时查询；Frida 使用本仓库的工具和白名单脚本，不修改设备持久化配置。
4. 证据脱敏，结论分为“已确认 / 待复核 / 未验证”。

## 保留的检查要点

- **Android**：签名与完整性、debuggable/allowBackup、导出组件与权限、网络安全配置、本地存储/硬编码、日志、WebView；先静态清单，不逐个调用组件。
- **iOS**：签名/Entitlement、ATS 与 URL Scheme、权限说明、Keychain/NSUserDefaults/SQLite、日志与后台快照；不重签、不注入 dylib、不越狱。
- **鸿蒙 NEXT**：HAP/HSP 签名、`module.json` 的 Ability/Extension 导出、权限与 ACL、Preferences/RelationalStore；字段与命令以本机 SDK 版本为准。
- **Windows 客户端**：技术栈与依赖、配置文件读取、内存敏感字段、协议加密；确认凭据暴露即停，不连库、不执行命令。

## 工具与设备

- Android 优先官方 Emulator；本机已配置 MuMu/夜神且 ADB 明确连接时可作为外接设备。模拟器不随 agent 打包。
- iOS 使用 Xcode Simulator 与兼容的测试构建；鸿蒙需本机 DevEco/hdc。
- 自动化限定为设备发现、已安装包元数据读取和启动；不自动安装、点击业务、提交表单、上传/导出数据。

## 停止条件

- 资产/设备未授权，账号或数据非测试专用。
- 需要修改设备系统或持久化配置（已授权测试设备上的 frida-server 除外），或操作会写入业务、文件或设备状态。
- 出现真实 PII、生产凭据或无法确认只读性质；此时立即停止并交技术指导复核。

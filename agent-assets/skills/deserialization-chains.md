---
name: deserialization-chains
description: "Java/PHP/Python 反序列化探测与利用链选择：识别序列化标记、Shiro rememberMe、ysoserial gadget、JNDI 注入，确认到命令执行即停止。"
---

# 反序列化利用链

## 1. 识别

| 语言/框架 | 标记 | 位置 |
|---|---|---|
| Java | `ac ed 00 05`、Base64 `rO0AB` | body、Cookie、隐藏字段 |
| Shiro | `rememberMe` | 任意页面，GET 和 POST 都可能 |

Shiro 检测不要只看首页：爬取到的登录页、后台页、API 页都要检查响应 `Set-Cookie: rememberMe=deleteMe`，并检查 POST 表单和 JSON 请求。

## 2. Java 链

1. 确认序列化入口和反序列化点。
2. 用 `ysoserial` 或等价工具生成无害命令链，例如 `pwd`、`id`。
3. 只发一次验证请求，观察回显、延时或 DNS 回调。
4. CommonsCollections、CommonsBeanutils、Spring、Fastjson 等链按 classpath 选择；不确定 classpath 时先用 DNSLog 探测。

## 3. JNDI

- 只在自有 LDAP/RMI 测试服务上验证。
- 使用 DNSLog 或本地回连确认 lookup 发生。
- 不加载远程恶意 class，不建立反弹 shell。

## 4. 停止条件

- 已确认命令执行即停止，不写文件、不持久化、不横向。
- 目标出现异常、重启或业务错误时立即停止。
- 只能确认反序列化点但无法确认利用链时，标为待复核。

## 5. 上报

提交入口、序列化标记、生成的 payload 类型（不提交真实利用链）、回调或回显证据、CVSS 与修复建议。

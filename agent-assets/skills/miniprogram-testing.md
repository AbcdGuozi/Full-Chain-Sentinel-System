---
name: miniprogram-testing
description: "微信小程序 wxapkg 静态解析、包结构与接口审阅，衔接后续授权测试。"
---

# 微信小程序静态分析（wxapkg）

本页约束 `.wxapkg` 包的静态审阅与后续授权测试衔接。执行边界以 [non-destructive-testing.md](non-destructive-testing.md) 为准：只做只读解析、文本审阅和证据整理，不解密、不执行包内代码、不联网验证。

## 1. 可以做什么

- 接收用户已获得授权的安装包或抓取包，计算 SHA-256、记录文件大小和来源。
- 解析标准 **wxapkg v1** 索引：首字节 `0xBE`、`0xED` 校验字节、文件数、文件名、offset、size。
- 读取包内文本文件：`.js`、`.json`、`.wxml`、`.wxss`。
- 对二进制文件只记录名称、偏移和大小，不读取内容。
- 提取配置字段（页面、分包、插件、权限、超时）、接口线索和静态风险信号。
- 生成脱敏后的清单，供人工复核和后续授权测试排期。

## 2. 不可以做什么

- 不调用微信开发者工具、模拟器或真机去登录、点击、下单、上传或删除。
- 不执行包内 JavaScript，不加载 WXML/WXSS，不运行任何构建脚本。
- 不解密或绕过 `APPVPKG` / `APPV2PKG` 等专用封装；遇到时直接停止并说明“当前只支持标准 wxapkg v1”。
- 不对接口清单做自动扫描、并发请求、目录爆破或参数 fuzzing。
- 不把包内出现的密钥、token、openId/unionId 原值写入报告或日志。
- 不根据静态域名列表推断未授权资产属于测试范围。

## 3. 解析边界与体积限制

| 项目 | 限制 | 越界行为 |
| --- | --- | --- |
| 文件数 | `<= 5000` | 标记 `truncated: true`，停止解析 |
| 单文件 | `<= 20 MB` | 标记 `truncated: true`，停止解析 |
| 解包总量 | `<= 200 MB` | 标记 `truncated: true`，停止解析 |
| 入口文件数 | 最多返回 200 条接口 | 超出部分不记录，note 中说明 |

- 只支持标准 v1；非 `0xBE` 头、长度不足或 `0xED` 校验失败时返回中文错误。
- 索引损坏或 offset/size 越界时返回已解析部分并置 `truncated: true`，不抛未捕获异常。
- `truncated: true` 表示结论覆盖不完整，不能据此判断“没有风险”。

## 4. 证据字段

静态结果以 `analyzeMiniProgram(buffer)` 返回：

```js
{
  meta: {
    version, packageSha256, packageBytes, fileCount,
    textFileCount, binaryFileCount, fileBytes, truncated
  },
  config: {
    appidMasked, pages, subpackages, plugins,
    permissions, networkTimeout
  },
  apis: [{ url, method, source, line, resolved }],
  findings: [/* 见下表 */],
  note
}
```

| 字段 | 用途 | 脱敏要求 |
| --- | --- | --- |
| `appidMasked` | 识别小程序归属 | 仅 `前4位 + **** + 后4位`，不返回完整 appid |
| `packageSha256` | 固定证据版本 | 原值可保留 |
| `truncated` | 说明解析是否完整 | 必须在结论中体现 |
| `source` / `line` | 定位代码位置 | 原值可保留 |
| `url` / `method` | 接口线索 | URL 查询参数中的 token/key/secret/openId 等替换为 `[REDACTED]` |
| `resolved: false` | 相对路径或 `baseUrl + "/path"` 片段 | 不能当作完整接口地址 |
| `evidence.file` / `evidence.line` | 风险位置 | 原值可保留 |
| `evidence.key` | 密钥标识类型（如 `appSecret`） | 只报标识，不报值 |

配置分析只挑选白名单字段，`appSecret`、`mchKey`、`privateKey` 的值不会进入返回值。密钥类 finding 只包含文件名、行号和标识；即使发现真实凭据，也不得复制到聊天、报告或工单。

## 5. findings 类型

| category | 含义 | 默认等级 | 复核重点 |
| --- | --- | --- | --- |
| `plaintext_http` | 明文 HTTP 接口 | 中危 | 是否仍可用、是否携带凭据 |
| `hardcoded_host` | 硬编码域名/IP | 低危/提示 | 是否属于授权资产、是否内网地址 |
| `hardcoded_secret` | 出现敏感密钥标识 | 高危 | 是否为真实凭据；确认后立即轮换 |
| `identity_param` | openId/unionId 直接作为身份参数 | 中危 | 服务端是否信任客户端身份值 |
| `undeclared_page` | `Page()` 文件未在配置声明 | 低危 | 是否隐藏入口、是否仍被路由访问 |

静态发现只是线索，不等于漏洞结论。需要运行时或接口验证的，转入授权测试流程并单独确认。

## 6. API 清单如何用于后续授权测试

1. 先确认清单中每个域名都在授权范围内；不在范围内的条目直接剔除，不探测。
2. 以 `method + url` 为单位去重；`resolved: false` 的条目先人工补全，不猜测路径。
3. 默认只做 `GET`/`HEAD`/`OPTIONS` 的只读请求；`POST` 仅限登录、查询等白名单语义，并且需要 `allowStateChange: true` 的显式授权。
4. 单次只发一个请求，使用测试账号和测试数据；不携带真实用户 token，不重放抓包中的生产凭据。
5. 验证身份类问题时，只测试测试账号 A 能否读取测试账号 B 的测试对象；不读取、导出或修改真实数据。
6. 所有请求经过 `http-replay` 的边界检查：禁止删除语义路径、私网地址、云元数据地址和跨域目标。
7. 证据记录请求方法、脱敏 URL、状态码、长度、耗时和哈希；响应正文只保留前 4096 字节并脱敏。
8. 结论区分“已确认 / 待复核 / 未验证”，不把静态域名或接口存在本身写成“存在漏洞”。

## 7. 停止条件

出现以下任一情况立即停止，交给技术指导或委托方确认：

- 无法证明资产、账号或数据在授权范围内。
- 需要解密 `APPVPKG`/`APPV2PKG`、绕过加固、执行包内代码或安装未授权工具。
- 发现真实 appSecret、mchKey、privateKey、生产 token 或真实用户 PII；只保留位置，停止进一步读取。
- 解析结果 `truncated: true`，且缺失文件可能影响结论；要求重新提供完整包。
- 需要写入业务数据、修改配置、上传/导出文件、删除对象或触发支付。
- 接口只能通过生产账号或真实数据验证。
- 静态分析与运行时表现冲突，且无法在测试环境复现。

## 8. 最小输出模板

```text
资产：<包文件名>
SHA-256：<64 位十六进制>
体积/文件数：<bytes> / <count>（文本 <n>，二进制 <n>）
解析完整性：<完整 | truncated>
appid：<前4位****后4位>
页面/分包：<数量，未声明页面另列>
接口线索：<总数，未解析数>
静态风险：
- <category>｜<file>:<line>｜<脱敏说明>
边界：未解密、未执行、未联网；结论待人工复核。
```

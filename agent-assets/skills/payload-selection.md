---
name: payload-selection
description: "按资产类型、输入面、回包特征与技术栈选择 payload，并给出对照请求与停止条件。"
---

# Payload 场景选型与对比

本文件回答两个问题：

1. 当前场景应该优先选哪条 payload；
2. 同一个漏洞类别里，clown 知识库、真实报告和现有技能谁更完整，为什么。

机器可读目录在 `../payloads/payload-catalog.json`，也可用 `payload_search`、`payload_select`、`payload_get` 读取。所有模板只用于**已授权**测试；目录本身不发送请求，发送由受控工具按“确认即停”执行。

## 选型流程

1. **先定资产面**：Web / API / 小程序 / Android / iOS / 鸿蒙 / 云 / 网关。
2. **再定输入面**：搜索筛选、登录、上传下载、JSON body、富文本、跳转回调、对象存储、WebSocket、GraphQL。
3. **看回包特征**：报错、回显、时间差、DNS/HTTP 回调、状态码/长度差异、对象归属差异。
4. **按栈选变体**：MySQL / PostgreSQL / Oracle / Mongo / Node / Java / PHP / 前端框架 / Android / iOS / 鸿蒙。
5. **选最具体的模板**：真实报告或指南里有完整闭合和对照包的优先；clown 里有更严格停止条件的作为约束。
6. **只取一个主模板 + 一个对照**：不要一次把所有变体都打出去；确认一个点后再换上下文。

## 优先级规则

- **报告/指南优先**：包含真实上下文闭合、对照包、判据或绕过点，直接选该变体。
- **clown 优先**：报告没有覆盖，或 clown 的停止条件/最小伤害节奏更完整时选 clown。
- **现有技能优先**：移动端只做静态审阅、设备发现和低影响观察时，沿用 `mobile-app-testing.md`。
- **高风险条目确认即停**：`risk: high` 或涉及 RCE、反序列化、请求走私、缓存投毒、STS 通配、OAuth 接管的，可自动执行到证明漏洞存在，确认后立即停止；`destructive: true` 仅人工复核。
- **报告中的真实目标、账号、Token、Cookie、PII、WebShell 一律不进入目录**；来源只保留报告类别和 sha1 前 8 位。

## 场景矩阵

| 场景 ID | 场景 | 资产类型 | 典型信号 | 首选 payload |
|---|---|---|---|---|
| `web-search` | 搜索/列表/筛选 | web / miniprogram / app | search、keyword、query、filter、list、total | `sqli-es-or-total`<br>`sqli-mysql-error-like`<br>`sqli-mysql-time`<br>`sqli-postgres-time`<br>`xss-reflected-basic`<br>`xss-attribute-break`<br>`ssti-detect` |
| `web-login` | 登录/认证/会话 | web / miniprogram / app | login、auth、token、jwt、oauth、session | `jwt-none`<br>`jwt-weak-secret`<br>`jwt-kid-injection`<br>`auth-token-issuance`<br>`auth-empty-code`<br>`oauth-userid-swap`<br>`oauth-code-reuse`<br>`nosql-operator`<br>`csrf-form`<br>`framework-shiro-detect` |
| `web-upload` | 文件上传/下载/预览 | web / miniprogram | upload、file、download、attach、filename、上传 | `upload-frontend-bypass`<br>`upload-extension-bypass`<br>`upload-unauth`<br>`upload-sts-wildcard`<br>`path-traversal-basic`<br>`lfi-php-filter`<br>`xxe-classic` |
| `web-api-json` | JSON API / 前后端分离 | web / api / miniprogram / app | json、api、rest、graphql、body、接口 | `sqli-mysql-error-like`<br>`sqli-mysql-time`<br>`sqli-postgres-time`<br>`idor-id-swap`<br>`bfla-method-swap`<br>`mass-assignment`<br>`graphql-introspection`<br>`prototype-pollution`<br>`info-leak-druid`<br>`info-leak-swagger`<br>`info-leak-nacos`<br>`framework-fastjson-detect`<br>`framework-shiro-detect` |
| `web-cloud` | 云资产/对象存储/元数据 | web / cloud / api | cloud、oss、s3、bucket、metadata、sts | `ssrf-cloud-metadata`<br>`ssrf-dnslog`<br>`ssrf-redirect-follow`<br>`upload-sts-wildcard`<br>`cloud-sts-policy`<br>`subdomain-takeover`<br>`cloud-sts-unicode-bypass` |
| `web-content` | 富文本/评论/资料展示 | web / miniprogram | comment、profile、nickname、richtext、富文本、评论 | `xss-stored`<br>`xss-reflected-basic`<br>`xss-attribute-break`<br>`xss-waf-bypass`<br>`xss-dom` |
| `web-redirect` | 跳转/回调/分享 | web / miniprogram / app | redirect、returnurl、callback、next、跳转 | `open-redirect`<br>`ssrf-dnslog`<br>`host-header-injection` |
| `web-infra` | 网关/CDN/代理 | web | gateway、cdn、proxy、host、cache、网关 | `api-gateway-path`<br>`http-smuggling-clte`<br>`http-smuggling-tecl`<br>`cache-poisoning-host`<br>`host-header-injection`<br>`info-leak-druid`<br>`info-leak-swagger`<br>`info-leak-nacos`<br>`framework-fastjson-detect`<br>`framework-shiro-detect` |
| `mobile-app` | App 移动端 | app | android、ios、app、apk、ipa、模拟器 | `mobile-deeplink`<br>`idor-id-swap`<br>`oauth-userid-swap`<br>`auth-token-issuance`<br>`mobile-android-exported`<br>`mobile-android-webview`<br>`mobile-ios-ats`<br>`mobile-harmony-ability` |
| `mobile-webview` | App WebView/DeepLink | app | webview、deeplink、scheme、h5 | `mobile-deeplink`<br>`xss-reflected-basic`<br>`xss-dom`<br>`open-redirect`<br>`mobile-android-webview`<br>`mobile-ios-ats` |
| `miniprogram` | 小程序 | miniprogram | 小程序、openid、wx、mini program | `miniprogram-openid`<br>`sqli-mysql-error-like`<br>`idor-id-swap`<br>`auth-token-issuance` |
| `cloud-iam` | 云账号/IAM/STS | cloud / web | iam、sts、role、policy、assumerole、权限 | `cloud-sts-policy`<br>`upload-sts-wildcard`<br>`ssrf-cloud-metadata`<br>`cloud-sts-unicode-bypass`<br>`cloud-hasura-admin`<br>`info-leak-nacos` |
| `graphql` | GraphQL | web / api | graphql、__schema、query | `graphql-introspection`<br>`graphql-batch`<br>`idor-id-swap`<br>`cloud-hasura-admin` |
| `websocket` | WebSocket | web / api | websocket、ws、origin | `websocket-origin` |
| `infra-http` | HTTP 协议层 | web | smuggling、http2、cl.te、te.cl、协议 | `http-smuggling-clte`<br>`http-smuggling-tecl`<br>`cache-poisoning-host` |
| `deserialization` | 反序列化/JNDI | web / api | deserialize、jndi、ldap、rmi、java | `deserialization-java`<br>`jndi-lookup`<br>`framework-fastjson-detect`<br>`framework-shiro-detect` |
| `logic-payment` | 业务逻辑/支付 | web / api / app / miniprogram | price、amount、payment、coupon、order、支付 | `logic-price-tamper`<br>`logic-coupon-reuse`<br>`race-condition` |
| `race` | 并发/竞态 | web / api / app / miniprogram | race、concurrent、parallel、并发 | `race-condition` |

## Payload 对比表

| Payload ID | 标题 | 选中来源 | 完整度 | 备选 | 选择理由 | 风险 |
|---|---|---|---|---|---|---|
| `sqli-mysql-error-like` | MySQL LIKE 上下文报错注入 | 报告 | 5/5 | 通用引号/布尔/延时（2/5） | 给出 LIKE 闭合、extractvalue 回显和对照包，实战可复现性最好 | medium |
| `sqli-mysql-error-from` | MySQL FROM 子查询别名报错注入 | 报告 | 5/5 | 通用单引号探针（2/5） | 解决表名位置不能直接加子查询的问题，给出合法 FROM 结构 | medium |
| `sqli-mysql-time` | MySQL 时间盲注（默认不自动发送） | 报告 | 5/5 | 通用 SLEEP/BENCHMARK（3/5） | 给出排序参数注入位置、真假对照和响应时间判据 | high |
| `sqli-postgres-time` | PostgreSQL 时间盲注（默认不自动发送） | 报告 | 5/5 | pg_sleep 替代（3/5） | 给出 PostgreSQL 字符串闭合、条件延时与基线对照 | high |
| `sqli-oracle-time` | Oracle 时间盲注（默认不自动发送） | 报告 | 5/5 | 无 Oracle 专用模板（0/5）；dbms_pipe 直接调用（4/5） | 给出 Oracle CASE + dbms_pipe 的完整条件延时结构 | high |
| `sqli-oracle-error` | Oracle 报错/带外注入 | 报告 | 5/5 | 无 Oracle 专用模板（0/5）；SYS_CONTEXT 布尔（4/5） | 给出 Oracle 带外函数和闭合方式 | medium |
| `sqli-generic-boolean` | 通用 SQL 布尔差分 | clown | 5/5 | and 1=1 / 1=2（3/5） | 明确“先假后真、只打一枪”的节奏，副作用控制最好 | medium |
| `sqli-es-or-total` | 列表筛选 OR + total 差分类注入 | clown | 5/5 | — | 唯一覆盖 ES/列表 total 差异的模板，且明确只打一枪 | medium |
| `sqli-oracle-union` | Oracle UNION 查询 | 报告 | 5/5 | 通用 UNION 变体（3/5） | 给出 Oracle 列数、dual 和字符串闭合 | medium |
| `nosql-operator` | MongoDB/NoSQL 操作符注入 | clown | 5/5 | — | 覆盖 JSON 与 form 两种传参，且提醒登录框不当业务参 | medium |
| `command-injection` | 命令注入无害探针 | clown | 5/5 | — | 只读命令探针；禁止 sleep/ping flood，不反弹 shell、不写文件 | medium |
| `ssti-detect` | SSTI 引擎探测 | clown | 5/5 | — | 覆盖 Jinja2/Twig/FreeMarker/ERB/Thymeleaf | medium |
| `ssti-rce-reference` | SSTI 引擎利用链（确认即停） | clown | 4/5 | — | 可执行到确认命令执行即停止，不读文件、不持久化 | high |
| `xss-reflected-basic` | 反射型 XSS 基础验证 | clown | 5/5 | 属性闭合 autofocus（4/5） | 覆盖标签、事件、iframe 和 details，适用面最广 | medium |
| `xss-attribute-break` | XSS 属性闭合 | clown | 5/5 | — | 覆盖双引号、单引号和标签闭合三种上下文 | medium |
| `xss-waf-bypass` | XSS WAF 绕过 | clown | 5/5 | — | 给出 5 类绕过方向，比单一编码更完整 | medium |
| `xss-dom` | DOM XSS 查找 | clown | 5/5 | — | 给出 source/sink 清单，适合 SPA 和前端路由 | medium |
| `xss-stored` | 存储型 XSS 验证 | clown | 4/5 | — | 列出存储型常见入口，适合按业务面选点 | medium |
| `ssrf-dnslog` | SSRF DNS/HTTP 回调验证 | clown | 5/5 | webhook.site 回显（5/5） | 无需公网服务器，最适合无回显 SSRF | medium |
| `ssrf-cloud-metadata` | SSRF 云元数据读取 | clown | 5/5 | 100.100.100.200 超时差分（4/5） | 覆盖三家云和角色凭证路径，比单一路径完整 | high |
| `ssrf-internal-port` | SSRF 内网端口探测 | clown | 4/5 | — | 覆盖常见服务，但只适合隔离环境 | high |
| `ssrf-redirect-follow` | SSRF 重定向绕过 | clown | 4/5 | — | 覆盖“先公网后跳转”的过滤绕过 | high |
| `xxe-classic` | XXE 文件读取 | clown | 5/5 | — | 用 hostname 做无害证明，避免直接读敏感文件 | medium |
| `xxe-oob` | XXE 带外验证 | clown | 5/5 | — | 适合无回显场景，使用自己的回调 | medium |
| `path-traversal-basic` | 路径穿越基础验证 | clown | 5/5 | — | 覆盖明文和 URL 编码，证明边界 | medium |
| `path-traversal-nginx-alias` | Nginx alias 缺斜杠穿越 | clown | 5/5 | — | 针对 alias 配置错误的专用模板 | medium |
| `lfi-php-filter` | PHP filter 链读取源码 | clown | 5/5 | — | 标准只读源码读取方式 | medium |
| `upload-frontend-bypass` | 文件上传前端校验绕过 | 报告 | 5/5 | 先传正常文件看路径（3/5） | 来自真实报告，明确指出仅前端校验 | medium |
| `upload-extension-bypass` | 文件扩展名/内容类型绕过 | 报告 | 4/5 | 按栈现场变后缀（2/5） | 给出三类常见绕过，仍保持无害文件内容 | medium |
| `upload-unauth` | 未授权上传接口 | 报告 | 5/5 | 先确认是否需要登录（3/5） | 给出从 JS 发现接口到无 Token 上传的完整路径 | medium |
| `upload-sts-wildcard` | 对象存储 STS 通配覆盖 | clown | 5/5 | — | 覆盖 STS 策略拼接、通配、upsert 和验收方法 | high |
| `idor-id-swap` | 水平越权 ID 替换 | 报告 | 5/5 | 对象图 + 读差分（4/5） | 真实报告证明“前端加密 ID”不等于授权；补足对象图验证 | medium |
| `idor-uuid-leak` | UUID/对象标识泄露 | clown | 4/5 | — | 适合不可枚举的 UUID 场景 | medium |
| `bfla-method-swap` | 功能级越权/方法替换 | clown | 4/5 | — | 覆盖端点级权限校验缺失 | medium |
| `mass-assignment` | 批量赋值/隐藏字段 | clown | 4/5 | — | 强调只改自己的测试账号并改回 | medium |
| `jwt-none` | JWT alg:none | clown | 5/5 | — | 标准检测，覆盖大小写/空格变体 | medium |
| `jwt-weak-secret` | JWT 弱密钥 | clown | 4/5 | — | 只做小字典验证，不爆破 | medium |
| `jwt-kid-injection` | JWT kid 注入 | clown | 5/5 | — | 覆盖 SQLi 和路径两类 kid 用法 | medium |
| `oauth-userid-swap` | OAuth/扫码登录 userId 替换 | 报告 | 5/5 | 授权码/状态校验（4/5） | 真实报告证明 userId 未绑定会话；补足扫码登录场景 | high |
| `oauth-code-reuse` | OAuth 授权码重放 | clown | 4/5 | — | 覆盖授权码一次性校验缺失 | medium |
| `auth-token-issuance` | 未授权 Token 签发 | 报告 | 5/5 | 只带身份字段签发（4/5） | 真实报告给出完整签发链；只用自有测试工号 | high |
| `auth-empty-code` | 验证码/授权码空值绕过 | clown | 4/5 | — | 覆盖空值/省略/重复三类；写操作只动测试账号并确认即停 | medium |
| `logic-price-tamper` | 支付金额篡改 | 报告 | 5/5 | 金额/数量/优惠券字段（4/5） | 真实报告证明服务端信任客户端金额；只用测试商品 | high |
| `logic-coupon-reuse` | 优惠券/权益重复领取 | 报告 | 5/5 | 促销/绑定字段（4/5） | 真实报告给出完整重复领取链；只用测试账号 | medium |
| `race-condition` | 并发/竞态条件 | clown | 5/5 | — | 覆盖多种竞态场景和并发脚本 | high |
| `csrf-form` | CSRF 表单验证 | clown | 5/5 | — | 标准表单 PoC，强调 SameSite/Token 检查 | medium |
| `http-smuggling-clte` | HTTP 请求走私 CL.TE | clown | 5/5 | — | 覆盖 CL.TE 原理和检测 | high |
| `http-smuggling-tecl` | HTTP 请求走私 TE.CL | clown | 5/5 | — | 覆盖 TE.CL 原理和检测 | high |
| `cache-poisoning-host` | 缓存投毒 Host 头 | clown | 5/5 | — | 覆盖缓存键与 Host 头组合 | high |
| `host-header-injection` | Host 头注入 | clown | 4/5 | — | 覆盖密码重置链接污染 | medium |
| `open-redirect` | 开放重定向 | clown | 5/5 | — | 覆盖多种解析差异 | medium |
| `prototype-pollution` | 原型链污染 | clown | 5/5 | — | 覆盖 JSON/query 两种入口和检测 | medium |
| `deserialization-java` | Java 反序列化检测（确认即停） | clown | 4/5 | — | 可执行到确认命令执行即停止，不拿 shell、不持久化 | high |
| `jndi-lookup` | JNDI 注入检测（回调确认即停） | clown | 4/5 | — | 覆盖多种注入位置，回调确认后停止 | high |
| `graphql-introspection` | GraphQL  introspection | clown | 5/5 | — | 标准查询，适合发现隐藏字段 | medium |
| `graphql-batch` | GraphQL 批量/别名滥用 | clown | 4/5 | — | 覆盖别名批量与限流绕过 | medium |
| `websocket-origin` | WebSocket Origin 校验 | clown | 4/5 | — | 覆盖 CSWSH 基础检测 | medium |
| `api-gateway-path` | API 网关路径规范化绕过 | clown | 5/5 | — | 覆盖多种规范化差异 | medium |
| `info-leak-actuator` | 常见信息泄露端点 | clown | 4/5 | — | 覆盖常见暴露面，适合低影响发现 | medium |
| `subdomain-takeover` | 子域接管 | clown | 4/5 | — | 覆盖常见服务指纹 | medium |
| `cloud-sts-policy` | 云 STS Policy 注入 | 专题文章 | 5/5 | Policy 字段通配/目录穿越（4/5）；腾讯云 COS 追加 Statement（5/5） | 给出原始 Go 模板、闭合字符、重复键覆盖和完整请求，最可复现 | high |
| `miniprogram-openid` | 小程序 openId 登录绕过 | 报告 | 5/5 | 空串/假值 openId（4/5） | 真实报告证明身份字段未绑定会话 | medium |
| `mobile-deeplink` | App DeepLink/WebView 入口 | 现有技能 | 4/5 | — | 沿用现有移动端技能，补充入口验证 | medium |
| `cloud-sts-unicode-bypass` | STS Policy 过滤器 Unicode/双写绕过 | 专题文章 | 5/5 | 双写绕过（4/5） | 给出 \u002a 和键名 Unicode 变体，专门绕过字符串替换式修复 | high |
| `mobile-android-exported` | Android 导出组件静态检查 | 指南 | 5/5 | 包配置静态审阅（3/5） | 给出导出判定规则和静态命令，覆盖最完整 | low |
| `mobile-android-webview` | Android WebView 配置静态检查 | 指南 | 5/5 | WebView/TLS 观察（3/5） | 直接给出危险 API 清单，适合静态审阅 | medium |
| `mobile-ios-ats` | iOS ATS/URL Scheme 静态检查 | 指南 | 5/5 | 签名/ATS/权限说明（3/5） | 覆盖 ATS 例外、URL Scheme 和 Universal Link 入口 | low |
| `mobile-harmony-ability` | 鸿蒙 NEXT Ability 导出检查 | 指南 | 5/5 | HAP/HSP 静态审阅（3/5） | 给出 HAP 版本、hdc 命令和 Ability 导出判定 | low |
| `info-leak-druid` | Druid 监控台默认口令/信息泄露 | 报告 | 5/5 | 常见监控端点（3/5） | 真实报告给出若依框架 Druid 默认口令入口和验证页面 | high |
| `info-leak-swagger` | Swagger/OpenAPI 文档暴露 | clown | 4/5 | — | 覆盖 Swagger 2/3 和 OpenAPI 常见路径 | low |
| `info-leak-nacos` | Nacos 配置/默认口令暴露 | 报告 | 4/5 | 中间件暴露面（3/5） | 报告样本中 Nacos 出现频率高，给出配置读取和默认登录两个入口 | high |
| `framework-fastjson-detect` | Fastjson autoType 检测（DNS 回调确认即停） | 报告 | 5/5 | Java 反序列化探测（3/5） | 报告给出 Fastjson autoType 未限制的完整上下文；检测用 DNS 回调，不执行命令 | high |
| `framework-shiro-detect` | Shiro rememberMe 检测（标记确认即停） | 报告 | 5/5 | Java 反序列化探测（3/5） | 报告样本出现 rememberMe，检测只判断 Shiro 解析行为，不发送 gadget | high |
| `cloud-hasura-admin` | Hasura 管理密钥/GraphQL 暴露 | 报告 | 5/5 | GraphQL introspection（3/5） | 报告给出 Hasura 默认密钥和 metadata 入口；只读 schema，不执行写操作 | high |

## 使用示例

### 搜索框回显 + MySQL 报错

- 场景：`web-search`
- 信号：`search`、`like`、`mysql`、`1064`
- 首选：`sqli-mysql-error-like`
- 对照：先提交唯一无害标记，再提交单引号；出现 `XPATH syntax error` 后用 `extractvalue(1,concat(0x7e,database()))` 只读库名。
- 停止：不读取业务表、不翻页、不导出。

### JSON API + 对象 ID

- 场景：`web-api-json`
- 信号：`json`、`id`、`userId`、`objectId`
- 首选：`idor-id-swap`
- 对照：两个自有测试账号 + 两个合成对象；B 访问 A 的对象应被拒绝。
- 停止：不遍历真实 ID、不读取真实 PII。

### 文件上传 + 仅前端校验

- 场景：`web-upload`
- 信号：`upload`、`filename`、`fileType`
- 首选：`upload-frontend-bypass`
- 对照：先传无害 `.txt`，再改 `fileName` / `fileType` 为 `.html` / `text/html`。
- 停止：不上传 WebShell、不覆盖他人文件、验证后删除。

### 对象存储 + STS Policy

- 场景：`web-cloud`
- 信号：`sts`、`oss`、`bucket`、`policy`
- 首选：`cloud-sts-policy` / `cloud-sts-unicode-bypass`
- 对照：只覆盖自己刚上传的探测对象，验证 Policy 范围是否扩大。
- 停止：不列桶、不删、不覆盖官方或他人对象。

### Android 导出组件

- 场景：`mobile-app`
- 信号：`android`、`exported`、`manifest`
- 首选：`mobile-android-exported`
- 对照：静态列出 `exported="true"` 的组件和 intent-filter。
- 停止：不实际调用组件、不重打包、不注入 Hook。

## 维护方式

1. 新增报告/指南模板时，先补到 `payload-catalog.json` 的 `variants`，再更新 `selectedVariant`。
2. 每个变体必须有 `source`、`template`、`verify`、`score`、`reason`。
3. 评分 5 = 可直接复现且有完整判据；4 = 可用但缺上下文；3 = 原则/通用探针；2 = 仅方向；0 = 不覆盖。
4. 不把真实目标、账号、Token、Cookie、PII 或完整 WebShell 写入目录。
5. 修改目录后用 `payload_search` 验证；不要手工改写已校对条目。

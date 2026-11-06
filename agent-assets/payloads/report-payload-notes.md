# 报告样本中的 Payload 观察

## 范围与方法

本轮对 212 份 DOCX/PDF/DOC 做了本地文本提取和类别扫描：本地报告库 52 份，以及渗透测试、护网行动、专题项目等目录 160 份。逐条 payload 归纳以本地报告库 52 份和 14 份移动端/Web/云专题指南为主；其余报告用于类别覆盖和缺口核对。原始报告、目标域名/IP、账号、Token、Cookie、身份证/手机号等 PII、WebShell 和可直接执行的完整利用链**没有写入知识库**。

提取结果只保留：

- 漏洞类别与输入面；
- payload 的结构、闭合方式和判据；
- 真实报告里比 clown 更完整的上下文；
- 需要补进 `payload-library.md` / `payload-catalog.json` 的缺口。

## 类别分布（本地报告库 52 份样本）

| 类别 | 命中报告数 | 说明 |
|---|---:|---|
| 越权/IDOR | 28 | 占比最高，常见“前端加密 ID、后端不校验归属” |
| 业务逻辑/支付 | 31 | 支付金额、优惠券/权益重复领取、并发 |
| 信息泄露 | 29 | 未授权接口、日志、配置、响应字段 |
| JWT/OAuth/Token | 24 | `sub` 与参数不一致、未授权签发、扫码登录 userId 替换 |
| XSS | 21 | 反射/存储为主，WAF 绕过样本较少 |
| 文件上传 | 20 | 仅前端校验、扩展名/Content-Type、未授权上传 |
| 认证绕过/弱口令 | 24 | 空验证码、默认口令、Token 签发口 |
| 命令执行/RCE | 25 | 多为报告结论，完整利用链未入库 |
| SQL 注入 | 14 | MySQL 报错/时间、PostgreSQL 时间、Oracle 时间/带外/UNION |
| 路径穿越/LFI | 17 | 文件下载、预览、静态目录 |
| SSRF | 17 | 回调验证、云元数据、超时差分 |
| CSRF | 17 | 多为配置观察，实际利用样本少 |
| 反序列化/XXE/GraphQL/WebSocket | 少 | 报告覆盖不足，主要沿用 clown；补充 Fastjson/Shiro/Hasura 检测 |
| 中间件/框架暴露 | 多 | Druid、Nacos、Swagger、Actuator、Hasura 出现频率高，已补目录条目 |

## 报告比 clown 更完整的点

### SQL 注入

- **MySQL LIKE 上下文**：`key=<VALUE>' AND extractvalue(1,concat(0x7e,database())) AND '%'='%'`，回包 `XPATH syntax error`。clown 只有通用引号/布尔/延时。
- **MySQL FROM 子查询别名**：`channel=<TABLE> t,(SELECT extractvalue(1,concat(0x7e,version())))x`，解决表名位置不能直接加子查询。
- **MySQL 排序参数时间盲注**：`sort=DESC,(select if(1=1,sleep(2),0))`，真假条件响应时间对照。
- **PostgreSQL 时间盲注**：`<PARAM>=0'+AND+1=(SELECT+1+FROM+PG_SLEEP(3))+AND+'a'='a`。
- **Oracle 时间盲注**：`dbms_pipe.receive_message('a',3)` + `CASE WHEN`。
- **Oracle 带外/报错**：`UTL_INADDR.GET_HOST_NAME((select SYS_CONTEXT('USERENV','DB_NAME') from dual))`。
- **Oracle UNION**：`' union select SYS_CONTEXT('USERENV','DB_NAME'),999,... from dual`。

### 认证与对象级授权

- **JWT `sub` 与参数不一致**：Token 内工号与请求里的 `empCode` 不一致，服务端只校验签名，导致水平越权。
- **未授权 Token 签发**：只提交工号/用户名就返回对应 JWT。
- **扫码登录 userId 替换**：确认接口按客户端传入的 `userId` 签发授权码，未绑定会话归属。
- **前端加密 ID**：ID 用前端硬编码 AES 密钥加密，后端不校验归属，改数字即可读他人对象。
- **空验证码/空 openId**：验证码或身份字段置空仍可进入已有测试账号。

### 文件上传

- **仅前端校验**：改 `fileName` / `fileType` 即可上传 HTML。
- **扩展名/Content-Type 绕过**：`.html`、`.html.txt`、`Content-Type: image/gif`。
- **未授权上传**：从不带 Token 的前端 JS 发现上传接口，直接上传测试文件。


### 中间件/框架补充

- `info-leak-druid`：若依/Druid 监控台默认口令与页面验证；
- `info-leak-swagger`：Swagger 2/3、OpenAPI 文档路径；
- `info-leak-nacos`：Nacos 配置读取/默认登录；
- `framework-fastjson-detect`：`@type` autoType DNS 回调检测；
- `framework-shiro-detect`：`rememberMe` 标记检测；
- `cloud-hasura-admin`：Hasura `x-hasura-admin-secret` + metadata 只读验证。

这些条目只做暴露面/默认口令/回调检测，不包含完整 RCE gadget、命令执行或业务写操作。

### 业务逻辑

- **支付金额篡改**：客户端金额/状态被服务端信任。
- **权益重复领取**：身份字段重置 + 重放领取请求。
- **并发/竞态**：并行请求同一测试资源，观察重复领取/状态不一致。

## clown 比报告更完整的点

- **XSS**：标签/事件/编码/注释/WAF 绕过/DOM source-sink 覆盖更全。
- **SSRF**：DNSLog、内网端口、云元数据路径、重定向跟随、GOPROXY 等场景更全。
- **XXE/LFI/路径穿越**：模板和编码变体更全。
- **HTTP 协议层**：请求走私、缓存投毒、Host 头、API 网关路径规范化更全。
- **OAuth/JWT**：`alg:none`、弱密钥、`kid` 注入、SAML 等结构更全。
- **反序列化/原型链/GraphQL/WebSocket**：报告几乎没有，沿用 clown。
- **停止条件**：clown 对“只打一枪、不翻页、不导出、不删改”的节奏约束更明确。

## 未纳入自动模板的内容

以下内容只在报告中出现，未写入可执行模板：

- WebShell、反弹 Shell、持久化、权限维持；
- 批量拖库、批量枚举真实用户、导出真实 PII；
- 修改/删除真实业务对象、真实支付/库存操作；
- 真实目标、账号、Token、Cookie、密钥、身份证/手机号；
- 需要重签、注入 Hook、绕过证书固定、越狱/root 的移动端操作。

这些内容只作为风险类别和影响面说明，由人工在授权范围内复核。

## 维护建议

1. 新增报告时先做文本提取和 PII 筛除，只补“结构 + 判据 + 停止条件”。
2. 每个新模板同时更新 `payload-catalog.json` 的 `variants` 和 `selectedVariant`。
3. 报告模板评分高于 clown 的条件：有完整闭合、对照包、真实判据或明确绕过点。
4. clown 模板评分高于报告的条件：场景覆盖更全、停止条件更严格、或报告没有对应类别。
5. 高风险模板只作为人工审查参考，不进入自动执行路径。

## 补充指南与专题文章

除本地报告库外，本轮还抽取了以下材料，用于补移动端和云 STS 场景：

- 某厂商 Android 测试指南/报告模板、Android 测试用例、内部培训-安卓渗透测试入门；
- 某厂商 iOS 测试指南/报告模板、内部培训-iOS 渗透测试入门、iOS 端渗透测试方法与漏洞案例；
- 鸿蒙 NEXT 应用渗透测试指南（2026 第二版）；
- 某安全团队整理的 Web 漏洞集合；
- 《云安全：STS Policy 注入在对象存储直传与攻击中的利用链》专题文章。

从中补充的目录条目：

- `mobile-android-exported`：`exported="true"` / intent-filter 静态判定；
- `mobile-android-webview`：`setJavaScriptEnabled` / `addJavascriptInterface` / 文件访问静态检索；
- `mobile-ios-ats`：`NSAppTransportSecurity` / `CFBundleURLSchemes` 静态审阅；
- `mobile-harmony-ability`：`hdc shell bm dump` + `module.json5` Ability 导出检查；
- `cloud-sts-policy`：阿里云/腾讯云 Policy JSON 闭合与重复键；
- `cloud-sts-unicode-bypass`：`\u002a` 与键名 Unicode 变体、双写绕过。

移动端条目只保留静态审阅和低影响入口检查；Frida/objection Hook、脱壳、重签、越狱/root、Keychain 导出等未纳入自动模板。

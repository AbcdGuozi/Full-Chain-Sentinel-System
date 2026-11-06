---
name: nuclei-integration
description: "Nuclei 模板导入、检索、按目标改写与命中判据，避免照抄模板路径。"
---

# Nuclei 模板与 payload 集成

## 用途

把官方 Nuclei 模板导入 Full-Chain 的 POC 库，按目标指纹检索模板，读取 matcher 和 payload，再改写成该目标真实路径下的验证请求。模板是参考资料，不是可直接对目标发射的武器。

## 导入

Full-Chain 的 POC 库按 `info.id` 去重，单模板上限 512KB，单次导入上限 512MB。导入步骤见 `../NUCLEI-IMPORT.md`：

1. 打包 `~/nuclei-templates`。
2. 控制台「设置 → POC 库 → 导入」上传 zip。
3. 后台队列解析，完成后用 `poc_search` 检索。

不迁移 hah-agent 的 `nuclei-catalog.json` / `nuclei-payloads.json`；它们是导入产物的旧快照，直接使用官方模板和 POC 库。

## 检索与读取

- `poc_search`：按关键词、标签、等级检索，返回模板 id 与元数据。
- `poc_read`：一次读取最多 8 个模板的完整 YAML。
- 先按产品、CVE、标签定位，再读模板；不要一次读取整个目录。

## 改写规则

1. 模板里的 `path` 和 URL 前缀是作者按常见部署猜的，先按侦察结果确认真实前缀。
2. 保留 matcher 逻辑，替换路径、参数名、请求头和占位符。
3. `{{BaseURL}}`、`{{Hostname}}`、`{{interactsh-url}}` 等占位符按目标环境替换；回调地址只使用自己的测试服务。
4. 多请求模板先拆成单请求验证，确认一个判据后再组合。
5. POST、上传、反序列化模板默认只读比对；需要状态变更时先确认影响面。

## 判据

- 命中 matcher 才算证据；状态码 200 不是判据。
- 记录基线请求和验证请求的状态码、长度、关键响应片段。
- 模板未命中不能证明目标不存在漏洞；路径不对、版本不符、WAF 拦截都会导致假阴性。

## 执行与停止

- 纯指纹、版本、无侵入 GET/HEAD 检测可以自动执行。
- RCE、JNDI、反序列化、上传、self-contained 外部目标模板只执行到确认漏洞存在，不建立 shell、不写文件、不横向。
- 请求会修改配置、删除数据、重启服务时停止。
- 确认漏洞后用 `vuln_submit` 提交原始请求、响应证据和修复建议。

# 内置知识与 payload 资产

本目录是从 hah-agent 迁移到 Full-Chain 的知识资产。控制台启动时会把 `skills/` 与 `payloads/` 复制到 Agent 配置目录（默认 `~/.sentinel/agent/`），已存在的文件不会被覆盖。项目工作目录中也可以放 `.pi/skills/` 覆盖同名技能。

## 技能

| 文件 | 用途 |
|---|---|
| `skills/asset-types.md` | 按资产类型选择流程 |
| `skills/cloud-testing.md` | 对象存储、STS/IAM、云元数据 |
| `skills/miniprogram-testing.md` | 小程序包静态分析 |
| `skills/mobile-app-testing.md` | 移动端测试索引 |
| `skills/<name>/SKILL.md` | Android、iOS、鸿蒙 NEXT、Frida、客户端逆向（各自独立技能目录） |
| `skills/nday-exploitation.md` | 指纹识别后的 N-day 验证 |
| `skills/deserialization-chains.md` | Java/PHP/Python 反序列化与 Shiro 检测 |
| `skills/token-forge.md` | JWT/OAuth/SAML 令牌伪造与弱密钥尝试 |
| `skills/non-destructive-testing.md` | 非破坏性边界与停止条件 |
| `skills/nuclei-integration.md` | Nuclei 模板使用规则 |
| `skills/payload-selection.md` | 场景化 payload 选型 |
| `skills/report-format.md` | 报告结构 |
| `skills/report-derived-patterns.md` | 资料归纳的风险类别 |
| `skills/scope-and-evidence.md` | 范围与证据记录 |
| `skills/waf-bypass.md` | WAF 绕过变形方法 |
| `skills/web-observation.md` | Web 页面观察 |
| `skills/clown/SKILL.md` | clown SRC 知识库入口 |
| `skills/clown/knowledge/*.md` | 44 个漏洞类别知识文件 |

三角色证据链相关文件（`agent-workflow.md`、`context-management.md`）没有迁移。

## Payload

- `payloads/payload-catalog.json`：机器可读目录，18 个场景、74 个 payload、WAF 绕过变体。
- `payloads/payload-library.md`：人读模板与停止条件。
- `payloads/nday-catalog.json`：指纹识别后的 N-day 验证条目。
- `payloads/report-payload-notes.md`：报告样本中提炼的 payload 缺口。
- `payloads/report-template.md`：报告字段模板。

Agent 通过三个工具使用目录：

- `payload_search`：按关键词、场景、资产类型、风险级别检索。
- `payload_select`：按观测到的 signals 排序场景和 payload。
- `payload_get`：读取完整变体、判据、WAF 绕过形式和停止条件。

这三个工具只在 `poc_read` 权限开启时挂载；未开启时技能仍可加载，但不能直接读取 payload 目录。

payload 目录是参考资料，不是自动执行器；发送由工具按任务执行。高风险非破坏条目可自动执行到确认漏洞存在，破坏性条目只做人工复核。

## Nuclei 模板

不迁移 hah-agent 的 `nuclei-catalog.json` / `nuclei-payloads.json`。Full-Chain 已有 POC 库，直接导入官方模板 zip 即可，步骤见 `NUCLEI-IMPORT.md`。

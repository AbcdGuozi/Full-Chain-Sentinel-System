# 场景化 Payload 目录插件

可选的 MCP 插件，把 `payload_search`、`payload_select`、`payload_get` 暴露给外部 MCP 客户端。控制台内置的同名工具已经直接读取 `agent-assets/payloads/payload-catalog.json`，正常使用不需要安装本插件。

## 直接运行

```sh
cd plugins/payload-catalog
PORT=7801 node server.mjs
```

- `GET /healthz` 返回 `{"ok":true}`。
- `POST /mcp` 使用 streamable HTTP，JSON-RPC 方法为 `initialize`、`tools/list`、`tools/call`。

## 容器

```sh
docker build -t sentinel-payload-catalog .
docker run --rm -p 7801:7801 sentinel-payload-catalog
```

## 插件中心安装

把本目录打成 zip（`plugin.json` 位于 zip 根目录），在控制台「设置 → 插件」选择本地安装。插件只读目录，不向目标发送请求。

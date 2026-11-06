# Nuclei 模板导入

Full-Chain 的 POC 库按 `info.id` 去重，单模板上限 512KB，单次导入上限 512MB。hah-agent 导出的两个大 JSON 不再迁移，直接使用官方模板目录。

## 本机模板目录

当前机器已有 `~/nuclei-templates`，约 13,617 个 YAML。打包：

```sh
cd ~
rm -f /tmp/nuclei-templates.zip
zip -qr /tmp/nuclei-templates.zip nuclei-templates \
  -x '*/node_modules/*' '*/.*' '*.DS_Store'
ls -lh /tmp/nuclei-templates.zip
```

## 通过控制台导入

1. 打开控制台，进入「设置 → POC 库」。
2. 选择「导入」，上传 `/tmp/nuclei-templates.zip`。
3. 导入在后台队列执行，页面轮询进度；完成后按 `info.id` 去重。
4. 用 `poc_search` 按关键词、标签或等级检索，用 `poc_read` 读取模板。

## 使用规则

- 模板里的 path 和 URL 前缀只是作者猜测的常见部署。先按侦察结果确认真实路径，再改写匹配逻辑。
- 模板命中或未命中都不能单独作为结论；需要基线对照和原始响应。
- 不要把模板直接当攻击武器。RCE、反序列化、文件写入类模板只执行到确认漏洞存在。

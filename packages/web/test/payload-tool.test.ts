import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { createPayloadTools, signalText } from "../src/payload-tool.ts";

interface CallableTool {
	execute: (
		id: string,
		params: unknown,
	) => Promise<{ content: Array<{ type: string; text?: string }>; details: unknown }>;
}

const catalogPath = fileURLToPath(new URL("../../../agent-assets/payloads/payload-catalog.json", import.meta.url));

function tool(name: string): CallableTool {
	const found = createPayloadTools({ catalogPath }).find((entry) => entry.name === name);
	if (!found) throw new Error(`missing tool ${name}`);
	return found as unknown as CallableTool;
}

test("signalText flattens arrays and objects", () => {
	expect(signalText(["search", { mysql: ["like", 1064] }])).toContain("search mysql like 1064");
});

test("payload_select ranks a search scenario and its best variant", async () => {
	const result = await tool("payload_select").execute("call-1", {
		signals: ["search", "keyword", "mysql", "1064"],
		assetType: "web",
	});
	const text = result.content.map((item) => item.text ?? "").join("\n");
	expect(text).toContain("web-search");
	expect(text).toContain("sqli-mysql-error-like");
	expect(text).toContain("report-mysql-like-context");
	expect(result.details).toMatchObject({ ok: true, scenario: "web-search" });
});

test("payload_get includes variants and bypass forms", async () => {
	const result = await tool("payload_get").execute("call-1", { ids: ["sqli-mysql-error-like"] });
	const text = result.content.map((item) => item.text ?? "").join("\n");
	expect(text).toContain("MySQL LIKE 上下文报错注入");
	expect(text).toContain("WAF 绕过变体");
	expect(text).toContain("sqli-double-url-encode");
});

test("payload_get marks high-risk entries as confirm-stop and destructive entries as manual", async () => {
	const result = await tool("payload_get").execute("call-1", {
		ids: ["deserialization-java", "sqli-mysql-time"],
	});
	const text = result.content.map((item) => item.text ?? "").join("\n");
	expect(text).toContain("（可执行到确认）");
	expect(text).toContain("（破坏性，仅人工复核）");
});

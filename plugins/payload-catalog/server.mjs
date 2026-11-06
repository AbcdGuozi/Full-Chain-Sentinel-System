import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 7801);
const PROTOCOL_VERSION = "2025-03-26";
const catalog = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "payload-catalog.json"), "utf-8"));
const payloads = catalog.payloads;
const scenarios = catalog.scenarios;

const TOOLS = [
	{
		name: "payload_search",
		description: "按关键词、场景、资产类型或风险级别检索 payload，返回 id、标题、首选变体和风险。高风险非破坏条目可执行到确认，破坏性条目仅人工复核。",
		inputSchema: {
			type: "object",
			properties: {
				search: { type: "string" },
				scenario: { type: "string" },
				assetType: { type: "string" },
				risk: { type: "string", enum: ["low", "medium", "high"] },
				limit: { type: "integer", minimum: 1, maximum: 20 },
			},
		},
	},
	{
		name: "payload_select",
		description: "按观测 signals 与资产类型排序场景和 payload，返回首选模板、判据和停止条件。",
		inputSchema: {
			type: "object",
			properties: {
				signals: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 },
				assetType: { type: "string" },
				limit: { type: "integer", minimum: 1, maximum: 8 },
			},
			required: ["signals"],
		},
	},
	{
		name: "payload_get",
		description: "按 id 读取 payload 的完整变体、WAF 绕过形式、判据和停止条件。高风险非破坏条目可执行到确认，破坏性条目仅人工复核。",
		inputSchema: {
			type: "object",
			properties: {
				ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
				includeBypass: { type: "boolean" },
			},
			required: ["ids"],
		},
	},
];

function signalsOf(value) {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(signalsOf).filter(Boolean).join(" ");
	if (value && typeof value === "object") {
		return Object.entries(value)
			.flatMap(([key, entry]) => [key, signalsOf(entry)])
			.filter(Boolean)
			.join(" ");
	}
	return "";
}

function riskLabel(risk) {
	return risk === "high" ? "高" : risk === "medium" ? "中" : "低";
}

function riskSuffix(payload) {
	if (payload.destructive) return "（破坏性，仅人工复核）";
	if (payload.risk === "high") return "（可执行到确认）";
	return "";
}

function selected(payload) {
	return payload.variants.find((variant) => variant.id === payload.selectedVariant) ?? payload.variants[0];
}

function search(args) {
	const needle = String(args.search ?? "").trim().toLowerCase();
	const limit = Math.min(Number(args.limit ?? 20), 20);
	const matches = payloads.filter((payload) => {
		if (args.scenario && !payload.scenarios.includes(args.scenario)) return false;
		if (args.assetType && !payload.assetTypes.includes(args.assetType)) return false;
		if (args.risk && payload.risk !== args.risk) return false;
		if (!needle) return true;
		return [payload.id, payload.title, payload.category, signalsOf(payload.signals)]
			.join(" ")
			.toLowerCase()
			.includes(needle);
	});
	const lines = matches.slice(0, limit).map((payload) => {
		const variant = selected(payload);
		return `- ${payload.id} | ${payload.title} | 风险 ${riskLabel(payload.risk)}${payload.destructive ? "（破坏性）" : ""} | 场景 ${payload.scenarios.join("/")} | 首选 ${variant?.label ?? "无"}`;
	});
	return lines.length ? lines.join("\n") : "没有匹配的 payload。";
}

function select(args) {
	const signals = (args.signals ?? []).map((signal) => String(signal).trim().toLowerCase()).filter(Boolean);
	const assetType = args.assetType;
	const rankedScenarios = scenarios
		.map((scenario) => {
			const haystack = `${signalsOf(scenario.signals)} ${scenario.label}`.toLowerCase();
			let score = 0;
			for (const signal of signals) if (haystack.includes(signal)) score += 3;
			if (assetType && scenario.assetTypes.includes(assetType)) score += 2;
			return { scenario, score };
		})
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, 3);
	const primary = rankedScenarios[0]?.scenario?.id;
	const rankedPayloads = payloads
		.map((payload) => {
			const haystack = [payload.id, payload.title, payload.category, signalsOf(payload.signals)].join(" ").toLowerCase();
			let score = 0;
			for (const signal of signals) if (haystack.includes(signal)) score += 1;
			if (primary && payload.scenarios.includes(primary)) score += 4;
			return { payload, score };
		})
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, Math.min(Number(args.limit ?? 5), 8));
	const lines = ["场景排序："];
	for (const entry of rankedScenarios) lines.push(`- ${entry.scenario.id} | ${entry.scenario.label} | 匹配分 ${entry.score}`);
	lines.push("", "候选 payload：");
	for (const entry of rankedPayloads) {
		const variant = selected(entry.payload);
		lines.push(
			`- ${entry.payload.id} | ${entry.payload.title} | 匹配分 ${entry.score} | 风险 ${riskLabel(entry.payload.risk)}`,
			variant ? `  variant ${variant.id}: ${variant.template}` : "",
			variant ? `  判据: ${variant.verify}` : "",
			`  停止: ${entry.payload.stop}`,
		);
	}
	return lines.filter(Boolean).join("\n");
}

function get(args) {
	const ids = (args.ids ?? []).map((id) => String(id).trim()).filter(Boolean);
	const includeBypass = args.includeBypass !== false;
	const sections = [];
	const missing = [];
	for (const id of ids) {
		const payload = payloads.find((entry) => entry.id === id);
		if (!payload) {
			missing.push(id);
			continue;
		}
		const lines = [
			`## ${payload.id} | ${payload.title}`,
			`类别 ${payload.category} | 风险 ${riskLabel(payload.risk)}${riskSuffix(payload)} | 场景 ${payload.scenarios.join("/")}`,
			`停止条件: ${payload.stop}`,
			"",
			"变体:",
		];
		for (const variant of payload.variants) {
			lines.push(
				`- ${variant.id}${variant.id === payload.selectedVariant ? "（首选）" : ""} | 完整度 ${variant.score}/5 | ${variant.label}`,
				`  模板: ${variant.template}`,
				`  判据: ${variant.verify}`,
				`  来源: ${variant.source}`,
			);
		}
		if (includeBypass && payload.bypassVariants?.length) {
			lines.push("", "WAF 绕过变体:");
			for (const bypass of payload.bypassVariants) {
				lines.push(
					`- ${bypass.id} | ${bypass.technique} | 风险 ${riskLabel(bypass.risk)}`,
					`  模板: ${bypass.template}`,
					`  解码: ${bypass.decodeSteps.join(" -> ")}`,
					`  适用: ${bypass.applicableWhen}`,
				);
			}
		}
		sections.push(lines.join("\n"));
	}
	if (missing.length) sections.push(`未找到: ${missing.join(", ")}`);
	return sections.join("\n\n");
}

function sendJson(response, status, payload) {
	const body = JSON.stringify(payload);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body),
	});
	response.end(body);
}

function result(id, value) {
	return { jsonrpc: "2.0", id, result: value };
}

function error(id, code, message) {
	return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function handleRpc(message) {
	if (!message || typeof message !== "object") return error(null, -32600, "invalid request");
	const id = message.id;
	const method = message.method;
	if (method === "initialize") {
		return result(id, {
			protocolVersion: typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : PROTOCOL_VERSION,
			capabilities: { tools: {} },
			serverInfo: { name: "sentinel-payload-catalog", version: "0.1.0" },
		});
	}
	if (method === "ping") return result(id, {});
	if (method === "tools/list") return result(id, { tools: TOOLS });
	if (method === "tools/call") {
		const name = message.params?.name;
		const args = message.params?.arguments ?? {};
		const handlers = { payload_search: search, payload_select: select, payload_get: get };
		const handler = handlers[name];
		if (!handler) return error(id, -32602, `unknown tool ${String(name)}`);
		return result(id, { content: [{ type: "text", text: handler(args) }] });
	}
	if (method === "resources/list") return result(id, { resources: [] });
	if (method === "prompts/list") return result(id, { prompts: [] });
	if (id === undefined) return null;
	return error(id, -32601, `method not found: ${String(method)}`);
}

const server = createServer((request, response) => {
	if (request.method === "GET" && request.url === "/healthz") {
		sendJson(response, 200, { ok: true });
		return;
	}
	if (request.url !== "/mcp" || request.method !== "POST") {
		sendJson(response, 404, { error: "not found" });
		return;
	}
	const chunks = [];
	request.on("data", (chunk) => chunks.push(chunk));
	request.on("end", () => {
		let payload;
		try {
			payload = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
		} catch {
			sendJson(response, 400, error(null, -32700, "parse error"));
			return;
		}
		const answer = Array.isArray(payload) ? payload.map(handleRpc).filter(Boolean) : handleRpc(payload);
		if (answer === null) {
			response.writeHead(202).end();
			return;
		}
		sendJson(response, 200, answer);
	});
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(`payload-catalog MCP listening on ${PORT}`);
});

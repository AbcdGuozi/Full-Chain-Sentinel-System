/**
 * Scenario-aware payload selection over the migrated payload catalog.
 *
 * The catalog is reference material, not an execution engine. It answers three
 * questions: which scenario matches the current input surface, which variant is
 * the most complete for that scenario, and which WAF-bypass form fits the
 * observed decoding behaviour. Destructive entries are manual-review-only;
 * other high-risk entries may be sent once to confirm the issue, then stop.
 */

import { readFileSync } from "node:fs";
import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const MAX_LIST = 20;
const MAX_MATCHES = 8;
const MAX_OUTPUT = 14000;

export type PayloadRisk = "low" | "medium" | "high";

export interface PayloadVariant {
	id: string;
	source: string;
	label: string;
	template: string;
	verify: string;
	score: number;
	reason: string;
}

export interface PayloadBypassVariant {
	id: string;
	technique: string;
	template: string;
	decodeSteps: string[];
	risk: PayloadRisk;
	note: string;
	applicableWhen: string;
}

export interface CatalogPayload {
	id: string;
	category: string;
	title: string;
	assetTypes: string[];
	scenarios: string[];
	signals: unknown;
	risk: PayloadRisk;
	destructive: boolean;
	requiresConfirmation: boolean;
	selectedVariant: string;
	variants: PayloadVariant[];
	bypassVariants?: PayloadBypassVariant[];
	stop: string;
}

export interface CatalogScenario {
	id: string;
	label: string;
	assetTypes: string[];
	signals: unknown;
	payloads: string[];
}

interface PayloadCatalog {
	version: number;
	updatedAt: string;
	sourcePolicy: Record<string, unknown>;
	scenarios: CatalogScenario[];
	payloads: CatalogPayload[];
}

export interface PayloadToolOptions {
	/** Absolute path to payload-catalog.json. */
	catalogPath: string;
}

/** Flatten strings from arrays, objects and nested values (old catalogs used objects). */
export function signalText(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) return value.map(signalText).filter(Boolean).join(" ");
	if (value && typeof value === "object") {
		return Object.entries(value as Record<string, unknown>)
			.flatMap(([key, entry]) => [key, signalText(entry)])
			.filter(Boolean)
			.join(" ");
	}
	return "";
}

function loadCatalog(path: string): PayloadCatalog {
	return JSON.parse(readFileSync(path, "utf-8")) as PayloadCatalog;
}

function selectedVariant(payload: CatalogPayload): PayloadVariant | undefined {
	return payload.variants.find((variant) => variant.id === payload.selectedVariant) ?? payload.variants[0];
}

function riskLabel(risk: PayloadRisk): string {
	return risk === "high" ? "高" : risk === "medium" ? "中" : "低";
}

function clip(text: string): string {
	return text.length <= MAX_OUTPUT ? text : `${text.slice(0, MAX_OUTPUT)}\n…（输出已截断，共 ${text.length} 字符）`;
}

function oneLine(text: string): string {
	return text.replaceAll("\n", " ").replaceAll("\r", " ").trim();
}

function payloadLine(payload: CatalogPayload): string {
	const variant = selectedVariant(payload);
	return [
		`- ${payload.id} | ${payload.title}`,
		`风险 ${riskLabel(payload.risk)}${riskSuffix(payload)}`,
		`场景 ${payload.scenarios.join("/")}`,
		`首选 ${variant?.label ?? "无"}`,
	].join(" | ");
}

function riskSuffix(payload: CatalogPayload): string {
	if (payload.destructive) return "（破坏性，仅人工复核）";
	if (payload.risk === "high") return "（可执行到确认）";
	return "";
}

function scoreScenario(scenario: CatalogScenario, signals: string[], assetType: string | undefined): number {
	const haystack = `${signalText(scenario.signals).toLowerCase()} ${scenario.label.toLowerCase()}`;
	let score = 0;
	for (const signal of signals) {
		const needle = signal.trim().toLowerCase();
		if (needle && haystack.includes(needle)) score += 3;
	}
	if (assetType && scenario.assetTypes.includes(assetType)) score += 2;
	return score;
}

function scorePayload(payload: CatalogPayload, signals: string[], scenarioId: string | undefined): number {
	const haystack = [
		payload.id,
		payload.title,
		payload.category,
		signalText(payload.signals),
		...payload.variants.flatMap((variant) => [variant.label, variant.source, variant.reason]),
	]
		.join(" ")
		.toLowerCase();
	let score = 0;
	for (const signal of signals) {
		const needle = signal.trim().toLowerCase();
		if (needle && haystack.includes(needle)) score += 1;
	}
	if (scenarioId && payload.scenarios.includes(scenarioId)) score += 4;
	return score;
}

interface SearchDetails {
	ok: boolean;
	count: number;
	hasMore: boolean;
}

interface SelectDetails {
	ok: boolean;
	scenario: string | null;
	payloads: string[];
}

interface ReadDetails {
	ok: boolean;
	ids: string[];
	missing: string[];
}

export function createPayloadTools(options: PayloadToolOptions): ToolDefinition[] {
	const search = defineTool({
		name: "payload_search",
		label: "Search payload catalog",
		description:
			"Search the local scenario-aware payload catalog by keyword, scenario, asset type or risk. Returns payload ids and the selected variant. The catalog is reference material: read an entry before sending anything and replace every placeholder. High-risk entries may be sent once to confirm the issue; destructive entries are manual-review-only.",
		promptSnippet: "Search the local payload catalog for a scenario, technology or vulnerability class",
		promptGuidelines: [
			"Use payload_search when choosing a payload: match the asset type and input surface first, then read the full entry with payload_get",
			"Prefer the variant marked as selected: it is the most complete one for that scenario, not merely the shortest",
			"High-risk entries stop at confirmation: no shell, no persistence, no data damage, no repeated replay",
		],
		parameters: Type.Object({
			search: Type.Optional(
				Type.String({
					description: "Case-insensitive substring over id, title, category, signals and variant text",
				}),
			),
			scenario: Type.Optional(Type.String({ description: "Scenario id from payload_select, e.g. web-search" })),
			assetType: Type.Optional(Type.String({ description: "web, api, cloud, app, miniprogram" })),
			risk: Type.Optional(
				Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
					description: "Only payloads of this risk level",
				}),
			),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_LIST })),
		}),
		execute: async (_id, params): Promise<AgentToolResult<SearchDetails>> => {
			const catalog = loadCatalog(options.catalogPath);
			const search = params.search?.trim().toLowerCase();
			const limit = params.limit ?? MAX_LIST;
			const matches = catalog.payloads.filter((payload) => {
				if (params.scenario && !payload.scenarios.includes(params.scenario)) return false;
				if (params.assetType && !payload.assetTypes.includes(params.assetType)) return false;
				if (params.risk && payload.risk !== params.risk) return false;
				if (!search) return true;
				const haystack = [
					payload.id,
					payload.title,
					payload.category,
					signalText(payload.signals),
					...payload.variants.flatMap((variant) => [variant.label, variant.source, variant.template]),
				]
					.join(" ")
					.toLowerCase();
				return haystack.includes(search);
			});
			const shown = matches.slice(0, limit);
			const details = { ok: true, count: matches.length, hasMore: matches.length > shown.length };
			const text = shown.length
				? shown.map(payloadLine).join("\n") +
					(details.hasMore ? `\n…还有 ${matches.length - shown.length} 条，请缩小条件。` : "")
				: "没有匹配的 payload。换一个场景、技术栈或风险级别再试。";
			return { content: [{ type: "text", text: clip(text) }], details };
		},
	});

	const select = defineTool({
		name: "payload_select",
		label: "Select payload for signals",
		description:
			"Rank catalog scenarios and payloads against observed signals (parameter names, response features, technology hints). Use it after recon to decide which payload family fits the current input surface. It returns the best scenario, the top payload ids and their selected variants.",
		promptSnippet: "Rank payload scenarios against observed signals and an asset type",
		promptGuidelines: [
			"Call payload_select with the concrete signals you observed, not generic guesses",
			"One primary and one control payload is usually enough; do not fan out every candidate",
			"Read the chosen entry with payload_get before sending it",
		],
		parameters: Type.Object({
			signals: Type.Array(Type.String({ minLength: 1 }), {
				minItems: 1,
				maxItems: 20,
				description: "Observed signals, e.g. ['search','keyword','mysql','1064']",
			}),
			assetType: Type.Optional(Type.String({ description: "web, api, cloud, app or miniprogram" })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_MATCHES })),
		}),
		execute: async (_id, params): Promise<AgentToolResult<SelectDetails>> => {
			const catalog = loadCatalog(options.catalogPath);
			const limit = params.limit ?? 5;
			const scenarios = [...catalog.scenarios]
				.map((scenario) => ({ scenario, score: scoreScenario(scenario, params.signals, params.assetType) }))
				.filter((entry) => entry.score > 0)
				.sort((left, right) => right.score - left.score)
				.slice(0, 3);
			const primary = scenarios[0]?.scenario;
			const payloads = [...catalog.payloads]
				.map((payload) => ({ payload, score: scorePayload(payload, params.signals, primary?.id) }))
				.filter((entry) => entry.score > 0)
				.sort((left, right) => right.score - left.score)
				.slice(0, limit);
			const lines = ["场景排序："];
			if (scenarios.length === 0) lines.push("- 没有匹配场景；先补充更具体的参数名、回包特征或技术栈。");
			for (const entry of scenarios) {
				lines.push(
					`- ${entry.scenario.id} | ${entry.scenario.label} | 匹配分 ${entry.score} | 候选 payload ${entry.scenario.payloads.length} 条`,
				);
			}
			lines.push("", "候选 payload：");
			if (payloads.length === 0) lines.push("- 没有匹配 payload；用 payload_search 按类别检索。");
			for (const entry of payloads) {
				const variant = selectedVariant(entry.payload);
				lines.push(
					`- ${entry.payload.id} | ${entry.payload.title} | 匹配分 ${entry.score} | 风险 ${riskLabel(entry.payload.risk)}${riskSuffix(entry.payload)}`,
				);
				if (variant) lines.push(`  variant ${variant.id}: ${oneLine(variant.template)}`);
				if (variant) lines.push(`  判据: ${oneLine(variant.verify)}`);
				lines.push(`  停止: ${oneLine(entry.payload.stop)}`);
			}
			lines.push("", "先取一个主 payload 和一个对照，确认占位符、闭合上下文和停止条件后再发送。");
			return {
				content: [{ type: "text", text: clip(lines.join("\n")) }],
				details: { ok: true, scenario: primary?.id ?? null, payloads: payloads.map((entry) => entry.payload.id) },
			};
		},
	});

	const read = defineTool({
		name: "payload_get",
		label: "Read payload entry",
		description:
			"Read full payload entries by id: variants, selected template, verification criteria, WAF-bypass variants and stop conditions. Placeholders must be replaced before use. High-risk entries may be sent once to confirm the issue; destructive entries are manual review only. Stop after confirmation.",
		promptSnippet: "Read a payload entry with variants, bypass forms and stop conditions",
		promptGuidelines: [
			"Read the selected variant and at least one bypass variant before choosing what to send",
			"If the stop condition matches the current target, stop instead of sending",
			"High-risk proof actions stop at confirmation: no shell, no persistence, no data damage",
		],
		parameters: Type.Object({
			ids: Type.Array(Type.String({ minLength: 1 }), {
				minItems: 1,
				maxItems: 4,
				description: "Payload ids from payload_search or payload_select",
			}),
			includeBypass: Type.Optional(Type.Boolean({ description: "Include WAF-bypass variants (default true)" })),
		}),
		execute: async (_id, params): Promise<AgentToolResult<ReadDetails>> => {
			const catalog = loadCatalog(options.catalogPath);
			const found: CatalogPayload[] = [];
			const missing: string[] = [];
			for (const id of params.ids) {
				const payload = catalog.payloads.find((entry) => entry.id === id);
				if (payload) found.push(payload);
				else missing.push(id);
			}
			const sections: string[] = [];
			for (const payload of found) {
				const lines = [
					`## ${payload.id} | ${payload.title}`,
					`类别 ${payload.category} | 风险 ${riskLabel(payload.risk)}${riskSuffix(payload)} | 场景 ${payload.scenarios.join("/")}`,
					`停止条件: ${oneLine(payload.stop)}`,
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
				if (payload.bypassVariants?.length && params.includeBypass !== false) {
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
			return {
				content: [{ type: "text", text: clip(sections.join("\n\n")) }],
				details: { ok: true, ids: found.map((payload) => payload.id), missing },
			};
		},
	});

	return [search, select, read];
}

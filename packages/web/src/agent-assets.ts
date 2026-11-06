/**
 * Bundled knowledge assets.
 *
 * The console ships the migrated skill library and payload catalog with the
 * checkout. They are seeded into the agent configuration directory once, so a
 * fresh install has the same knowledge a source checkout has. Existing files
 * are never overwritten: an operator edit is the more valuable copy.
 */

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository `agent-assets` directory. A compiled binary has no sibling tree. */
export function bundledAgentAssetsDir(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "agent-assets");
}

/** Skill and payload files seeded into `agentDir` when they are missing. */
export function seedBundledAgentAssets(agentDir: string): void {
	const root = bundledAgentAssetsDir();
	if (!existsSync(root)) return;
	for (const name of ["skills", "payloads"]) {
		const source = join(root, name);
		if (!existsSync(source)) continue;
		const destination = join(agentDir, name);
		mkdirSync(destination, { recursive: true });
		cpSync(source, destination, {
			recursive: true,
			force: false,
			errorOnExist: false,
			filter: (path) => !path.endsWith(".DS_Store"),
		});
	}
}

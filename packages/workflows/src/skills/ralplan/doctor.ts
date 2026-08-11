import { readdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { transactionJournalPath } from "#workflows/session/session-layout";
import { criticObstacleAgreement, latestCriticPass, latestCriticVerdict } from "#workflows/skills/ralplan/approval";
import { ralplanCompletionProvenancePath } from "#workflows/skills/ralplan/completion-transaction";
import { isPlainObject, readRalplanStatus } from "#workflows/skills/ralplan/index-store";
import { readRalplanObstacleLedger } from "#workflows/skills/ralplan/obstacles";
import type { RalplanDoctorResult, RalplanIndexRow } from "#workflows/skills/ralplan/types";
import { sha256 } from "#workflows/state/state-writer";

export async function doctorRalplan(cwd: string, sessionId: string, runId?: string): Promise<RalplanDoctorResult> {
	const status = await readRalplanStatus(cwd, sessionId, runId);
	const problems: string[] = [];
	const warnings: string[] = [];
	if (!status.run_id) problems.push("missing ralplan run_id");
	for (const line of status.invalid_index_lines) problems.push(`invalid index line ${line.line}: ${line.reason}`);
	const seen = new Map<string, RalplanIndexRow>();
	for (const row of status.rows) {
		const key = `${row.stage}:${row.stage_n}`;
		const prior = seen.get(key);
		if (prior && prior.sha256 !== row.sha256) problems.push(`conflicting index rows for ${key}`);
		seen.set(key, row);
		try {
			const content = await readFile(row.path, "utf8");
			if (sha256(content) !== row.sha256) problems.push(`sha256 mismatch for ${row.path}`);
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			problems.push(`cannot read artifact ${row.path}: ${err.message}`);
		}
		try {
			const sidecar = JSON.parse(await readFile(ralplanCompletionProvenancePath(row.path), "utf8")) as unknown;
			if (!isPlainObject(sidecar)) problems.push(`completion provenance sidecar is invalid for ${row.path}`);
			else {
				if (sidecar.artifact_sha256 !== row.sha256)
					problems.push(`completion provenance hash mismatch for ${row.path}`);
				if (sidecar.stage !== row.stage || sidecar.stage_n !== row.stage_n)
					problems.push(`completion provenance stage mismatch for ${row.path}`);
			}
		} catch {
			warnings.push(`missing completion provenance sidecar for ${row.path}`);
		}
	}
	if (status.pending_approval) {
		if (!status.pending_approval_path) problems.push("pending approval phase has no pending_approval_path");
		else {
			try {
				await readFile(status.pending_approval_path, "utf8");
			} catch {
				problems.push(`pending approval artifact is missing: ${status.pending_approval_path}`);
			}
		}
		const pendingCriticVerdict = latestCriticVerdict(status.rows);
		if (pendingCriticVerdict === "reject") warnings.push("pending approval but the latest critic verdict is REJECT");
		else if (pendingCriticVerdict === "iterate")
			warnings.push(
				"pending approval but the latest critic verdict is ITERATE (not re-reviewed after last revision)",
			);
		// R-2 obstacle-ledger agreement warning (mirror of the approve dev-assert).
		// Doctor surfaces divergence (including an empty ledger against a blocker
		// verdict) as a warning rather than throwing.
		const pass = latestCriticPass(status.rows);
		if (pass && status.run_id) {
			const ledger = await readRalplanObstacleLedger(cwd, status.run_id, sessionId);
			if (ledger.obstacles.length === 0) {
				if (pass.verdict === "reject" || pass.verdict === "iterate")
					warnings.push(
						`latest critic verdict is ${pass.verdict.toUpperCase()} but the obstacle ledger is empty (dual-write may have failed or run predates R-1)`,
					);
			} else {
				const agreement = criticObstacleAgreement(pass, ledger);
				if (!agreement.agree) warnings.push(`critic/obstacle divergence: ${agreement.reason}`);
			}
		}
	}
	if (status.run_id) {
		const txDir = dirname(transactionJournalPath(cwd, sessionId, "probe"));
		try {
			const files = await readdir(txDir);
			for (const file of files.sort()) {
				if (!file.endsWith(".json")) continue;
				try {
					const journal = JSON.parse(await readFile(`${txDir}/${file}`, "utf8")) as unknown;
					if (!isPlainObject(journal) || journal.type !== "ralplan_completion" || journal.run_id !== status.run_id)
						continue;
					const steps = Array.isArray(journal.steps) ? journal.steps.filter(isPlainObject) : [];
					if (journal.status === "pending" && steps.some((step) => step.status === "done"))
						problems.push(`partial completion journal: ${file}`);
					else if (journal.status === "pending") warnings.push(`stale intent journal: ${file}`);
					else if (journal.status === "rolled_back") warnings.push(`rolled back ralplan completion: ${file}`);
					else if (journal.status !== "committed" && journal.status !== "complete")
						problems.push(`unknown transaction journal status in ${file}`);
				} catch (error) {
					const err = error as NodeJS.ErrnoException;
					problems.push(`invalid transaction journal ${file}: ${err.message}`);
				}
			}
		} catch {
			// No transaction directory yet.
		}
	}
	if (status.rows.length === 0) warnings.push("ralplan index is empty");
	return { ok: problems.length === 0, problems, warnings, status };
}

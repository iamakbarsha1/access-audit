import { db, eq } from "@access-audit/db";
import { violations as violationsTable } from "@access-audit/db/schema";
import { generateFixSuggestions } from "./ai-client.js";
import { publishProgress } from "./progress.js";
import { config } from "./config.js";

interface ViolationRow {
  id: string;
  ruleId: string;
  description: string;
  helpUrl: string | null;
  wcagTags: string[] | null;
  htmlSnippet: string | null;
  selector: string | null;
}

/**
 * Process AI fix suggestions for all violations in a scan.
 * Groups violations by ruleId, calls Claude Haiku per group,
 * updates aiExplanation + aiFixCode on each violation row.
 */
export async function processAiSuggestions(scanId: string): Promise<void> {
  // Load all violations for this scan
  const allViolations = await db
    .select({
      id: violationsTable.id,
      ruleId: violationsTable.ruleId,
      description: violationsTable.description,
      helpUrl: violationsTable.helpUrl,
      wcagTags: violationsTable.wcagTags,
      htmlSnippet: violationsTable.htmlSnippet,
      selector: violationsTable.selector,
    })
    .from(violationsTable)
    .where(eq(violationsTable.scanId, scanId));

  if (allViolations.length === 0) {
    console.log(`[ai-suggestions] No violations for scan ${scanId}, skipping`);
    await publishProgress(scanId, { event: "ai_complete", scanId });
    return;
  }

  // Group violations by ruleId
  const groups = new Map<string, ViolationRow[]>();
  for (const v of allViolations) {
    const existing = groups.get(v.ruleId) ?? [];
    existing.push(v);
    groups.set(v.ruleId, existing);
  }

  const totalGroups = groups.size;
  console.log(
    `[ai-suggestions] Processing ${allViolations.length} violations in ${totalGroups} rule groups for scan ${scanId}`
  );

  await publishProgress(scanId, {
    event: "ai_start",
    scanId,
    totalGroups,
  });

  let groupsProcessed = 0;

  for (const [ruleId, ruleViolations] of groups) {
    try {
      // Chunk into batches of max N violations per prompt
      const maxPerPrompt = config.aiMaxViolationsPerPrompt;
      const chunks: ViolationRow[][] = [];
      for (let i = 0; i < ruleViolations.length; i += maxPerPrompt) {
        chunks.push(ruleViolations.slice(i, i + maxPerPrompt));
      }

      let sharedExplanation: string | null = null;

      for (const chunk of chunks) {
        // Use first violation's metadata for the prompt (all share the same rule)
        const first = chunk[0];
        if (!first) continue;

        const result = await generateFixSuggestions({
          ruleId,
          description: first.description,
          helpUrl: first.helpUrl ?? "",
          wcagTags: first.wcagTags ?? [],
          violations: chunk.map((v) => ({
            id: v.id,
            htmlSnippet: v.htmlSnippet ?? "",
            selector: v.selector ?? "",
          })),
        });

        // First chunk's explanation is used for all violations in the group
        if (!sharedExplanation) {
          sharedExplanation = result.explanation;
        }

        // Update each violation with AI results
        for (let i = 0; i < chunk.length; i++) {
          const violation = chunk[i];
          if (!violation) continue;
          const fixCode = result.fixes[i] ?? null;
          await db
            .update(violationsTable)
            .set({
              aiExplanation: sharedExplanation,
              aiFixCode: fixCode,
            })
            .where(eq(violationsTable.id, violation.id));
        }
      }

      groupsProcessed++;
      await publishProgress(scanId, {
        event: "ai_progress",
        scanId,
        groupsProcessed,
        totalGroups,
        currentRule: ruleId,
      });
    } catch (err) {
      // Partial failure: skip this group, continue with remaining
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[ai-suggestions] Failed to process rule "${ruleId}" for scan ${scanId}: ${errorMsg}`
      );
      groupsProcessed++;
    }
  }

  await publishProgress(scanId, { event: "ai_complete", scanId });
  console.log(`[ai-suggestions] Completed AI suggestions for scan ${scanId}`);
}

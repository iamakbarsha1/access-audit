# Phase 3 Design Spec: AI Fix Suggestions

## Overview

Add Claude Haiku 4.5 integration to the scanner service to generate plain-English violation explanations and copy-paste fix code for each WCAG violation found during scans.

**Approach:** Post-scan batch processing. Scans complete fast with null AI fields, then a second BullMQ job generates AI suggestions in bulk. Users see violations immediately; AI suggestions appear shortly after.

**Cost model:** ~$0.001-0.005 per scan at Haiku rates ($0.25/M input, $1.25/M output). Deduplication by `ruleId` reduces API calls from N violations to N unique rules (typically 5-15 per scan).

## Architecture

```
Scan completes
  → worker auto-enqueues "ai-suggestions" job with { scanId }
  → worker picks up AI job
  → loads all violations for scan from DB
  → groups violations by ruleId
  → calls Claude Haiku once per ruleId group
  → updates aiExplanation + aiFixCode on each violation row
```

Same BullMQ queue (`scan-queue`), same worker process. Job routing by job name: `"scan"` vs `"ai-suggestions"`.

## Components

### 1. Anthropic SDK Client — `apps/scanner/src/ai-client.ts`

Singleton `Anthropic` client. Single exported function:

```typescript
generateFixSuggestions(input: {
  ruleId: string;
  description: string;
  helpUrl: string;
  wcagTags: string[];
  violations: Array<{ id: string; htmlSnippet: string; selector: string }>;
}): Promise<AiFixResult>
```

- Reads `ANTHROPIC_API_KEY` from config
- Uses `claude-haiku-4-5-20251001` model
- Requests JSON response format
- Retry: 3 attempts with exponential backoff (1s, 2s, 4s) on transient errors (rate limits, 500s)
- Timeout: 30s per API call

### 2. Prompt Design

One API call per unique `ruleId` per scan. Prompt structure:

```
System: You are an accessibility expert helping developers fix WCAG violations.
Respond ONLY with valid JSON matching this schema:
{ "explanation": string, "fixes": string[] }

User:
A WCAG audit found violations of rule "{ruleId}".

Rule: {description}
WCAG tags: {wcagTags joined}
Reference: {helpUrl}

The following {N} HTML elements violate this rule:

1. Selector: {selector}
   HTML: {htmlSnippet}

2. Selector: {selector}
   HTML: {htmlSnippet}

...

Provide:
1. "explanation" — A plain-English explanation of why this is an accessibility problem (2-3 sentences, for a non-technical audience)
2. "fixes" — An array with one corrected HTML snippet per element above, in the same order
```

**Constraints:**
- Max 20 violations per prompt. Groups larger than 20 are split into chunks. All chunks share the same `explanation` from the first chunk's response.
- `htmlSnippet` is truncated to 500 chars to avoid bloating the prompt.

### 3. AI Suggestions Processor — `apps/scanner/src/ai-suggestions.ts`

Main orchestrator function:

```typescript
processAiSuggestions(scanId: string, publishProgress: ProgressPublisher): Promise<void>
```

Flow:
1. Load all violations for `scanId` from DB (join on `scan_pages` to get scan's violations)
2. Group violations by `ruleId`
3. Publish `ai_start` progress event with `{ totalGroups }`
4. For each ruleId group:
   a. Chunk into batches of max 20 violations
   b. Call `generateFixSuggestions()` for each chunk (all chunks use the same prompt — explanation is idempotent)
   c. First chunk's `explanation` is used for all violations in the group (subsequent chunks' explanations are discarded)
   d. Batch-update `aiExplanation` and `aiFixCode` on each violation row
   e. Publish `ai_progress` with `{ groupsProcessed, totalGroups, currentRule }`
5. On success: publish `ai_complete`
6. On failure: publish `ai_failed` with error, allow partial results to persist

**Partial failure handling:** If one ruleId group fails (e.g., API error after retries), log the error, skip that group, and continue processing remaining groups. Violations in the failed group keep null AI fields.

### 4. Worker Routing — modify `apps/scanner/src/worker.ts`

Current worker handles `"scan"` jobs. Changes:

- Add job name routing: `if (job.name === "scan")` → existing pipeline, `if (job.name === "ai-suggestions")` → call `processAiSuggestions()`
- At the end of a successful scan job, enqueue: `queue.add("ai-suggestions", { scanId }, { jobId: scanId-ai, attempts: 2, backoff: { type: "exponential", delay: 10000 } })`
- AI job uses its own retry config (2 attempts, 10s backoff) independent of scan job retries

### 5. Types — modify `apps/scanner/src/types.ts`

New types:

```typescript
interface AiSuggestionsJob {
  scanId: string;
}

interface AiFixResult {
  explanation: string;
  fixes: string[];
}
```

New progress events (added to `ProgressEvent` union):

```typescript
| { type: "ai_start"; scanId: string; totalGroups: number }
| { type: "ai_progress"; scanId: string; groupsProcessed: number; totalGroups: number; currentRule: string }
| { type: "ai_complete"; scanId: string }
| { type: "ai_failed"; scanId: string; error: string }
```

### 6. Config — modify `apps/scanner/src/config.ts`

New environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes (for AI jobs) | — | Anthropic API key |
| `AI_MODEL` | No | `claude-haiku-4-5-20251001` | Model to use |
| `AI_MAX_VIOLATIONS_PER_PROMPT` | No | `20` | Max violations per API call |
| `AI_MAX_RETRIES` | No | `3` | Max retries per API call |
| `AI_TIMEOUT_MS` | No | `30000` | Timeout per API call |

`ANTHROPIC_API_KEY` is validated at AI job start, not at service boot — so the scanner can run scan-only without it.

### 7. Web App Scan Queue — modify `apps/web/src/lib/scan-queue.ts`

Update the job data type to be a union:

```typescript
type ScanJobData = {
  scanId: string;
  siteId: string;
  url: string;
  maxPages: number;
} | {
  scanId: string;  // AI suggestions job only needs scanId
};
```

No other web app changes needed — the `violations` tRPC router already returns `aiExplanation` and `aiFixCode` fields from the schema.

### 8. Dependencies

Add to `apps/scanner/package.json`:

```json
"@anthropic-ai/sdk": "^0.52.0"
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Claude API down | AI job fails after retries, violations keep null AI fields, scan result unaffected |
| Rate limited | Exponential backoff (1s, 2s, 4s), retry up to 3 times |
| Single ruleId group fails | Skip group, process remaining, partial AI results persist |
| Invalid JSON response | Retry once, then skip group |
| ANTHROPIC_API_KEY missing | AI job fails immediately with clear error, scan jobs unaffected |
| Scan has 0 violations | AI job completes immediately (nothing to process) |

## What This Does NOT Include

- **On-demand generation** — post-MRR enhancement (Option 3), lazy generation when user views a violation
- **Claude-powered page analysis** — post-MRR (Option B), full AI scanning beyond axe-core
- **UI changes** — displaying AI suggestions is Phase 4 dashboard work
- **Streaming** — Haiku responses are small enough that streaming isn't needed

export const features = { plainTextCompaction: true, outputBudget: true, nativeOutputCaps: true, liteSearch: false, rewritePersona: false, projectInstructions: true, compaction: true };
export const persona = `You are a coding agent powered by the {model} model.
Complete verifiable engineering work with few model round trips. Inspect relevant code and project instructions before editing. Use the exposed tools and their exact schemas. Prefer targeted edits. Batch independent read-only checks when useful; check dependencies and results before writes. Keep tool output focused; reduced output is a preview, so retrieve omitted details when needed for diagnosis. Verify meaningful changes with the smallest relevant checks. Report what changed, what was verified and remaining work in the user's language. Preserve correctness, permissions and cancellation.`;
// Preserve the baseline's compaction headroom. A smaller model window must
// not also remove its safety reservation, especially in the desktop Profile.
export const compaction = { thresholdRatio: 0.75, headroomTokens: 65536, retainRatio: 0.16, maxTokens: 8192, compactionRetries: 0, maxOverflowRetries: 1, plainText: true, maxSummaryAttemptsPerSurface: 2 };
export const search = { sampleOverCapGlobResults: false, globMaxResults: 80, grepMaxMatches: 80, grepMaxLineBytes: 512, searchMetaMaxBytes: 8192 };
export const recovery = { mode: 'normal', maxRetries: 1, retryableCodes: ['RATE_LIMIT'], backoff: { initialDelayMs: 1000, maxDelayMs: 10000, jitterRatio: 0.1 } };

export function buildSystemPrompt(): string {
  return [
    "MEMORY-WORTH memory policy: trust is associational, never causal.",
    "Search memory before answering when prior context could help; store durable insights with memory_write (applies_when is required); prefer updating over duplicating.",
    "Trust labels are population quantiles: high co-occurred with success, low with failure, unproven means too little evidence.",
    "Write-time constraints beat post-hoc filters: ground memories to files, symbols, or git refs.",
    "Lines prefixed [MEMORY] are already rendered in the transcript as their own message parts, so the user has seen them. Act on their content silently and do not quote, summarize, or repeat them back in your reply.",
    "Your reply stands on its own: a captured rule must already be honoured, not announced as 'I noted that'.",
  ].join(" ")
}
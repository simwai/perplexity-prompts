export function buildMemoryPromptFragment(memories: Array<{ content: string; trust_label: string; trust_score: number }>): string {
  if (memories.length === 0) return "";

  const lines = memories.map((m, i) => {
    const confidence = m.trust_score >= 0.7 ? "high" : m.trust_score <= 0.3 ? "low" : "neutral";
    return `[${i + 1}] (trust: ${m.trust_label}, confidence: ${confidence})\n${m.content}`;
  });

  return `\n\n--- Persistent memories (${memories.length}) ---\n${lines.join("\n\n")}\n--- End memories ---\n`;
}

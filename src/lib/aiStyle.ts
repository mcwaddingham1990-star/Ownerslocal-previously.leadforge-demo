// Turns the owner's real, persisted AI Assistant Config-tab settings into
// the styleGuidance string sent with every AI request (see server/aiHandler.ts
// buildSystemInstruction) -- this is how the assistant "learns" the owner's
// tone and bidding/writing preferences, shared by every place that calls
// /api/ai/ask so the guidance is never duplicated or drifted between them.
export interface AiKnowledgeBase {
  selectedKBDoc: string;
  creativityLevel: number;
  aiTone: string;
  styleNotes: string;
}

const TONE_LABELS: Record<string, string> = {
  analytical: "straight to the point, factual",
  supportive: "friendly and encouraging",
  brutalist: "short and blunt, just the facts",
  sales: "sales-minded, always closing"
};

export function buildStyleGuidance(kb: AiKnowledgeBase): string {
  const parts = [
    `Tone: ${TONE_LABELS[kb.aiTone] || kb.aiTone}.`,
    `Creativity: ${kb.creativityLevel}/100 (higher = more personality/embellishment, lower = plain facts).`
  ];
  if (kb.styleNotes.trim()) parts.push(`Owner's own notes on how they want things written/bid: ${kb.styleNotes.trim()}`);
  return parts.join(" ");
}

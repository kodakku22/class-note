// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { extractJSON, type LearningCoachResult } from '../../electron/ai/agents';

describe('learningCoach output contract', () => {
  it('extracts the shared learning-coach JSON shape from fenced output', () => {
    const parsed = extractJSON<LearningCoachResult>(`Result:\n\n\`\`\`json
{
  "diagnosis": "核心は手法と限界の接続です。",
  "keyConcepts": [{ "term": "Attention", "explanation": "系列内の依存を重み付けする仕組み", "confidence": "high" }],
  "misconceptions": ["万能な長期記憶ではない"],
  "quiz": [{ "question": "Attentionは何を重み付けするか", "answer": "トークン間の関連度", "difficulty": "easy" }],
  "nextActions": ["実験設定を確認する"],
  "suggestedNotes": [{ "title": "Self-Attention", "reason": "関連概念を切り出すため" }]
}
\`\`\``);

    expect(parsed?.diagnosis).toContain('核心');
    expect(parsed?.keyConcepts[0].term).toBe('Attention');
    expect(parsed?.quiz[0].difficulty).toBe('easy');
    expect(parsed?.suggestedNotes[0].title).toBe('Self-Attention');
  });
});

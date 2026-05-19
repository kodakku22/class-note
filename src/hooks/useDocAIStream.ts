// useDocAIStream — owns the docai:* streaming-event subscription and the
// turn-by-turn Q&A state. Extracted from DocAIPanel.tsx so the panel can stay
// a thin composition root.
//
// Race-condition hardening: each ask() call bumps an internal session id;
// late-arriving chunk/done events for a previous session are silently ignored.
// This protects against the user switching the active document while a stream
// is still flushing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocAICitation } from '../types';

export type Turn = {
  role: 'user' | 'assistant';
  content: string;
  citations?: DocAICitation[];
};

export type DocAIStreamOptions = {
  filePath: string;
};

export type DocAIStreamResult = {
  turns: Turn[];
  streaming: boolean;
  streamingText: string;
  streamingCitations: DocAICitation[];
  followUps: string[];
  error: string | null;
  ask: (question: string, opts: { isMultiDoc: boolean; allActivePaths: string[] }) => Promise<void>;
  /** Forcefully reset everything (called when filePath changes). */
  reset: () => void;
  /** Clear only the user-facing error banner. */
  clearError: () => void;
};

export function useDocAIStream({ filePath }: DocAIStreamOptions): DocAIStreamResult {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<DocAICitation[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Monotonic session id. Bumped on every `ask`. Stream events with a stale
  // session id are dropped (handled via ref so subscribers see latest).
  const sessionRef = useRef(0);
  const ackedSessionRef = useRef(0);

  const reset = useCallback(() => {
    setTurns([]);
    setStreamingText('');
    setStreamingCitations([]);
    setFollowUps([]);
    setStreaming(false);
    setError(null);
    sessionRef.current += 1;
    ackedSessionRef.current = sessionRef.current;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Subscribe to streaming events once (re-subscribe is unnecessary since
  // preload exposes a single channel).
  useEffect(() => {
    const isLive = () => ackedSessionRef.current === sessionRef.current;
    const offChunk = window.api.docai.onChunk(({ text }) => {
      if (!isLive()) return;
      setStreamingText((prev) => prev + text);
    });
    const offCitations = window.api.docai.onCitations(({ citations }) => {
      if (!isLive()) return;
      setStreamingCitations(citations);
    });
    const offDone = window.api.docai.onDone(({ text, citations, suggestedFollowUps }) => {
      if (!isLive()) return;
      setTurns((prev) => [...prev, { role: 'assistant', content: text, citations }]);
      setStreamingText('');
      setStreamingCitations([]);
      setStreaming(false);
      if (suggestedFollowUps) setFollowUps(suggestedFollowUps);
    });
    const offErr = window.api.docai.onError(({ error: e }) => {
      if (!isLive()) return;
      setError(e);
      setStreamingText('');
      setStreaming(false);
    });
    return () => {
      offChunk();
      offCitations();
      offDone();
      offErr();
    };
  }, []);

  // Reset whenever the target file changes.
  useEffect(() => {
    reset();
  }, [filePath, reset]);

  const ask = useCallback<DocAIStreamResult['ask']>(
    async (question, opts) => {
      const q = question.trim();
      if (!q || streaming) return;
      setError(null);
      setStreaming(true);
      setTurns((prev) => [...prev, { role: 'user', content: q }]);
      setFollowUps([]);
      // Mark this session live; previously-in-flight events are discarded.
      sessionRef.current += 1;
      ackedSessionRef.current = sessionRef.current;
      try {
        if (opts.isMultiDoc) {
          await window.api.docai.askMulti(opts.allActivePaths, q);
        } else {
          await window.api.docai.ask(filePath, q);
        }
      } catch (err) {
        setError(String(err));
        setStreaming(false);
      }
    },
    [filePath, streaming]
  );

  return useMemo(
    () => ({
      turns,
      streaming,
      streamingText,
      streamingCitations,
      followUps,
      error,
      ask,
      reset,
      clearError,
    }),
    [turns, streaming, streamingText, streamingCitations, followUps, error, ask, reset, clearError]
  );
}

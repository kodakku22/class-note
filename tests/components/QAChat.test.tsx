import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// jsdom doesn't implement scrollTo — stub it so QAChat's auto-scroll useEffect works
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function () {};
}

// Mock heavy child components
vi.mock('../../src/components/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));
vi.mock('../../src/components/LearningAgentPanel', () => ({
  LearningAgentPanel: () => <div data-testid="learning-agent-panel" />,
}));

import { QAChat } from '../../src/components/QAChat';

const DEFAULT_PROPS = {
  vaultPath: '/vault',
  subject: 'Math',
  onOpenSettings: vi.fn(),
  onJumpToWikilink: vi.fn(),
  onJumpToFile: vi.fn(),
};

function installMocks(options?: {
  log?: string;
  ready?: boolean;
  provider?: string;
}) {
  const readLogMock = vi.fn().mockResolvedValue(options?.log ?? '');
  const askMock = vi.fn().mockResolvedValue({ ok: true });
  const onChunkMock = vi.fn().mockReturnValue(() => {});
  const onDoneMock = vi.fn().mockReturnValue(() => {});
  const onErrorMock = vi.fn().mockReturnValue(() => {});
  const getAiConfigMock = vi.fn().mockResolvedValue({
    provider: options?.provider ?? 'claude',
    authMode: 'login',
    model: 'sonnet',
    models: {
      openai: 'gpt-5.5',
      gemini: 'gemini-3.1-pro-preview',
      claudeApi: 'claude-sonnet-4-6',
      claudeLogin: 'sonnet',
    },
  });
  const getProviderAuthStatusMock = vi.fn().mockResolvedValue({
    ok: true,
    providers: {
      claude: {
        provider: 'claude',
        apiKeyConfigured: false,
        login: { installed: true, loggedIn: options?.ready !== false },
      },
    },
  });

  const origApi = window.api;
  const apiOverrides: Record<string, unknown> = {
    qa: {
      readLog: readLogMock,
      ask: askMock,
      onChunk: onChunkMock,
      onDone: onDoneMock,
      onError: onErrorMock,
    },
    settings: {
      getAiConfig: getAiConfigMock,
      getProviderAuthStatus: getProviderAuthStatusMock,
    },
  };

  (window as Record<string, unknown>).api = new Proxy(origApi, {
    get(target, prop) {
      if (typeof prop === 'string' && prop in apiOverrides) {
        return apiOverrides[prop];
      }
      return (target as Record<string | symbol, unknown>)[prop];
    },
  });

  return {
    readLogMock,
    askMock,
    onChunkMock,
    onDoneMock,
    onErrorMock,
    getAiConfigMock,
    getProviderAuthStatusMock,
    origApi,
  };
}

describe('QAChat', () => {
  let mocks: ReturnType<typeof installMocks>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = installMocks();
  });

  afterEach(() => {
    (window as Record<string, unknown>).api = mocks.origApi;
  });

  it('renders the chat UI with subject name', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    expect(screen.getByText('Math')).toBeInTheDocument();
  });

  it('shows empty state when no turns exist', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Math について質問してみよう/)).toBeInTheDocument();
    });
  });

  it('shows the input textarea and send button', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    expect(screen.getByPlaceholderText(/Math について質問/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '送信' })).toBeInTheDocument();
  });

  it('disables send button when input is empty', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled();
  });

  it('enables send button when input has text', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Math について質問/), {
        target: { value: 'What is calculus?' },
      });
    });

    expect(screen.getByRole('button', { name: '送信' })).not.toBeDisabled();
  });

  it('sends a question when clicking send', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    // Wait for ready state
    await waitFor(() => {
      expect(mocks.getAiConfigMock).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Math について質問/), {
        target: { value: 'What is calculus?' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '送信' }));
    });

    expect(mocks.askMock).toHaveBeenCalledWith('/vault', 'Math', 'What is calculus?');
  });

  it('shows user message in the chat after sending', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(mocks.getAiConfigMock).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Math について質問/), {
        target: { value: 'What is calculus?' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '送信' }));
    });

    expect(screen.getByText('What is calculus?')).toBeInTheDocument();
  });

  it('parses and displays existing log turns', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    const logContent =
      '\n## 2025-01-01 — Q\nWhat is 2+2?\n\n---\n\n## 2025-01-01 — A\n4\n\n---\n';
    mocks = installMocks({ log: logContent });

    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
    });

    // The AI response
    const renderers = screen.getAllByTestId('markdown-renderer');
    expect(renderers.some((r) => r.textContent === '4')).toBe(true);
  });

  it('shows login button when not ready', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks({ ready: false });

    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ログイン/ })).toBeInTheDocument();
    });
  });

  it('shows error when trying to send without ready AI', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks({ ready: false });

    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(mocks.getAiConfigMock).toHaveBeenCalled();
    });

    // Need to wait for the config loading to settle
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ログイン/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Math について質問/), {
        target: { value: 'test question' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '送信' }));
    });

    // Should show error, not call ask
    expect(mocks.askMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('does not send when input is whitespace only', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Math について質問/), {
        target: { value: '   ' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '送信' }));
    });

    expect(mocks.askMock).not.toHaveBeenCalled();
  });

  it('shows streaming indicator text', async () => {
    // Capture the onDone callback so we can trigger it
    let capturedOnDone: ((payload: { text: string; usage: Record<string, number> }) => void) | null =
      null;
    let capturedOnChunk: ((payload: { text: string }) => void) | null = null;

    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks();

    // Re-configure onChunk/onDone to capture callbacks
    mocks.onChunkMock.mockImplementation(
      (cb: (payload: { text: string }) => void) => {
        capturedOnChunk = cb;
        return () => {};
      }
    );
    mocks.onDoneMock.mockImplementation(
      (cb: (payload: { text: string; usage: Record<string, number> }) => void) => {
        capturedOnDone = cb;
        return () => {};
      }
    );

    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(mocks.getAiConfigMock).toHaveBeenCalled();
    });

    // Type and send
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Math について質問/), {
        target: { value: 'Test Q' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '送信' }));
    });

    // Should show "考えています..." while streaming with no text yet
    expect(screen.getByText('考えています...')).toBeInTheDocument();

    // Simulate a chunk
    await act(async () => {
      capturedOnChunk?.({ text: 'Hello' });
    });

    // Simulate done
    await act(async () => {
      capturedOnDone?.({ text: 'Hello World', usage: { input: 10, output: 5, cacheRead: 0 } });
    });

    // Should show the final answer
    await waitFor(() => {
      const renderers = screen.getAllByTestId('markdown-renderer');
      expect(renderers.some((r) => r.textContent === 'Hello World')).toBe(true);
    });

    // Should show usage
    expect(screen.getByText(/tokens/)).toBeInTheDocument();
  });

  it('shows Ctrl+Enter hint', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    expect(screen.getByText('Ctrl+Enter で送信')).toBeInTheDocument();
  });

  it('sends via Ctrl+Enter keyboard shortcut', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(mocks.getAiConfigMock).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(/Math について質問/);

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Keyboard test' } });
    });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    });

    expect(mocks.askMock).toHaveBeenCalledWith('/vault', 'Math', 'Keyboard test');
  });

  it('handles error from AI callback', async () => {
    let capturedOnError: ((payload: { error: string }) => void) | null = null;

    (window as Record<string, unknown>).api = mocks.origApi;
    mocks = installMocks();

    mocks.onErrorMock.mockImplementation(
      (cb: (payload: { error: string }) => void) => {
        capturedOnError = cb;
        return () => {};
      }
    );

    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(mocks.getAiConfigMock).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Math について質問/), {
        target: { value: 'Test Q' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '送信' }));
    });

    // Simulate error
    await act(async () => {
      capturedOnError?.({ error: 'Rate limited' });
    });

    expect(screen.getByText(/Rate limited/)).toBeInTheDocument();
  });

  it('reads the log on mount', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    expect(mocks.readLogMock).toHaveBeenCalledWith('/vault', 'Math');
  });

  it('registers event listeners on mount', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    expect(mocks.onChunkMock).toHaveBeenCalled();
    expect(mocks.onDoneMock).toHaveBeenCalled();
    expect(mocks.onErrorMock).toHaveBeenCalled();
  });

  it('shows provider name in the header', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Claude/)).toBeInTheDocument();
    });
  });

  it('clears input after sending', async () => {
    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(mocks.getAiConfigMock).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(/Math について質問/) as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'My question' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '送信' }));
    });

    expect(textarea.value).toBe('');
  });

  it('shows AI role label for assistant turns', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    const logContent =
      '\n## 2025-01-01 — Q\nQ1\n\n---\n\n## 2025-01-01 — A\nA1\n\n---\n';
    mocks = installMocks({ log: logContent });

    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText('AI')).toBeInTheDocument();
    });
  });

  it('shows Wiki save button on assistant turns that follow user turns', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    const logContent =
      '\n## 2025-01-01 — Q\nQuestion\n\n---\n\n## 2025-01-01 — A\nAnswer\n\n---\n';
    mocks = installMocks({ log: logContent });

    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Wiki に保存/)).toBeInTheDocument();
    });
  });

  it('handles AI config fetch failure gracefully', async () => {
    (window as Record<string, unknown>).api = mocks.origApi;
    const origApi = window.api;

    const failConfigMock = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const apiOverrides: Record<string, unknown> = {
      qa: {
        readLog: vi.fn().mockResolvedValue(''),
        ask: vi.fn().mockResolvedValue({ ok: true }),
        onChunk: vi.fn().mockReturnValue(() => {}),
        onDone: vi.fn().mockReturnValue(() => {}),
        onError: vi.fn().mockReturnValue(() => {}),
      },
      settings: {
        getAiConfig: failConfigMock,
        getProviderAuthStatus: vi.fn().mockResolvedValue({ ok: true, providers: {} }),
      },
    };

    (window as Record<string, unknown>).api = new Proxy(origApi, {
      get(target, prop) {
        if (typeof prop === 'string' && prop in apiOverrides) return apiOverrides[prop];
        return (target as Record<string | symbol, unknown>)[prop];
      },
    });

    await act(async () => {
      render(<QAChat {...DEFAULT_PROPS} />);
    });

    // Should not crash — should gracefully degrade
    await waitFor(() => {
      expect(failConfigMock).toHaveBeenCalled();
    });

    // Restore
    (window as Record<string, unknown>).api = origApi;
  });
});

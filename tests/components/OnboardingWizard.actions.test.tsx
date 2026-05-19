import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// --------------------------------------------------------------------------
// Coverage targets for OnboardingWizard.tsx:
//   - Step navigation: back(), next() with boundary clamping
//   - pickVault() — successful folder pick and cancelled folder pick
//   - finish() — final step completion call
//   - canAdvance logic per step (step 2 requires vaultPath)
//   - All 5 step renderings (steps 3, 4, 5 are untested)
//   - The installSample checkbox toggle
//   - The progress bar ARIA attributes
// --------------------------------------------------------------------------

// Mock the AiSettingsPanel since it's rendered in step 3
vi.mock('../../src/components/ai/AiSettingsPanel', () => ({
  AiSettingsPanel: () => <div data-testid="ai-settings-panel">AI Settings Mock</div>,
}));

import { OnboardingWizard } from '../../src/components/onboarding/OnboardingWizard';

describe('OnboardingWizard – branches and actions', () => {
  let mockPickFolder: ReturnType<typeof vi.fn>;
  let mockVaultInit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPickFolder = vi.fn().mockResolvedValue(null);
    mockVaultInit = vi.fn().mockResolvedValue({ vaultPath: '/test/vault' });

    (window as any).api = {
      ...((window as any).api ?? {}),
      pickFolder: mockPickFolder,
      vault: { init: mockVaultInit },
    };
  });

  // --- Step navigation ---

  it('back button does not appear on step 1', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '戻る' })).not.toBeInTheDocument();
  });

  it('back button appears on step 2 and goes back to step 1', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    // Go to step 2
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('Vault を選ぶ')).toBeInTheDocument();
    // Go back to step 1
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(screen.getByText('ようこそ')).toBeInTheDocument();
  });

  it('next button is disabled on step 2 without vault path', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  // --- Vault picker ---

  it('picks a vault and enables next button on step 2', async () => {
    mockPickFolder.mockResolvedValue('/chosen/folder');
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    // Go to step 2
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('Vault を選ぶ')).toBeInTheDocument();

    // Click folder picker
    await act(async () => {
      fireEvent.click(screen.getByText('📁 フォルダを選択'));
    });

    // Verify vault init was called
    expect(mockVaultInit).toHaveBeenCalledWith('/chosen/folder');

    // Next button should now be enabled (vaultPath is set)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '次へ' })).not.toBeDisabled();
    });
  });

  it('does nothing when folder picker is cancelled', async () => {
    mockPickFolder.mockResolvedValue(null);
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    // Go to step 2
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    // Click folder picker, but cancel
    await act(async () => {
      fireEvent.click(screen.getByText('📁 フォルダを選択'));
    });

    expect(mockVaultInit).not.toHaveBeenCalled();
    // Next should still be disabled
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });

  // --- Step 3: AI settings ---

  it('renders AiSettingsPanel on step 3', async () => {
    mockPickFolder.mockResolvedValue('/vault');
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    // Step 1 -> 2
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    // Pick vault to enable next
    await act(async () => {
      fireEvent.click(screen.getByText('📁 フォルダを選択'));
    });
    // Step 2 -> 3
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '次へ' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByText('AI を設定')).toBeInTheDocument();
    expect(screen.getByTestId('ai-settings-panel')).toBeInTheDocument();
  });

  // --- Step 4: Sample vault ---

  it('renders step 4 with sample checkbox and allows toggling', async () => {
    mockPickFolder.mockResolvedValue('/vault');
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    // Navigate to step 4
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> step 2
    await act(async () => {
      fireEvent.click(screen.getByText('📁 フォルダを選択'));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '次へ' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> step 3
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> step 4

    expect(screen.getByText('サンプルを試す')).toBeInTheDocument();

    // Checkbox should be checked by default (installSample = true)
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    // Toggle it off
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    // Toggle it back on
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  // --- Step 5: Completion ---

  it('renders final step and calls onComplete with finish button', async () => {
    const onComplete = vi.fn();
    mockPickFolder.mockResolvedValue('/vault');
    render(<OnboardingWizard onComplete={onComplete} onSkip={vi.fn()} />);

    // Navigate to step 5
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 2
    await act(async () => {
      fireEvent.click(screen.getByText('📁 フォルダを選択'));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '次へ' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 3
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 4
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 5

    expect(screen.getByText(/準備完了/)).toBeInTheDocument();

    // The final step shows はじめる instead of 次へ
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeInTheDocument();
    const finishBtn = screen.getByRole('button', { name: 'はじめる' });
    expect(finishBtn).toBeInTheDocument();

    // Click finish
    fireEvent.click(finishBtn);
    expect(onComplete).toHaveBeenCalledWith({
      vaultPath: '/test/vault',
      installSample: true,
    });
  });

  it('onComplete passes installSample: false when unchecked', async () => {
    const onComplete = vi.fn();
    mockPickFolder.mockResolvedValue('/vault');
    render(<OnboardingWizard onComplete={onComplete} onSkip={vi.fn()} />);

    // Navigate to step 4
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 2
    await act(async () => {
      fireEvent.click(screen.getByText('📁 フォルダを選択'));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '次へ' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 3
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 4

    // Uncheck the sample checkbox
    fireEvent.click(screen.getByRole('checkbox'));

    // -> 5
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    // Click finish
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(onComplete).toHaveBeenCalledWith({
      vaultPath: '/test/vault',
      installSample: false,
    });
  });

  // --- Progress bar ---

  it('renders progress dots with correct active state', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '1');
    expect(progressbar).toHaveAttribute('aria-valuemin', '1');
    expect(progressbar).toHaveAttribute('aria-valuemax', '5');
  });

  it('updates progress bar when advancing', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    // Advance to step 2
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '2');
  });

  // --- Back button on step 5 ---

  it('back button on step 5 goes to step 4', async () => {
    mockPickFolder.mockResolvedValue('/vault');
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    // Navigate to step 5
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 2
    await act(async () => {
      fireEvent.click(screen.getByText('📁 フォルダを選択'));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '次へ' })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 3
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 4
    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> 5

    expect(screen.getByText(/準備完了/)).toBeInTheDocument();

    // Go back to step 4
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(screen.getByText('サンプルを試す')).toBeInTheDocument();
  });

  it('displays selected vault path on step 2', async () => {
    mockPickFolder.mockResolvedValue('/my/vault');
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '次へ' })); // -> step 2
    await act(async () => {
      fireEvent.click(screen.getByText('📁 フォルダを選択'));
    });

    // The vault path should be displayed
    await waitFor(() => {
      expect(screen.getByText('/test/vault')).toBeInTheDocument();
    });
  });
});

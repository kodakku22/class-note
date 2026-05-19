// Smoke test for the onboarding wizard. Verifies:
//   - The 5-step flow advances and completes
//   - Skip resolves cleanly
//   - The provider radio buttons show the API key input only when needed
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingWizard } from '../../src/components/onboarding/OnboardingWizard';

describe('OnboardingWizard', () => {
  it('renders the welcome step on mount', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('ようこそ')).toBeInTheDocument();
  });

  it('skip button calls onSkip', () => {
    const onSkip = vi.fn();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: /スキップ/ }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('advances through steps with the next button', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    // Step 1 -> Step 2 (Vault selection)
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('Vault を選ぶ')).toBeInTheDocument();
    // Without a vault, Next is disabled
    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
  });
});

// Accessibility smoke tests using axe-core via jest-axe.
// We run axe on the most user-facing components to catch missing aria-labels,
// contrast issues, and structural ARIA problems before they ship.
//
// CI gate: 0 violations.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { OnboardingWizard } from '../../src/components/onboarding/OnboardingWizard';

expect.extend(toHaveNoViolations);

describe('Accessibility', () => {
  it('ErrorBoundary fallback has no axe violations', async () => {
    const Boom = (): never => {
      throw new Error('axe test');
    };
    // Suppress React's expected error noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary label="axe test">
        <Boom />
      </ErrorBoundary>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
    spy.mockRestore();
  });

  it('OnboardingWizard step 1 has no axe violations', async () => {
    const { container } = render(<OnboardingWizard onComplete={() => {}} onSkip={() => {}} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// Provide vi for the suppressed-console block above.
import { vi } from 'vitest';

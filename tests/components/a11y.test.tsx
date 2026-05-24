// Accessibility smoke tests using axe-core via jest-axe.
// We run axe on the most user-facing components to catch missing aria-labels,
// contrast issues, and structural ARIA problems before they ship.
//
// Failure policy: 0 violations (jest-axe defaults to wcag2a + wcag2aa rules,
// minus color-contrast which doesn't measure reliably in jsdom).
//
// Companion E2E coverage lives in e2e/tests/a11y.spec.ts (runs axe against
// the actually-launched Electron app for views that can't be statically
// rendered here without heavy mocking).
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { OnboardingWizard } from '../../src/components/onboarding/OnboardingWizard';
import { VaultPicker } from '../../src/components/VaultPicker';
import { FAQPanel } from '../../src/components/help/FAQPanel';
import { ContextMenu } from '../../src/components/common/ContextMenu';
import { TypeSelector } from '../../src/components/TypeSelector';

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
    const { container } = render(
      <OnboardingWizard onComplete={() => {}} onSkip={() => {}} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('VaultPicker (no recents) has no axe violations', async () => {
    const { container } = render(
      <VaultPicker onPicked={() => {}} recentVaults={[]} onRemoveRecent={() => {}} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('VaultPicker (with recents) has no axe violations', async () => {
    const { container } = render(
      <VaultPicker
        onPicked={() => {}}
        recentVaults={['C:\\Vault\\A', 'C:\\Vault\\B']}
        onRemoveRecent={() => {}}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('FAQPanel has no axe violations', async () => {
    const { container } = render(<FAQPanel onClose={() => {}} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('ContextMenu has no axe violations', async () => {
    const { container } = render(
      <ContextMenu
        x={100}
        y={100}
        items={[
          { label: 'Open', onClick: () => {} },
          { label: 'Delete', danger: true, onClick: () => {} },
        ]}
        onClose={() => {}}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('TypeSelector has no axe violations', async () => {
    const { container } = render(
      <TypeSelector
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

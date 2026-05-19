import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RelationsPanel } from '../../src/components/relations/RelationsPanel';

describe('RelationsPanel', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onChange.mockClear();
  });

  it('renders panel with PROPERTIES header', () => {
    render(<RelationsPanel meta={{}} onChange={onChange} />);
    expect(screen.getByText('PROPERTIES')).toBeInTheDocument();
  });

  it('renders Type selector', () => {
    render(<RelationsPanel meta={{}} onChange={onChange} />);
    expect(screen.getByText('Type')).toBeInTheDocument();
    const select = screen.getByDisplayValue(/フリー/);
    expect(select).toBeInTheDocument();
  });

  it('shows correct type for lecture meta', () => {
    render(<RelationsPanel meta={{ type: 'lecture' }} onChange={onChange} />);
    const select = screen.getByDisplayValue(/授業ノート/);
    expect(select).toBeInTheDocument();
  });

  it('shows lecture-specific relations', () => {
    render(<RelationsPanel meta={{ type: 'lecture' }} onChange={onChange} />);
    expect(screen.getByText('科目')).toBeInTheDocument();
    expect(screen.getByText('日付')).toBeInTheDocument();
    expect(screen.getByText('担当教員')).toBeInTheDocument();
    expect(screen.getByText('章')).toBeInTheDocument();
  });

  it('shows review-specific rating stars', () => {
    render(<RelationsPanel meta={{ type: 'review', understanding: 3 }} onChange={onChange} />);
    expect(screen.getByText('理解度')).toBeInTheDocument();
    const stars = screen.getAllByText('★');
    expect(stars.length).toBe(5);
    // 3 filled stars
    const filled = stars.filter((s) => s.className.includes('filled'));
    expect(filled.length).toBe(3);
  });

  it('calls onChange when type is changed', async () => {
    render(<RelationsPanel meta={{ type: 'lecture' }} onChange={onChange} />);
    const select = screen.getByDisplayValue(/授業ノート/);

    await act(async () => {
      fireEvent.change(select, { target: { value: 'summary' } });
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'summary' }));
  });

  it('calls onChange when text field is updated', async () => {
    render(<RelationsPanel meta={{ type: 'lecture' }} onChange={onChange} />);
    // Find the subject text input
    const inputs = screen.getAllByRole('textbox');
    const subjectInput = inputs[0]; // first text input after type

    await act(async () => {
      fireEvent.change(subjectInput, { target: { value: 'Math 101' } });
    });

    expect(onChange).toHaveBeenCalled();
  });

  it('renders date input for date relations', () => {
    render(<RelationsPanel meta={{ type: 'lecture' }} onChange={onChange} />);
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).toBeInTheDocument();
  });

  it('removes key when value is empty string', async () => {
    render(<RelationsPanel meta={{ type: 'lecture', subject: 'Math' }} onChange={onChange} />);
    const inputs = screen.getAllByRole('textbox');
    const subjectInput = inputs.find((i) => (i as HTMLInputElement).value === 'Math');

    if (subjectInput) {
      await act(async () => {
        fireEvent.change(subjectInput, { target: { value: '' } });
      });

      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
      expect(lastCall.subject).toBeUndefined();
    }
  });

  it('renders tags input for tag relations', () => {
    render(<RelationsPanel meta={{ type: 'lecture', tags: ['math', 'calculus'] }} onChange={onChange} />);
    expect(screen.getByText('タグ')).toBeInTheDocument();
    // TagInput renders tags as #tag inside tag-chip spans
    const chips = document.querySelectorAll('.tag-chip');
    const chipTexts = Array.from(chips).map((c) => c.textContent);
    expect(chipTexts.some((t) => t?.includes('math'))).toBe(true);
    expect(chipTexts.some((t) => t?.includes('calculus'))).toBe(true);
  });

  it('renders status dropdown with options', () => {
    render(<RelationsPanel meta={{ type: 'lecture', status: '受講中' }} onChange={onChange} />);
    expect(screen.getByText('状態')).toBeInTheDocument();
    const statusSelect = screen.getByDisplayValue('受講中');
    expect(statusSelect).toBeInTheDocument();
  });

  it('changes status dropdown', async () => {
    render(<RelationsPanel meta={{ type: 'lecture', status: '受講中' }} onChange={onChange} />);
    const statusSelect = screen.getByDisplayValue('受講中');

    await act(async () => {
      fireEvent.change(statusSelect, { target: { value: '習得' } });
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: '習得' }));
  });

  it('renders number input for number relations', () => {
    render(<RelationsPanel meta={{ type: 'review', cards: 10 }} onChange={onChange} />);
    expect(screen.getByText('暗記カード数')).toBeInTheDocument();
    const numInput = screen.getByDisplayValue('10');
    expect(numInput).toBeInTheDocument();
  });

  it('updates number field', async () => {
    render(<RelationsPanel meta={{ type: 'review', cards: 10 }} onChange={onChange} />);
    const numInput = screen.getByDisplayValue('10');

    await act(async () => {
      fireEvent.change(numInput, { target: { value: '25' } });
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cards: 25 }));
  });

  it('clears number field to undefined', async () => {
    render(<RelationsPanel meta={{ type: 'review', cards: 10 }} onChange={onChange} />);
    const numInput = screen.getByDisplayValue('10');

    await act(async () => {
      fireEvent.change(numInput, { target: { value: '' } });
    });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.cards).toBeUndefined();
  });

  it('renders star rating and toggles on click', async () => {
    render(<RelationsPanel meta={{ type: 'review', understanding: 2 }} onChange={onChange} />);
    const stars = screen.getAllByText('★');

    // Click star 4
    await act(async () => {
      fireEvent.click(stars[3]);
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ understanding: 4 }));
  });

  it('clears rating when clicking same star', async () => {
    render(<RelationsPanel meta={{ type: 'review', understanding: 3 }} onChange={onChange} />);
    const stars = screen.getAllByText('★');

    // Click star 3 (same as current)
    await act(async () => {
      fireEvent.click(stars[2]);
    });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.understanding).toBeUndefined();
  });

  it('renders longtext textarea for research source', () => {
    render(<RelationsPanel meta={{ type: 'research' }} onChange={onChange} />);
    expect(screen.getByText('引用元')).toBeInTheDocument();
    const textarea = document.querySelector('textarea');
    expect(textarea).toBeInTheDocument();
  });

  it('renders experiment-specific relations', () => {
    render(<RelationsPanel meta={{ type: 'experiment' }} onChange={onChange} />);
    expect(screen.getByText('データセット')).toBeInTheDocument();
    expect(screen.getByText('モデル')).toBeInTheDocument();
    expect(screen.getByText('Seed')).toBeInTheDocument();
  });

  it('renders free type with only tags', () => {
    render(<RelationsPanel meta={{}} onChange={onChange} />);
    // Free type should have only tags relation (besides type)
    expect(screen.getByText('タグ')).toBeInTheDocument();
    // Should not have lecture-specific fields
    expect(screen.queryByText('担当教員')).not.toBeInTheDocument();
  });

  it('renders aria label on aside', () => {
    render(<RelationsPanel meta={{}} onChange={onChange} />);
    expect(screen.getByLabelText('プロパティパネル')).toBeInTheDocument();
  });

  it('handles select relation with options', () => {
    render(<RelationsPanel meta={{ type: 'summary', completion: '途中' }} onChange={onChange} />);
    expect(screen.getByText('完了度')).toBeInTheDocument();
    expect(screen.getByDisplayValue('途中')).toBeInTheDocument();
  });

  it('changes select relation', async () => {
    render(<RelationsPanel meta={{ type: 'summary', completion: '途中' }} onChange={onChange} />);
    const select = screen.getByDisplayValue('途中');

    await act(async () => {
      fireEvent.change(select, { target: { value: '完成' } });
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ completion: '完成' }));
  });

  it('renders date relation and updates', async () => {
    render(<RelationsPanel meta={{ type: 'lecture', date: '2025-01-15' }} onChange={onChange} />);
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe('2025-01-15');

    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2025-02-20' } });
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ date: '2025-02-20' }));
  });

  it('handles unknown type fallback to free', () => {
    render(<RelationsPanel meta={{ type: 'nonexistent' }} onChange={onChange} />);
    // Should fallback to 'free' type
    expect(screen.getByText('タグ')).toBeInTheDocument();
  });

  it('handles meta with string tags as array', () => {
    render(<RelationsPanel meta={{ tags: 'single-tag' }} onChange={onChange} />);
    // TagInput renders as #single-tag inside a tag-chip
    const chips = document.querySelectorAll('.tag-chip');
    const chipTexts = Array.from(chips).map((c) => c.textContent);
    expect(chipTexts.some((t) => t?.includes('single-tag'))).toBe(true);
  });

  it('handles meta with null values gracefully', () => {
    render(<RelationsPanel meta={{ type: 'lecture', subject: null as any }} onChange={onChange} />);
    // Should not crash
    expect(screen.getByText('科目')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaperFilterBar, type PaperFilters } from '../../src/components/papers/PaperFilterBar';

const DEFAULT_FILTERS: PaperFilters = {
  query: '',
  status: 'all',
  tag: 'all',
  yearFrom: null,
  yearTo: null,
};

const TAGS = ['ml', 'nlp', 'cv'];

describe('PaperFilterBar', () => {
  it('renders search input', () => {
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByLabelText('論文を検索')).toBeInTheDocument();
  });

  it('renders status select', () => {
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByLabelText('ステータスでフィルタ')).toBeInTheDocument();
  });

  it('renders tag select', () => {
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByLabelText('タグでフィルタ')).toBeInTheDocument();
  });

  it('renders year range inputs', () => {
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByLabelText('開始年')).toBeInTheDocument();
    expect(screen.getByLabelText('終了年')).toBeInTheDocument();
  });

  it('calls onChange when query changes', () => {
    const onChange = vi.fn();
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={onChange} availableTags={TAGS} />);
    fireEvent.change(screen.getByLabelText('論文を検索'), { target: { value: 'attention' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, query: 'attention' });
  });

  it('calls onChange when status changes', () => {
    const onChange = vi.fn();
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={onChange} availableTags={TAGS} />);
    fireEvent.change(screen.getByLabelText('ステータスでフィルタ'), { target: { value: 'reading' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, status: 'reading' });
  });

  it('calls onChange when tag changes', () => {
    const onChange = vi.fn();
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={onChange} availableTags={TAGS} />);
    fireEvent.change(screen.getByLabelText('タグでフィルタ'), { target: { value: 'ml' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, tag: 'ml' });
  });

  it('calls onChange when yearFrom changes', () => {
    const onChange = vi.fn();
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={onChange} availableTags={TAGS} />);
    fireEvent.change(screen.getByLabelText('開始年'), { target: { value: '2020' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, yearFrom: 2020 });
  });

  it('calls onChange when yearTo changes', () => {
    const onChange = vi.fn();
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={onChange} availableTags={TAGS} />);
    fireEvent.change(screen.getByLabelText('終了年'), { target: { value: '2024' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, yearTo: 2024 });
  });

  it('converts empty year input to null', () => {
    const onChange = vi.fn();
    const filters = { ...DEFAULT_FILTERS, yearFrom: 2020 };
    render(<PaperFilterBar filters={filters} onChange={onChange} availableTags={TAGS} />);
    fireEvent.change(screen.getByLabelText('開始年'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ...filters, yearFrom: null });
  });

  it('does not show reset button when no filters active', () => {
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.queryByText(/リセット/)).not.toBeInTheDocument();
  });

  it('shows reset button when query is set', () => {
    const filters = { ...DEFAULT_FILTERS, query: 'test' };
    render(<PaperFilterBar filters={filters} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByText(/リセット/)).toBeInTheDocument();
  });

  it('shows reset button when status is set', () => {
    const filters = { ...DEFAULT_FILTERS, status: 'reading' as const };
    render(<PaperFilterBar filters={filters} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByText(/リセット/)).toBeInTheDocument();
  });

  it('shows reset button when tag is set', () => {
    const filters = { ...DEFAULT_FILTERS, tag: 'ml' };
    render(<PaperFilterBar filters={filters} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByText(/リセット/)).toBeInTheDocument();
  });

  it('shows reset button when yearFrom is set', () => {
    const filters = { ...DEFAULT_FILTERS, yearFrom: 2020 };
    render(<PaperFilterBar filters={filters} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByText(/リセット/)).toBeInTheDocument();
  });

  it('resets all filters on reset click', () => {
    const onChange = vi.fn();
    const filters = { query: 'test', status: 'reading' as const, tag: 'ml', yearFrom: 2020, yearTo: 2024 };
    render(<PaperFilterBar filters={filters} onChange={onChange} availableTags={TAGS} />);
    fireEvent.click(screen.getByText(/リセット/));
    expect(onChange).toHaveBeenCalledWith({
      query: '',
      status: 'all',
      tag: 'all',
      yearFrom: null,
      yearTo: null,
    });
  });

  it('disables tag select when no tags available', () => {
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={vi.fn()} availableTags={[]} />);
    const tagSelect = screen.getByLabelText('タグでフィルタ');
    expect(tagSelect).toBeDisabled();
  });

  it('renders available tags as options', () => {
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByText('#ml')).toBeInTheDocument();
    expect(screen.getByText('#nlp')).toBeInTheDocument();
    expect(screen.getByText('#cv')).toBeInTheDocument();
  });

  it('has search role on container', () => {
    render(<PaperFilterBar filters={DEFAULT_FILTERS} onChange={vi.fn()} availableTags={TAGS} />);
    expect(screen.getByRole('search')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagInput } from '../../src/components/relations/TagInput';

describe('TagInput', () => {
  it('renders existing tags as chips', () => {
    render(<TagInput tags={['ml', 'nlp']} onChange={vi.fn()} />);
    expect(screen.getByText('#ml')).toBeInTheDocument();
    expect(screen.getByText('#nlp')).toBeInTheDocument();
  });

  it('renders remove buttons for each tag', () => {
    render(<TagInput tags={['ml', 'nlp']} onChange={vi.fn()} />);
    expect(screen.getByLabelText('ml を削除')).toBeInTheDocument();
    expect(screen.getByLabelText('nlp を削除')).toBeInTheDocument();
  });

  it('shows placeholder when no tags', () => {
    render(<TagInput tags={[]} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('タグを追加')).toBeInTheDocument();
  });

  it('hides placeholder when tags exist', () => {
    render(<TagInput tags={['ml']} onChange={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '');
  });

  it('adds tag on Enter', () => {
    const onChange = vi.fn();
    render(<TagInput tags={['existing']} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'newtag' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['existing', 'newtag']);
  });

  it('adds tag on comma', () => {
    const onChange = vi.fn();
    render(<TagInput tags={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'first' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(onChange).toHaveBeenCalledWith(['first']);
  });

  it('adds tag on blur', () => {
    const onChange = vi.fn();
    render(<TagInput tags={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'blurtag' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(['blurtag']);
  });

  it('strips leading # from tag', () => {
    const onChange = vi.fn();
    render(<TagInput tags={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '#hashtag' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['hashtag']);
  });

  it('trims whitespace from tag', () => {
    const onChange = vi.fn();
    render(<TagInput tags={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  spacetag  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['spacetag']);
  });

  it('does not add empty tag', () => {
    const onChange = vi.fn();
    render(<TagInput tags={['a']} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not add duplicate tag', () => {
    const onChange = vi.fn();
    render(<TagInput tags={['ml']} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'ml' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes last tag on Backspace when input empty', () => {
    const onChange = vi.fn();
    render(<TagInput tags={['a', 'b', 'c']} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('does not remove on Backspace when input has text', () => {
    const onChange = vi.fn();
    render(<TagInput tags={['a']} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not remove on Backspace when no tags', () => {
    const onChange = vi.fn();
    render(<TagInput tags={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes specific tag on × click', () => {
    const onChange = vi.fn();
    render(<TagInput tags={['a', 'b', 'c']} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('b を削除'));
    expect(onChange).toHaveBeenCalledWith(['a', 'c']);
  });

  it('clears input after adding a tag', () => {
    render(<TagInput tags={[]} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });
});

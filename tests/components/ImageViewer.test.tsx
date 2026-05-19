import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ImageViewer } from '../../src/components/ImageViewer';

describe('ImageViewer', () => {
  it('renders an img element', () => {
    const { container } = render(<ImageViewer filePath="/vault/img/test.png" />);
    const img = container.querySelector('img');
    expect(img).toBeDefined();
    expect(img).not.toBeNull();
  });

  it('sets src from filePath via toAppFileUrl', () => {
    const { container } = render(<ImageViewer filePath="/vault/img/photo.jpg" />);
    const img = container.querySelector('img');
    expect(img!.getAttribute('src')).toBeTruthy();
  });

  it('wraps in image-viewer container', () => {
    const { container } = render(<ImageViewer filePath="/vault/img/test.png" />);
    expect(container.querySelector('.image-viewer')).not.toBeNull();
  });
});

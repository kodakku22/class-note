import { toAppFileUrl } from '../utils/paths';

export function ImageViewer({ filePath }: { filePath: string }) {
  const url = toAppFileUrl(filePath);
  return (
    <div className="image-viewer">
      <img src={url} alt="" />
    </div>
  );
}

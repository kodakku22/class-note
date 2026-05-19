// Card for non-markdown materials (PDF / image / office docs).
import { toAppFileUrl } from '../../utils/paths';

type Props = {
  filePath: string;
  fileName: string;
  kind: 'pdf' | 'image' | 'office' | 'other';
  mtime: number;
  active?: boolean;
  onOpen: () => void;
};

const fileToAppUrl = toAppFileUrl;

const ICON: Record<Props['kind'], string> = {
  pdf: '📕',
  image: '🖼️',
  office: '📘',
  other: '📄',
};

function formatDate(mtime: number): string {
  const d = new Date(mtime);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MaterialCard({ filePath, fileName, kind, mtime, active, onOpen }: Props) {
  return (
    <div className={`material-card ${active ? 'active' : ''}`} onClick={onOpen}>
      <div className="material-card-thumb">
        {kind === 'image' ? (
          <img src={fileToAppUrl(filePath)} alt={fileName} loading="lazy" />
        ) : (
          <div className="material-card-fallback">{ICON[kind]}</div>
        )}
      </div>
      <div className="material-card-body">
        <div className="material-card-name" title={fileName}>{fileName}</div>
        <div className="material-card-meta">
          <span>{kind.toUpperCase()}</span>
          <span>·</span>
          <span>{formatDate(mtime)}</span>
        </div>
      </div>
    </div>
  );
}

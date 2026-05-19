import type { SubjectView } from '../FileList';

export type SubjectViewTabsProps = {
  view: SubjectView;
  onChange: (v: SubjectView) => void;
};

export function SubjectViewTabs({ view, onChange }: SubjectViewTabsProps) {
  const tabs: Array<{ id: SubjectView; icon: string; label: string; title: string }> = [
    { id: 'list', icon: '📋', label: 'リスト', title: 'リスト表示' },
    { id: 'gallery', icon: '🎴', label: 'ギャラリー', title: 'ギャラリー表示' },
    { id: 'board', icon: '🗂️', label: 'Board', title: 'Canvas Board' },
    { id: 'database', icon: '📊', label: 'Database', title: 'Database View' },
    { id: 'graph', icon: '🕸️', label: 'グラフ', title: 'グラフ' },
  ];

  return (
    <div className="subject-panel-tabs" role="tablist" aria-label="ノート表示モード">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={view === tab.id}
          className={view === tab.id ? 'subject-panel-tab active' : 'subject-panel-tab'}
          onClick={() => onChange(tab.id)}
          title={tab.title}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

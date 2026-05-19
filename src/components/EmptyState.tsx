// Reusable empty-state component used across the major views.
import type { ReactNode } from 'react';

type Props = {
  icon: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  children?: ReactNode;
};

export function EmptyState({ icon, title, description, action, children }: Props) {
  return (
    <div className="empty-state-v2">
      <div className="empty-state-icon" aria-hidden>
        {icon}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {children}
      {action && (
        <button className="primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

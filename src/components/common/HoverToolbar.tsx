import { type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  toolbar: ReactNode;
  className?: string;
};

export function HoverToolbar({ children, toolbar, className }: Props) {
  return (
    <div className={className ? `${className} hover-toolbar-host` : 'hover-toolbar-host'}>
      {children}
      <div className="hover-toolbar">{toolbar}</div>
    </div>
  );
}

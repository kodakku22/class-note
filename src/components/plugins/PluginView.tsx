import { useEffect, useState } from 'react';
import type { PluginManifest, PluginViewManifest } from '../../types';

export type ActivePluginView = {
  pluginId: string;
  viewId: string;
};

type Props = {
  vaultPath: string;
  plugins: PluginManifest[];
  active: ActivePluginView | null;
};

export function PluginView({ vaultPath, plugins, active }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plugin = active ? plugins.find((item) => item.id === active.pluginId) : null;
  const view: PluginViewManifest | null =
    plugin && active ? plugin.views.find((item) => item.id === active.viewId) ?? null : null;

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    if (!active) return;
    window.api.plugins
      .getViewUrl(vaultPath, active.pluginId, active.viewId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.url) setUrl(result.url);
        else setError(result.error ?? 'Plugin view を読み込めませんでした');
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [active, vaultPath]);

  return (
    <div className="main-area plugin-view">
      <div className="plugin-view-header">
        <div>
          <h2>{view?.icon ?? '🧩'} {view?.title ?? plugin?.name ?? 'Plugin'}</h2>
          <span className="plugin-view-subtitle">
            {plugin ? `${plugin.name} v${plugin.version}` : 'Vault plugin'}
          </span>
        </div>
      </div>
      {error ? (
        <div className="empty-state">{error}</div>
      ) : url ? (
        <iframe
          title={view?.title ?? 'Plugin view'}
          className="plugin-view-frame"
          src={url}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="empty-state">Plugin view を読み込み中…</div>
      )}
    </div>
  );
}

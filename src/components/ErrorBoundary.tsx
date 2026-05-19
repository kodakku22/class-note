// React error boundary used to wrap each major view so that a render
// crash in one panel doesn't take down the whole app.
//
// Productization note: when an error fires, the user gets actionable
// recovery options (retry, copy details, open log dir) rather than a
// dead screen. The original `console.error` path is preserved so the
// crash also lands in the main-process electron-log file.
import { Component, type ReactNode } from 'react';
import { log } from '../utils/logger';
import styles from './ErrorBoundary.module.css';

type Props = { children: ReactNode; fallback?: ReactNode; label?: string };
type State = { error: Error | null; info: string | null; copied: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
     
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info);
    // Forward to main-process logger so the crash also lands in main.log.
    log.error(`ErrorBoundary[${this.props.label ?? 'unknown'}]: ${error.message}`, {
      stack: error.stack,
      componentStack: info.componentStack,
    });
    this.setState({ info: info.componentStack ?? null });
  }

  reset = () => this.setState({ error: null, info: null, copied: false });

  buildReport = (): string => {
    const { error, info } = this.state;
    const lines = [
      `ClassNotes error report`,
      `time: ${new Date().toISOString()}`,
      `view: ${this.props.label ?? 'unknown'}`,
      `userAgent: ${navigator.userAgent}`,
      ``,
      `message: ${error?.message ?? '(none)'}`,
      ``,
      `stack:`,
      error?.stack ?? '(no stack)',
    ];
    if (info) {
      lines.push('', 'componentStack:', info);
    }
    return lines.join('\n');
  };

  copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(this.buildReport());
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard may be unavailable in some contexts; ignore silently.
    }
  };

  openLogDir = async () => {
    try {
      await window.api?.materials?.openLogDir?.();
    } catch {
      // Best-effort; the user can still use copy.
    }
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className={styles.root}>
          <div className={styles.icon}>⚠️</div>
          <h3>表示中にエラーが発生しました</h3>
          {this.props.label && <div className={styles.label}>{this.props.label}</div>}
          <pre className={styles.message}>{this.state.error.message}</pre>
          <div className={styles.actions}>
            <button onClick={this.reset}>🔄 再試行</button>
            <button onClick={this.copyDetails}>
              {this.state.copied ? '✓ コピーしました' : '📋 詳細をコピー'}
            </button>
            <button onClick={this.openLogDir}>📁 ログを開く</button>
          </div>
          <div className={styles.hint}>
            問題が続く場合は「詳細をコピー」してから報告してください。
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

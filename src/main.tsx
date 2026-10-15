import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Global uncaught error listener to display errors directly on screen on mobile/iPhone
function showGlobalErrorOverlay(msg: string, stack?: string) {
  let container = document.getElementById('debug-error-overlay');
  if (!container) {
    container = document.createElement('div');
    container.id = 'debug-error-overlay';
    container.style.cssText =
      'position: fixed; inset: 0; z-index: 99999; background: #0b0f19; color: #f87171; padding: 24px; font-family: monospace; font-size: 13px; overflow: auto; display: flex; flex-direction: column; gap: 12px;';
    document.body.appendChild(container);
  }

  container.innerHTML = `
    <div style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.4); border-radius: 8px; padding: 16px;">
      <h2 style="color: #ef4444; margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">Uncaught Runtime Error</h2>
      <div style="color: #fff; margin-bottom: 8px; word-break: break-all;">${msg}</div>
      ${stack ? `<pre style="font-size: 11px; color: #94a3b8; white-space: pre-wrap; word-break: break-all; margin: 0;">${stack.slice(0, 800)}</pre>` : ''}
      <button onclick="window.location.reload()" style="margin-top: 16px; background: #10b981; color: white; border: none; padding: 10px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;">
        Neu laden
      </button>
      <button onclick="localStorage.clear(); sessionStorage.clear(); indexedDB.deleteDatabase('portfolio-tracker'); window.location.reload();" style="margin-top: 8px; margin-left: 8px; background: #374151; color: #d1d5db; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer;">
        Speicher leeren
      </button>
    </div>
  `;
}

window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error || event.message);
  showGlobalErrorOverlay(
    event.message || 'Unknown global error',
    event.error ? event.error.stack : undefined
  );
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason);
  const reason = event.reason;
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  showGlobalErrorOverlay(`Unhandled Promise Rejection: ${msg}`, stack);
});

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
  } catch (err: unknown) {
    const errorObj = err as Error;
    showGlobalErrorOverlay(
      errorObj?.message || 'Error mounting React root',
      errorObj?.stack
    );
  }
}

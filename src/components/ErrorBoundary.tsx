import { Component, type ReactNode } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crashed:', error, info);
  }

  handleResetStorage = () => {
    try {
      indexedDB.deleteDatabase('portfolio-tracker');
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-6">
          <div className="max-w-sm w-full text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle size={32} className="text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Ein Fehler ist aufgetreten
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
              Die App konnte nicht korrekt geladen werden. Du kannst versuchen, die Seite neu zu laden oder den lokalen Speicher zurückzusetzen.
            </p>
            <div className="space-y-2.5">
              <button
                onClick={this.handleReload}
                className="w-full rounded-xl bg-green-600 text-white py-3 text-sm font-semibold active:scale-95 transition-transform"
              >
                Neu laden
              </button>
              <button
                onClick={this.handleResetStorage}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-3 text-sm font-medium active:scale-95 transition-transform"
              >
                <Trash2 size={16} />
                Lokalen Speicher zurücksetzen
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

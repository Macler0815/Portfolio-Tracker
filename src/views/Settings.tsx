import { useEffect, useRef, useState } from 'react';
import { Download, Upload, Trash2, ShieldAlert, CheckCircle2, Github, Cloud, CloudOff, RefreshCw, FolderOpen, Loader2 } from 'lucide-react';
import type { PortfolioExport } from '@/lib/types';
import {
  isFileSystemAccessSupported,
  getSavedFileHandle,
  pickSaveLocation,
  pickLoadLocation,
  writeToHandle,
  readFromHandle,
  verifyPermission,
  clearFileHandle,
} from '@/lib/icloud';

interface SettingsViewProps {
  onExport: () => Promise<PortfolioExport>;
  onImport: (data: PortfolioExport) => Promise<void>;
  onClear: () => Promise<void>;
  getExportData: () => Promise<PortfolioExport>;
}

export function SettingsView({ onExport, onImport, onClear, getExportData }: SettingsViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const [icloudSupported] = useState(isFileSystemAccessSupported);
  const [icloudConnected, setIcloudConnected] = useState(false);
  const [icloudBusy, setIcloudBusy] = useState(false);
  const [icloudFolderName, setIcloudFolderName] = useState<string | null>(null);

  useEffect(() => {
    if (!icloudSupported) return;
    getSavedFileHandle().then((handle) => {
      if (handle) {
        setIcloudConnected(true);
        setIcloudFolderName(handle.name);
      }
    });
  }, [icloudSupported]);

  async function handleIcloudSave() {
    setIcloudBusy(true);
    setStatus(null);
    try {
      let handle = await getSavedFileHandle();
      if (!handle) {
        handle = await pickSaveLocation();
        if (!handle) {
          setIcloudBusy(false);
          return;
        }
      }
      const granted = await verifyPermission(handle, true);
      if (!granted) {
        setStatus({ type: 'error', msg: 'Schreibberechtigung für iCloud-Datei verweigert' });
        setIcloudBusy(false);
        return;
      }
      const data = await getExportData();
      await writeToHandle(handle, data);
      setIcloudConnected(true);
      setIcloudFolderName(handle.name);
      setStatus({ type: 'success', msg: `Portfolio in iCloud Drive gespeichert (${handle.name})` });
    } catch {
      setStatus({ type: 'error', msg: 'iCloud-Speichern fehlgeschlagen' });
    } finally {
      setIcloudBusy(false);
    }
  }

  async function handleIcloudLoad() {
    setIcloudBusy(true);
    setStatus(null);
    try {
      let handle = await getSavedFileHandle();
      if (!handle) {
        handle = await pickLoadLocation();
        if (!handle) {
          setIcloudBusy(false);
          return;
        }
      }
      const granted = await verifyPermission(handle, false);
      if (!granted) {
        setStatus({ type: 'error', msg: 'Leseberechtigung für iCloud-Datei verweigert' });
        setIcloudBusy(false);
        return;
      }
      const data = (await readFromHandle(handle)) as PortfolioExport;
      if (!data.version || !Array.isArray(data.transactions)) {
        throw new Error('Invalid format');
      }
      await onImport(data);
      setIcloudConnected(true);
      setIcloudFolderName(handle.name);
      setStatus({ type: 'success', msg: `Portfolio aus iCloud Drive geladen (${handle.name})` });
    } catch {
      setStatus({ type: 'error', msg: 'iCloud-Laden fehlgeschlagen — ungültige Datei' });
    } finally {
      setIcloudBusy(false);
    }
  }

  async function handleIcloudChooseFolder() {
    setIcloudBusy(true);
    setStatus(null);
    const handle = await pickSaveLocation();
    if (handle) {
      setIcloudConnected(true);
      setIcloudFolderName(handle.name);
      setStatus({ type: 'success', msg: `iCloud-Speicherort gewählt: ${handle.name}` });
    }
    setIcloudBusy(false);
  }

  async function handleIcloudDisconnect() {
    await clearFileHandle();
    setIcloudConnected(false);
    setIcloudFolderName(null);
    setStatus({ type: 'success', msg: 'iCloud-Verbindung getrennt' });
  }

  async function handleExport() {
    try {
      const data = await onExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'portfolio.json';
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', msg: 'Portfolio exportiert als portfolio.json' });
    } catch {
      setStatus({ type: 'error', msg: 'Export fehlgeschlagen' });
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as PortfolioExport;
      if (!data.version || !Array.isArray(data.transactions)) {
        throw new Error('Invalid format');
      }
      await onImport(data);
      setStatus({ type: 'success', msg: 'Portfolio erfolgreich importiert' });
    } catch {
      setStatus({ type: 'error', msg: 'Import fehlgeschlagen — ungültige Datei' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleClear() {
    try {
      await onClear();
      setStatus({ type: 'success', msg: 'Alle Daten wurden gelöscht' });
    } catch {
      setStatus({ type: 'error', msg: 'Löschen fehlgeschlagen' });
    }
    setConfirmClear(false);
  }

  return (
    <div className="px-4 pt-2 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">Einstellungen</h1>

      {status && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm ${
            status.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:bg-red-800 text-red-700 dark:text-red-300'
          }`}
        >
          {status.type === 'success' ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
          {status.msg}
        </div>
      )}

      {/* iCloud Drive Sync */}
      {icloudSupported && (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Cloud size={18} className={icloudConnected ? 'text-green-500' : 'text-gray-400'} />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">iCloud Drive Sync</h2>
              {icloudConnected && (
                <span className="ml-auto text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-full px-2 py-0.5">
                  Verbunden
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {icloudConnected
                ? `Speicherort: ${icloudFolderName} — Speichern und Laden direkt aus iCloud Drive.`
                : 'Wähle einen Speicherort in deinem iCloud Drive Ordner, um direkt zu speichern und zu laden.'}
            </p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            <button
              onClick={handleIcloudSave}
              disabled={icloudBusy}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {icloudBusy ? <Loader2 size={20} className="animate-spin text-gray-400" /> : <RefreshCw size={20} className="text-gray-500 dark:text-gray-400" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">In iCloud Drive speichern</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Portfolio direkt in iCloud schreiben</p>
              </div>
            </button>
            <button
              onClick={handleIcloudLoad}
              disabled={icloudBusy}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {icloudBusy ? <Loader2 size={20} className="animate-spin text-gray-400" /> : <Download size={20} className="text-gray-500 dark:text-gray-400" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Aus iCloud Drive laden</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Portfolio aus iCloud lesen und ersetzen</p>
              </div>
            </button>
            {icloudConnected ? (
              <button
                onClick={handleIcloudDisconnect}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
              >
                <CloudOff size={20} className="text-gray-500 dark:text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">iCloud-Verbindung trennen</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Speicherort vergessen</p>
                </div>
              </button>
            ) : (
              <button
                onClick={handleIcloudChooseFolder}
                disabled={icloudBusy}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {icloudBusy ? <Loader2 size={20} className="animate-spin text-gray-400" /> : <FolderOpen size={20} className="text-gray-500 dark:text-gray-400" />}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">iCloud-Ordner wählen</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Speicherort in iCloud Drive festlegen</p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual Backup */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Manuelles Backup</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Exportiere oder importiere deine Daten als JSON-Datei.
          </p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          <button
            onClick={handleExport}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
          >
            <Download size={20} className="text-gray-500 dark:text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Portfolio exportieren</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Als portfolio.json herunterladen</p>
            </div>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
          >
            <Upload size={20} className="text-gray-500 dark:text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Portfolio importieren</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">portfolio.json hochladen und ersetzen</p>
            </div>
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
        </div>
      </div>

      {/* Data Management */}
      <div className="mt-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Datenverwaltung</h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {confirmClear ? (
            <div className="px-4 py-3.5">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-3">Alle Daten unwiderruflich löschen?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleClear}
                  className="flex-1 rounded-lg bg-red-600 text-white py-2 text-sm font-medium active:scale-95 transition-transform"
                >
                  Ja, löschen
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2 text-sm font-medium active:scale-95 transition-transform"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
            >
              <Trash2 size={20} className="text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Alle Daten löschen</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Transaktionen und Kurse entfernen</p>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* About */}
      <div className="mt-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Github size={16} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Über die App</h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Portfolio Tracker läuft komplett lokal in deinem Browser. Alle Daten werden auf deinem Gerät in IndexedDB gespeichert. Live-Kurse werden über die Yahoo Finance API abgerufen und für 15 Minuten zwischengespeichert. Keine Cloud, keine Registrierung.
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Briefcase, List, Settings as SettingsIcon, Plus, Download, AlertCircle } from 'lucide-react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useBiometric } from '@/hooks/useBiometric';
import { Dashboard } from '@/views/Dashboard';
import { HoldingsView } from '@/views/Holdings';
import { TransactionsView } from '@/views/Transactions';
import { SettingsView } from '@/views/Settings';
import { TransactionModal } from '@/components/TransactionModal';
import { PriceEditModal } from '@/components/PriceEditModal';
import { LockScreen } from '@/components/LockScreen';
import type { Transaction, Holding, PortfolioExport } from '@/lib/types';
import { getApiKeyConfig } from '@/lib/api';

type Tab = 'dashboard' | 'holdings' | 'transactions' | 'settings';

function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceHolding, setPriceHolding] = useState<Holding | null>(null);
  const [syncStep, setSyncStep] = useState<'idle' | 'saving' | 'modal' | 'done'>('idle');
  const [iosBlobUrl, setIosBlobUrl] = useState<string>('');

  const portfolio = usePortfolio();
  const bio = useBiometric();
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    getApiKeyConfig()
      .then((c) => setHasApiKey(!!c))
      .catch(() => setHasApiKey(false));
  }, [bio.state]);

  const knownBanks = Array.from(
    new Set((portfolio.transactions || []).map((t) => t?.bank).filter((b): b is string => !!b))
  );

  const unlockedRef = useRef(false);
  unlockedRef.current = bio.state === 'unlocked';

  const refreshPricesRef = useRef(portfolio.refreshPrices);
  refreshPricesRef.current = portfolio.refreshPrices;

  // Auto-refresh on foreground
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        if (unlockedRef.current) {
          refreshPricesRef.current(true);
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Auto-refresh on initial unlock
  useEffect(() => {
    if (bio.state === 'unlocked' && !portfolio.loading && portfolio.transactions && portfolio.transactions.length > 0) {
      refreshPricesRef.current(true);
    }
  }, [bio.state, portfolio.loading, portfolio.transactions]);

  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'holdings', label: 'Positionen', icon: Briefcase },
    { id: 'transactions', label: 'Verlauf', icon: List },
    { id: 'settings', label: 'Einstellungen', icon: SettingsIcon },
  ];

  function handleEditTransaction(t: Transaction) {
    setEditingTx(t);
    setTxModalOpen(true);
  }

  // INTELLIGENTE AUTOMATISCHE TICKER-SUCHE PER ISIN
  async function handleSaveTransaction(t: Omit<Transaction, 'id'> | Transaction) {
    let finalSymbol = (t?.symbol || '').trim().toUpperCase();
    const isIsinOrWkn = finalSymbol.length === 12 || finalSymbol.length === 6;

    if (isIsinOrWkn) {
      try {
        const config = await getApiKeyConfig();
        const apiKey = config?.apiKey || '';
        if (apiKey) {
          const response = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(finalSymbol)}&token=${apiKey}`);
          if (response.ok) {
            const searchData = await response.json().catch(() => null);
            if (searchData && Array.isArray(searchData.result) && searchData.result.length > 0) {
              const first = searchData.result[0];
              if (first && (first.symbol || first.displaySymbol)) {
                finalSymbol = first.symbol || first.displaySymbol;
              }
            }
          }
        }
      } catch (e) {
        console.error("Automatischer Lookup fehlgeschlagen:", e);
      }
    }

    const updatedTransaction = { ...t, symbol: finalSymbol };
    if ('id' in updatedTransaction) {
      portfolio.updateTransaction(updatedTransaction as Transaction);
    } else {
      portfolio.addTransaction(updatedTransaction);
    }
  }


  function handleEditPrice(h: Holding) {
    setPriceHolding(h);
    setPriceModalOpen(true);
  }

  async function handleICloudSync() {
    setSyncStep('saving');
    try {
      const data: PortfolioExport = await portfolio.exportPortfolio();
      const jsonString = JSON.stringify(data, null, 2);

      // 1. Sichere Prüfung: Nur Chrome/Edge/Desktop-Browser nutzen showSaveFilePicker
      if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          const pickerWindow = window as unknown as {
            showSaveFilePicker: (options?: {
              suggestedName?: string;
              types?: Array<{ description: string; accept: Record<string, string[]> }>;
            }) => Promise<{
              createWritable: () => Promise<{
                write: (content: string) => Promise<void>;
                close: () => Promise<void>;
              }>;
            }>;
          };
          const handle = await pickerWindow.showSaveFilePicker({
            suggestedName: 'portfolio.json',
            types: [{
              description: 'JSON File',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(jsonString);
          await writable.close();
          setSyncStep('done');
          setTimeout(() => setSyncStep('idle'), 2500);
          return;
        } catch (err: unknown) {
          if ((err as Error)?.name === 'AbortError') {
            setSyncStep('idle');
            return;
          }
          // Bei anderen Fehlern im Picker nicht abstürzen, sondern auf Fallback leiten
        }
      }
    
      // 2. Absolut sicherer Fallback für iOS (Safari / PWA)
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // iOS-spezifischer Sicherheits-Check: Falls der State-Wechsel hakt,
      // stellen wir sicher, dass die URL existiert, bevor das Modal triggert.
      if (url) {
        setIosBlobUrl(url);
        setSyncStep('modal');
      } else {
        throw new Error('Blob URL creation failed');
      }

    } catch (error) {
      console.error("Sync-Fehler abgefangen:", error);
      setSyncStep('idle');
      // Verhindert den White Screen, indem der Fehler niemals die App reißt
    }
  }


  const currentPrices = new Map((portfolio.holdings || []).map((h) => [h?.symbol || '', h?.currentPrice || 0]));

  if (bio.state !== 'unlocked') {
    if (bio.state === 'checking' || portfolio.loading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    return (
      <LockScreen
        state={bio.state}
        error={bio.error}
        busy={bio.busy}
        onRegister={bio.register}
        onAuthenticate={bio.authenticate}
        onSkip={bio.proceedWithoutBio}
        onReset={bio.resetBiometric}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 safe-top">
      {tab === 'dashboard' && (
        <Dashboard
          summary={portfolio.summary}
          holdings={portfolio.holdings}
          transactions={portfolio.transactions}
          currentPrices={currentPrices}
          refreshing={portfolio.refreshing}
          lastRefresh={portfolio.lastRefresh}
          error={portfolio.error}
          onRefresh={() => portfolio.refreshPrices(true)}
          onICloudSync={handleICloudSync}
          onICloudLoad={portfolio.importPortfolio}
          syncing={syncStep === 'saving'}
          syncDone={syncStep === 'done'}
          hasApiKey={hasApiKey}
        />
      )}
      {tab === 'holdings' && (
        <HoldingsView
          holdings={portfolio.holdings}
          transactions={portfolio.transactions}
          currentPrices={currentPrices}
          onEditPrice={handleEditPrice}
        />
      )}
      {tab === 'transactions' && (
        <TransactionsView
          transactions={portfolio.transactions}
          onEdit={handleEditTransaction}
          onDelete={portfolio.removeTransaction}
        />
      )}
      {tab === 'settings' && (
        <SettingsView
          onExport={portfolio.exportPortfolio}
          onImport={portfolio.importPortfolio}
          onClear={portfolio.clearPortfolio}
          getExportData={portfolio.exportPortfolio}
          onApiKeyChanged={() => { getApiKeyConfig().then((c) => setHasApiKey(!!c)); portfolio.refreshPrices(true); }}
        />
      )}

      {/* iOS iCloud Sync Modal */}
      {syncStep === 'modal' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3 text-green-600 dark:text-green-400 mb-4">
              <Download size={28} />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Backup in iCloud sichern</h3>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
              Deine aktuellen Portfoliodaten sind bereit. Tippe unten auf den Button, um den Speicherort (deinen iCloud-Ordner) selbst auszuwählen.
            </p>

            <div className="flex gap-2 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200/50 dark:border-amber-900/30 mb-5">
              <AlertCircle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <strong>iOS-Tipp:</strong> Falls die Datei automatisch heruntergeladen wird, stelle in den iPhone-Einstellungen unter <em>Safari &rarr; Downloads</em> auf <strong>"Jedes Mal fragen"</strong>.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <a
                href={iosBlobUrl}
                download="portfolio.json"
                onClick={() => {
                  setSyncStep('done');
                  setTimeout(() => {
                    setSyncStep('idle');
                    URL.revokeObjectURL(iosBlobUrl);
                  }, 2000);
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 active:scale-95 transition-transform"
              >
                <Download size={18} />
                Speicherort wählen
              </a>
              <button
                onClick={() => {
                  setSyncStep('idle');
                  URL.revokeObjectURL(iosBlobUrl);
                }}
                className="w-full bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 py-2 text-sm font-medium"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setEditingTx(null);
          setTxModalOpen(true);
        }}
        className="fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-green-600 text-white shadow-lg shadow-green-600/30 flex items-center justify-center active:scale-90 transition-transform"
        aria-label="Transaktion hinzufügen"
      >
        <Plus size={26} />
      </button>

      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 safe-bottom">
        <div className="flex items-center justify-around max-w-2xl mx-auto px-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center gap-0.5 py-2 px-3 transition-colors ${
                  active ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <TransactionModal
        open={txModalOpen}
        editing={editingTx}
        onClose={() => {
          setTxModalOpen(false);
          setEditingTx(null);
        }}
        onSave={handleSaveTransaction}
        knownBanks={knownBanks}
      />
      <PriceEditModal
        open={priceModalOpen}
        holding={priceHolding}
        onClose={() => {
          setPriceModalOpen(false);
          setPriceHolding(null);
        }}
        onSave={portfolio.setManualPrice}
        onRemove={portfolio.removeManualPrice}
      />
    </div>
  );
}

export default App;

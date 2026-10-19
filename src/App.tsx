import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Briefcase, List, Settings as SettingsIcon, Plus } from 'lucide-react';
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
  const [syncStep, setSyncStep] = useState<'idle' | 'saving' | 'done'>('idle');

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
      const portfolioData: PortfolioExport = await portfolio.exportPortfolio();
      const jsonString = JSON.stringify(portfolioData, null, 2);
      const file = new File([jsonString], 'portfolio.json', { type: 'application/json' });

      // Safe type casting to prevent TypeScript from crashing the build
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = (typeof navigator !== 'undefined' ? navigator : null) as any;
      let canShareFiles = false;

      if (nav && typeof nav.share === 'function') {
        try {
          canShareFiles = !!(nav.canShare && nav.canShare({ files: [file] }));
        } catch {
          canShareFiles = false;
        }
      }

      // If available, trigger native system share dialog
      if (canShareFiles && nav) {
        try {
          await nav.share({
            files: [file],
            title: '',
            text: '',
          });
          setSyncStep('done');
          setTimeout(() => setSyncStep('idle'), 2500);
          return;
        } catch (err: unknown) {
          if ((err as Error)?.name === 'AbortError') {
            setSyncStep('idle');
            return;
          }
          // On other errors, continue to desktop/blob fallback
        }
      }

      const fileName = 'portfolio.json';

      // Desktop File System Access API (if available on desktop Chrome/Edge)
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
            suggestedName: fileName,
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
        }
      }

      // Fallback: Traditional Blob download via hidden <a> tag
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2500);

      setSyncStep('done');
      setTimeout(() => setSyncStep('idle'), 2500);
    } catch (error) {
      console.error('Sync-Fehler abgefangen:', error);
      setSyncStep('idle');
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

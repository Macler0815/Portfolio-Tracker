import { useState, useEffect, useRef, useCallback } from 'react';
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
import { getSavedFileHandle, writeToHandle, verifyPermission } from '@/lib/icloud';

type Tab = 'dashboard' | 'holdings' | 'transactions' | 'settings';

function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [priceHolding, setPriceHolding] = useState<Holding | null>(null);
  const [syncStep, setSyncStep] = useState<'idle' | 'refreshing' | 'saving' | 'done'>('idle');

  const portfolio = usePortfolio();
  const bio = useBiometric();

  // Extract known banks for autocomplete
  const knownBanks = Array.from(new Set(portfolio.transactions.map((t) => t.bank).filter(Boolean))) as string[];

  // Track unlocked state in ref for event handlers
  const unlockedRef = useRef(false);
  unlockedRef.current = bio.state === 'unlocked';

  // --- PWA Lifecycle: auto-refresh on foreground + auto-export on background ---
  const refreshPricesRef = useRef(portfolio.refreshPrices);
  refreshPricesRef.current = portfolio.refreshPrices;

  const exportPortfolioRef = useRef(portfolio.exportPortfolio);
  exportPortfolioRef.current = portfolio.exportPortfolio;

  const triggerAutoExport = useCallback(async () => {
    if (!unlockedRef.current) return;
    const exportFn = exportPortfolioRef.current;
    try {
      const data = await exportFn();
      const handle = await getSavedFileHandle();
      if (handle && (await verifyPermission(handle, true))) {
        await writeToHandle(handle, data);
      } else {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'portfolio.json';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Silent fail on background export
    }
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Only auto-refresh if already unlocked (biometric hook re-locks on hidden)
        if (unlockedRef.current) {
          refreshPricesRef.current(true);
        }
      } else if (document.visibilityState === 'hidden') {
        triggerAutoExport();
      }
    }

    function handlePageHide() {
      triggerAutoExport();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [triggerAutoExport]);

  // Auto-refresh on initial unlock (foreground) — only when unlocked
  useEffect(() => {
    if (bio.state === 'unlocked' && !portfolio.loading && portfolio.transactions.length > 0) {
      portfolio.refreshPrices(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bio.state, portfolio.loading]);

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

  function handleSaveTransaction(t: Omit<Transaction, 'id'> | Transaction) {
    if ('id' in t) {
      portfolio.updateTransaction(t);
    } else {
      portfolio.addTransaction(t);
    }
  }

  function handleEditPrice(h: Holding) {
    setPriceHolding(h);
    setPriceModalOpen(true);
  }

  async function handleSyncAndBackup() {
    setSyncStep('refreshing');
    await portfolio.refreshPrices(true);
    setSyncStep('saving');
    try {
      const data: PortfolioExport = await portfolio.exportPortfolio();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'portfolio.json';
      a.click();
      URL.revokeObjectURL(url);
      setSyncStep('done');
      setTimeout(() => setSyncStep('idle'), 2500);
    } catch {
      setSyncStep('idle');
    }
  }

  const currentPrices = new Map(portfolio.holdings.map((h) => [h.symbol, h.currentPrice]));

  // Gate: show lock screen for all non-unlocked states
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
      {/* Content */}
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
          onSyncAndBackup={handleSyncAndBackup}
          syncing={syncStep !== 'idle' && syncStep !== 'done'}
          syncStep={syncStep}
        />
      )}
      {tab === 'holdings' && (
        <HoldingsView holdings={portfolio.holdings} onEditPrice={handleEditPrice} />
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
          onApiKeyChanged={() => portfolio.refreshPrices(true)}
        />
      )}

      {/* Floating Action Button */}
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

      {/* Bottom Navigation */}
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

      {/* Modals */}
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

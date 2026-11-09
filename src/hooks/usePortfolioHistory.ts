import { useState, useEffect } from 'react';
import {
  getPortfolioHistory,
  type PortfolioHistory,
  HISTORY_EVENT,
} from '@/lib/history';

export function usePortfolioHistory(): PortfolioHistory {
  const [history, setHistory] = useState<PortfolioHistory>(() => getPortfolioHistory());

  useEffect(() => {
    function handleUpdate() {
      setHistory(getPortfolioHistory());
    }

    window.addEventListener(HISTORY_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(HISTORY_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return history;
}

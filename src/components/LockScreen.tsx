import { Lock, Fingerprint, ShieldCheck, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import type { BiometricState } from '@/hooks/useBiometric';

interface LockScreenProps {
  state: BiometricState;
  error: string | null;
  busy: boolean;
  onRegister: () => void;
  onAuthenticate: () => void;
  onSkip: () => void;
  onReset: () => void;
}

export function LockScreen({
  state,
  error,
  busy,
  onRegister,
  onAuthenticate,
  onSkip,
  onReset,
}: LockScreenProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col items-center justify-center px-6">
      {/* Subtle gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-950 to-black pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-green-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col items-center max-w-sm w-full">
        {/* Lock icon */}
        <div className="w-20 h-20 rounded-3xl bg-gray-800/80 border border-gray-700/50 flex items-center justify-center mb-6 shadow-2xl">
          {state === 'unregistered' ? (
            <Fingerprint size={36} className="text-green-400" />
          ) : busy ? (
            <Loader2 size={36} className="text-gray-400 animate-spin" />
          ) : (
            <Lock size={36} className="text-gray-300" />
          )}
        </div>

        {state === 'unsupported' && (
          <>
            <h1 className="text-xl font-semibold text-white mb-2">Biometrie nicht verfügbar</h1>
            <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed">
              Dein Gerät oder Browser unterstützt keine biometrische Authentifizierung über Passkeys.
              Du kannst die App trotzdem ohne Biometriesperre nutzen.
            </p>
            <button
              onClick={onSkip}
              className="w-full rounded-2xl bg-green-600 text-white py-3.5 text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              Weiter ohne Biometrie
            </button>
          </>
        )}

        {state === 'unregistered' && (
          <>
            <h1 className="text-xl font-semibold text-white mb-2">Biometrie einrichten</h1>
            <p className="text-sm text-gray-400 text-center mb-6 leading-relaxed">
              Schütze dein Portfolio mit Face ID oder deiner Geräte-PIN. Registriere dich einmal
              auf diesem Gerät — bei jedem Start wird danach authentifiziert.
            </p>

            <div className="w-full flex items-center gap-3 rounded-2xl bg-gray-800/60 border border-gray-700/50 px-4 py-3 mb-6">
              <ShieldCheck size={20} className="text-green-400 shrink-0" />
              <p className="text-xs text-gray-300 leading-relaxed">
                Deine Daten bleiben lokal auf diesem Gerät. Die Authentifizierung läuft
                vollständig über die sichere Enclave deines Geräts.
              </p>
            </div>

            <button
              onClick={onRegister}
              disabled={busy}
              className="w-full rounded-2xl bg-green-600 text-white py-3.5 text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Registrierung läuft…
                </>
              ) : (
                <>
                  <Fingerprint size={18} />
                  Mit Face ID registrieren
                </>
              )}
            </button>

            <button
              onClick={onSkip}
              className="w-full text-center text-sm text-gray-500 font-medium mt-4"
            >
              Später einrichten
            </button>
          </>
        )}

        {state === 'locked' && (
          <>
            <h1 className="text-xl font-semibold text-white mb-2">Portfolio gesperrt</h1>
            <p className="text-sm text-gray-400 text-center mb-8 leading-relaxed">
              Authentifiziere dich mit Face ID oder deiner Geräte-PIN, um dein Portfolio
              freizugeben.
            </p>

            <button
              onClick={onAuthenticate}
              disabled={busy}
              className="w-full rounded-2xl bg-green-600 text-white py-3.5 text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Wird freigegeben…
                </>
              ) : (
                <>
                  <Lock size={18} />
                  Portfolio entsperren
                </>
              )}
            </button>

            <button
              onClick={onReset}
              className="w-full text-center text-xs text-gray-600 font-medium mt-6"
            >
              Biometrie zurücksetzen
            </button>
          </>
        )}

        {error && (
          <div className="w-full flex items-start gap-2 rounded-xl bg-red-950/60 border border-red-800/50 px-4 py-3 mt-4">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 leading-relaxed">{error}</p>
          </div>
        )}

        {/* Privacy footer */}
        <div className="absolute -bottom-16 flex items-center gap-1.5 text-gray-600">
          <EyeOff size={12} />
          <span className="text-[10px]">Daten bleiben geschützt bis Freigabe</span>
        </div>
      </div>
    </div>
  );
}

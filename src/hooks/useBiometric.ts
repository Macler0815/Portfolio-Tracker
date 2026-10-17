import { useCallback, useEffect, useRef, useState } from 'react';

const CRED_ID_KEY = 'portfolio_webauthn_cred_id';
const REGISTERED_KEY = 'portfolio_webauthn_registered';

export type BiometricState =
  | 'checking'
  | 'unsupported'
  | 'unregistered'
  | 'locked'
  | 'unlocked';

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function randomChallenge(): ArrayBuffer {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr.buffer;
}

export function useBiometric() {
  const [state, setState] = useState<BiometricState>('checking');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (typeof window === 'undefined' || !window.PublicKeyCredential) {
          if (!cancelled) setState('unsupported');
          return;
        }

        try {
          const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500));
          const checkPromise = PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
          const available = await Promise.race([checkPromise, timeoutPromise]);
          if (!available) {
            if (!cancelled) setState('unsupported');
            return;
          }
        } catch {
          if (!cancelled) {
            setState('unsupported');
            return;
          }
        }

        let registered: string | null = null;
        try {
          registered = localStorage.getItem(REGISTERED_KEY);
        } catch {
          // localStorage disabled or restricted in private browsing
        }

        if (!cancelled) {
          setState(registered ? 'locked' : 'unregistered');
        }
      } catch (err) {
        console.warn('Biometric init exception:', err);
        if (!cancelled) setState('unsupported');
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const userId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'user_' + Date.now();
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: randomChallenge(),
          rp: {
            name: 'Portfolio Tracker',
            id: window.location.hostname,
          },
          user: {
            id: new TextEncoder().encode(userId),
            name: 'portfolio-user',
            displayName: 'Portfolio User',
          },
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -256 },
          ],
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (credential) {
        const credId = bufferToBase64(credential.rawId);
        localStorage.setItem(CRED_ID_KEY, credId);
        localStorage.setItem(REGISTERED_KEY, Date.now().toString());
        setState('unlocked');
      }
    } catch {
      setError(
        'Registrierung abgebrochen oder fehlgeschlagen. Bitte versuche es erneut.'
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const authenticate = useCallback(async () => {
    const credId = localStorage.getItem(CRED_ID_KEY);
    if (!credId) {
      setState('unregistered');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: randomChallenge(),
          rpId: window.location.hostname,
          userVerification: 'required',
          allowCredentials: [
            {
              id: base64ToBuffer(credId),
              type: 'public-key',
            },
          ],
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (assertion) {
        setState('unlocked');
      }
    } catch {
      setError(
        'Authentifizierung fehlgeschlagen. Bitte versuche es erneut.'
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const resetBiometric = useCallback(() => {
    localStorage.removeItem(CRED_ID_KEY);
    localStorage.removeItem(REGISTERED_KEY);
    setError(null);
    setState('unregistered');
  }, []);

  const proceedWithoutBio = useCallback(() => {
    setState('unlocked');
  }, []);

  const lock = useCallback(() => {
    setState((prev) => (prev === 'unlocked' ? 'locked' : prev));
  }, []);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden' && stateRef.current === 'unlocked') {
        setState('locked');
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return {
    state,
    error,
    busy,
    register,
    authenticate,
    resetBiometric,
    proceedWithoutBio,
    lock,
  };
}

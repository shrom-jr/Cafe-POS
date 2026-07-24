import { useState, useEffect, useRef } from 'react';
import { useStaffStore } from '@/store/useStaffStore';
import { usePOSStore } from '@/store/usePOSStore';
import { StaffUser, Role } from '@/types/staff';
import { Lock } from 'lucide-react';

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.15)',  border: 'rgba(168,85,247,0.35)', text: '#c084fc' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.35)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.35)', text: '#34d399' },
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN:   'Admin',
  CASHIER: 'Cashier',
  WAITER:  'Waiter',
};

// ── PIN Keypad Modal ─────────────────────────────────────────────────────────
const PinModal = ({
  user,
  onClose,
}: {
  user: StaffUser;
  onClose: () => void;
}) => {
  const { login } = useStaffStore();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [showError, setShowError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use a ref so the keydown handler always sees the latest pin/shake without
  // re-attaching the listener on every keystroke.
  const pinRef = useRef(pin);
  const shakeRef = useRef(shake);
  pinRef.current = pin;
  shakeRef.current = shake;

  const colors = ROLE_COLORS[user.role];

  const handleDigit = (digit: string) => {
    if (shakeRef.current) return;
    // Read from ref so this is safe to call from a stale keydown closure too.
    const current = pinRef.current;
    if (current.length >= 4) return;
    const next = current + digit;
    // Update pin display first — NOT inside the setter so we never call login()
    // during a React state-update cycle (avoids the render-phase setState warning).
    setPin(next);
    if (next.length === 4) {
      const ok = login(user.id, next);
      if (ok) {
        // Set the URL before BrowserRouter mounts so it initialises at the
        // correct path for this role (admin → /admin, others → /).
        window.history.replaceState(null, '', user.role === 'ADMIN' ? '/admin' : '/');
      } else {
        setShake(true);
        setShowError(true);
        setTimeout(() => {
          setShake(false);
          setPin('');
          setTimeout(() => setShowError(false), 200);
        }, 600);
      }
      // On success, store sets currentUser → App re-renders → BrowserRouter mounts.
    }
  };

  const handleBackspace = () => {
    if (!shakeRef.current) setPin((p) => p.slice(0, -1));
  };

  const handleSubmit = () => {
    if (pinRef.current.length === 4) {
      const ok = login(user.id, pinRef.current);
      if (ok) {
        window.history.replaceState(null, '', user.role === 'ADMIN' ? '/admin' : '/');
      } else {
        setShake(true);
        setShowError(true);
        setTimeout(() => {
          setShake(false);
          setPin('');
          setTimeout(() => setShowError(false), 200);
        }, 600);
      }
    }
  };

  // Auto-focus the container on open so keyboard input works immediately.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Global keydown listener — runs alongside mouse/touch, does not replace them.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Digits: top-row keys (key '0'–'9') and Numpad (code 'Numpad0'–'Numpad9')
      if (/^[0-9]$/.test(e.key) || /^Numpad[0-9]$/.test(e.code)) {
        e.preventDefault();
        const digit = e.key.length === 1 ? e.key : e.code.replace('Numpad', '');
        if (pinRef.current.length < 4) handleDigit(digit);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        handleSubmit();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // attach once; refs keep values fresh

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      {/* tabIndex makes the container focusable so auto-focus works */}
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`w-full max-w-xs rounded-2xl border p-6 space-y-5 transition-transform outline-none ${
          shake ? 'animate-shake' : ''
        }`}
        style={{
          background: 'linear-gradient(135deg, #0a1228 0%, #0d1a2e 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 64px -8px rgba(0,0,0,0.85)',
        }}
      >
        {/* Avatar + name */}
        <div className="text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-xl font-black text-white/90 mb-3"
            style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <p className="font-bold text-white/90">{user.name}</p>
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full mt-1.5 inline-block"
            style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
          >
            {ROLE_LABEL[user.role]}
          </span>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-4 py-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full transition-all duration-150"
              style={{
                background: pin.length > i ? 'hsl(var(--accent))' : 'rgba(255,255,255,0.18)',
                transform: pin.length > i ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {/* Error message */}
        <p
          className="text-center text-sm font-semibold transition-opacity duration-200"
          style={{ color: '#f87171', opacity: showError ? 1 : 0, minHeight: '1.25rem' }}
        >
          Invalid PIN
        </p>

        {/* Keypad — mouse clicks and touch taps work independently of keyboard */}
        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, idx) => {
            if (!key) return <div key={idx} />;
            const isBack = key === '⌫';
            return (
              <button
                key={idx}
                onClick={() => (isBack ? handleBackspace() : pin.length < 4 && handleDigit(key))}
                className="h-12 rounded-xl text-base font-bold transition-all active:scale-90 select-none"
                style={{
                  background: isBack ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.09)',
                  color: isBack ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.88)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {key}
              </button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ── Main Login Screen ────────────────────────────────────────────────────────
const PinLoginScreen = () => {
  const { users } = useStaffStore();
  const settings = usePOSStore((s) => s.settings);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);

  const activeUsers = users.filter((u) => u.active);

  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)' }}
    >
      {/* Header */}
      <header
        className="flex-shrink-0 flex flex-col items-center justify-center px-6 py-5"
        style={{
          background: 'linear-gradient(135deg, #0a1228 0%, #0d1a2e 100%)',
          borderBottom: '1px solid rgba(59,130,246,0.15)',
        }}
      >
        <div className="flex items-center gap-2.5 mb-1">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}
          >
            <Lock size={14} className="text-blue-400" />
          </div>
          <p className="text-xs font-bold text-white/50 tracking-[0.14em] uppercase select-none">
            {settings.cafeName}
          </p>
        </div>
        <p className="text-sm font-medium text-white/60">Select your profile to log in</p>
      </header>

      {/* Profile grid */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {activeUsers.length === 0 ? (
            <div className="text-center py-20 text-white/30">
              <p className="text-sm font-semibold">No active staff accounts found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {activeUsers.map((user) => {
                const colors = ROLE_COLORS[user.role];
                return (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className="flex flex-col items-center gap-3 p-5 rounded-2xl transition-all duration-200 active:scale-[0.96] hover:brightness-110 select-none"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: '0 4px 24px -6px rgba(0,0,0,0.5)',
                    }}
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-white/85"
                      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-white/90">{user.name}</p>
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1.5 inline-block"
                        style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
                      >
                        {ROLE_LABEL[user.role]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PIN Modal */}
      {selectedUser && (
        <PinModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
};

export default PinLoginScreen;

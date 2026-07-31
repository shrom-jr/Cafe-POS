import { useState, useEffect, useRef } from 'react';
import { useStaffStore } from '@/store/useStaffStore';
import { usePOSStore } from '@/store/usePOSStore';
import { StaffUser, Role } from '@/types/staff';
import { getFirstPermittedRoute } from '@/utils/permissions';
import { Lock, ArrowLeft, Mail, RotateCcw, Loader2 } from 'lucide-react';
import { writePinReset } from '@/utils/firebaseSync';
import { toast } from 'sonner';
import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID  = 'service_mgnjpll';
const EMAILJS_TEMPLATE_ID = 'template_od1a97s';
const EMAILJS_PUBLIC_KEY  = 'ct_T99fLZJzPB5zut';

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.15)',  border: 'rgba(168,85,247,0.35)', text: '#c084fc' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.35)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.35)', text: '#34d399' },
  KITCHEN: { bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.35)',  text: '#fb923c' },
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN:   'Admin',
  CASHIER: 'Cashier',
  WAITER:  'Waiter',
  KITCHEN: 'Kitchen',
};

// ── Shared keypad keys ───────────────────────────────────────────────────────
const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

const OTP_DURATION = 300; // 5 minutes in seconds

type ModalView = 'pin' | 'email' | 'otp' | 'newpin';

// ── PIN Keypad Modal ─────────────────────────────────────────────────────────
const PinModal = ({
  user,
  onClose,
}: {
  user: StaffUser;
  onClose: () => void;
}) => {
  const { login, updateUser } = useStaffStore();
  const colors = ROLE_COLORS[user.role];

  // ── view navigation ──
  const [view, setView] = useState<ModalView>('pin');

  // ── pin view state ──
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [showError, setShowError] = useState(false);

  // ── otp view state ──
  const [isSending, setIsSending] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [timeLeft, setTimeLeft] = useState(OTP_DURATION);
  // otpKey increments on every send/resend so the timer effect re-runs even
  // when view is already 'otp' (e.g. when Resend is tapped).
  const [otpKey, setOtpKey] = useState(0);

  // ── new-pin view state ──
  const [newPinStep, setNewPinStep] = useState<'enter' | 'confirm'>('enter');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newPinShake, setNewPinShake] = useState(false);

  // ── refs (keep keyboard handler stable while always reading fresh values) ──
  const containerRef  = useRef<HTMLDivElement>(null);
  const pinRef        = useRef(pin);
  const shakeRef      = useRef(shake);
  const viewRef       = useRef(view);
  const newPinRef     = useRef(newPin);
  const confirmPinRef = useRef(confirmPin);
  const newPinStepRef = useRef(newPinStep);
  const generatedOtp  = useRef('');
  const expiresAt     = useRef(0);

  pinRef.current        = pin;
  shakeRef.current      = shake;
  viewRef.current       = view;
  newPinRef.current     = newPin;
  confirmPinRef.current = confirmPin;
  newPinStepRef.current = newPinStep;

  // ── countdown timer — restarts on every send/resend ──
  useEffect(() => {
    if (view !== 'otp') return;
    setTimeLeft(OTP_DURATION);
    const id = setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? (clearInterval(id), 0) : t - 1));
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, otpKey]);

  // ── send / resend OTP ──
  const sendOtp = async () => {
    setIsSending(true);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const exp = Date.now() + OTP_DURATION * 1000;
    generatedOtp.current = otp;
    expiresAt.current    = exp;

    // Write to Firebase first (non-blocking on email failure)
    await writePinReset(user.id, otp, exp);

    // Send via EmailJS
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        { to_name: user.name, to_email: user.email, otp },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      toast.success(`Code sent to ${user.email}`);
    } catch (err) {
      console.error('[EmailJS] Send failed:', err);
      toast.error('Failed to send email — check your connection and try again.');
      setIsSending(false);
      return; // stay on email view so user can retry
    }

    setOtpInput('');
    setOtpError('');
    setOtpKey((k) => k + 1);
    setView('otp');
    setIsSending(false);
  };

  // ── verify OTP ──
  const verifyOtp = () => {
    if (Date.now() > expiresAt.current) {
      setOtpError('Code expired — tap Resend to get a new one.');
      return;
    }
    if (otpInput !== generatedOtp.current) {
      setOtpError('Incorrect code. Please try again.');
      return;
    }
    setOtpError('');
    setNewPin('');
    setConfirmPin('');
    setNewPinStep('enter');
    setView('newpin');
  };

  // ── pin view handlers ──
  const handleDigit = (digit: string) => {
    if (shakeRef.current) return;
    const current = pinRef.current;
    if (current.length >= 4) return;
    const next = current + digit;
    setPin(next);
    if (next.length === 4) {
      const ok = login(user.id, next);
      if (ok) {
        window.history.replaceState(null, '', getFirstPermittedRoute(user.permissions));
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
  const handleBackspace = () => { if (!shakeRef.current) setPin((p) => p.slice(0, -1)); };
  const handleSubmit = () => {
    if (pinRef.current.length !== 4) return;
    const ok = login(user.id, pinRef.current);
    if (ok) {
      window.history.replaceState(null, '', getFirstPermittedRoute(user.permissions));
    } else {
      setShake(true); setShowError(true);
      setTimeout(() => { setShake(false); setPin(''); setTimeout(() => setShowError(false), 200); }, 600);
    }
  };

  // ── new-pin view handlers ──
  const handleNewPinDigit = (digit: string) => {
    if (newPinStepRef.current === 'enter') {
      const cur = newPinRef.current;
      if (cur.length >= 4) return;
      const next = cur + digit;
      setNewPin(next);
      if (next.length === 4) setTimeout(() => setNewPinStep('confirm'), 180);
    } else {
      const cur = confirmPinRef.current;
      if (cur.length >= 4) return;
      const next = cur + digit;
      setConfirmPin(next);
      if (next.length === 4) {
        if (next !== newPinRef.current) {
          setNewPinShake(true);
          setTimeout(() => { setNewPinShake(false); setConfirmPin(''); }, 600);
        } else {
          updateUser(user.id, { pin: next });
          toast.success('PIN updated successfully');
          onClose();
        }
      }
    }
  };
  const handleNewPinBackspace = () => {
    if (newPinStepRef.current === 'enter') setNewPin((p) => p.slice(0, -1));
    else setConfirmPin((p) => p.slice(0, -1));
  };

  // ── auto-focus ──
  useEffect(() => { containerRef.current?.focus(); }, []);

  // ── global keyboard handler (attached once, refs stay fresh) ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const v = viewRef.current;
      const isDigit = /^[0-9]$/.test(e.key) || /^Numpad[0-9]$/.test(e.code);
      const digit   = e.key.length === 1 ? e.key : e.code.replace('Numpad', '');

      if (v === 'pin') {
        if (isDigit) { e.preventDefault(); if (pinRef.current.length < 4) handleDigit(digit); return; }
        if (e.key === 'Backspace') { e.preventDefault(); handleBackspace(); return; }
        if (e.key === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); handleSubmit(); return; }
      }
      if (v === 'newpin') {
        if (isDigit) { e.preventDefault(); handleNewPinDigit(digit); return; }
        if (e.key === 'Backspace') { e.preventDefault(); handleNewPinBackspace(); return; }
      }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // refs keep everything fresh

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── shared keypad renderer ──
  const Keypad = ({
    onDigit,
    onBack,
    small,
  }: {
    onDigit: (d: string) => void;
    onBack: () => void;
    small?: boolean;
  }) => (
    <div className={`grid grid-cols-3 ${small ? 'gap-2' : 'gap-2.5'}`}>
      {KEYPAD_KEYS.map((key, idx) => {
        if (!key) return <div key={idx} />;
        const isBack = key === '⌫';
        return (
          <button
            key={idx}
            onClick={() => (isBack ? onBack() : onDigit(key))}
            className={`${small ? 'h-11 text-sm' : 'h-12 text-base'} rounded-xl font-bold transition-all active:scale-90 select-none`}
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
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`w-full max-w-xs rounded-2xl p-6 space-y-5 outline-none transition-transform ${
          (shake && view === 'pin') || (newPinShake && view === 'newpin') ? 'animate-shake' : ''
        }`}
        style={{
          background: 'linear-gradient(135deg, #0a1228 0%, #0d1a2e 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 24px 64px -8px rgba(0,0,0,0.85)',
        }}
      >

        {/* ════════════════════════════════ PIN VIEW ════════════════════════════════ */}
        {view === 'pin' && (
          <>
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

            {/* Error */}
            <p
              className="text-center text-sm font-semibold transition-opacity duration-200"
              style={{ color: '#f87171', opacity: showError ? 1 : 0, minHeight: '1.25rem' }}
            >
              Invalid PIN
            </p>

            <Keypad
              onDigit={(d) => { if (pin.length < 4) handleDigit(d); }}
              onBack={handleBackspace}
            />

            <div className="space-y-1.5">
              {user.email && (
                <button
                  onClick={() => setView('email')}
                  className="w-full py-1.5 text-xs font-medium text-blue-400/70 hover:text-blue-300 transition-colors"
                >
                  Forgot PIN?
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ══════════════════════════════ EMAIL VIEW ════════════════════════════════ */}
        {view === 'email' && (
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('pin')}
                className="p-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 className="font-bold text-white/90 text-sm">Reset PIN</h3>
                <p className="text-xs text-white/40 mt-0.5">We'll send a verification code to your email</p>
              </div>
            </div>

            {/* Email card */}
            <div
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}
              >
                <Mail size={15} className="text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-white/40 mb-0.5 uppercase tracking-wide font-medium">Sending to</p>
                <p className="text-sm font-semibold text-white/85 truncate">{user.email}</p>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                onClick={sendOtp}
                disabled={isSending}
                className="w-full py-3 rounded-xl text-sm font-black text-white transition-all active:scale-[0.97] disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)',
                  boxShadow: '0 4px 16px -4px rgba(59,130,246,0.55)',
                }}
              >
                {isSending
                  ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" />Sending…</span>
                  : 'Send Code'}
              </button>
              <button
                onClick={() => setView('pin')}
                className="w-full py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                Back
              </button>
            </div>
          </>
        )}

        {/* ═══════════════════════════════ OTP VIEW ════════════════════════════════ */}
        {view === 'otp' && (
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('email')}
                className="p-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 className="font-bold text-white/90 text-sm">Enter Code</h3>
                <p className="text-xs text-white/40 mt-0.5">Check your email inbox for the 6-digit code</p>
              </div>
            </div>

            {/* Countdown badge */}
            <div className="flex justify-center">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={{
                  background: timeLeft > 60 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${timeLeft > 60 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.25)'}`,
                  color: timeLeft > 60 ? '#34d399' : '#f87171',
                }}
              >
                {timeLeft > 0 ? `Expires in ${fmtTime(timeLeft)}` : 'Code expired'}
              </span>
            </div>

            {/* 6 digit boxes */}
            <div>
              <div className="flex justify-center gap-1.5 mb-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white/90 transition-all"
                    style={{
                      background: otpInput[i] ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${otpInput[i] ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    }}
                  >
                    {otpInput[i] ?? ''}
                  </div>
                ))}
              </div>
              {otpError && (
                <p className="text-center text-xs font-semibold text-red-400">{otpError}</p>
              )}
            </div>

            <Keypad
              small
              onDigit={(d) => {
                if (otpInput.length < 6) { setOtpInput((p) => p + d); setOtpError(''); }
              }}
              onBack={() => { setOtpInput((p) => p.slice(0, -1)); setOtpError(''); }}
            />

            <div className="space-y-1.5">
              <button
                onClick={verifyOtp}
                disabled={otpInput.length !== 6 || timeLeft === 0}
                className="w-full py-3 rounded-xl text-sm font-black text-white transition-all active:scale-[0.97] disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)',
                  boxShadow: '0 4px 16px -4px rgba(59,130,246,0.55)',
                }}
              >
                Verify
              </button>
              <button
                onClick={sendOtp}
                disabled={isSending || timeLeft > OTP_DURATION - 30}
                className="w-full py-2 text-xs font-semibold text-blue-400/60 hover:text-blue-300 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-35"
              >
                <RotateCcw size={11} /> Resend Code
              </button>
            </div>
          </>
        )}

        {/* ══════════════════════════════ NEW PIN VIEW ══════════════════════════════ */}
        {view === 'newpin' && (
          <>
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-xl font-black text-white/90 mb-3"
                style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <p className="font-bold text-white/90">
                {newPinStep === 'enter' ? 'Set New PIN' : 'Confirm PIN'}
              </p>
              <p className="text-xs text-white/40 mt-1">
                {newPinStep === 'enter' ? 'Enter a new 4-digit PIN' : 'Re-enter your new PIN to confirm'}
              </p>
            </div>

            {/* PIN dots */}
            <div className="flex justify-center gap-4 py-1">
              {[0, 1, 2, 3].map((i) => {
                const cur = newPinStep === 'enter' ? newPin : confirmPin;
                return (
                  <div
                    key={i}
                    className="w-4 h-4 rounded-full transition-all duration-150"
                    style={{
                      background: cur.length > i
                        ? (newPinShake ? '#f87171' : 'hsl(var(--accent))')
                        : 'rgba(255,255,255,0.18)',
                      transform: cur.length > i ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                );
              })}
            </div>

            {newPinShake && (
              <p className="text-center text-xs font-semibold text-red-400 -mt-2">
                PINs don't match — try again
              </p>
            )}

            <Keypad onDigit={handleNewPinDigit} onBack={handleNewPinBackspace} />

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
          </>
        )}

      </div>
    </div>
  );
};

// ── Main Login Screen ────────────────────────────────────────────────────────
const PinLoginScreen = () => {
  const users = useStaffStore((state) => state.users);
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
          <p className="text-xs font-medium text-slate-200 tracking-[0.14em] uppercase select-none">
            {settings.cafeName}
          </p>
        </div>
        <p className="text-sm font-medium text-slate-300">Select your profile to log in</p>
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

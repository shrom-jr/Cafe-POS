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

const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string; glow: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.18)', border: 'rgba(168,85,247,0.40)', text: '#c084fc', glow: 'rgba(168,85,247,0.35)' },
  CASHIER: { bg: 'rgba(59,130,246,0.18)',  border: 'rgba(59,130,246,0.40)',  text: '#60a5fa', glow: 'rgba(59,130,246,0.35)'  },
  WAITER:  { bg: 'rgba(16,185,129,0.18)',  border: 'rgba(16,185,129,0.40)',  text: '#34d399', glow: 'rgba(16,185,129,0.35)'  },
  KITCHEN: { bg: 'rgba(249,115,22,0.18)',  border: 'rgba(249,115,22,0.40)',  text: '#fb923c', glow: 'rgba(249,115,22,0.35)'  },
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin', CASHIER: 'Cashier', WAITER: 'Waiter', KITCHEN: 'Kitchen',
};

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
const OTP_DURATION = 300;

type ModalView = 'pin' | 'email' | 'otp' | 'newpin';

// ── Live clock ────────────────────────────────────────────────────────────────
function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return {
    time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    date: time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

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

  const [view, setView]             = useState<ModalView>('pin');
  const [pin, setPin]               = useState('');
  const [shake, setShake]           = useState(false);
  const [showError, setShowError]   = useState(false);
  const [isSending, setIsSending]   = useState(false);
  const [otpInput, setOtpInput]     = useState('');
  const [otpError, setOtpError]     = useState('');
  const [timeLeft, setTimeLeft]     = useState(OTP_DURATION);
  const [otpKey, setOtpKey]         = useState(0);
  const [newPinStep, setNewPinStep] = useState<'enter' | 'confirm'>('enter');
  const [newPin, setNewPin]         = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newPinShake, setNewPinShake] = useState(false);

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

  useEffect(() => {
    if (view !== 'otp') return;
    setTimeLeft(OTP_DURATION);
    const id = setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? (clearInterval(id), 0) : t - 1));
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, otpKey]);

  const sendOtp = async () => {
    setIsSending(true);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const exp = Date.now() + OTP_DURATION * 1000;
    generatedOtp.current = otp;
    expiresAt.current    = exp;
    await writePinReset(user.id, otp, exp);
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
        { to_name: user.name, to_email: user.email, otp },
        { publicKey: EMAILJS_PUBLIC_KEY },
      );
      toast.success(`Code sent to ${user.email}`);
    } catch (err) {
      console.error('[EmailJS] Send failed:', err);
      toast.error('Failed to send email — check your connection and try again.');
      setIsSending(false);
      return;
    }
    setOtpInput(''); setOtpError('');
    setOtpKey((k) => k + 1);
    setView('otp');
    setIsSending(false);
  };

  const verifyOtp = () => {
    if (Date.now() > expiresAt.current) { setOtpError('Code expired — tap Resend to get a new one.'); return; }
    if (otpInput !== generatedOtp.current) { setOtpError('Incorrect code. Please try again.'); return; }
    setOtpError('');
    setNewPin(''); setConfirmPin(''); setNewPinStep('enter');
    setView('newpin');
  };

  const handleDigit = (digit: string) => {
    if (shakeRef.current) return;
    const cur = pinRef.current;
    if (cur.length >= 4) return;
    const next = cur + digit;
    setPin(next);
    if (next.length === 4) {
      const ok = login(user.id, next);
      if (ok) {
        window.history.replaceState(null, '', getFirstPermittedRoute(user.permissions));
      } else {
        setShake(true); setShowError(true);
        setTimeout(() => { setShake(false); setPin(''); setTimeout(() => setShowError(false), 200); }, 600);
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

  useEffect(() => { containerRef.current?.focus(); }, []);

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
  }, []);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Circular keypad ──────────────────────────────────────────────────────────
  const Keypad = ({
    onDigit, onBack, small,
  }: { onDigit: (d: string) => void; onBack: () => void; small?: boolean }) => (
    <div className={`grid grid-cols-3 ${small ? 'gap-2' : 'gap-3'}`}>
      {KEYPAD_KEYS.map((key, idx) => {
        if (!key) return <div key={idx} />;
        const isBack = key === '⌫';
        const size = small ? 'w-12 h-12 text-sm' : 'w-14 h-14 text-base';
        return (
          <div key={idx} className="flex justify-center">
            <button
              onClick={() => (isBack ? onBack() : onDigit(key))}
              className={`${size} rounded-full font-bold transition-all active:scale-90 select-none flex items-center justify-center`}
              style={{
                background: isBack
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(255,255,255,0.08)',
                color: isBack ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.88)',
                border: `1px solid ${isBack ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.13)'}`,
                boxShadow: isBack ? 'none' : '0 2px 8px -2px rgba(0,0,0,0.5)',
              }}
            >
              {key}
            </button>
          </div>
        );
      })}
    </div>
  );

  // ── PIN dots ─────────────────────────────────────────────────────────────────
  const PinDots = ({ value, error }: { value: string; error?: boolean }) => (
    <div className="flex justify-center gap-5 py-2">
      {[0, 1, 2, 3].map((i) => {
        const filled = value.length > i;
        return (
          <div
            key={i}
            className="w-5 h-5 rounded-full transition-all duration-150"
            style={{
              background: filled
                ? (error ? '#f87171' : colors.text)
                : 'rgba(255,255,255,0.15)',
              boxShadow: filled
                ? `0 0 14px 4px ${error ? 'rgba(248,113,113,0.5)' : colors.glow}`
                : 'none',
              transform: filled ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`w-full max-w-xs rounded-3xl p-6 space-y-5 outline-none ${
          (shake && view === 'pin') || (newPinShake && view === 'newpin') ? 'animate-shake' : ''
        }`}
        style={{
          background: 'rgba(10,18,40,0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 32px 80px -12px rgba(0,0,0,0.90), inset 0 1px 0 0 rgba(255,255,255,0.06)',
        }}
      >

        {/* ════ PIN VIEW ════ */}
        {view === 'pin' && (
          <>
            <div className="text-center space-y-2">
              <div
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-2xl font-black text-white/90"
                style={{
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  boxShadow: `0 0 20px -4px ${colors.glow}`,
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-white/90 text-base">{user.name}</p>
                <span
                  className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full mt-1.5 inline-block"
                  style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
                >
                  {ROLE_LABEL[user.role]}
                </span>
              </div>
            </div>

            <PinDots value={pin} error={showError} />

            <p
              className="text-center text-sm font-semibold transition-opacity duration-200 -mt-2"
              style={{ color: '#f87171', opacity: showError ? 1 : 0, minHeight: '1.25rem' }}
            >
              Invalid PIN
            </p>

            <Keypad onDigit={(d) => { if (pin.length < 4) handleDigit(d); }} onBack={handleBackspace} />

            <div className="space-y-1.5 pt-1">
              {user.email && (
                <button
                  onClick={() => setView('email')}
                  className="w-full py-1.5 text-xs font-medium text-blue-400/65 hover:text-blue-300 transition-colors"
                >
                  Forgot PIN?
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-2xl text-sm font-semibold text-white/35 hover:text-white/55 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ════ EMAIL VIEW ════ */}
        {view === 'email' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setView('pin')} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors">
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 className="font-bold text-white/90 text-sm">Reset PIN</h3>
                <p className="text-xs text-white/40 mt-0.5">We'll send a verification code to your email</p>
              </div>
            </div>
            <div
              className="flex items-center gap-3 p-4 rounded-2xl"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
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
                className="w-full py-3 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.97] disabled:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)',
                  boxShadow: '0 4px 20px -4px rgba(59,130,246,0.60)',
                }}
              >
                {isSending
                  ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" />Sending…</span>
                  : 'Send Code'}
              </button>
              <button
                onClick={() => setView('pin')}
                className="w-full py-2.5 rounded-2xl text-sm font-semibold text-white/35 hover:text-white/55 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                Back
              </button>
            </div>
          </>
        )}

        {/* ════ OTP VIEW ════ */}
        {view === 'otp' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setView('email')} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors">
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 className="font-bold text-white/90 text-sm">Enter Code</h3>
                <p className="text-xs text-white/40 mt-0.5">Check your email inbox for the 6-digit code</p>
              </div>
            </div>
            <div className="flex justify-center">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={{
                  background: timeLeft > 60 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${timeLeft > 60 ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.25)'}`,
                  color: timeLeft > 60 ? '#34d399' : '#f87171',
                }}
              >
                {timeLeft > 0 ? `Expires in ${fmtTime(timeLeft)}` : 'Code expired'}
              </span>
            </div>
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
              {otpError && <p className="text-center text-xs font-semibold text-red-400">{otpError}</p>}
            </div>
            <Keypad
              small
              onDigit={(d) => { if (otpInput.length < 6) { setOtpInput((p) => p + d); setOtpError(''); } }}
              onBack={() => { setOtpInput((p) => p.slice(0, -1)); setOtpError(''); }}
            />
            <div className="space-y-1.5">
              <button
                onClick={verifyOtp}
                disabled={otpInput.length !== 6 || timeLeft === 0}
                className="w-full py-3 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.97] disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)',
                  boxShadow: '0 4px 20px -4px rgba(59,130,246,0.60)',
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

        {/* ════ NEW PIN VIEW ════ */}
        {view === 'newpin' && (
          <>
            <div className="text-center space-y-2">
              <div
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-2xl font-black text-white/90"
                style={{ background: colors.bg, border: `1px solid ${colors.border}`, boxShadow: `0 0 20px -4px ${colors.glow}` }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-white/90">{newPinStep === 'enter' ? 'Set New PIN' : 'Confirm PIN'}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {newPinStep === 'enter' ? 'Enter a new 4-digit PIN' : 'Re-enter your new PIN to confirm'}
                </p>
              </div>
            </div>
            <PinDots value={newPinStep === 'enter' ? newPin : confirmPin} error={newPinShake} />
            {newPinShake && (
              <p className="text-center text-xs font-semibold text-red-400 -mt-2">PINs don't match — try again</p>
            )}
            <Keypad onDigit={handleNewPinDigit} onBack={handleNewPinBackspace} />
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-2xl text-sm font-semibold text-white/35 hover:text-white/55 transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── Main Login Screen ─────────────────────────────────────────────────────────
const PinLoginScreen = () => {
  const users    = useStaffStore((state) => state.users);
  const settings = usePOSStore((s) => s.settings);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);
  const { time, date } = useClock();

  const activeUsers = users.filter((u) => u.active);

  return (
    <div className="h-[100dvh] flex overflow-hidden" style={{ background: 'linear-gradient(160deg, #060d1c 0%, #090f1e 100%)' }}>

      {/* ── Left branding panel (lg+) ─────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between w-72 xl:w-80 flex-shrink-0 p-8"
        style={{
          background: 'linear-gradient(160deg, #080f22 0%, #0a1228 100%)',
          borderRight: '1px solid rgba(59,130,246,0.12)',
        }}
      >
        {/* Logo + name */}
        <div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
            style={{
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.30)',
              boxShadow: '0 0 24px -6px rgba(59,130,246,0.55)',
            }}
          >
            <Lock size={24} className="text-blue-400" />
          </div>
          <h1 className="text-xl font-black text-white/90 leading-tight mb-1">
            {settings.cafeName || 'S Bamboo Cottage'}
          </h1>
          <p className="text-sm text-white/35 font-medium leading-snug">
            Point of Sale System
          </p>

          {/* Divider */}
          <div className="mt-8 h-px bg-white/[0.06]" />

          {/* Status indicators */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex w-2 h-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" style={{ animationDuration: '2.4s' }} />
                <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" style={{ boxShadow: '0 0 6px 2px rgba(52,211,153,0.55)' }} />
              </span>
              <span className="text-xs font-semibold text-emerald-400/80">System Online</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-blue-400/60 flex-shrink-0" />
              <span className="text-xs font-medium text-white/35">
                {activeUsers.length} staff account{activeUsers.length !== 1 ? 's' : ''} active
              </span>
            </div>
          </div>
        </div>

        {/* Clock */}
        <div>
          <div className="h-px bg-white/[0.06] mb-6" />
          <p className="font-mono text-3xl font-bold text-white/70 tabular-nums tracking-tight">{time}</p>
          <p className="text-xs text-white/30 font-medium mt-1">{date}</p>
        </div>
      </div>

      {/* ── Right: staff selection ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile-only compact header */}
        <header
          className="lg:hidden flex-shrink-0 flex items-center justify-between px-5 py-4"
          style={{
            background: 'rgba(8,15,34,0.85)',
            borderBottom: '1px solid rgba(59,130,246,0.10)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.28)' }}
            >
              <Lock size={13} className="text-blue-400" />
            </div>
            <p className="text-xs font-bold text-white/70 tracking-[0.12em] uppercase">
              {settings.cafeName}
            </p>
          </div>
          <p className="font-mono text-xs font-medium text-white/30 tabular-nums">{time}</p>
        </header>

        {/* Heading */}
        <div className="flex-shrink-0 px-6 pt-8 pb-4">
          <h2 className="text-lg font-black text-white/85">Select Profile</h2>
          <p className="text-sm text-white/35 mt-0.5">Choose your account to continue</p>
        </div>

        {/* Profile grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          {activeUsers.length === 0 ? (
            <div className="text-center py-24 text-white/25">
              <p className="text-sm font-semibold">No active staff accounts found.</p>
              <p className="text-xs mt-1">Add accounts in Admin → Staff.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 max-w-2xl">
              {activeUsers.map((user) => {
                const c = ROLE_COLORS[user.role];
                return (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className="flex flex-col items-center gap-3 p-5 rounded-2xl transition-all duration-200 active:scale-[0.95] hover:brightness-110 select-none group"
                    style={{
                      background: 'rgba(255,255,255,0.025)',
                      border: `1px solid rgba(255,255,255,0.07)`,
                      boxShadow: '0 4px 24px -8px rgba(0,0,0,0.60)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = c.border;
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 24px -8px ${c.glow}`;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.07)';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 24px -8px rgba(0,0,0,0.60)';
                    }}
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-white/85"
                      style={{
                        background: c.bg,
                        border: `1px solid ${c.border}`,
                        boxShadow: `0 0 18px -4px ${c.glow}`,
                      }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-white/88">{user.name}</p>
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1.5 inline-block"
                        style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
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

import { useState, useEffect, useRef } from 'react';
import { useStaffStore } from '@/store/useStaffStore';
import { usePOSStore } from '@/store/usePOSStore';
import { StaffUser, Role } from '@/types/staff';
import { getFirstPermittedRoute } from '@/utils/permissions';
import { ArrowLeft, Mail, RotateCcw, Loader2, X } from 'lucide-react';
import { writePinReset } from '@/utils/firebaseSync';
import { toast } from 'sonner';
import emailjs from '@emailjs/browser';
import { ThemeToggle } from '@/components/ui/Navigation';

const EMAILJS_SERVICE_ID  = 'service_mgnjpll';
const EMAILJS_TEMPLATE_ID = 'template_od1a97s';
const EMAILJS_PUBLIC_KEY  = 'ct_T99fLZJzJzPB5zut';

// ── Role pill tokens (card grid only) ─────────────────────────────────────────
const ROLE_PILL: Record<Role, string> = {
  ADMIN:   'bg-purple-500/15 border border-purple-500/40 text-purple-300',
  CASHIER: 'bg-sky-500/15 border border-sky-500/40 text-sky-300',
  WAITER:  'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300',
  KITCHEN: 'bg-amber-500/15 border border-amber-500/40 text-amber-300',
};

// Modal inline colours (dark-only surface — unchanged logic)
const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.15)',  border: 'rgba(168,85,247,0.40)', text: '#c084fc' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.40)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.40)', text: '#34d399' },
  KITCHEN: { bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.40)',  text: '#fb923c' },
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN:   'Admin',
  CASHIER: 'Cashier',
  WAITER:  'Waiter',
  KITCHEN: 'Kitchen',
};

// ── Keypad keys ───────────────────────────────────────────────────────────────
const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

const OTP_DURATION = 300;

type ModalView = 'pin' | 'email' | 'otp' | 'newpin';

// ── Initials helper ───────────────────────────────────────────────────────────
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── PIN Keypad Modal ──────────────────────────────────────────────────────────
const PinModal = ({
  user,
  onClose,
}: {
  user: StaffUser;
  onClose: () => void;
}) => {
  const { login, updateUser } = useStaffStore();
  const colors = ROLE_COLORS[user.role];

  const [view, setView]               = useState<ModalView>('pin');
  const [pin, setPin]                 = useState('');
  const [shake, setShake]             = useState(false);
  const [showError, setShowError]     = useState(false);
  const [isSending, setIsSending]     = useState(false);
  const [otpInput, setOtpInput]       = useState('');
  const [otpError, setOtpError]       = useState('');
  const [timeLeft, setTimeLeft]       = useState(OTP_DURATION);
  const [otpKey, setOtpKey]           = useState(0);
  const [newPinStep, setNewPinStep]   = useState<'enter' | 'confirm'>('enter');
  const [newPin, setNewPin]           = useState('');
  const [confirmPin, setConfirmPin]   = useState('');
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

  // ── OTP countdown ──
  useEffect(() => {
    if (view !== 'otp') return;
    setTimeLeft(OTP_DURATION);
    const id = setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? (clearInterval(id), 0) : t - 1));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, otpKey]);

  // ── Send / resend OTP ──
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
        { publicKey: EMAILJS_PUBLIC_KEY }
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

  // ── Verify OTP ──
  const verifyOtp = () => {
    if (Date.now() > expiresAt.current) { setOtpError('Code expired — tap Resend to get a new one.'); return; }
    if (otpInput !== generatedOtp.current) { setOtpError('Incorrect code. Please try again.'); return; }
    setOtpError('');
    setNewPin(''); setConfirmPin(''); setNewPinStep('enter');
    setView('newpin');
  };

  // ── PIN handlers ──
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

  // ── New-PIN handlers ──
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

  // ── Keyboard handler (refs stay fresh) ──
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

  // ── Shared tactile keypad ─────────────────────────────────────────────────
  const Keypad = ({ onDigit, onBack, small }: {
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
            className={`${small ? 'h-11 text-sm' : 'h-14 text-xl'} w-full rounded-2xl font-bold transition-all duration-150 active:scale-95 select-none flex items-center justify-center text-white`}
            style={{
              background: '#1E2235',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#282D45'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1E2235'; }}
          >
            {key}
          </button>
        );
      })}
    </div>
  );

  // ── Staff header chip (pin + newpin views) ────────────────────────────────
  const StaffChip = ({ label }: { label?: string }) => (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
          style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
        >
          {initials(user.name)}
        </div>
        <div className="text-left">
          <p className="text-sm font-black text-white leading-tight">{user.name}</p>
          <span
            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mt-0.5"
            style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
          >
            {ROLE_LABEL[user.role]}
          </span>
        </div>
      </div>
      {label && <span className="text-xs font-bold text-white/40">{label}</span>}
      {!label && (
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-colors text-white/30 hover:text-white/70"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`max-w-xs w-full p-6 rounded-3xl flex flex-col gap-5 outline-none shadow-2xl transition-transform ${
          (shake && view === 'pin') || (newPinShake && view === 'newpin') ? 'animate-shake' : ''
        }`}
        style={{ background: '#13151F', border: '1px solid rgba(255,255,255,0.15)' }}
      >

        {/* ══════════════════════════════ PIN VIEW ══════════════════════════════ */}
        {view === 'pin' && (
          <>
            <StaffChip />

            {/* PIN dots */}
            <div className="flex justify-center gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
                    pin.length > i
                      ? 'bg-amber-500 border-amber-500 shadow-md shadow-amber-500/40 scale-110'
                      : 'bg-transparent border-white/20'
                  }`}
                />
              ))}
            </div>

            {/* Error row */}
            <p
              className="text-center text-sm font-semibold text-red-400 transition-opacity duration-200"
              style={{ opacity: showError ? 1 : 0, minHeight: '1.25rem' }}
            >
              Invalid PIN
            </p>

            <Keypad onDigit={(d) => { if (pin.length < 4) handleDigit(d); }} onBack={handleBackspace} />

            <div className="space-y-1.5">
              {user.email && (
                <button
                  onClick={() => setView('email')}
                  className="w-full py-1.5 text-xs font-semibold text-blue-400/70 hover:text-blue-300 transition-colors"
                >
                  Forgot PIN?
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/30 hover:text-white/60 transition-colors flex items-center justify-center gap-1.5"
              >
                <X size={13} /> Cancel
              </button>
            </div>
          </>
        )}

        {/* ══════════════════════════════ EMAIL VIEW ════════════════════════════ */}
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
                <h3 className="font-bold text-white text-sm">Reset PIN</h3>
                <p className="text-xs text-white/40 mt-0.5">We'll send a verification code to your email</p>
              </div>
            </div>

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

            <div className="space-y-2.5">
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

        {/* ═══════════════════════════════ OTP VIEW ═════════════════════════════ */}
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
                <h3 className="font-bold text-white text-sm">Enter Code</h3>
                <p className="text-xs text-white/40 mt-0.5">Check your email for the 6-digit code</p>
              </div>
            </div>

            <div className="flex justify-center">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  timeLeft > 60
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}
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

        {/* ════════════════════════════ NEW PIN VIEW ════════════════════════════ */}
        {view === 'newpin' && (
          <>
            <StaffChip label={newPinStep === 'enter' ? 'Set New PIN' : 'Confirm PIN'} />

            {/* PIN dots */}
            <div className="flex justify-center gap-4">
              {[0, 1, 2, 3].map((i) => {
                const cur = newPinStep === 'enter' ? newPin : confirmPin;
                return (
                  <div
                    key={i}
                    className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
                      cur.length > i
                        ? newPinShake
                          ? 'bg-red-500 border-red-500 scale-110'
                          : 'bg-amber-500 border-amber-500 shadow-md shadow-amber-500/40 scale-110'
                        : 'bg-transparent border-white/20'
                    }`}
                  />
                );
              })}
            </div>

            <p className="text-center text-xs text-white/40">
              {newPinStep === 'enter' ? 'Enter a new 4-digit PIN' : 'Re-enter your new PIN to confirm'}
            </p>

            {newPinShake && (
              <p className="text-center text-xs font-semibold text-red-400 -mt-3">
                PINs don't match — try again
              </p>
            )}

            <Keypad onDigit={handleNewPinDigit} onBack={handleNewPinBackspace} />

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white/30 hover:text-white/60 transition-colors flex items-center justify-center gap-1.5"
            >
              <X size={13} /> Cancel
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

  const activeUsers = users.filter((u) => u.active);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-slate-50 dark:bg-[#0A0B0E] text-slate-950 dark:text-white">

      {/* ── Theme toggle — top-right ── */}
      <div className="absolute top-4 right-4 z-40">
        <ThemeToggle />
      </div>

      {/* ── Hero brand header ── */}
      <header className="flex-shrink-0 flex flex-col items-center justify-center px-6 pt-14 pb-6">
        {/* Logo */}
        <div
          className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl border-2 border-amber-500/40 p-2 shadow-xl shadow-amber-500/10 mb-4 mx-auto overflow-hidden flex items-center justify-center"
          style={{ background: '#13151F' }}
        >
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt={settings.cafeName} className="h-full w-full object-contain" />
          ) : (
            <span className="text-3xl font-black text-amber-500">
              {settings.cafeName?.charAt(0)?.toUpperCase() ?? '🍽'}
            </span>
          )}
        </div>

        {/* Restaurant name */}
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white text-center">
          {settings.cafeName}
        </h1>

        {/* System title */}
        <p className="text-xs sm:text-sm font-bold tracking-widest text-amber-500 dark:text-amber-400 uppercase mt-1">
          POS &amp; Management System
        </p>

        {/* Instruction badge */}
        <div
          className="inline-flex items-center gap-2 mt-4 px-4 py-1.5 rounded-full shadow-sm"
          style={{ background: '#13151F', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <span className="text-xs font-bold text-slate-300">Select Your Profile to Continue</span>
        </div>
      </header>

      {/* ── Staff profile grid ── */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center px-4 pb-10">
        <div className="w-full max-w-4xl mt-2">
          {activeUsers.length === 0 ? (
            <div className="text-center py-20 text-slate-400 dark:text-white/30">
              <p className="text-sm font-semibold">No active staff accounts found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {activeUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="group p-6 rounded-3xl flex flex-col items-center justify-between min-h-[190px] cursor-pointer transition-all duration-200 active:scale-[0.97] select-none
                    bg-white border-2 border-slate-900 hover:bg-slate-50 shadow-sm hover:shadow-md hover:-translate-y-1
                    dark:bg-[#13151F] dark:border dark:border-white/10 dark:hover:border-amber-500/60 dark:hover:bg-[#181B28] dark:shadow-lg dark:shadow-black/40 dark:hover:shadow-amber-500/5"
                >
                  {/* Monogram avatar */}
                  <div
                    className="h-16 w-16 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-inner mb-3 transition-transform duration-200 group-hover:scale-105"
                    style={{ background: '#1E2235', border: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    {initials(user.name)}
                  </div>

                  {/* Name */}
                  <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-wide truncate w-full text-center mt-1">
                    {user.name}
                  </p>

                  {/* Role pill */}
                  <span
                    className={`text-[11px] font-black uppercase px-3 py-0.5 rounded-full tracking-wider mt-2 ${ROLE_PILL[user.role]}`}
                  >
                    {ROLE_LABEL[user.role]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── PIN modal ── */}
      {selectedUser && (
        <PinModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
};

export default PinLoginScreen;

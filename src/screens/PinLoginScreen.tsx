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
const EMAILJS_PUBLIC_KEY  = 'ct_T99fLZJzPB5zut';

// ── Role colour tokens ────────────────────────────────────────────────────────
type RoleTokens = {
  avatarGradient: string;
  avatarShadow: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
};

const ROLE_TOKENS: Record<Role, RoleTokens> = {
  ADMIN: {
    avatarGradient: 'from-purple-600 to-indigo-500',
    avatarShadow:   'shadow-purple-500/20',
    pillBg:     'bg-purple-500/15',
    pillText:   'text-purple-600 dark:text-purple-300',
    pillBorder: 'border-purple-500/30',
  },
  CASHIER: {
    avatarGradient: 'from-sky-500 to-blue-600',
    avatarShadow:   'shadow-sky-500/20',
    pillBg:     'bg-sky-500/15',
    pillText:   'text-sky-600 dark:text-sky-300',
    pillBorder: 'border-sky-500/30',
  },
  WAITER: {
    avatarGradient: 'from-emerald-500 to-teal-600',
    avatarShadow:   'shadow-emerald-500/20',
    pillBg:     'bg-emerald-500/15',
    pillText:   'text-emerald-600 dark:text-emerald-300',
    pillBorder: 'border-emerald-500/30',
  },
  KITCHEN: {
    avatarGradient: 'from-amber-500 to-orange-600',
    avatarShadow:   'shadow-orange-500/20',
    pillBg:     'bg-orange-500/15',
    pillText:   'text-orange-600 dark:text-orange-300',
    pillBorder: 'border-orange-500/30',
  },
};

// Legacy inline-style colours used only inside the dark-only PinModal
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

const ROLE_EMOJI: Record<Role, string> = {
  ADMIN:   '👑',
  CASHIER: '💳',
  WAITER:  '🍽️',
  KITCHEN: '👨‍🍳',
};

// ── Keypad keys ───────────────────────────────────────────────────────────────
const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

const OTP_DURATION = 300;

type ModalView = 'pin' | 'email' | 'otp' | 'newpin';

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

  const verifyOtp = () => {
    if (Date.now() > expiresAt.current) { setOtpError('Code expired — tap Resend to get a new one.'); return; }
    if (otpInput !== generatedOtp.current) { setOtpError('Incorrect code. Please try again.'); return; }
    setOtpError('');
    setNewPin(''); setConfirmPin(''); setNewPinStep('enter');
    setView('newpin');
  };

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

  // ── Tactile keypad ────────────────────────────────────────────────────────
  const Keypad = ({ onDigit, onBack, small }: { onDigit: (d: string) => void; onBack: () => void; small?: boolean }) => (
    <div className={`grid grid-cols-3 ${small ? 'gap-2' : 'gap-2.5'}`}>
      {KEYPAD_KEYS.map((key, idx) => {
        if (!key) return <div key={idx} />;
        const isBack = key === '⌫';
        return (
          <button
            key={idx}
            onClick={() => (isBack ? onBack() : onDigit(key))}
            className={`${small ? 'h-11 text-sm' : 'h-14 w-14 mx-auto text-xl'} w-full rounded-2xl font-bold transition-all duration-150 active:scale-95 select-none border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-900 dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-white`}
          >
            {key}
          </button>
        );
      })}
    </div>
  );

  // ── Avatar chip (reused across pin/newpin views) ──────────────────────────
  const AvatarChip = () => (
    <div className="text-center">
      <div
        className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-xl font-black text-white mb-3 shadow-md"
        style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
      >
        {user.name.charAt(0).toUpperCase()}
      </div>
      <p className="font-bold text-slate-900 dark:text-white">{user.name}</p>
      <span
        className="text-xs font-black px-2.5 py-0.5 rounded-full mt-1.5 inline-block tracking-wider uppercase border"
        style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
      >
        {ROLE_LABEL[user.role]}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/70 p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`w-full max-w-xs rounded-3xl p-6 space-y-5 outline-none bg-white dark:bg-[#12141E] border border-slate-200 dark:border-white/10 shadow-2xl transition-transform ${
          (shake && view === 'pin') || (newPinShake && view === 'newpin') ? 'animate-shake' : ''
        }`}
      >

        {/* ══════════════════════════════ PIN VIEW ══════════════════════════════ */}
        {view === 'pin' && (
          <>
            <AvatarChip />

            {/* PIN dots */}
            <div className="flex justify-center gap-4 py-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
                    pin.length > i
                      ? 'bg-amber-500 border-amber-500 scale-110'
                      : 'bg-transparent border-slate-300 dark:border-zinc-700'
                  }`}
                />
              ))}
            </div>

            {/* Error */}
            <p
              className="text-center text-sm font-semibold transition-opacity duration-200 text-red-500"
              style={{ opacity: showError ? 1 : 0, minHeight: '1.25rem' }}
            >
              Invalid PIN
            </p>

            <Keypad onDigit={(d) => { if (pin.length < 4) handleDigit(d); }} onBack={handleBackspace} />

            <div className="space-y-1.5">
              {user.email && (
                <button
                  onClick={() => setView('email')}
                  className="w-full py-1.5 text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors"
                >
                  Forgot PIN?
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Reset PIN</h3>
                <p className="text-xs text-slate-500 dark:text-white/40 mt-0.5">We'll send a verification code to your email</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-100 border border-blue-200 dark:bg-blue-500/15 dark:border-blue-500/25">
                <Mail size={15} className="text-blue-500 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500 dark:text-white/40 mb-0.5 uppercase tracking-wide font-medium">Sending to</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-white/85 truncate">{user.email}</p>
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
                className="w-full py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60 transition-colors"
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70 transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Enter Code</h3>
                <p className="text-xs text-slate-500 dark:text-white/40 mt-0.5">Check your email inbox for the 6-digit code</p>
              </div>
            </div>

            <div className="flex justify-center">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  timeLeft > 60
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400'
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
                    className={`w-10 h-12 rounded-xl flex items-center justify-center text-lg font-black transition-all border ${
                      otpInput[i]
                        ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-500/18 dark:border-blue-500/40 dark:text-white/90'
                        : 'bg-slate-50 border-slate-200 text-slate-900 dark:bg-white/5 dark:border-white/10 dark:text-white/30'
                    }`}
                  >
                    {otpInput[i] ?? ''}
                  </div>
                ))}
              </div>
              {otpError && <p className="text-center text-xs font-semibold text-red-500 dark:text-red-400">{otpError}</p>}
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
                className="w-full py-2 text-xs font-semibold text-blue-500 hover:text-blue-400 dark:text-blue-400/60 dark:hover:text-blue-300 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-35"
              >
                <RotateCcw size={11} /> Resend Code
              </button>
            </div>
          </>
        )}

        {/* ════════════════════════════ NEW PIN VIEW ════════════════════════════ */}
        {view === 'newpin' && (
          <>
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-xl font-black text-white mb-3 shadow-md"
                style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <p className="font-bold text-slate-900 dark:text-white">
                {newPinStep === 'enter' ? 'Set New PIN' : 'Confirm PIN'}
              </p>
              <p className="text-xs text-slate-500 dark:text-white/40 mt-1">
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
                    className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
                      cur.length > i
                        ? newPinShake
                          ? 'bg-red-500 border-red-500 scale-110'
                          : 'bg-emerald-500 border-emerald-500 scale-110'
                        : 'bg-transparent border-slate-300 dark:border-zinc-700'
                    }`}
                  />
                );
              })}
            </div>

            {newPinShake && (
              <p className="text-center text-xs font-semibold text-red-500 dark:text-red-400 -mt-2">
                PINs don't match — try again
              </p>
            )}

            <Keypad onDigit={handleNewPinDigit} onBack={handleNewPinBackspace} />

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60 transition-colors flex items-center justify-center gap-1.5"
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
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-slate-50 dark:bg-[#0d0f1a]">

      {/* ── Theme toggle ── */}
      <div className="absolute top-4 right-4 z-40">
        <ThemeToggle />
      </div>

      {/* ── Hero header ── */}
      <header className="flex-shrink-0 flex flex-col items-center justify-center px-6 pt-12 pb-6">
        {/* Logo container */}
        <div className="h-16 w-16 rounded-2xl ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10 mb-3 mx-auto overflow-hidden bg-white dark:bg-zinc-900 flex items-center justify-center">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt={settings.cafeName} className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-black text-amber-500">
              {settings.cafeName?.charAt(0)?.toUpperCase() ?? '🍽'}
            </span>
          )}
        </div>

        {/* Brand name */}
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white text-center">
          {settings.cafeName}
        </h1>

        {/* Subtitle */}
        <p className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-zinc-400 tracking-wider uppercase mt-1">
          Staff Portal
        </p>

        {/* Selection indicator pill */}
        <div className="mt-4 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 px-4 py-1.5 rounded-full">
          <span className="text-xs font-bold text-slate-600 dark:text-zinc-400">
            👤 Select Your Profile to Continue
          </span>
        </div>
      </header>

      {/* ── Staff profile grid ── */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center p-6 pb-10">
        <div className="w-full max-w-4xl">
          {activeUsers.length === 0 ? (
            <div className="text-center py-20 text-slate-400 dark:text-white/30">
              <p className="text-sm font-semibold">No active staff accounts found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {activeUsers.map((user) => {
                const tokens = ROLE_TOKENS[user.role];
                return (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className="relative group p-5 rounded-3xl cursor-pointer transition-all duration-200 flex flex-col items-center justify-center text-center
                      bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-900 shadow-sm hover:shadow-xl hover:-translate-y-1.5
                      dark:bg-[#13151F] dark:hover:bg-[#1A1D2B] dark:border dark:border-white/10 dark:hover:border-white/25 dark:shadow-lg dark:shadow-black/40 dark:hover:shadow-2xl
                      active:scale-[0.97] select-none"
                  >
                    {/* Role avatar pill */}
                    <div
                      className={`h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-md mb-3 transition-transform duration-200 group-hover:scale-105 bg-gradient-to-tr ${tokens.avatarGradient} ${tokens.avatarShadow}`}
                    >
                      {ROLE_EMOJI[user.role]}
                    </div>

                    {/* Name */}
                    <p className="text-lg font-black text-slate-900 dark:text-white tracking-wide truncate w-full">
                      {user.name}
                    </p>

                    {/* Role pill badge */}
                    <span
                      className={`mt-2 px-3 py-1 rounded-full text-[11px] font-black tracking-wider uppercase border ${tokens.pillBg} ${tokens.pillText} ${tokens.pillBorder}`}
                    >
                      {ROLE_LABEL[user.role]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── PIN Modal ── */}
      {selectedUser && (
        <PinModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
};

export default PinLoginScreen;

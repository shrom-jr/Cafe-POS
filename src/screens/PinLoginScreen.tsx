import { useState, useEffect, useRef } from 'react';
import { useStaffStore } from '@/store/useStaffStore';
import { usePOSStore } from '@/store/usePOSStore';
import { StaffUser, Role } from '@/types/staff';
import { getFirstPermittedRoute } from '@/utils/permissions';
import { ArrowLeft, Mail, RotateCcw, Loader2, X, LockKeyhole } from 'lucide-react';
import { writePinReset } from '@/utils/firebaseSync';
import { toast } from 'sonner';
import emailjs from '@emailjs/browser';
import { ThemeToggle } from '@/components/ui/Navigation';

const EMAILJS_SERVICE_ID  = 'service_mgnjpll';
const EMAILJS_TEMPLATE_ID = 'template_od1a97s';
const EMAILJS_PUBLIC_KEY  = 'ct_T99fLZJzJzPB5zut';

const FALLBACK_NAME = 'S Bamboo Cottage & Sekuwa Corner';

// ── Role-themed staff card tokens ────────────────────────────────────────────
const ROLE_CARD_STYLES: Record<Role, { card: string; name: string; badge: string }> = {
  ADMIN: {
    card: 'bg-gradient-to-b from-purple-950/40 via-purple-900/15 to-[#10121A] border-2 border-purple-500/40 hover:border-purple-400 hover:shadow-[0_0_20px_rgba(168,85,247,0.25)]',
    name: 'group-hover:text-purple-200',
    badge: 'bg-purple-500/20 text-purple-200 border-purple-500/50',
  },
  CASHIER: {
    card: 'bg-gradient-to-b from-sky-950/40 via-sky-900/15 to-[#10121A] border-2 border-sky-500/40 hover:border-sky-400 hover:shadow-[0_0_20px_rgba(14,165,233,0.25)]',
    name: 'group-hover:text-sky-200',
    badge: 'bg-sky-500/20 text-sky-200 border-sky-500/50',
  },
  WAITER: {
    card: 'bg-gradient-to-b from-emerald-950/40 via-emerald-900/15 to-[#10121A] border-2 border-emerald-500/40 hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.25)]',
    name: 'group-hover:text-emerald-200',
    badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50',
  },
  KITCHEN: {
    card: 'bg-gradient-to-b from-amber-950/40 via-amber-900/15 to-[#10121A] border-2 border-amber-500/40 hover:border-amber-400 hover:shadow-[0_0_20px_rgba(245,158,11,0.25)]',
    name: 'group-hover:text-amber-200',
    badge: 'bg-amber-500/20 text-amber-200 border-amber-500/50',
  },
};

// ── Role colours for modal ────────────────────────────────────────────────────
const ROLE_COLORS: Record<Role, { bg: string; border: string; text: string }> = {
  ADMIN:   { bg: 'rgba(168,85,247,0.15)',  border: 'rgba(168,85,247,0.40)', text: '#c084fc' },
  CASHIER: { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.40)', text: '#60a5fa' },
  WAITER:  { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.40)', text: '#34d399' },
  KITCHEN: { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.40)',  text: '#fbbf24' },
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin', CASHIER: 'Cashier', WAITER: 'Waiter', KITCHEN: 'Kitchen',
};

const OTP_DURATION = 300;
type ModalView = 'pin' | 'email' | 'otp' | 'newpin';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ══════════════════════════════════════════════════════════════════════════════
// Tactile Glass PIN Terminal Modal
// ══════════════════════════════════════════════════════════════════════════════
const PinModal = ({ user, onClose }: { user: StaffUser; onClose: () => void }) => {
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

  // PIN length for this account's login (4 for legacy migrated accounts, 6 for new ones)
  const pinLength    = user.pinLength ?? 6;
  // New/reset PINs are always 6 digits regardless of the account's current length
  const newPinLength = 6;

  // OTP countdown
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
    if (Date.now() > expiresAt.current) { setOtpError('Code expired — tap Resend.'); return; }
    if (otpInput !== generatedOtp.current) { setOtpError('Incorrect code. Try again.'); return; }
    setOtpError('');
    setNewPin(''); setConfirmPin(''); setNewPinStep('enter');
    setView('newpin');
  };

  const handleDigit = async (digit: string) => {
    if (shakeRef.current) return;
    const current = pinRef.current;
    if (current.length >= pinLength) return;
    const next = current + digit;
    setPin(next);
    if (next.length === pinLength) {
      const ok = await login(user.id, next);
      if (ok) {
        const freshUser = useStaffStore.getState().users.find((u) => u.id === user.id);
        if (freshUser?.mustChangePin) {
          setNewPin(''); setConfirmPin(''); setNewPinStep('enter'); setPin('');
          setView('newpin');
          return;
        }
        window.history.replaceState(null, '', getFirstPermittedRoute(user.permissions));
      } else {
        setShake(true); setShowError(true);
        setTimeout(() => { setShake(false); setPin(''); setTimeout(() => setShowError(false), 200); }, 600);
      }
    }
  };
  const handleBackspace = () => { if (!shakeRef.current) setPin((p) => p.slice(0, -1)); };
  const handleSubmit = async () => {
    if (pinRef.current.length !== pinLength) return;
    const ok = await login(user.id, pinRef.current);
    if (ok) {
      const freshUser = useStaffStore.getState().users.find((u) => u.id === user.id);
      if (freshUser?.mustChangePin) {
        setNewPin(''); setConfirmPin(''); setNewPinStep('enter'); setPin('');
        setView('newpin');
        return;
      }
      window.history.replaceState(null, '', getFirstPermittedRoute(user.permissions));
    } else {
      setShake(true); setShowError(true);
      setTimeout(() => { setShake(false); setPin(''); setTimeout(() => setShowError(false), 200); }, 600);
    }
  };
  const handleForgotPin = () => setView('email');

  const handleNewPinDigit = async (digit: string) => {
    if (newPinStepRef.current === 'enter') {
      const cur = newPinRef.current;
      if (cur.length >= newPinLength) return;
      const next = cur + digit;
      setNewPin(next);
      if (next.length === newPinLength) setTimeout(() => setNewPinStep('confirm'), 180);
    } else {
      const cur = confirmPinRef.current;
      if (cur.length >= newPinLength) return;
      const next = cur + digit;
      setConfirmPin(next);
      if (next.length === newPinLength) {
        if (next !== newPinRef.current) {
          setNewPinShake(true);
          setTimeout(() => { setNewPinShake(false); setConfirmPin(''); }, 600);
        } else {
          await updateUser(user.id, { pin: next });
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
        if (isDigit) { e.preventDefault(); if (pinRef.current.length < pinLength) void handleDigit(digit); return; }
        if (e.key === 'Backspace') { e.preventDefault(); handleBackspace(); return; }
        if (e.key === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); void handleSubmit(); return; }
      }
      if (v === 'newpin') {
        if (isDigit) { e.preventDefault(); void handleNewPinDigit(digit); return; }
        if (e.key === 'Backspace') { e.preventDefault(); handleNewPinBackspace(); return; }
      }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Rectangular tactile keypad — 1-9 then placeholder/0/⌫ ────────────────
  const Keypad = ({
    onDigit, onBack, small,
  }: { onDigit: (d: string) => void; onBack: () => void; small?: boolean }) => {
    const cls = small
      ? 'h-12 w-full rounded-2xl bg-[#F1F3F5] text-slate-900 hover:bg-white active:scale-95 transition-all flex items-center justify-center shadow-sm font-black text-xl cursor-pointer select-none'
      : 'h-14 sm:h-[60px] w-full rounded-2xl bg-[#F1F3F5] text-slate-900 hover:bg-white active:scale-95 transition-all flex items-center justify-center shadow-sm font-black text-2xl cursor-pointer select-none';
    const backspaceCls = small
      ? 'h-12 w-full rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center text-lg transition-all cursor-pointer'
      : 'h-14 sm:h-[60px] w-full rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center text-xl transition-all cursor-pointer';
    return (
      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px] mx-auto">
        {[1,2,3,4,5,6,7,8,9].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onDigit(String(d))}
            className={cls}
            aria-label={`Enter ${d}`}
          >
            {d}
          </button>
        ))}
        <div aria-hidden="true" />
        <button type="button" onClick={() => onDigit('0')} className={cls} aria-label="Enter 0">0</button>
        <button type="button" onClick={onBack} className={backspaceCls} aria-label="Backspace">⌫</button>
      </div>
    );
  };

  // ── Staff header used by the reset flow ──────────────────────────────────
  const ModalHeader = ({ label }: { label?: string }) => (
    <div className="flex items-center gap-3 w-full">
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
            {label ?? ROLE_LABEL[user.role]}
          </span>
        </div>
      </div>
    </div>
  );

  // ── Glowing PIN dots ──────────────────────────────────────────────────────
  const PinDots = ({ filled, error, total = 4 }: { filled: number; error?: boolean; total?: number }) => (
    <div className="flex items-center justify-center gap-4 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
            filled > i
              ? error
                ? 'bg-red-500 border-red-500 scale-110'
                : 'bg-amber-400 border-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.8)] scale-110'
              : 'border-white/60 bg-white/10 shadow-sm'
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`relative w-full max-w-[340px] rounded-[28px] p-6 sm:p-7 bg-[#0E1017]/95 dark:bg-[#0E1017]/95 border border-white/15 shadow-2xl shadow-black flex flex-col items-center gap-5 outline-none transition-transform ${
          (shake && view === 'pin') || (newPinShake && view === 'newpin') ? 'animate-shake' : ''
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white transition-colors p-1"
          aria-label="Close PIN dialog"
        >
          <X size={18} />
        </button>

        {/* ═══════════════════════════ PIN VIEW ════════════════════════════════ */}
        {view === 'pin' && (
          <>
            <div className="flex flex-col items-center text-center">
              <LockKeyhole className="text-xl text-amber-400 mb-1 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]" size={20} aria-hidden="true" />
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-zinc-400 mb-2.5">
                ENTER YOUR PIN TO ACCESS
              </p>
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-white/[0.07] border border-white/15 shadow-inner mb-6">
                <span className="w-5 h-5 rounded-md bg-[#1E2235] text-[10px] font-black text-white flex items-center justify-center border border-white/10">
                  {initials(user.name)}
                </span>
                <span className="text-sm font-black text-white tracking-wide">{user.name}</span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {ROLE_LABEL[user.role]}
                </span>
              </div>
            </div>
            <PinDots filled={pin.length} error={shake} total={pinLength} />
            <p
              className="text-center text-sm font-semibold text-red-400 transition-opacity duration-200 -mt-2"
              style={{ opacity: showError ? 1 : 0, minHeight: '1.25rem' }}
            >
              Invalid PIN
            </p>
            <Keypad
              onDigit={(d) => { if (pin.length < pinLength) void handleDigit(d); }}
              onBack={handleBackspace}
            />
            {user.email && (
              <button
                type="button"
                onClick={handleForgotPin}
                className="mt-6 px-5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 border border-amber-500/40 hover:border-amber-400 text-amber-300 hover:text-amber-200 text-xs font-black tracking-wider uppercase transition-all duration-150 shadow-sm active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>🔑</span>
                <span>Forgot PIN?</span>
              </button>
            )}
          </>
        )}

        {/* ═══════════════════════════ EMAIL VIEW ══════════════════════════════ */}
        {view === 'email' && (
          <>
            <div className="flex items-center gap-3 w-full">
              <button onClick={() => setView('pin')} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors">
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 className="font-bold text-white text-sm">Reset PIN</h3>
                <p className="text-xs text-white/40 mt-0.5">We'll send a code to your email</p>
              </div>
            </div>
            <div
              className="flex items-center gap-3 p-4 rounded-xl w-full"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)' }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <Mail size={15} className="text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-white/40 mb-0.5 uppercase tracking-wide font-medium">Sending to</p>
                <p className="text-sm font-semibold text-white/85 truncate">{user.email}</p>
              </div>
            </div>
            <div className="space-y-2.5 w-full">
              <button
                onClick={sendOtp}
                disabled={isSending}
                className="w-full py-3 rounded-xl text-sm font-black text-white transition-all active:scale-[0.97] disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#1e50d0,#4186f5)', boxShadow: '0 4px 16px -4px rgba(59,130,246,0.55)' }}
              >
                {isSending
                  ? <span className="flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" />Sending…</span>
                  : 'Send Code'}
              </button>
              <button onClick={() => setView('pin')} className="w-full py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 transition-colors">
                Back
              </button>
            </div>
          </>
        )}

        {/* ═══════════════════════════ OTP VIEW ════════════════════════════════ */}
        {view === 'otp' && (
          <>
            <div className="flex items-center gap-3 w-full">
              <button onClick={() => setView('email')} className="p-1.5 rounded-lg text-white/40 hover:text-white/70 transition-colors">
                <ArrowLeft size={16} />
              </button>
              <div>
                <h3 className="font-bold text-white text-sm">Enter Code</h3>
                <p className="text-xs text-white/40 mt-0.5">Check your email for the 6-digit code</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              timeLeft > 60 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              {timeLeft > 0 ? `Expires in ${fmtTime(timeLeft)}` : 'Code expired'}
            </span>
            <div className="w-full">
              <div className="flex justify-center gap-1.5 mb-2">
                {[0,1,2,3,4,5].map((i) => (
                  <div key={i} className="w-10 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white/90 transition-all"
                    style={{
                      background: otpInput[i] ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${otpInput[i] ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    }}>
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
            <div className="space-y-1.5 w-full">
              <button
                onClick={verifyOtp}
                disabled={otpInput.length !== 6 || timeLeft === 0}
                className="w-full py-3 rounded-xl text-sm font-black text-white transition-all active:scale-[0.97] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#1e50d0,#4186f5)', boxShadow: '0 4px 16px -4px rgba(59,130,246,0.55)' }}
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

        {/* ═══════════════════════════ NEW PIN VIEW ════════════════════════════ */}
        {view === 'newpin' && (
          <>
            <ModalHeader label={newPinStep === 'enter' ? 'Set New PIN' : 'Confirm PIN'} />
            <PinDots filled={newPinStep === 'enter' ? newPin.length : confirmPin.length} error={newPinShake} total={newPinLength} />
            <p className="text-center text-xs text-white/40 -mt-2">
              {newPinStep === 'enter' ? 'Enter a new 6-digit PIN' : 'Re-enter to confirm'}
            </p>
            {newPinShake && (
              <p className="text-center text-xs font-semibold text-red-400 -mt-3">PINs don't match — try again</p>
            )}
            <Keypad onDigit={(d) => void handleNewPinDigit(d)} onBack={handleNewPinBackspace} />
          </>
        )}

      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Main Login Screen — Luxury Ambient Command Hub
// ══════════════════════════════════════════════════════════════════════════════
const PinLoginScreen = () => {
  const users    = useStaffStore((state) => state.users);
  const settings = usePOSStore((s) => s.settings);
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null);

  const activeUsers = users.filter((u) => u.active);

  return (
    <div className="bg-slate-100 dark:bg-[#0A0B0E] text-slate-950 dark:text-white min-h-screen relative flex items-center justify-center p-4 overflow-hidden">

      {/* Floating theme toggle */}
      <div className="absolute top-6 right-6 z-30">
        <ThemeToggle />
      </div>

      {/* ── Elevated glassmorphic hub card ── */}
      <div className="relative z-10 w-full max-w-4xl mx-auto rounded-3xl p-8 sm:p-12 backdrop-blur-2xl bg-white/80 dark:bg-[#10121A]/90 border border-black/10 dark:border-white/10 shadow-2xl dark:shadow-black/80 flex flex-col items-center">

        {/* ── Brand hero ── */}
        <div className="flex flex-col items-center mb-2">
          {/* Logo — clean glass container, no amber border */}
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-white/[0.04] border border-white/15 p-2 shadow-2xl mb-4 mx-auto flex items-center justify-center overflow-hidden">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="logo" className="w-full h-full object-contain rounded-2xl drop-shadow-md" />
            ) : (
              <span className="text-2xl font-black text-amber-400">
                {(settings?.cafeName || settings?.restaurantName || 'S Bamboo Cottage & Sekuwa Corner').charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Restaurant name — dynamic with generic fallback */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white text-center">
            {settings?.cafeName || settings?.restaurantName || 'S Bamboo Cottage & Sekuwa Corner'}
          </h1>

          {/* Subtitle */}
          <p className="text-xs font-black tracking-[0.25em] text-amber-400 uppercase mt-2 text-center">
            STAFF ACCESS • POS TERMINAL
          </p>

          {/* Instruction badge */}
          <div className="mt-3.5 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-zinc-300 shadow-sm">
            Tap Your Profile to Sign In
          </div>
        </div>

        {/* ── Luxury staff profile cards ── */}
        {activeUsers.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-white/30">
            <p className="text-sm font-semibold">No active staff accounts found.</p>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-4 w-full mt-8 max-w-4xl mx-auto">
            {activeUsers.map((user) => (
              (() => {
                const styles = ROLE_CARD_STYLES[user.role];
                return (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedUser(user)}
                className={`group w-[220px] sm:w-[230px] p-5 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 shadow-xl hover:-translate-y-1.5 active:scale-95 select-none ${styles.card}`}
              >
                <span className={`text-base sm:text-lg font-black text-white transition-colors truncate w-full ${styles.name}`}>
                  {user.name}
                </span>
                <span className={`mt-2.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border shadow-sm ${styles.badge}`}>
                  {ROLE_LABEL[user.role]}
                </span>
              </button>
                );
              })()
            ))}
          </div>
        )}
      </div>

      {/* PIN modal */}
      {selectedUser && (
        <PinModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
};

export default PinLoginScreen;

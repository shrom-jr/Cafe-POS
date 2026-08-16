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

const FALLBACK_NAME = 'S Bamboo Cottage & Sekuwa Corner';

// ── Role pill tokens ──────────────────────────────────────────────────────────
const ROLE_PILL: Record<Role, string> = {
  ADMIN:   'bg-purple-500/15 text-purple-300 border-purple-500/30',
  CASHIER: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  WAITER:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  KITCHEN: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
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

  // ── Circular glass keypad — 1-9 then ⌫/0/✕ ──────────────────────────────
  const BtnCls = 'h-14 w-14 rounded-full text-2xl font-bold bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 active:border-amber-400 text-white flex items-center justify-center transition-all shadow-sm select-none';
  const SmBtnCls = 'h-11 w-11 rounded-full text-base font-bold bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 active:border-amber-400 text-white flex items-center justify-center transition-all shadow-sm select-none';

  const Keypad = ({
    onDigit, onBack, onCancel, small,
  }: { onDigit: (d: string) => void; onBack: () => void; onCancel?: () => void; small?: boolean }) => {
    const cls = small ? SmBtnCls : BtnCls;
    return (
      <div className="flex flex-col items-center gap-3">
        {[[1,2,3],[4,5,6],[7,8,9]].map((row, ri) => (
          <div key={ri} className="flex gap-3">
            {row.map((d) => (
              <button key={d} onClick={() => onDigit(String(d))} className={cls}>{d}</button>
            ))}
          </div>
        ))}
        <div className="flex gap-3">
          <button onClick={onBack} className={cls}>⌫</button>
          <button onClick={() => onDigit('0')} className={cls}>0</button>
          {onCancel
            ? <button onClick={onCancel} className={`${cls} text-white/50 hover:text-white/90`}><X size={small ? 14 : 18} /></button>
            : <div className={small ? 'h-11 w-11' : 'h-14 w-14'} />}
        </div>
      </div>
    );
  };

  // ── Modal header with staff chip ─────────────────────────────────────────
  const ModalHeader = ({ label }: { label?: string }) => (
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
            {label ?? ROLE_LABEL[user.role]}
          </span>
        </div>
      </div>
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg transition-colors text-white/30 hover:text-white/70"
        aria-label="Close"
      >
        <X size={15} />
      </button>
    </div>
  );

  // ── Glowing PIN dots ──────────────────────────────────────────────────────
  const PinDots = ({ filled, error }: { filled: number; error?: boolean }) => (
    <div className="flex justify-center gap-4">
      {[0,1,2,3].map((i) => (
        <div
          key={i}
          className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
            filled > i
              ? error
                ? 'bg-red-500 border-red-500 scale-110'
                : 'bg-amber-400 border-amber-400 shadow-md shadow-amber-400/60 scale-110'
              : 'bg-transparent border-white/30'
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`max-w-xs w-full p-6 rounded-3xl bg-black/95 backdrop-blur-2xl border border-white/20 shadow-2xl shadow-black flex flex-col items-center gap-5 z-50 outline-none transition-transform ${
          (shake && view === 'pin') || (newPinShake && view === 'newpin') ? 'animate-shake' : ''
        }`}
      >

        {/* ═══════════════════════════ PIN VIEW ════════════════════════════════ */}
        {view === 'pin' && (
          <>
            <ModalHeader />
            <PinDots filled={pin.length} error={shake} />
            <p
              className="text-center text-sm font-semibold text-red-400 transition-opacity duration-200 -mt-2"
              style={{ opacity: showError ? 1 : 0, minHeight: '1.25rem' }}
            >
              Invalid PIN
            </p>
            <Keypad
              onDigit={(d) => { if (pin.length < 4) handleDigit(d); }}
              onBack={handleBackspace}
              onCancel={onClose}
            />
            {user.email && (
              <button
                onClick={() => setView('email')}
                className="mt-4 text-xs font-bold text-amber-400 hover:text-amber-300 hover:underline transition-colors tracking-wide"
              >
                Forgot PIN?
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
            <PinDots filled={newPinStep === 'enter' ? newPin.length : confirmPin.length} error={newPinShake} />
            <p className="text-center text-xs text-white/40 -mt-2">
              {newPinStep === 'enter' ? 'Enter a new 4-digit PIN' : 'Re-enter to confirm'}
            </p>
            {newPinShake && (
              <p className="text-center text-xs font-semibold text-red-400 -mt-3">PINs don't match — try again</p>
            )}
            <Keypad onDigit={handleNewPinDigit} onBack={handleNewPinBackspace} onCancel={onClose} />
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
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 p-2 shadow-xl mb-4 mx-auto flex items-center justify-center overflow-hidden">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="logo" className="w-full h-full object-contain rounded-xl" />
            ) : (
              <span className="text-2xl font-black text-amber-400">
                {(settings?.cafeName || settings?.restaurantName || 'Point of Sale').charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Restaurant name — dynamic with generic fallback */}
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white dark:text-white text-center">
            {settings?.cafeName || settings?.restaurantName || 'Point of Sale'}
          </h1>

          {/* Subtitle */}
          <p className="text-xs font-black tracking-[0.2em] text-amber-400 uppercase mt-1.5 text-center">
            STAFF ACCESS • POS TERMINAL
          </p>

          {/* Instruction badge */}
          <div className="mt-4 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-zinc-400 dark:text-zinc-300">
            Tap Your Profile to Sign In
          </div>
        </div>

        {/* ── Luxury staff profile cards ── */}
        {activeUsers.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-white/30">
            <p className="text-sm font-semibold">No active staff accounts found.</p>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-4 w-full mt-8 max-w-3xl mx-auto">
            {activeUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className="group w-[230px] sm:w-[240px] p-4 rounded-2xl flex items-center gap-3.5 cursor-pointer transition-all duration-200 active:scale-[0.97] select-none
                  bg-slate-100 border border-slate-300 hover:bg-slate-200 hover:border-amber-500/60 shadow-sm hover:shadow-amber-500/10 hover:-translate-y-1
                  dark:bg-[#13151F] dark:border-white/10 dark:hover:border-amber-500/60 dark:hover:bg-[#181B26] dark:shadow-lg dark:hover:shadow-amber-500/10"
              >
                {/* Monogram avatar */}
                <div
                  className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-black text-white shadow-inner transition-transform duration-200 group-hover:scale-105"
                  style={{ background: '#202436', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {initials(user.name)}
                </div>

                {/* Name + role */}
                <div className="flex flex-col min-w-0 flex-1 text-left">
                  <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                    {user.name}
                  </span>
                  <span
                    className={`mt-1 self-start px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${ROLE_PILL[user.role]}`}
                  >
                    {ROLE_LABEL[user.role]}
                  </span>
                </div>
              </button>
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

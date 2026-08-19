/**
 * AdminPinGate — compact modal that prompts for any active admin account's PIN.
 * Verifies against stored hashes (verifyPin) with a legacy-plaintext fallback.
 * Renders above everything at z-[70].
 */
import { useState, useRef, useEffect } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useStaffStore } from '@/store/useStaffStore';
import { verifyPin } from '@/utils/cryptoPin';

interface AdminPinGateProps {
  /** Short description shown under the title, e.g. "Authorize void for Table 3". */
  prompt?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AdminPinGate({ prompt, onSuccess, onCancel }: AdminPinGateProps) {
  const users     = useStaffStore((s) => s.users);
  const [pin, setPin]       = useState('');
  const [shake, setShake]   = useState(false);
  const [error, setError]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Allow Escape to cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const verify = async (value: string) => {
    const adminUsers = users.filter((u) => u.role === 'ADMIN' && u.active);
    let valid = false;
    for (const u of adminUsers) {
      if (u.pinHash && u.salt) {
        if (await verifyPin(value, u.pinHash, u.salt)) { valid = true; break; }
      } else if (u.pin !== undefined) {
        // Legacy plaintext fallback for unmigrated accounts
        if (u.pin === value) { valid = true; break; }
      }
    }
    if (valid) {
      onSuccess();
    } else {
      setShake(true);
      setError('Incorrect admin PIN');
      setTimeout(() => {
        setShake(false);
        setPin('');
        setError('');
        inputRef.current?.focus();
      }, 650);
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPin(v);
    setError('');
    if (v.length === 6) await verify(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && pin.length >= 4) void verify(pin);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.80)' }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className={`w-full max-w-xs rounded-2xl overflow-hidden transition-transform ${shake ? 'animate-shake' : ''}`}
        style={{
          background: 'linear-gradient(180deg,#1e1a2e 0%,#111827 100%)',
          border: '1px solid rgba(168,85,247,0.35)',
          boxShadow: '0 24px 64px -12px rgba(0,0,0,0.85), 0 0 0 1px rgba(168,85,247,0.10)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 pt-5 pb-4 flex items-start justify-between gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(168,85,247,0.18)' }}
            >
              <ShieldCheck size={16} style={{ color: '#c084fc' }} />
            </div>
            <div>
              <p
                className="text-[10px] font-black uppercase tracking-widest mb-0.5"
                style={{ color: 'rgba(192,132,252,0.85)' }}
              >
                Admin Required
              </p>
              <p className="text-sm font-bold text-white leading-snug">
                {prompt ?? 'Authorize this action'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors mt-0.5 flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.45)' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-3.5">
          <p className="text-xs" style={{ color: 'rgba(148,163,184,0.72)' }}>
            Enter any admin account's PIN to continue.
          </p>

          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="••••••"
            className="w-full rounded-xl px-4 py-3 text-center text-2xl font-black tracking-[0.5em] outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${error ? 'rgba(239,68,68,0.55)' : 'rgba(168,85,247,0.35)'}`,
              color: error ? 'rgba(252,165,165,0.9)' : '#e2e8f0',
            }}
          />

          {error && (
            <p
              className="text-[11px] text-center font-bold"
              style={{ color: 'rgba(252,165,165,0.85)' }}
            >
              {error}
            </p>
          )}

          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Minus, Plus, X, ShieldCheck } from 'lucide-react';
import type { OrderItem } from '@/types/pos';
import { fmt } from '@/utils/format';
import AdminPinGate from '@/components/ui/AdminPinGate';
import { useStaffStore } from '@/store/useStaffStore';

const VOID_REASONS = [
  'Customer Changed Mind',
  'Kitchen Out of Stock',
  'Wrong Item Punched',
  'Other',
] as const;

interface VoidItemModalProps {
  item: OrderItem;
  onConfirm: (qty: number, reason: string) => void;
  onClose: () => void;
}

const VoidItemModal = ({ item, onConfirm, onClose }: VoidItemModalProps) => {
  const currentUser = useStaffStore((s) => s.currentUser);
  const [qty, setQty]           = useState(1);
  const [reason, setReason]     = useState<string>('');
  const [otherText, setOtherText] = useState('');
  const [showAdminGate, setShowAdminGate] = useState(false);

  const canConfirm = !!reason && (reason !== 'Other' || otherText.trim().length > 0);
  const isAdmin    = currentUser?.role === 'ADMIN';

  const executeVoid = () => {
    const finalReason = reason === 'Other'
      ? `Other: ${otherText.trim() || 'No details'}`
      : reason;
    onConfirm(qty, finalReason);
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (isAdmin) {
      executeVoid();
    } else {
      setShowAdminGate(true);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
          style={{
            background: 'linear-gradient(180deg,#1a2540 0%,#111827 100%)',
            border: '1px solid rgba(239,68,68,0.28)',
            boxShadow: '0 24px 64px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(239,68,68,0.10)',
          }}
        >
          {/* Header */}
          <div
            className="px-5 pt-5 pb-4 flex items-start justify-between gap-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div>
              <p
                className="text-[11px] font-black uppercase tracking-widest mb-1"
                style={{ color: 'rgba(239,68,68,0.8)' }}
              >
                🚫 Void / Cancel Item
              </p>
              <p className="text-base font-extrabold text-white leading-tight">{item.name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(148,163,184,0.7)' }}>
                Rs. {fmt(item.price)} each · {item.quantity} ordered
              </p>
            </div>
            <button
              onClick={onClose}
              className="mt-0.5 p-1.5 rounded-lg transition-colors hover:bg-white/10 flex-shrink-0"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-5">
            {/* Quantity selector */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wide mb-2.5"
                style={{ color: 'rgba(148,163,184,0.7)' }}
              >
                How many to cancel?
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-all active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.28)', color: 'rgba(252,165,165,0.9)' }}
                >
                  <Minus size={14} />
                </button>
                <div className="flex-1 flex items-center justify-center gap-1">
                  <span className="text-2xl font-black tabular-nums text-white">{qty}</span>
                  <span className="text-sm font-semibold" style={{ color: 'rgba(148,163,184,0.55)' }}>
                    / {item.quantity}
                  </span>
                </div>
                <button
                  onClick={() => setQty((q) => Math.min(item.quantity, q + 1))}
                  disabled={qty >= item.quantity}
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-all active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.28)', color: 'rgba(252,165,165,0.9)' }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Reason selector */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-wide mb-2.5"
                style={{ color: 'rgba(148,163,184,0.7)' }}
              >
                Reason <span style={{ color: 'rgba(239,68,68,0.8)' }}>*</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {VOID_REASONS.map((r) => {
                  const active = reason === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className="px-3 py-2.5 rounded-xl text-xs font-bold text-left leading-snug transition-all active:scale-95"
                      style={
                        active
                          ? { background: 'rgba(239,68,68,0.22)', border: '1px solid rgba(239,68,68,0.5)', color: 'rgba(252,165,165,1)' }
                          : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(226,232,240,0.7)' }
                      }
                    >
                      {r}
                    </button>
                  );
                })}
              </div>

              {reason === 'Other' && (
                <textarea
                  autoFocus
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="Please describe the reason…"
                  rows={2}
                  className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    color: '#e2e8f0',
                  }}
                />
              )}
            </div>

            {/* Admin auth notice (non-admin users only) */}
            {!isAdmin && canConfirm && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(168,85,247,0.10)', border: '1px solid rgba(168,85,247,0.25)' }}
              >
                <ShieldCheck size={13} style={{ color: '#c084fc', flexShrink: 0 }} />
                <p className="text-[11px] font-semibold" style={{ color: 'rgba(192,132,252,0.85)' }}>
                  Admin PIN required to authorize this void
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-5 pb-5 pt-3 flex gap-2.5"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
          >
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="flex-1 py-3 rounded-xl text-sm font-black transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: canConfirm ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.3)',
                color: '#fff',
                boxShadow: canConfirm ? '0 4px 16px -4px rgba(239,68,68,0.55)' : 'none',
              }}
            >
              {isAdmin ? '' : '🔒 '}Void {qty} × {item.name.split(' ')[0]}
            </button>
          </div>
        </div>
      </div>

      {showAdminGate && (
        <AdminPinGate
          prompt={`Authorize void — ${qty} × ${item.name}`}
          onSuccess={() => { setShowAdminGate(false); executeVoid(); }}
          onCancel={() => setShowAdminGate(false)}
        />
      )}
    </>
  );
};

export default VoidItemModal;

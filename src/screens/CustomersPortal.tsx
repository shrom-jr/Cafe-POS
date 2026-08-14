import { useState, useMemo } from 'react';
import { useCustomerStore } from '@/store/useCustomerStore';
import { usePOSStore } from '@/store/usePOSStore';
import { useStaffStore } from '@/store/useStaffStore';
import { Customer, CustomerRepayment } from '@/types/pos';
import { fmt } from '@/utils/format';
import AppLayout from '@/components/ui/AppLayout';
import { UserCircle, Plus, X, BookOpen, Edit2, Trash2, DollarSign, AlertTriangle } from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────────

const formatDate = (ts: number | string) =>
  new Date(typeof ts === 'string' ? ts : ts).toLocaleString([], {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

// ── sub-components ─────────────────────────────────────────────────────────────

interface ModalProps { onClose: () => void; children: React.ReactNode; title: string }
const Modal = ({ onClose, children, title }: ModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl" style={{ background: 'rgba(15,23,42,0.98)' }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
        <p className="font-black text-white text-sm">{title}</p>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all">
          <X size={15} />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  </div>
);

// ── main component ─────────────────────────────────────────────────────────────

const CustomersPortal = () => {
  const {
    customers, repayments,
    addCustomer, updateCustomer, deleteCustomer, receiveRepayment,
  } = useCustomerStore();
  const orders = usePOSStore((s) => s.orders);
  const currentUser = useStaffStore((s) => s.currentUser);

  // ── stat cards ──────────────────────────────────────────────────────────────
  const totalActive = customers.length;
  const totalDues = customers.reduce((s, c) => s + c.currentDue, 0);
  const totalCollected = repayments.reduce((s, r) => s + r.amount, 0);

  // ── modal/drawer state ──────────────────────────────────────────────────────
  const [showRegister, setShowRegister]   = useState(false);
  const [registerName, setRegisterName]   = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerError, setRegisterError] = useState('');

  const [editTarget, setEditTarget]   = useState<Customer | null>(null);
  const [editName, setEditName]       = useState('');
  const [editPhone, setEditPhone]     = useState('');

  const [collectTarget, setCollectTarget]     = useState<Customer | null>(null);
  const [collectAmount, setCollectAmount]     = useState('');
  const [collectMethod, setCollectMethod]     = useState<'cash' | 'fonepay'>('cash');
  const [collectError, setCollectError]       = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [ledgerTarget, setLedgerTarget] = useState<Customer | null>(null);

  const enteredCollectAmount = Number(collectAmount);
  const collectAmountExceedsDue = !!collectTarget
    && collectAmount.trim() !== ''
    && Number.isFinite(enteredCollectAmount)
    && enteredCollectAmount > collectTarget.currentDue;
  const collectAmountValid = !!collectTarget
    && collectAmount.trim() !== ''
    && Number.isFinite(enteredCollectAmount)
    && enteredCollectAmount > 0
    && enteredCollectAmount <= collectTarget.currentDue;
  const visibleCollectError = collectAmountExceedsDue
    ? `Amount cannot exceed current due of Rs. ${fmt(collectTarget.currentDue)}`
    : collectError;

  // ── register helpers ────────────────────────────────────────────────────────
  const handleRegister = () => {
    if (!registerName.trim()) { setRegisterError('Name is required.'); return; }
    addCustomer({ name: registerName, phone: registerPhone });
    setRegisterName('');
    setRegisterPhone('');
    setRegisterError('');
    setShowRegister(false);
  };

  // ── edit helpers ────────────────────────────────────────────────────────────
  const openEdit = (c: Customer) => {
    setEditTarget(c);
    setEditName(c.name);
    setEditPhone(c.phone);
  };
  const handleEdit = () => {
    if (!editTarget || !editName.trim()) return;
    updateCustomer(editTarget.id, { name: editName, phone: editPhone });
    setEditTarget(null);
  };

  // ── collect helpers ─────────────────────────────────────────────────────────
  const openCollect = (c: Customer) => {
    setCollectTarget(c);
    setCollectAmount('');
    setCollectMethod('cash');
    setCollectError('');
  };
  const handleCollect = () => {
    if (!collectTarget) return;
    if (!collectAmountValid) {
      setCollectError(
        collectAmountExceedsDue
          ? `Amount cannot exceed current due of Rs. ${fmt(collectTarget.currentDue)}`
          : 'Enter a valid amount greater than zero.',
      );
      return;
    }
    const processedBy = currentUser
      ? { id: currentUser.id, name: currentUser.name ?? currentUser.email ?? '', role: currentUser.role }
      : undefined;
    const result = receiveRepayment({
      customerId: collectTarget.id,
      amount: Number(collectAmount),
      method: collectMethod,
      receivedBy: processedBy,
    });
    if (!result.ok) { setCollectError(result.error); return; }
    setCollectTarget(null);
  };

  // ── ledger data ─────────────────────────────────────────────────────────────
  const ledgerEntries = useMemo(() => {
    if (!ledgerTarget) return [];
    const custOrders = orders
      .filter((o) => o.attachedCustomer?.id === ledgerTarget.id && o.status === 'paid')
      .map((o) => ({
        kind: 'order' as const,
        at: o.createdAt,
        label: `Order — Table ${o.tableNumber}`,
        amount: o.items.reduce((s, i) => s + i.price * i.quantity, 0),
        detail: o.items.map((i) => `${i.name} ×${i.quantity}`).join(', '),
      }));
    const custRepayments = repayments
      .filter((r) => r.customerId === ledgerTarget.id)
      .map((r: CustomerRepayment) => ({
        kind: 'repayment' as const,
        at: r.createdAt,
        label: `Repayment (${r.method === 'cash' ? 'Cash' : 'QR / Fonepay'})`,
        amount: r.amount,
        detail: r.notes ?? '',
      }));
    return [...custOrders, ...custRepayments].sort((a, b) => b.at - a.at);
  }, [ledgerTarget, orders, repayments]);

  // ── input style helper ──────────────────────────────────────────────────────
  const inputClass = "w-full px-3.5 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10 placeholder:text-white/25 focus:outline-none focus:border-blue-500/50 transition-colors";

  return (
    <AppLayout title="Customers">
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 space-y-5">

          {/* ── Page header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black text-white">Customers</h1>
              <p className="text-xs text-slate-400 mt-0.5">Credit balances · repayments · ledger history</p>
            </div>
            <button
              onClick={() => setShowRegister(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 hover:brightness-110"
              style={{ background: 'linear-gradient(135deg,#1e50d0,#4186f5)', boxShadow: '0 4px 16px -4px rgba(59,130,246,0.45)' }}
            >
              <Plus size={15} />
              Register New Customer
            </button>
          </div>

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total Customers</p>
              <p className="mt-1 text-2xl font-black text-white">{totalActive}</p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Total Dues Outstanding</p>
              <p className="mt-1 text-2xl font-black text-red-400">Rs. {fmt(totalDues)}</p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Total Collected</p>
              <p className="mt-1 text-2xl font-black text-emerald-400">Rs. {fmt(totalCollected)}</p>
            </div>
          </div>

          {/* ── Customer table ── */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <UserCircle size={40} className="text-slate-600" />
                <p className="text-sm text-slate-500">No customers registered yet.</p>
                <button
                  onClick={() => setShowRegister(true)}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  + Register the first customer
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 border-b border-white/[0.06]">
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Current Due</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0"
                              style={{ background: 'rgba(59,130,246,0.18)', color: 'rgba(147,197,253,0.9)' }}
                            >
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-white">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{c.phone || '—'}</td>
                        <td className="px-4 py-3">
                          {c.currentDue > 0
                            ? <span className="font-black text-red-400">Rs. {fmt(c.currentDue)}</span>
                            : <span className="font-semibold text-emerald-400">✓ Clear</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openCollect(c)}
                              title="Collect Payment"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all active:scale-95"
                            >
                              <DollarSign size={12} />
                              Collect
                            </button>
                            <button
                              onClick={() => setLedgerTarget(c)}
                              title="View Ledger"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all active:scale-95"
                            >
                              <BookOpen size={12} />
                              Ledger
                            </button>
                            <button
                              onClick={() => openEdit(c)}
                              title="Edit Customer"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 bg-white/5 border border-white/10 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(c)}
                              title="Delete Customer"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 bg-white/5 border border-white/10 hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* ── Register modal ── */}
      {showRegister && (
        <Modal title="Register New Customer" onClose={() => { setShowRegister(false); setRegisterError(''); }}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Full Name *</label>
              <input
                className={inputClass}
                placeholder="e.g. Ram Shrestha"
                value={registerName}
                onChange={(e) => { setRegisterName(e.target.value); setRegisterError(''); }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Phone Number</label>
              <input
                className={inputClass}
                placeholder="e.g. 9800000000"
                value={registerPhone}
                onChange={(e) => setRegisterPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              />
            </div>
            {registerError && (
              <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} />{registerError}</p>
            )}
            <button
              onClick={handleRegister}
              className="w-full py-2.5 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:brightness-110"
              style={{ background: 'linear-gradient(135deg,#1e50d0,#4186f5)' }}
            >
              Register Customer
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit modal ── */}
      {editTarget && (
        <Modal title="Edit Customer" onClose={() => setEditTarget(null)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Full Name</label>
              <input
                className={inputClass}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Phone Number</label>
              <input
                className={inputClass}
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
              />
            </div>
            <button
              onClick={handleEdit}
              className="w-full py-2.5 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:brightness-110"
              style={{ background: 'linear-gradient(135deg,#1e50d0,#4186f5)' }}
            >
              Save Changes
            </button>
          </div>
        </Modal>
      )}

      {/* ── Collect Payment modal ── */}
      {collectTarget && (
        <Modal title={`Collect from ${collectTarget.name}`} onClose={() => setCollectTarget(null)}>
          <div className="space-y-3">
            {/* Balance display */}
            <div className="rounded-xl px-4 py-3 text-center" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <p className="text-xs text-slate-400">Current Outstanding</p>
              <p className="text-2xl font-black text-red-400 mt-0.5">Rs. {fmt(collectTarget.currentDue)}</p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="text-xs font-semibold text-slate-400">Amount Received (Rs.)</label>
                <button
                  type="button"
                  onClick={() => { setCollectAmount(String(collectTarget.currentDue)); setCollectError(''); }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-black text-amber-200 transition-all active:scale-95 hover:bg-amber-400/20"
                  style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)' }}
                >
                  ⚡ Pay Full: Rs. {fmt(collectTarget.currentDue)}
                </button>
              </div>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                className={inputClass}
                placeholder={`Max Rs. ${fmt(collectTarget.currentDue)}`}
                value={collectAmount}
                onChange={(e) => { setCollectAmount(e.target.value); setCollectError(''); }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCollect()}
              />
              {collectAmount.trim() !== '' && Number.isFinite(enteredCollectAmount) && enteredCollectAmount >= 0 && enteredCollectAmount < collectTarget.currentDue && (
                <p className="text-xs text-slate-400 mt-1.5">
                  Remaining balance after payment: <span className="font-bold text-white">Rs. {fmt(collectTarget.currentDue - enteredCollectAmount)}</span>
                </p>
              )}
              {collectAmount.trim() !== '' && Number.isFinite(enteredCollectAmount) && enteredCollectAmount === collectTarget.currentDue && (
                <p className="text-xs font-bold text-emerald-400 mt-1.5">Balance will be: ✓ Clear</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {(['cash', 'fonepay'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setCollectMethod(m)}
                    className="py-2 rounded-xl text-xs font-bold capitalize transition-all active:scale-95"
                    style={
                      collectMethod === m
                        ? { background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.5)', color: 'rgba(147,197,253,0.95)' }
                        : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }
                    }
                  >
                    {m === 'cash' ? '💵 Cash' : '📱 QR / Fonepay'}
                  </button>
                ))}
              </div>
            </div>
            {visibleCollectError && (
              <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} />{visibleCollectError}</p>
            )}
            <button
              onClick={handleCollect}
              disabled={!collectAmountValid}
              className="w-full py-2.5 rounded-xl font-black text-sm text-white transition-all active:scale-95 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)', boxShadow: '0 4px 14px -4px rgba(16,185,129,0.4)' }}
            >
              Confirm Collection
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <Modal title="Delete Customer?" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              This will permanently remove <span className="font-bold text-white">{deleteTarget.name}</span> and all their repayment history. This cannot be undone.
            </p>
            {deleteTarget.currentDue > 0 && (
              <div className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-300">This customer has an outstanding balance of Rs. {fmt(deleteTarget.currentDue)}.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={() => { deleteCustomer(deleteTarget.id); setDeleteTarget(null); }}
                className="flex-1 py-2.5 rounded-xl font-black text-sm text-white bg-red-500/80 border border-red-500/50 hover:bg-red-500 transition-all active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Ledger drawer ── */}
      {ledgerTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl flex flex-col"
            style={{ background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '80dvh' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 flex-shrink-0 border-b border-white/[0.07]">
              <div>
                <p className="font-black text-white text-sm flex items-center gap-2">
                  <BookOpen size={14} className="text-blue-400" />
                  {ledgerTarget.name}'s Ledger
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">{ledgerTarget.phone || 'No phone'}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Balance</p>
                  <p className={`text-sm font-black ${ledgerTarget.currentDue > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {ledgerTarget.currentDue > 0 ? `Rs. ${fmt(ledgerTarget.currentDue)}` : '✓ Clear'}
                  </p>
                </div>
                <button onClick={() => setLedgerTarget(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all">
                  <X size={15} />
                </button>
              </div>
            </div>
            {/* Entries */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
              {ledgerEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No history recorded yet.</p>
              ) : (
                ledgerEntries.map((e, i) => (
                  <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${e.kind === 'repayment' ? 'text-emerald-300' : 'text-blue-300'}`}>
                        {e.kind === 'repayment' ? '💰' : '🧾'} {e.label}
                      </span>
                      <span className={`text-xs font-black ${e.kind === 'repayment' ? 'text-emerald-400' : 'text-white'}`}>
                        {e.kind === 'repayment' ? '−' : '+'} Rs. {fmt(e.amount)}
                      </span>
                    </div>
                    {e.detail && (
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{e.detail}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-0.5">{formatDate(e.at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default CustomersPortal;

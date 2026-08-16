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

// ── Modal shell ────────────────────────────────────────────────────────────────

interface ModalProps { onClose: () => void; children: React.ReactNode; title: string }
const Modal = ({ onClose, children, title }: ModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
    <div className="w-full max-w-md p-6 rounded-3xl bg-[#12141D] border border-white/15 shadow-2xl shadow-black text-white relative">
      <div className="flex items-center justify-between mb-5">
        <p className="font-black text-white text-base">{title}</p>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <X size={15} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ── shared input class ─────────────────────────────────────────────────────────
const inputClass = "w-full bg-[#1A1D2A] border border-white/10 focus:border-amber-400 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-zinc-500 outline-none transition-all";

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

  return (
    <AppLayout title="Customers">
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 space-y-5">

          {/* ── Page header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-white dark:text-white tracking-tight">Customers & Ledger</h1>
              <p className="text-xs font-semibold text-slate-400 dark:text-zinc-400 mt-1">Credit balances · repayments · ledger history</p>
            </div>
            <button
              onClick={() => setShowRegister(true)}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 hover:-translate-y-0.5"
            >
              <Plus size={15} />
              Register New Customer
            </button>
          </div>

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#13151F] border border-white/10 p-5 rounded-2xl shadow-lg">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total Customers</p>
              <p className="text-2xl sm:text-3xl font-black text-white mt-1">{totalActive}</p>
            </div>
            <div className="bg-[#13151F] border border-rose-500/30 p-5 rounded-2xl shadow-lg shadow-rose-500/5">
              <p className="text-[11px] font-black uppercase tracking-wider text-rose-400">Total Dues Outstanding</p>
              <p className="text-2xl sm:text-3xl font-black text-rose-400 mt-1">Rs. {fmt(totalDues)}</p>
            </div>
            <div className="bg-[#13151F] border border-emerald-500/30 p-5 rounded-2xl shadow-lg shadow-emerald-500/5">
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-400">Total Collected</p>
              <p className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">Rs. {fmt(totalCollected)}</p>
            </div>
          </div>

          {/* ── Customer table ── */}
          <div className="bg-[#13151F] border border-white/10 rounded-2xl overflow-hidden shadow-xl mt-6">
            {customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <UserCircle size={40} className="text-slate-600" />
                <p className="text-sm text-slate-500">No customers registered yet.</p>
                <button
                  onClick={() => setShowRegister(true)}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  + Register the first customer
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/10">
                      <th className="text-[11px] font-black uppercase tracking-wider text-slate-400 py-3.5 px-6 text-left">Customer</th>
                      <th className="text-[11px] font-black uppercase tracking-wider text-slate-400 py-3.5 px-6 text-left">Phone</th>
                      <th className="text-[11px] font-black uppercase tracking-wider text-slate-400 py-3.5 px-6 text-left">Current Due</th>
                      <th className="text-[11px] font-black uppercase tracking-wider text-slate-400 py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-[#1E2235] border border-white/10 flex items-center justify-center text-xs font-black text-white shadow-inner flex-shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-black text-white tracking-wide">{c.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-xs font-bold text-slate-400">{c.phone || '—'}</span>
                        </td>
                        <td className="py-4 px-6">
                          {c.currentDue > 0
                            ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-black">Rs. {fmt(c.currentDue)}</span>
                            : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-black">✓ Clear</span>}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openCollect(c)}
                              title="Collect Payment"
                              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 border border-amber-500/40 text-amber-300 text-xs font-black transition-all flex items-center gap-1.5"
                            >
                              <DollarSign size={12} />
                              Collect
                            </button>
                            <button
                              onClick={() => setLedgerTarget(c)}
                              title="View Ledger"
                              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                              <BookOpen size={12} />
                              Ledger
                            </button>
                            <button
                              onClick={() => openEdit(c)}
                              title="Edit Customer"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(c)}
                              title="Delete Customer"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
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
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm transition-all shadow-lg shadow-amber-500/20"
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
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm transition-all shadow-lg shadow-amber-500/20"
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
            <div className="rounded-xl px-4 py-3 text-center bg-rose-500/8 border border-rose-500/20">
              <p className="text-xs text-slate-400">Current Outstanding</p>
              <p className="text-2xl font-black text-rose-400 mt-0.5">Rs. {fmt(collectTarget.currentDue)}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Amount Received (Rs.)</label>
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
              <button
                type="button"
                onClick={() => { setCollectAmount(String(collectTarget.currentDue)); setCollectError(''); }}
                className="w-full mt-2 px-3 py-3 rounded-lg text-xs font-semibold text-amber-300 transition-all active:scale-[0.98] hover:bg-amber-500/25 bg-amber-500/15 border border-amber-500/40"
              >
                ⚡ Pay Full Due: Rs. {fmt(collectTarget.currentDue)}
              </button>
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
                    type="button"
                    onClick={() => setCollectMethod(m)}
                    className={`py-2.5 rounded-xl text-xs capitalize transition-all active:scale-95 border ${
                      collectMethod === m
                        ? 'bg-amber-500/20 border-2 border-amber-400 text-amber-300 font-black'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white font-bold'
                    }`}
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
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="rounded-xl px-3 py-2 flex items-center gap-2 bg-rose-500/8 border border-rose-500/20">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col bg-[#12141D] border border-white/15 shadow-2xl shadow-black"
            style={{ maxHeight: '80dvh' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 flex-shrink-0 border-b border-white/10">
              <div>
                <p className="font-black text-white text-sm flex items-center gap-2">
                  <BookOpen size={14} className="text-amber-400" />
                  {ledgerTarget.name}'s Ledger
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">{ledgerTarget.phone || 'No phone'}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Balance</p>
                  <p className={`text-sm font-black ${ledgerTarget.currentDue > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {ledgerTarget.currentDue > 0 ? `Rs. ${fmt(ledgerTarget.currentDue)}` : '✓ Clear'}
                  </p>
                </div>
                <button
                  onClick={() => setLedgerTarget(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
                >
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
                  <div key={i} className="rounded-xl px-3 py-2.5 bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${e.kind === 'repayment' ? 'text-emerald-300' : 'text-amber-300'}`}>
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

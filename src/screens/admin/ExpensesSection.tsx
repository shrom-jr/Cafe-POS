import { useState } from 'react';
import { useMaintenanceStore } from '@/store/useMaintenanceStore';
import { useStaffStore } from '@/store/useStaffStore';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Wrench, Edit3, Trash2, Plus, Download } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfMonth } from 'date-fns';
import { fmt } from '@/utils/format';
import type { MaintenanceExpense, MaintenanceCategory, MaintenancePaymentMethod } from '@/types/pos';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  plumbing:          'Plumbing',
  electrical:        'Electrical',
  kitchen_equipment: 'Kitchen Equipment',
  cottage_structure: 'Cottage Structure',
  general:           'General Upkeep',
};

const PAYMENT_LABELS: Record<MaintenancePaymentMethod, string> = {
  cash:          'Cash',
  esewa:         'eSewa',
  khalti:        'Khalti',
  bank_transfer: 'Bank Transfer',
};

type Period = 'today' | 'yesterday' | 'last7' | 'month' | 'custom';
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 Days', month: 'This Month', custom: 'Custom',
};

const dateInputCls = 'px-4 py-2 rounded-xl bg-[#13151F] border border-white/15 text-white font-bold text-xs focus:outline-none focus:border-amber-400 [color-scheme:dark]';

const inputCls = 'w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 outline-none';

// ── Empty form helper ─────────────────────────────────────────────────────────

const emptyForm = () => ({
  title: '',
  category: 'general' as MaintenanceCategory,
  amount: '',
  paymentMethod: 'cash' as MaintenancePaymentMethod,
  date: format(new Date(), 'yyyy-MM-dd'),
});

// ── Component ─────────────────────────────────────────────────────────────────

export const ExpensesSection = () => {
  const expenses       = useMaintenanceStore((s) => s.expenses);
  const addExpense     = useMaintenanceStore((s) => s.addExpense);
  const updateExpense  = useMaintenanceStore((s) => s.updateExpense);
  const deleteExpense  = useMaintenanceStore((s) => s.deleteExpense);
  const currentUser    = useStaffStore((s) => s.currentUser);

  // ── Date filter ──
  const [period,      setPeriod]      = useState<Period>('month');
  const [customStart, setCustomStart] = useState(() => format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [customEnd,   setCustomEnd]   = useState(() => format(new Date(), 'yyyy-MM-dd'));

  // ── Modal state ──
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [form,        setForm]        = useState(emptyForm());
  const [deleteId,    setDeleteId]    = useState<string | null>(null);

  // ── Date range ──
  const now = new Date();
  const periodStart = (() => {
    switch (period) {
      case 'today':     return startOfDay(now);
      case 'yesterday': return startOfDay(subDays(now, 1));
      case 'last7':     return startOfDay(subDays(now, 6));
      case 'month':     return startOfMonth(now);
      case 'custom':    return startOfDay(new Date(customStart + 'T00:00:00'));
    }
  })();
  const periodEndTs = (() => {
    if (period === 'yesterday') return startOfDay(now).getTime();
    if (period === 'custom') {
      const end = new Date(customEnd + 'T00:00:00');
      end.setDate(end.getDate() + 1);
      return end.getTime();
    }
    return endOfDay(now).getTime();
  })();

  const filtered = expenses.filter((e) => {
    const ts = new Date(e.date + 'T00:00:00').getTime();
    return ts >= periodStart.getTime() && ts < periodEndTs;
  });

  const totalSpent = filtered.reduce((s, e) => s + e.amount, 0);

  // ── Modal helpers ──
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (exp: MaintenanceExpense) => {
    setEditingId(exp.id);
    setForm({
      title:         exp.title,
      category:      exp.category,
      amount:        String(exp.amount),
      paymentMethod: exp.paymentMethod,
      date:          exp.date,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    const trimTitle = form.title.trim();
    if (!trimTitle) { toast.error('Title is required'); return; }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }

    if (editingId) {
      updateExpense(editingId, {
        title:         trimTitle,
        category:      form.category,
        amount,
        paymentMethod: form.paymentMethod,
        date:          form.date,
      });
      toast.success('Expense updated');
    } else {
      const now = new Date();
      addExpense({
        id:            crypto.randomUUID(),
        title:         trimTitle,
        category:      form.category,
        amount,
        paymentMethod: form.paymentMethod,
        date:          form.date,
        loggedBy:      currentUser?.name || 'Admin',
        createdAt:     now.toISOString(),
      });
      toast.success('Expense logged');
    }
    setModalOpen(false);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteExpense(deleteId);
    setDeleteId(null);
    toast.success('Expense deleted');
  };

  const exportCSV = () => {
    const escapeCSV = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const headers = ['Date', 'Title', 'Category', 'Amount', 'Payment Method', 'Logged By'];
    const rows = filtered.map((expense) => [
      expense.date,
      expense.title,
      CATEGORY_LABELS[expense.category],
      expense.amount,
      PAYMENT_LABELS[expense.paymentMethod],
      expense.loggedBy,
    ]);
    const csv = [
      headers.map(escapeCSV).join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `maintenance-expenses-${period}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Expense CSV exported');
  };

  const changePeriod = (p: Period) => setPeriod(p);

  return (
    <div className="space-y-5">

      {/* ── Period filter toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 mt-6">
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => changePeriod(key)}
              className={`px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all ${
                period === key
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                  : 'bg-[#13151F] border border-white/15 text-zinc-200 hover:text-white hover:bg-white/10 font-bold'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 text-white font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-sm"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={openAdd}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center gap-2 hover:-translate-y-0.5"
          >
            <Plus size={14} /> Log Maintenance Expense
          </button>
        </div>
      </div>

      {/* ── Custom date range ── */}
      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06]">
          <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex-shrink-0">Date Range</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={customStart} max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)} className={dateInputCls} />
            <span className="text-xs font-bold text-zinc-300">to</span>
            <input type="date" value={customEnd} min={customStart}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setCustomEnd(e.target.value)} className={dateInputCls} />
          </div>
          <span className="text-xs font-bold text-zinc-300">
            {filtered.length} expense{filtered.length !== 1 ? 's' : ''} in range
          </span>
        </div>
      )}

      {/* ── Summary card ── */}
      <div className="mt-6 flex flex-col">
        <div className="p-6 rounded-2xl bg-[#181116] border-2 border-rose-500/40 shadow-xl shadow-rose-500/5 max-w-sm flex flex-col justify-between min-h-[130px]">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-400">
            <Wrench size={15} />
            <span>Total Maintenance Spent</span>
          </div>
          <p className="text-3xl font-black text-rose-400 tracking-tight mt-1.5 drop-shadow-[0_0_12px_rgba(244,63,94,0.3)]">Rs. {fmt(totalSpent)}</p>
        </div>
      </div>

      {/* ── Expenses table ── */}
      <div className="bg-[#13151F] border border-white/15 rounded-3xl overflow-hidden shadow-2xl shadow-black/50 mt-8">
        <h3 className="bg-white/[0.04] border-b border-white/10 text-base font-black text-white tracking-wide py-4 px-6">Maintenance Log</h3>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02] m-6">
            <Wrench size={36} className="text-amber-400 mb-2" />
            <p className="text-sm font-black text-white">No expenses this period</p>
            <p className="text-xs font-bold text-zinc-300 mt-1">Log a maintenance expense to see it here</p>
          </div>
        ) : (
          <>
            {/* Desktop header */}
            <div className="hidden sm:grid grid-cols-[90px_1fr_140px_100px_130px_100px_80px] gap-2 px-6 py-4 bg-white/[0.04] border-b border-white/10 text-xs font-black uppercase tracking-widest text-zinc-200 mb-1">
              <span>Date</span><span>Title</span><span>Category</span>
              <span className="text-right">Amount</span><span>Payment</span>
              <span>Logged By</span><span className="text-right">Actions</span>
            </div>
            <div className="space-y-0.5">
              {filtered.map((exp) => (
                <div key={exp.id}>
                  {/* Desktop row */}
                  <div className="hidden sm:grid grid-cols-[90px_1fr_140px_100px_130px_100px_80px] gap-2 px-6 py-4 border-b border-white/10 hover:bg-white/[0.03] transition-colors items-center">
                    <span className="text-sm font-bold font-mono text-zinc-200 tracking-wider">{exp.date}</span>
                    <span className="text-base font-black text-white tracking-wide truncate">{exp.title}</span>
                    <span className="inline-flex items-center px-3 py-1 rounded-lg bg-white/10 border border-white/20 text-zinc-200 text-xs font-black uppercase tracking-wider w-fit">
                      {CATEGORY_LABELS[exp.category]}
                    </span>
                    <span className="text-base font-black text-rose-400 font-mono tracking-tight text-right">Rs. {fmt(exp.amount)}</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold w-fit">
                      {PAYMENT_LABELS[exp.paymentMethod]}
                    </span>
                    <span className="text-sm font-bold text-zinc-200 tracking-wide truncate">{exp.loggedBy}</span>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => openEdit(exp)}
                        className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all">
                        <Edit3 size={13} />
                      </button>
                      <button onClick={() => setDeleteId(exp.id)}
                        className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {/* Mobile row */}
                  <div className="sm:hidden flex items-center gap-3 px-6 py-4 border-b border-white/10 hover:bg-white/[0.03] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-white tracking-wide truncate">{exp.title}</span>
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-white/10 border border-white/20 text-zinc-200 font-black uppercase tracking-wider flex-shrink-0">
                          {CATEGORY_LABELS[exp.category]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-bold font-mono text-zinc-200">{exp.date}</span>
                        <span className="text-xs font-bold text-zinc-200">{exp.loggedBy}</span>
                      </div>
                    </div>
                    <span className="text-base font-black text-rose-400 font-mono flex-shrink-0">Rs. {fmt(exp.amount)}</span>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => openEdit(exp)}
                        className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all">
                        <Edit3 size={13} />
                      </button>
                      <button onClick={() => setDeleteId(exp.id)}
                        className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/15 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Log / Edit modal ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md w-full p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white tracking-tight">{editingId ? 'Edit Expense' : 'Log Maintenance Expense'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1 block">Expense Title</label>
              <input
                type="text"
                placeholder="e.g. Plumbing leak repair"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1 block">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as MaintenanceCategory }))}>
                <SelectTrigger className="w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(CATEGORY_LABELS) as [MaintenanceCategory, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1 block">Amount (Rs.)</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1 block">Payment Method</label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v as MaintenancePaymentMethod }))}>
                <SelectTrigger className="w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PAYMENT_LABELS) as [MaintenancePaymentMethod, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-amber-400 mb-1 block">Date</label>
              <input
                type="date"
                value={form.date}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className={inputCls + ' [color-scheme:dark]'}
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => setModalOpen(false)}
              className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all">
              Cancel
            </button>
            <button onClick={handleSave}
              className="flex-1 w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all">
              {editingId ? 'Save Changes' : 'Log Expense'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the expense record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExpensesSection;

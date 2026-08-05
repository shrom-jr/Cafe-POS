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

const ACTIVE_STYLE = {
  background: 'rgba(59,130,246,0.16)',
  border: '1px solid rgba(59,130,246,0.28)',
  boxShadow: '0 0 18px -4px rgba(59,130,246,0.3)',
};

const dateInputCls = 'px-2.5 py-1.5 text-sm rounded-lg bg-white/[0.05] border border-white/[0.1] text-foreground focus:outline-none focus:border-blue-500/40 [color-scheme:dark]';

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm bg-white/[0.05] border border-white/[0.1] text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:border-blue-500/40';

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => changePeriod(key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === key
                  ? 'text-white'
                  : 'bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white/80'
              }`}
              style={period === key ? ACTIVE_STYLE : {}}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-white/[0.05] border border-white/[0.08] text-white/65 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            <Plus size={14} /> Log Maintenance Expense
          </button>
        </div>
      </div>

      {/* ── Custom date range ── */}
      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06]">
          <span className="text-xs font-semibold text-blue-400 flex-shrink-0">Date Range</span>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={customStart} max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)} className={dateInputCls} />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={customEnd} min={customStart}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setCustomEnd(e.target.value)} className={dateInputCls} />
          </div>
          <span className="text-xs text-muted-foreground">
            {filtered.length} expense{filtered.length !== 1 ? 's' : ''} in range
          </span>
        </div>
      )}

      {/* ── Summary card ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-red-500/25 bg-slate-900/60 backdrop-blur-md p-4">
          <div className="w-8 h-8 rounded-lg bg-red-500/[0.08] border border-red-500/25 flex items-center justify-center mb-3">
            <Wrench size={14} className="text-red-400" />
          </div>
          <p className="text-xl font-bold text-red-300 leading-tight">Rs. {fmt(totalSpent)}</p>
          <p className="text-xs font-bold text-slate-100 mt-0.5">Total Maintenance Spent</p>
          <p className="text-[10px] text-slate-300 mt-0.5">{filtered.length} expense{filtered.length !== 1 ? 's' : ''} this period</p>
        </div>
      </div>

      {/* ── Expenses table ── */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-5">
        <h3 className="font-semibold text-foreground mb-4">Maintenance Log</h3>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
              <Wrench size={20} className="text-slate-300 opacity-70" />
            </div>
            <p className="text-sm font-semibold text-slate-300">No expenses this period</p>
            <p className="text-xs text-slate-400 mt-0.5">Log a maintenance expense to see it here</p>
          </div>
        ) : (
          <>
            {/* Desktop header */}
            <div className="hidden sm:grid grid-cols-[90px_1fr_140px_100px_130px_100px_80px] gap-2 px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/[0.06] mb-1">
              <span>Date</span><span>Title</span><span>Category</span>
              <span className="text-right">Amount</span><span>Payment</span>
              <span>Logged By</span><span className="text-right">Actions</span>
            </div>
            <div className="space-y-0.5">
              {filtered.map((exp) => (
                <div key={exp.id}>
                  {/* Desktop row */}
                  <div className="hidden sm:grid grid-cols-[90px_1fr_140px_100px_130px_100px_80px] gap-2 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors items-center">
                    <span className="text-xs text-muted-foreground tabular-nums">{exp.date}</span>
                    <span className="text-sm font-medium text-foreground truncate">{exp.title}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 font-medium w-fit">
                      {CATEGORY_LABELS[exp.category]}
                    </span>
                    <span className="text-sm font-bold text-red-300 text-right">Rs. {fmt(exp.amount)}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 font-medium w-fit">
                      {PAYMENT_LABELS[exp.paymentMethod]}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{exp.loggedBy}</span>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(exp)}
                        className="p-1.5 rounded-lg hover:bg-white/[0.07] text-muted-foreground hover:text-blue-400 transition-colors">
                        <Edit3 size={13} />
                      </button>
                      <button onClick={() => setDeleteId(exp.id)}
                        className="p-1.5 rounded-lg hover:bg-white/[0.07] text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {/* Mobile row */}
                  <div className="sm:hidden flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{exp.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-slate-300 font-medium flex-shrink-0">
                          {CATEGORY_LABELS[exp.category]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{exp.date}</span>
                        <span className="text-[10px] text-muted-foreground">{exp.loggedBy}</span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-red-300 flex-shrink-0">Rs. {fmt(exp.amount)}</span>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => openEdit(exp)}
                        className="p-1.5 rounded-lg hover:bg-white/[0.07] text-muted-foreground hover:text-blue-400 transition-colors">
                        <Edit3 size={13} />
                      </button>
                      <button onClick={() => setDeleteId(exp.id)}
                        className="p-1.5 rounded-lg hover:bg-white/[0.07] text-muted-foreground hover:text-red-400 transition-colors">
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Expense' : 'Log Maintenance Expense'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Title / Description</label>
              <input
                type="text"
                placeholder="e.g. Plumbing leak repair"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as MaintenanceCategory }))}>
                <SelectTrigger className="bg-white/[0.05] border-white/[0.1]">
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
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Amount (Rs.)</label>
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
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Payment Method</label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v as MaintenancePaymentMethod }))}>
                <SelectTrigger className="bg-white/[0.05] border-white/[0.1]">
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
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className={inputCls + ' [color-scheme:dark]'}
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/[0.05] border border-white/[0.1] text-foreground hover:bg-white/[0.1] transition-colors">
              Cancel
            </button>
            <button onClick={handleSave}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors">
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

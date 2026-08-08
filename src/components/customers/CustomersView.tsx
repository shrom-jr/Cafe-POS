import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  BookOpen, CheckCircle2, CreditCard, Search, UserRound,
  WalletCards, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Customer } from '@/types/pos';
import { useCustomerStore } from '@/store/useCustomerStore';
import { usePOSStore } from '@/store/usePOSStore';
import { useStaffStore } from '@/store/useStaffStore';
import { fmt } from '@/utils/format';
import { getStaffName } from '@/utils/staffName';

type CustomersViewProps = {
  compact?: boolean;
};

const customerInitial = (customer: Customer) => customer.name.trim().charAt(0).toUpperCase() || '?';

const MetricCard = ({
  icon, label, value, tone = 'blue',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'blue' | 'amber' | 'emerald';
}) => {
  const tones = {
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  };
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center mb-3 ${tones[tone]}`}>{icon}</div>
      <p className={`text-xl font-black tabular-nums ${tone === 'amber' ? 'text-amber-300' : 'text-white'}`}>{value}</p>
      <p className="text-xs font-semibold text-slate-400 mt-1">{label}</p>
    </div>
  );
};

const RepaymentModal = ({ customerId, onClose }: { customerId: string; onClose: () => void }) => {
  const receiveRepayment = useCustomerStore((s) => s.receiveRepayment);
  // Resolved live from the store: another device may collect part of this balance
  // while the modal sits open, and the cashier must never act on a stale figure.
  const customer = useCustomerStore((s) => s.customers.find((c) => c.id === customerId));
  const currentUser = useStaffStore((s) => s.currentUser);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'fonepay'>('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [quotedDue, setQuotedDue] = useState(() => useCustomerStore.getState().getCustomer(customerId)?.currentDue ?? 0);
  const numericAmount = Number(amount);
  const currentDue = customer?.currentDue ?? 0;
  const dueChanged = customer !== undefined && quotedDue !== currentDue;

  useEffect(() => {
    if (!customer) onClose();
  }, [customer, onClose]);
  if (!customer) return null;

  const acknowledgeNewDue = () => {
    setQuotedDue(currentDue);
    if (numericAmount > currentDue) setAmount('');
  };

  const submit = () => {
    if (saving) return;
    if (dueChanged) {
      toast.error(`This balance changed to Rs. ${fmt(currentDue)}. Confirm the new amount before collecting.`);
      return;
    }
    setSaving(true);
    // Permission is re-checked against live staff state, not just the button that
    // opened this modal — it can be withdrawn while the modal sits open.
    const liveStaff = useStaffStore.getState().currentUser;
    if (liveStaff?.permissions.canSettleDues !== true) {
      setSaving(false);
      toast.error('You do not have permission to settle customer dues.');
      onClose();
      return;
    }
    const receivedBy = currentUser
      ? { id: currentUser.id, name: getStaffName(currentUser), role: currentUser.role }
      : undefined;
    const result = receiveRepayment({ customerId: customer.id, amount: numericAmount, method, notes, receivedBy });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Received Rs. ${fmt(result.repayment.amount)} from ${customer.name}.`);
    onClose();
  };

  return (
    <ModalShell title="Receive Payment" onClose={onClose}>
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5">
        <p className="font-bold text-white">{customer.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">{customer.phone || 'No phone number'}</p>
        <p className="text-sm font-bold text-amber-300 mt-3" data-testid="text-modal-current-due">
          Current Due: Rs. {fmt(currentDue)}
        </p>
      </div>
      {dueChanged && (
        <div className="mt-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3" data-testid="banner-due-changed">
          <p className="text-xs font-semibold text-amber-200">
            This balance changed to Rs. {fmt(currentDue)} — it was collected elsewhere while this was open.
            Confirm the new figure with the customer before taking any money.
          </p>
          <button
            type="button" onClick={acknowledgeNewDue} data-testid="button-acknowledge-due"
            className="mt-2 w-full rounded-lg bg-amber-500/20 py-2 text-xs font-black text-amber-200"
          >
            New amount confirmed with customer
          </button>
        </div>
      )}
      <label className="block text-xs font-semibold text-slate-300 mt-4 mb-1.5">Payment Amount</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Rs.</span>
        <input
          autoFocus inputMode="decimal" type="number" min="1" max={currentDue} step="0.01"
          value={amount} onChange={(event) => setAmount(event.target.value)}
          placeholder={`Up to ${fmt(currentDue)}`}
          className="w-full rounded-xl border border-slate-700 bg-slate-950/70 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-blue-500"
        />
      </div>
      <button
        type="button" onClick={() => setAmount(String(currentDue))}
        className="mt-2 text-xs font-semibold text-blue-300 hover:text-blue-200"
      >
        Use full amount · Rs. {fmt(currentDue)}
      </button>
      <label className="block text-xs font-semibold text-slate-300 mt-4 mb-1.5">Payment Method</label>
      <div className="grid grid-cols-2 gap-2">
        {([
          { id: 'cash', label: 'Cash' },
          { id: 'fonepay', label: 'Fonepay (QR)' },
        ] as const).map((option) => (
          <button
            key={option.id} type="button" onClick={() => setMethod(option.id)}
            className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
              method === option.id ? 'border-blue-400 bg-blue-500/15 text-blue-200' : 'border-slate-700 bg-slate-900 text-slate-400'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="block text-xs font-semibold text-slate-300 mt-4 mb-1.5">Notes / Reference <span className="text-slate-500">(optional)</span></label>
      <input
        value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Fonepay reference"
        className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-blue-500"
      />
      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-bold text-slate-300">Cancel</button>
        <button
          onClick={submit} data-testid="button-submit-repayment"
          disabled={saving || dueChanged || !Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > currentDue}
          className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirm Repayment
        </button>
      </div>
    </ModalShell>
  );
};

const ModalShell = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <>
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm" onClick={onClose} />
    <div className="fixed inset-x-3 top-[8%] z-[71] mx-auto w-auto max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl max-h-[84dvh] overflow-y-auto">
      <div className="flex items-center gap-3 pb-4 border-b border-white/10">
        <WalletCards size={18} className="text-blue-300" />
        <h2 className="flex-1 text-base font-black text-white">{title}</h2>
        <button onClick={onClose} className="rounded-lg bg-white/5 p-1.5 text-slate-400 hover:text-white"><X size={16} /></button>
      </div>
      {children}
    </div>
  </>
);

const LedgerModal = ({ customer, onClose }: { customer: Customer; onClose: () => void }) => {
  const repayments = useCustomerStore((s) => s.repayments);
  const payments = usePOSStore((s) => s.payments);
  const orders = usePOSStore((s) => s.orders);
  const entries = useMemo(() => {
    const khattaOrders = payments
      .filter((payment) => {
        if (payment.method !== 'khatta') return false;
        if (payment.customerId) return payment.customerId === customer.id;
        return orders.find((order) => order.id === payment.orderId)?.attachedCustomer?.id === customer.id;
      })
      .map((payment) => ({ id: payment.id, type: 'charge' as const, createdAt: payment.createdAt, amount: payment.total, label: `Bill #${payment.billNumber} · ${payment.tableNumber}` }));
    const customerRepayments = repayments
      .filter((payment) => payment.customerId === customer.id)
      .map((payment) => ({ id: payment.id, type: 'repayment' as const, createdAt: payment.createdAt, amount: payment.amount, label: `${payment.method === 'fonepay' ? 'Fonepay' : 'Cash'}${payment.notes ? ` · ${payment.notes}` : ''}` }));
    return [...khattaOrders, ...customerRepayments].sort((a, b) => b.createdAt - a.createdAt);
  }, [customer.id, orders, payments, repayments]);

  return (
    <ModalShell title={`${customer.name}'s Ledger`} onClose={onClose}>
      <div className="flex items-center justify-between py-4">
        <div><p className="text-xs text-slate-400">Current balance</p><p className="text-xl font-black text-amber-300">Rs. {fmt(customer.currentDue)}</p></div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${customer.currentDue > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{customer.currentDue > 0 ? 'Outstanding' : 'Clear'}</span>
      </div>
      <div className="space-y-2 border-t border-white/10 pt-3">
        {entries.length === 0 ? (
          <div className="py-9 text-center"><BookOpen size={22} className="mx-auto text-slate-600" /><p className="mt-2 text-sm text-slate-400">No recorded ledger activity yet.</p><p className="mt-1 text-xs text-slate-500">New Khatta orders and repayments will appear here.</p></div>
        ) : entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className={`rounded-lg p-2 ${entry.type === 'charge' ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
              {entry.type === 'charge' ? <CreditCard size={14} /> : <CheckCircle2 size={14} />}
            </div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{entry.type === 'charge' ? 'Khatta Order' : 'Repayment Received'}</p><p className="text-xs text-slate-500">{entry.label} · {format(entry.createdAt, 'dd MMM, h:mm a')}</p></div>
            <span className={`text-sm font-black ${entry.type === 'charge' ? 'text-amber-300' : 'text-emerald-300'}`}>{entry.type === 'charge' ? '+' : '−'} Rs. {fmt(entry.amount)}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
};

export const CustomersView = ({ compact = false }: CustomersViewProps) => {
  const customers = useCustomerStore((s) => s.customers);
  const repayments = useCustomerStore((s) => s.repayments);
  const currentUser = useStaffStore((s) => s.currentUser);
  const [query, setQuery] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [repaymentCustomer, setRepaymentCustomer] = useState<Customer | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const canSettle = currentUser?.permissions.canSettleDues === true;

  const totals = useMemo(() => ({
    outstanding: customers.reduce((sum, customer) => sum + customer.currentDue, 0),
    collected: repayments.reduce((sum, payment) => sum + payment.amount, 0),
  }), [customers, repayments]);
  const filteredCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return customers
      .filter((customer) => !needle || customer.name.toLowerCase().includes(needle) || customer.phone.includes(needle))
      .filter((customer) => !dueOnly || customer.currentDue > 0)
      .sort((a, b) => b.currentDue - a.currentDue || a.name.localeCompare(b.name));
  }, [customers, dueOnly, query]);

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard icon={<UserRound size={16} />} label="Total Customers" value={String(customers.length)} />
        <MetricCard icon={<WalletCards size={16} />} label="Total Outstanding Khatta" value={`Rs. ${fmt(totals.outstanding)}`} tone="amber" />
        <MetricCard icon={<CheckCircle2 size={16} />} label="Collected Dues" value={`Rs. ${fmt(totals.collected)}`} tone="emerald" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or phone…" className="w-full rounded-xl border border-slate-700 bg-slate-900 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500" /></div>
        <button onClick={() => setDueOnly(!dueOnly)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${dueOnly ? 'border-amber-400/50 bg-amber-500/15 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>{dueOnly ? '✓ Has Dues Only' : 'Has Dues Only'}</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/55">
        <div className="hidden lg:grid grid-cols-[1.3fr_1fr_.55fr_.75fr_.75fr_1.35fr] gap-3 border-b border-slate-800 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <span>Name</span><span>Phone Number</span><span>Visits</span><span>Lifetime Spend</span><span>Current Due</span><span>Actions</span>
        </div>
        <div className="divide-y divide-slate-800/80">
          {filteredCustomers.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">No customers match this search.</p> : filteredCustomers.map((customer) => (
            <div key={customer.id} className="grid gap-3 px-4 py-3.5 lg:grid-cols-[1.3fr_1fr_.55fr_.75fr_.75fr_1.35fr] lg:items-center">
              <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-sm font-black text-blue-200">{customerInitial(customer)}</span><span className="truncate text-sm font-bold text-white">{customer.name}</span></div>
              <span className="text-xs text-slate-400">{customer.phone || '—'}</span>
              <span className="text-sm text-slate-300"><span className="lg:hidden text-xs text-slate-500">Visits · </span>{customer.visits}</span>
              <span className="text-sm text-slate-300"><span className="lg:hidden text-xs text-slate-500">Lifetime · </span>Rs. {fmt(customer.totalSpend)}</span>
              <span className={`text-sm font-black ${customer.currentDue > 0 ? 'text-amber-300' : 'text-emerald-300'}`}><span className="lg:hidden text-xs text-slate-500">Due · </span>{customer.currentDue > 0 ? `Rs. ${fmt(customer.currentDue)}` : 'Clear'}</span>
              <div className="flex flex-wrap gap-2">
                {canSettle && customer.currentDue > 0 && <button onClick={() => setRepaymentCustomer(customer)} className="rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25">Receive Payment</button>}
                <button onClick={() => setLedgerCustomer(customer)} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-bold text-blue-300 hover:bg-blue-500/10">View Ledger</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {repaymentCustomer && <RepaymentModal customerId={repaymentCustomer.id} onClose={() => setRepaymentCustomer(null)} />}
      {ledgerCustomer && <LedgerModal customer={ledgerCustomer} onClose={() => setLedgerCustomer(null)} />}
    </div>
  );
};

export default CustomersView;
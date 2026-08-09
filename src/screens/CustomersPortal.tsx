import { useMemo, useState } from 'react';
import AppLayout from '@/components/ui/AppLayout';
import { useCustomerStore } from '@/store/useCustomerStore';
import { usePOSStore } from '@/store/usePOSStore';
import { fmt } from '@/utils/format';
import { format } from 'date-fns';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Banknote, Pencil, Trash2, BookOpen, Search } from 'lucide-react';

const cardStyle = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
} as const;

const inputCls =
  'w-full rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50';

const CustomersPortal = () => {
  const customers = useCustomerStore((s) => s.customers);
  const repayments = useCustomerStore((s) => s.repayments);
  const addCustomer = useCustomerStore((s) => s.addCustomer);
  const updateCustomer = useCustomerStore((s) => s.updateCustomer);
  const deleteCustomer = useCustomerStore((s) => s.deleteCustomer);
  const receiveRepayment = useCustomerStore((s) => s.receiveRepayment);
  const orders = usePOSStore((s) => s.orders);

  const [search, setSearch] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');

  // All row actions track only the customer ID so every render reads the
  // live record from the store — never a stale snapshot.
  const [collectId, setCollectId] = useState<string | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMethod, setCollectMethod] = useState<'cash' | 'fonepay'>('cash');

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(null);

  const totalDue = customers.reduce((sum, c) => sum + c.currentDue, 0);
  const totalCollected = repayments.reduce((sum, r) => sum + r.amount, 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [customers, search]);

  const collectCustomer = collectId ? customers.find((c) => c.id === collectId) : undefined;
  const deleteCustomerRec = deleteId ? customers.find((c) => c.id === deleteId) : undefined;
  const ledgerCustomer = ledgerId ? customers.find((c) => c.id === ledgerId) : undefined;

  const ledgerEntries = useMemo(() => {
    if (!ledgerCustomer) return [];
    const orderEntries = orders
      .filter((o) => o.attachedCustomer?.id === ledgerCustomer.id && o.status === 'paid')
      .map((o) => ({
        key: `order-${o.id}`,
        at: o.createdAt,
        label: `Order — Table ${o.tableNumber}`,
        detail: o.items.map((i) => `${i.name} ×${i.quantity}`).join(', '),
        amount: o.items.reduce((s, i) => s + i.price * i.quantity, 0),
        kind: 'order' as const,
      }));
    const repaymentEntries = repayments
      .filter((r) => r.customerId === ledgerCustomer.id)
      .map((r) => ({
        key: `repay-${r.id}`,
        at: r.createdAt,
        label: `Repayment (${r.method === 'cash' ? 'Cash' : 'QR / Fonepay'})`,
        detail: r.notes ?? '',
        amount: r.amount,
        kind: 'repayment' as const,
      }));
    return [...orderEntries, ...repaymentEntries].sort((a, b) => b.at - a.at);
  }, [ledgerCustomer, orders, repayments]);

  const handleRegister = () => {
    if (!regName.trim() || !regPhone.trim()) {
      toast.error('Name and phone number are both required.');
      return;
    }
    addCustomer({ name: regName, phone: regPhone });
    toast.success(`${regName.trim()} registered.`);
    setRegName('');
    setRegPhone('');
    setRegisterOpen(false);
  };

  const handleCollect = () => {
    if (!collectCustomer) return;
    const result = receiveRepayment({
      customerId: collectCustomer.id,
      amount: Number(collectAmount),
      method: collectMethod,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Rs. ${fmt(result.repayment.amount)} collected from ${collectCustomer.name}.`);
    setCollectId(null);
    setCollectAmount('');
  };

  const handleEditSave = () => {
    if (!editId) return;
    if (!editName.trim() || !editPhone.trim()) {
      toast.error('Name and phone number are both required.');
      return;
    }
    updateCustomer(editId, { name: editName.trim(), phone: editPhone.trim() });
    toast.success('Customer updated.');
    setEditId(null);
  };

  const handleDelete = () => {
    if (!deleteCustomerRec) return;
    deleteCustomer(deleteCustomerRec.id);
    toast.success(`${deleteCustomerRec.name} deleted.`);
    setDeleteId(null);
  };

  return (
    <AppLayout title="Customers">
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between border-b border-white/[0.06] pb-5">
            <div>
              <h1 className="text-xl font-semibold text-white">Customers</h1>
              <p className="mt-0.5 text-sm text-slate-300">
                Register customers, collect dues, and review ledgers during your shift.
              </p>
            </div>
            <button
              onClick={() => setRegisterOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 active:scale-95"
              data-testid="button-register-customer"
            >
              <Plus size={16} /> Register New Customer
            </button>
          </div>

          {/* Stat cards */}
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl p-4" style={cardStyle}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Active Customers</p>
              <p className="mt-1 text-2xl font-bold text-white" data-testid="stat-active-customers">{customers.length}</p>
            </div>
            <div className="rounded-2xl p-4" style={cardStyle}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Dues Outstanding</p>
              <p className="mt-1 text-2xl font-bold text-red-400" data-testid="stat-total-dues">Rs. {fmt(totalDue)}</p>
            </div>
            <div className="rounded-2xl p-4" style={cardStyle}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Collected Dues</p>
              <p className="mt-1 text-2xl font-bold text-emerald-400" data-testid="stat-total-collected">Rs. {fmt(totalCollected)}</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className={`${inputCls} pl-9`}
              data-testid="input-customer-search"
            />
          </div>

          {/* Customer table */}
          <div className="overflow-x-auto rounded-2xl" style={cardStyle}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone Number</th>
                  <th className="px-4 py-3 font-medium">Current Due</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      {customers.length === 0 ? 'No customers registered yet.' : 'No customers match your search.'}
                    </td>
                  </tr>
                )}
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-white/[0.04] last:border-0" data-testid={`row-customer-${c.id}`}>
                    <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                    <td className="px-4 py-3 text-slate-300">{c.phone}</td>
                    <td className="px-4 py-3">
                      {c.currentDue > 0 ? (
                        <span className="font-semibold text-red-400" data-testid={`text-due-${c.id}`}>Rs. {fmt(c.currentDue)}</span>
                      ) : (
                        <span className="font-semibold text-emerald-400" data-testid={`text-due-${c.id}`}>Clear</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => { setCollectId(c.id); setCollectAmount(''); setCollectMethod('cash'); }}
                          disabled={c.currentDue <= 0}
                          className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                          data-testid={`button-collect-${c.id}`}
                        >
                          <Banknote size={13} /> Collect Payment
                        </button>
                        <button
                          onClick={() => { setEditId(c.id); setEditName(c.name); setEditPhone(c.phone); }}
                          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition-all hover:bg-white/[0.1] active:scale-95"
                          data-testid={`button-edit-${c.id}`}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          onClick={() => setDeleteId(c.id)}
                          className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-300 transition-all hover:bg-red-500/20 active:scale-95"
                          data-testid={`button-delete-${c.id}`}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                        <button
                          onClick={() => setLedgerId(c.id)}
                          className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-xs font-semibold text-blue-300 transition-all hover:bg-blue-500/20 active:scale-95"
                          data-testid={`button-ledger-${c.id}`}
                        >
                          <BookOpen size={13} /> View Ledger
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Register modal */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Register New Customer</DialogTitle>
            <DialogDescription>Add a customer to the Khatta ledger.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Full name" className={inputCls} data-testid="input-register-name" />
            <input value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="Phone number" className={inputCls} data-testid="input-register-phone" />
          </div>
          <DialogFooter>
            <button onClick={() => setRegisterOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button>
            <button onClick={handleRegister} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white" data-testid="button-register-save">Register</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Collect payment modal — reads the live customer record on every render */}
      <Dialog open={!!collectId} onOpenChange={(open) => !open && setCollectId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Collect Payment</DialogTitle>
            <DialogDescription>
              {collectCustomer
                ? <>Current due for {collectCustomer.name}: <span className="font-semibold text-red-400">Rs. {fmt(collectCustomer.currentDue)}</span></>
                : 'This customer no longer exists.'}
            </DialogDescription>
          </DialogHeader>
          {collectCustomer && collectCustomer.currentDue > 0 ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['cash', 'fonepay'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setCollectMethod(m)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
                      collectMethod === m
                        ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                        : 'border-white/10 bg-white/[0.04] text-slate-400'
                    }`}
                    data-testid={`button-collect-method-${m}`}
                  >
                    {m === 'cash' ? '💵 Cash' : '📱 QR / Fonepay'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={collectCustomer.currentDue}
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  placeholder="Amount received"
                  className={inputCls}
                  data-testid="input-collect-amount"
                />
                <button
                  onClick={() => setCollectAmount(String(collectCustomer.currentDue))}
                  className="whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-300"
                  data-testid="button-collect-full"
                >
                  Full amount
                </button>
              </div>
            </div>
          ) : collectCustomer ? (
            <p className="text-sm text-emerald-400">This customer's balance is already clear.</p>
          ) : null}
          <DialogFooter>
            <button onClick={() => setCollectId(null)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button>
            <button
              onClick={handleCollect}
              disabled={!collectCustomer || collectCustomer.currentDue <= 0}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              data-testid="button-collect-confirm"
            >
              Record Payment
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>Update the customer's name and phone number.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name" className={inputCls} data-testid="input-edit-name" />
            <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone number" className={inputCls} data-testid="input-edit-phone" />
          </div>
          <DialogFooter>
            <button onClick={() => setEditId(null)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300">Cancel</button>
            <button onClick={handleEditSave} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white" data-testid="button-edit-save">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteCustomerRec?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the customer and their repayment history from this device and Firebase.
              {deleteCustomerRec && deleteCustomerRec.currentDue > 0 && (
                <span className="mt-1 block font-semibold text-red-400">
                  Warning: this customer still owes Rs. {fmt(deleteCustomerRec.currentDue)}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-500" data-testid="button-delete-confirm">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ledger drawer */}
      <Dialog open={!!ledgerId} onOpenChange={(open) => !open && setLedgerId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ledger — {ledgerCustomer?.name}</DialogTitle>
            <DialogDescription>Date-stamped order and repayment history.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {ledgerEntries.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No history recorded yet.</p>
            )}
            {ledgerEntries.map((entry) => (
              <div key={entry.key} className="rounded-xl p-3" style={cardStyle}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${entry.kind === 'repayment' ? 'text-emerald-300' : 'text-white'}`}>
                    {entry.label}
                  </span>
                  <span className={`text-sm font-bold ${entry.kind === 'repayment' ? 'text-emerald-400' : 'text-slate-200'}`}>
                    {entry.kind === 'repayment' ? '−' : '+'} Rs. {fmt(entry.amount)}
                  </span>
                </div>
                {entry.detail && <p className="mt-0.5 text-xs text-slate-400">{entry.detail}</p>}
                <p className="mt-0.5 text-[11px] text-slate-500">{format(new Date(entry.at), 'dd MMM yyyy, hh:mm a')}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default CustomersPortal;

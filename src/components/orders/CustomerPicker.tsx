import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, UserPlus, Phone, User } from 'lucide-react';
import { useCustomerStore } from '@/store/useCustomerStore';
import { Customer } from '@/types/pos';
import { fmt } from '@/utils/format';

interface CustomerPickerProps {
  onSelect: (customer: Customer) => void;
  onClose: () => void;
}

const CustomerPicker = ({ onSelect, onClose }: CustomerPickerProps) => {
  const { customers, addCustomer } = useCustomerStore();
  const [query, setQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return customers.slice().sort((a, b) => b.visits - a.visits);
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [customers, query]);

  const handleSaveNew = () => {
    if (!newName.trim()) return;
    setSaving(true);
    const created = addCustomer({ name: newName.trim(), phone: newPhone.trim() });
    onSelect(created);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0E1017] border border-white/20 rounded-[28px] p-6 shadow-2xl shadow-black relative flex flex-col gap-4 max-h-[85vh] mx-auto overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <User size={17} className="text-amber-400" />
          <span className="text-lg font-black text-white tracking-tight flex items-center gap-2 flex-1">Attach Customer</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full flex-shrink-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 pl-10 text-sm placeholder:text-zinc-400 outline-none transition-all shadow-inner"
          />
        </div>

        {/* Customer List */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 max-h-[360px] pr-1 overscroll-contain">
          {filtered.length === 0 && !showNewForm && (
            <p className="text-center py-8 text-xs text-zinc-400">
              No customers found matching "{query}"
            </p>
          )}

          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onSelect(c);
                onClose();
              }}
              className="w-full p-3.5 rounded-2xl bg-[#13151F] hover:bg-[#181B26] border border-white/10 hover:border-amber-400/60 shadow-sm flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] group text-left"
            >
              <div className="min-w-0">
                <p className="text-base font-black text-white group-hover:text-amber-200 transition-colors tracking-wide truncate">{c.name}</p>
                <p className="text-xs font-bold text-zinc-200 font-mono mt-0.5">
                  {c.phone || 'No phone'} · {c.visits} visit{c.visits !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Due / Clear Badge */}
              {c.currentDue > 0 ? (
                <span className="flex-shrink-0 px-3 py-1 rounded-xl bg-rose-500/20 border-2 border-rose-500 text-rose-200 text-xs font-black font-mono shadow-[0_0_10px_rgba(244,63,94,0.35)] whitespace-nowrap">
                  Due: Rs. {fmt(c.currentDue)}
                </span>
              ) : (
                <span className="flex-shrink-0 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-black uppercase whitespace-nowrap">
                  ✓ Clear
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Bottom Form Trigger / Add Form */}
        <div className="flex-shrink-0 mt-1">
          {!showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 mt-1"
            >
              <UserPlus size={14} />
              + Register New Customer
            </button>
          ) : (
            <div className="space-y-2.5 p-3 rounded-2xl bg-[#13151F] border border-white/10">
              <p className="text-[11px] font-black text-zinc-300 uppercase tracking-wider">
                New Customer Profile
              </p>
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Full name *"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-white text-xs placeholder:text-zinc-400 bg-[#181B26] border border-white/15 focus:outline-none focus:border-amber-400"
                  autoFocus
                />
              </div>
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl text-white text-xs placeholder:text-zinc-400 bg-[#181B26] border border-white/15 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowNewForm(false); setNewName(''); setNewPhone(''); }}
                  className="flex-1 py-1.5 rounded-xl text-xs font-black text-zinc-300 border border-white/15 hover:text-white hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNew}
                  disabled={!newName.trim() || saving}
                  className="flex-1 py-1.5 rounded-xl text-xs font-black text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 transition-all"
                >
                  Save & Attach
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerPicker;
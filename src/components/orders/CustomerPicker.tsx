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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Centered Modal Container (Max Width: 440px) */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{
          maxHeight: '80dvh',
          background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)',
          border: '1px solid rgba(59,130,246,0.3)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <User size={16} className="text-blue-400" />
          <span className="font-bold text-white text-sm flex-1">Attach Customer</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-3 flex-shrink-0 border-b border-slate-800/80">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name or phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(30,41,59,0.9)' }}
            />
          </div>
        </div>

        {/* Customer List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 && !showNewForm && (
            <p className="text-center py-8 text-xs text-slate-500">
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
              className="w-full flex items-center justify-between p-3 rounded-xl text-left transition-all hover:bg-slate-800/50 active:scale-[0.99] border border-slate-800/80"
              style={{ background: 'rgba(15,23,42,0.6)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm text-blue-300 border border-blue-500/30"
                  style={{ background: 'rgba(59,130,246,0.15)' }}
                >
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">{c.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {c.phone || 'No phone'} · {c.visits} visit{c.visits !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Due / Clear Badge */}
              {c.currentDue > 0 ? (
                <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Due Rs. {fmt(c.currentDue)}
                </span>
              ) : (
                <span className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Clear
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Bottom Form Trigger / Add Form */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-slate-800/80 bg-slate-950/40">
          {!showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20"
            >
              <UserPlus size={14} />
              + Register New Customer
            </button>
          ) : (
            <div className="space-y-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                New Customer Profile
              </p>
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Full name *"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-white text-xs placeholder:text-slate-500 bg-slate-900 border border-slate-700 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-white text-xs placeholder:text-slate-500 bg-slate-900 border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowNewForm(false); setNewName(''); setNewPhone(''); }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium text-slate-400 border border-slate-700 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNew}
                  disabled={!newName.trim() || saving}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition-all"
                >
                  Save & Attach
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CustomerPicker;
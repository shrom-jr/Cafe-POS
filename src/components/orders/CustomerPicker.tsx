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
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-x-3 top-[10%] z-50 flex flex-col rounded-2xl overflow-hidden"
        style={{
          maxHeight: '78dvh',
          background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)',
          border: '1px solid rgba(59,130,246,0.28)',
          boxShadow: '0 24px 64px -8px rgba(0,0,0,0.85)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <User size={15} style={{ color: 'rgba(147,197,253,0.75)' }} />
          <span className="font-bold text-white text-sm flex-1">Attach Customer</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.07)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.35)' }} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name or phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none"
              style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(30,41,59,0.9)' }}
            />
          </div>
        </div>

        {/* Customer list */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 && !showNewForm && (
            <p className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.28)' }}>
              No customers found
            </p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98] hover:brightness-110"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm"
                style={{ background: 'rgba(59,130,246,0.18)', color: 'rgba(147,197,253,0.9)' }}
              >
                {c.name.charAt(0).toUpperCase()}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{c.name}</p>
                <p className="text-xs" style={{ color: 'rgba(148,163,184,0.65)' }}>
                  {c.phone || 'No phone'} · {c.visits} visit{c.visits !== 1 ? 's' : ''}
                </p>
              </div>
              {/* Due badge */}
              {c.currentDue > 0 ? (
                <span
                  className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(251,191,36,0.12)', color: 'hsl(32 90% 68%)', border: '1px solid rgba(251,191,36,0.25)' }}
                >
                  Due Rs. {fmt(c.currentDue)}
                </span>
              ) : (
                <span
                  className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(52,211,153,0.10)', color: 'rgba(52,211,153,0.75)', border: '1px solid rgba(52,211,153,0.2)' }}
                >
                  Clear
                </span>
              )}
            </button>
          ))}
        </div>

        {/* New customer form / trigger */}
        <div
          className="flex-shrink-0 px-4 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          {!showNewForm ? (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
              style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: 'rgba(147,197,253,0.9)' }}
            >
              <UserPlus size={14} />
              + New Customer
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold text-white/60 uppercase tracking-wider">New Customer</p>
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <input
                  type="text"
                  placeholder="Full name *"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none"
                  style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(30,41,59,0.9)' }}
                  autoFocus
                />
              </div>
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none"
                  style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(30,41,59,0.9)' }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowNewForm(false); setNewName(''); setNewPhone(''); }}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNew}
                  disabled={!newName.trim() || saving}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)', color: '#fff' }}
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

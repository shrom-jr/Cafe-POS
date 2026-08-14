import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { usePOSStore } from '@/store/usePOSStore';
import { useStaffStore } from '@/store/useStaffStore';
import { Customer, Order, OrderItem } from '@/types/pos';
import { fmt } from '@/utils/format';
import { tableDisplayName } from '@/utils/tableName';
import { SEND_DELAY, SUCCESS_DURATION, FLASH_DURATION, NOW_TICK_INTERVAL } from '@/utils/kitchenTimings';
import { Minus, Plus, Trash2, ShoppingBag, Users, ArrowRightLeft, UserCircle, X as XIcon, Lock } from 'lucide-react';
import CustomerPicker from './CustomerPicker';
import VoidItemModal from './VoidItemModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface OrderPanelProps {
  order: Order | null;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onRemove: (menuItemId: string) => void;
  onPay: () => void;
  onSendToKitchen: () => void;
  onClear?: () => void;
  onMoveTable?: () => void;
  moveDisabled?: boolean;
  pax?: number;
  onPaxChange?: (pax: number) => void;
  /** When false, "Proceed to Payment" is hidden (WAITER role). */
  canPay?: boolean;
  /** Name of the staff member who took the order, for display. */
  serverName?: string;
  /** Currently attached customer for Khatta tracking. */
  attachedCustomer?: Customer | null;
  /** Called when the cashier attaches or detaches a customer. */
  onAttachCustomer?: (customer: Customer | null) => void;
}

const BLUE_BTN = { background: 'rgba(59,130,246,0.16)', border: '1px solid rgba(59,130,246,0.30)' };

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const formatRelativeTime = (ts: number, now: number): string => {
  const diffMin = Math.floor((now - ts) / 60000);
  if (diffMin < 1) return 'Sent just now';
  if (diffMin < 5) return `Sent ${diffMin} min ago`;
  return `Sent at ${formatTime(ts)}`;
};

/** True when the item has already been sent to the kitchen. */
const isSentToKitchen = (item: OrderItem) =>
  item.kitchenStatus === 'sent' || item.sentToKitchen === true;

const OrderPanel = ({
  order,
  onUpdateQty,
  onRemove,
  onPay,
  onSendToKitchen,
  onClear,
  onMoveTable,
  moveDisabled = false,
  pax = 1,
  onPaxChange,
  canPay = true,
  serverName,
  attachedCustomer,
  onAttachCustomer,
}: OrderPanelProps) => {
  const { tableId } = useParams<{ tableId: string }>();
  const table = usePOSStore((s) => s.tables.find((candidate) => candidate.id === tableId));
  const attachCustomerToTable = usePOSStore((s) => s.attachCustomerToTable);
  const voidOrderItem = usePOSStore((s) => s.voidOrderItem);
  const currentUser = useStaffStore((s) => s.currentUser);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [voidTarget, setVoidTarget] = useState<OrderItem | null>(null);
  const [sendPhase, setSendPhase] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sentAt, setSentAt] = useState<number | null>(
    order?.kitchenStatus === 'placed' ? Date.now() : null
  );
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());

  const sendTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = (fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    sendTimers.current.push(id);
    return id;
  };

  useEffect(() => {
    return () => {
      sendTimers.current.forEach(clearTimeout);
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const items = order?.items || [];
  const unpaidItems = items.filter((i) => i.status !== 'paid');
  const total = unpaidItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  // Per-item kitchen state (backwards-compatible)
  const draftItems = unpaidItems.filter((i) => !isSentToKitchen(i));
  const hasDraft = draftItems.length > 0;
  const draftUnitCount = draftItems.reduce((s, i) => s + i.quantity, 0);
  const allSent = unpaidItems.length > 0 && !hasDraft;

  // Grouping: show sent items above, draft items below (when both exist)
  const hasGrouping = unpaidItems.some(isSentToKitchen) && hasDraft;
  const sentDisplayItems = hasGrouping ? unpaidItems.filter(isSentToKitchen) : items;
  const draftDisplayItems = hasGrouping ? draftItems : [];

  // ── Button state ─────────────────────────────────────────────────────────
  const isEmpty = items.length === 0;

  let buttonLabel: string;
  let ariaLabel: string;
  let btnBackground: string;
  let btnShadow: string;

  if (isEmpty) {
    buttonLabel = 'Add items to order';
    ariaLabel = 'Add items to place an order';
    btnBackground = 'rgba(59,130,246,0.12)';
    btnShadow = 'none';
  } else if (hasDraft) {
    if (sendPhase === 'sending') {
      buttonLabel = 'Sending…';
      ariaLabel = 'Sending to kitchen, please wait';
    } else if (sendPhase === 'sent') {
      buttonLabel = 'Sent ✓';
      ariaLabel = 'Items sent to kitchen';
    } else {
      buttonLabel = `Send ${draftUnitCount} item${draftUnitCount !== 1 ? 's' : ''} to Kitchen`;
      ariaLabel = buttonLabel;
    }
    btnBackground = 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)';
    btnShadow =
      sendPhase === 'sent'
        ? '0 4px 20px -4px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.12)'
        : '0 4px 20px -4px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.12)';
    if (sendPhase === 'sent') btnBackground = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
  } else {
    // allSent — show Proceed to Payment
    buttonLabel = 'Proceed to Payment →';
    ariaLabel = 'Proceed to payment';
    btnBackground = 'linear-gradient(135deg, #1d4ed8 0%, #60a5fa 60%, #3b82f6 100%)';
    btnShadow = '0 6px 28px -4px rgba(59,130,246,0.75), inset 0 1px 0 rgba(255,255,255,0.18)';
  }

  const isBtnDisabled = isEmpty || sendPhase === 'sending';
  const btnPy = '16px';

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = () => {
    if (sendPhase !== 'idle') return;

    const unsentSnapshot = draftItems.map((i) => i.id);
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    if (unsentSnapshot.length > 0) {
      setFlashingIds(new Set(unsentSnapshot));
      flashTimer.current = setTimeout(() => {
        setFlashingIds(new Set());
        flashTimer.current = null;
      }, FLASH_DURATION);
    }

    setSendPhase('sending');
    const ts = Date.now();
    setSentAt(ts);
    setNow(ts);
    onSendToKitchen();

    schedule(() => setSendPhase('sent'), SEND_DELAY);
    schedule(() => setSendPhase('idle'), SEND_DELAY + SUCCESS_DURATION);
  };

  const handlePrimary = () => {
    if (sendPhase !== 'idle') return;
    if (allSent) {
      onPay();
    } else if (hasDraft) {
      handleSend();
    }
  };

  const handleClearConfirmed = () => {
    onClear?.();
    setShowClearConfirm(false);
  };

  const handleCustomerChange = (customer: Customer | null) => {
    if (order) {
      onAttachCustomer?.(customer);
      return;
    }
    if (customer && tableId && table) {
      attachCustomerToTable(tableId, table.number, customer);
    }
  };

  /** Called by OrderItemRow when staff taps -/trash on a SENT item. */
  const handleVoidRequest = (item: OrderItem) => {
    setVoidTarget(item);
  };

  const handleVoidConfirm = (qty: number, reason: string) => {
    if (!voidTarget || !order) return;
    const cancelledBy = currentUser
      ? `${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`.trim() || currentUser.username || 'Staff'
      : 'Staff';
    voidOrderItem(order.id, voidTarget.id, qty, reason, cancelledBy);
    setVoidTarget(null);
  };

  const kitchenStatus: 'draft' | 'placed' =
    order?.kitchenStatus === 'placed' ? 'placed' : 'draft';

  const statusLabel = hasDraft ? 'DRAFT' : allSent ? 'SENT' : 'DRAFT';
  const statusColor = hasDraft
    ? { background: 'rgba(148,163,184,0.14)', color: 'rgba(226,232,240,0.85)', border: '1px solid rgba(148,163,184,0.25)' }
    : { background: 'rgba(52,211,153,0.14)', color: 'rgba(52,211,153,0.9)', border: '1px solid rgba(52,211,153,0.28)' };

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-hidden relative"
      style={{ background: 'linear-gradient(180deg, #141e30 0%, #0c1522 100%)' }}
    >
      <style>{`
        @keyframes op-fade-in-scale {
          from { opacity: 0; transform: scale(0.82); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes op-item-flash {
          0%   { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
          35%  { box-shadow: 0 0 0 6px rgba(251,191,36,0.28); }
          100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
        }
        @keyframes op-btn-pulse {
          0%   { opacity: 1; }
          50%  { opacity: 0.65; }
          100% { opacity: 1; }
        }
      `}</style>

      <div className="absolute inset-x-0 top-0 h-px pointer-events-none" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <div className="absolute inset-x-0 top-0 h-16 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)' }} />

      {/* Header */}
      <div
        className="relative flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
          <h3 className="font-extrabold text-base text-white flex-1 truncate">
            {order ? tableDisplayName(order.tableNumber) : 'Order'}
          </h3>
          {order && (
            <span
              key={statusLabel}
              className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full flex-shrink-0"
              style={{ ...statusColor, animation: 'op-fade-in-scale 0.22s ease' }}
            >
              {statusLabel}
            </span>
          )}
          {itemCount > 0 && (
            <>
              {onMoveTable && (
                <button
                  onClick={onMoveTable}
                  disabled={moveDisabled}
                  data-testid="button-move-table"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                  style={{ color: 'rgba(147,197,253,0.8)', ...BLUE_BTN }}
                >
                  <ArrowRightLeft size={11} />
                  Move
                </button>
              )}
              {onClear && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  data-testid="button-clear-order"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
                  style={{ color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  <Trash2 size={11} />
                  Clear
                </button>
              )}
            </>
          )}
        </div>
        <div className="px-4 pb-2.5">
          <span className="text-xs font-medium" style={{ color: 'rgba(148,163,184,0.72)' }}>
            {serverName ? `Served by ${serverName}` : 'No server assigned'}
            {itemCount > 0 ? ` · ${itemCount} item${itemCount !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
      </div>

      {/* Pax selector */}
      <div
        className="px-4 py-2.5 flex items-center gap-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Users size={14} className="text-white/40 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-300 flex-1">Guests (Pax)</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPaxChange?.(Math.max(1, pax - 1))}
            disabled={pax <= 1}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 transition-all active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed hover:text-white hover:brightness-110"
            style={BLUE_BTN}
          >
            <Minus size={12} />
          </button>
          <span className="w-6 text-center font-black text-sm tabular-nums text-white">{pax}</span>
          <button
            onClick={() => onPaxChange?.(pax + 1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 transition-all active:scale-90 hover:text-white hover:brightness-110"
            style={BLUE_BTN}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Customer (Khatta) Row */}
      <div
        className="px-4 py-2.5 flex items-center justify-between gap-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <UserCircle size={15} className="text-blue-400 flex-shrink-0" />
          <span className="text-xs font-bold text-slate-300">Customer</span>
        </div>

        {attachedCustomer ? (
          <div className="flex items-center gap-1.5 max-w-[70%] bg-blue-950/50 border border-blue-500/35 px-2.5 py-1 rounded-xl">
            <span className="text-xs font-bold text-white truncate">
              👤 {attachedCustomer.name}
            </span>
            {attachedCustomer.currentDue > 0 && (
              <span className="text-[11px] font-extrabold text-amber-400 flex-shrink-0">
                (Due Rs. {fmt(attachedCustomer.currentDue)})
              </span>
            )}
            <button
              onClick={() => handleCustomerChange(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all flex-shrink-0"
              title="Detach customer"
            >
              <XIcon size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustomerPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all active:scale-95 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/35 text-blue-300"
          >
            <UserCircle size={13} />
            + Attach Customer
          </button>
        )}
      </div>

      {/* Customer picker overlay */}
      {showCustomerPicker && (
        <CustomerPicker
          onSelect={(c) => { handleCustomerChange(c); setShowCustomerPicker(false); }}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}

      {/* Item list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12" style={{ color: 'rgba(255,255,255,0.22)' }}>
            <ShoppingBag size={38} className="mb-3 opacity-25" />
            <p className="text-base font-bold text-center">No items yet</p>
            <p className="text-xs opacity-60 mt-1.5 text-center">Tap items on the left to add</p>
          </div>
        ) : hasGrouping ? (
          <>
            {/* Already-sent items */}
            {sentDisplayItems.map((item) => (
              <OrderItemRow
                key={item.id}
                item={item}
                onUpdateQty={onUpdateQty}
                onRemove={onRemove}
                onVoidRequest={handleVoidRequest}
                isPaid={item.status === 'paid'}
                isSent={true}
                isFlashing={false}
              />
            ))}
            {/* Draft items below the sent group */}
            {draftDisplayItems.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-1 pb-0.5">
                  <div className="flex-1 h-px" style={{ background: 'rgba(251,191,36,0.18)' }} />
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(251,191,36,0.55)' }}>
                    New items — not yet sent
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(251,191,36,0.18)' }} />
                </div>
                {draftDisplayItems.map((item) => (
                  <OrderItemRow
                    key={item.id}
                    item={item}
                    onUpdateQty={onUpdateQty}
                    onRemove={onRemove}
                    onVoidRequest={handleVoidRequest}
                    isPaid={false}
                    isSent={false}
                    isFlashing={flashingIds.has(item.id)}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          items.map((item) => (
            <OrderItemRow
              key={item.id}
              item={item}
              onUpdateQty={onUpdateQty}
              onRemove={onRemove}
              onVoidRequest={handleVoidRequest}
              isPaid={item.status === 'paid'}
              isSent={isSentToKitchen(item)}
              isFlashing={flashingIds.has(item.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 pt-3 pb-4 space-y-2.5 flex-shrink-0 relative"
        style={{ background: 'linear-gradient(180deg, #0f1a2e 0%, #0c1522 100%)' }}
      >
        <div
          className="absolute inset-x-0 pointer-events-none"
          style={{ top: '-48px', height: '48px', background: 'linear-gradient(to bottom, transparent, #0c1522)' }}
        />
        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(148,163,184,0.65)' }}>Total</span>
            {kitchenStatus === 'placed' && sentAt && (
              <span
                key={Math.floor((now - sentAt) / 60000)}
                className="text-[10px] font-medium"
                style={{ color: 'rgba(52,211,153,0.65)', animation: 'op-fade-in-scale 0.2s ease' }}
              >
                {formatRelativeTime(sentAt, now)}
              </span>
            )}
          </div>
          <span
            className="text-3xl font-black"
            style={{ color: items.length > 0 ? '#ffffff' : 'rgba(255,255,255,0.25)' }}
          >
            Rs. {fmt(total)}
          </span>
        </div>

        {hasDraft && items.length > 0 && (
          <p className="text-[10px] text-center font-semibold" style={{ color: 'rgba(251,191,36,0.6)' }}>
            ⚠ Send to kitchen before payment
          </p>
        )}

        <button
          onClick={handlePrimary}
          disabled={isBtnDisabled}
          aria-disabled={isBtnDisabled}
          aria-label={ariaLabel}
          data-testid="button-proceed-to-bill"
          className="w-full rounded-xl font-black text-lg flex items-center justify-center gap-2 active:scale-[0.97] disabled:opacity-20 disabled:cursor-not-allowed"
          style={{
            paddingTop: btnPy,
            paddingBottom: btnPy,
            background: btnBackground,
            color: items.length > 0 ? '#ffffff' : 'rgba(255,255,255,0.3)',
            boxShadow: btnShadow,
            transition: 'background 0.35s ease, box-shadow 0.35s ease',
            animation: sendPhase === 'sending' ? 'op-btn-pulse 0.7s ease' : undefined,
          }}
        >
          {buttonLabel}
        </button>
      </div>

      {/* Clear confirmation */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all items?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all items from the order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void / Cancel item modal */}
      {voidTarget && (
        <VoidItemModal
          item={voidTarget}
          onConfirm={handleVoidConfirm}
          onClose={() => setVoidTarget(null)}
        />
      )}
    </div>
  );
};

// ─── OrderItemRow ─────────────────────────────────────────────────────────────

interface OrderItemRowProps {
  item: OrderItem;
  onUpdateQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onVoidRequest: (item: OrderItem) => void;
  isPaid?: boolean;
  /** Whether this item has already been sent to the kitchen */
  isSent?: boolean;
  isFlashing?: boolean;
}

const OrderItemRow = ({
  item,
  onUpdateQty,
  onRemove,
  onVoidRequest,
  isPaid = false,
  isSent = false,
  isFlashing = false,
}: OrderItemRowProps) => {
  const isDraft = !isSent && !isPaid;

  const rowBg = isPaid
    ? 'rgba(255,255,255,0.02)'
    : isSent
    ? 'rgba(15,23,42,0.75)'
    : 'rgba(251,191,36,0.06)';

  const rowBorder = isPaid
    ? '1px solid rgba(255,255,255,0.04)'
    : isSent
    ? '1px solid rgba(30,41,59,0.85)'
    : '1px solid rgba(251,191,36,0.22)';

  const handleMinus = () => {
    if (isPaid) return;
    if (isSent) {
      onVoidRequest(item);
    } else {
      onUpdateQty(item.id, -1);
    }
  };

  const handleTrash = () => {
    if (isPaid) return;
    if (isSent) {
      onVoidRequest(item);
    } else {
      onRemove(item.id);
    }
  };

  return (
    <div
      className="flex items-center gap-2 rounded-xl p-2.5"
      data-testid={`order-item-${item.menuItemId}`}
      style={{
        background: rowBg,
        border: rowBorder,
        opacity: isPaid ? 0.5 : 1,
        transition: 'background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
        animation: isFlashing ? 'op-item-flash 0.65s ease' : undefined,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p
            className={`flex-1 min-w-0 text-sm font-bold break-words ${isPaid ? 'line-through' : ''}`}
            style={{ color: isPaid ? 'rgba(255,255,255,0.55)' : '#ffffff' }}
          >
            {item.name}
          </p>
          {isPaid && (
            <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(52,211,153,0.12)', color: 'rgba(52,211,153,0.7)' }}>
              Paid
            </span>
          )}
          {isSent && !isPaid && (
            <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(59,130,246,0.14)', color: 'rgba(147,197,253,0.85)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <Lock size={8} />
              Sent
            </span>
          )}
          {isDraft && (
            <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(251,191,36,0.15)', color: 'rgba(251,191,36,0.9)' }}>
              Draft
            </span>
          )}
        </div>
        <p className="text-xs font-medium mt-0.5" style={{ color: 'rgba(148,163,184,0.72)' }}>
          Rs. {fmt(item.price)} each
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Decrease / void */}
        <button
          onClick={handleMinus}
          disabled={isPaid}
          aria-label={isSent ? `Void ${item.name}` : `Decrease ${item.name} quantity`}
          data-testid={`button-decrease-${item.menuItemId}`}
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-base transition-colors active:scale-90 disabled:pointer-events-none disabled:opacity-30"
          style={
            isSent && !isPaid
              ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: 'rgba(252,165,165,0.8)' }
              : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.70)' }
          }
        >
          <Minus size={13} />
        </button>

        <span className="w-7 text-center font-black text-sm text-white tabular-nums"
          aria-label={`${item.quantity} of ${item.name}`}>
          {item.quantity}
        </span>

        {/* Increase — only for draft items */}
        <button
          onClick={() => isDraft && onUpdateQty(item.id, 1)}
          disabled={isPaid || isSent}
          aria-label={`Increase ${item.name} quantity`}
          data-testid={`button-increase-${item.menuItemId}`}
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-base transition-colors active:scale-90 hover:text-blue-300 hover:brightness-110 disabled:pointer-events-none disabled:opacity-30"
          style={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.35)', color: 'rgba(147,197,253,0.9)' }}
        >
          <Plus size={13} />
        </button>
      </div>

      <p className="w-16 text-right text-sm font-bold flex-shrink-0"
        style={{ color: isPaid ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.90)' }}>
        Rs. {fmt(item.price * item.quantity)}
      </p>

      {/* Trash / void button */}
      {!isPaid && (
        <button
          onClick={handleTrash}
          aria-label={isSent ? `Void ${item.name}` : `Remove ${item.name}`}
          data-testid={`button-remove-${item.menuItemId}`}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors active:scale-90 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
          style={
            isSent
              ? { color: 'rgba(252,165,165,0.6)', background: 'rgba(239,68,68,0.08)' }
              : { color: 'rgba(255,255,255,0.38)', background: 'rgba(255,255,255,0.04)' }
          }
        >
          <Trash2 size={13} />
        </button>
      )}
      {isPaid && <div className="w-8 h-8 flex-shrink-0" />}
    </div>
  );
};

export default OrderPanel;

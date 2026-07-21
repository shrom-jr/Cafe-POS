import { useState, useEffect, useRef } from 'react';
import { Order, OrderItem } from '@/types/pos';
import { fmt } from '@/utils/format';
import { SEND_DELAY, SUCCESS_DURATION, FLASH_DURATION, NOW_TICK_INTERVAL } from '@/utils/kitchenTimings';
import { Minus, Plus, Trash2, ShoppingBag, Users, ArrowRightLeft } from 'lucide-react';
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
}

const BLUE_BTN = { background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.24)' };

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const formatRelativeTime = (ts: number, now: number): string => {
  const diffMin = Math.floor((now - ts) / 60000);
  if (diffMin < 1) return 'Sent just now';
  if (diffMin < 5) return `Sent ${diffMin} min ago`;
  return `Sent at ${formatTime(ts)}`;
};

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
}: OrderPanelProps) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [sendPhase, setSendPhase] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [sentAt, setSentAt] = useState<number | null>(
    order?.kitchenStatus === 'placed' ? Date.now() : null
  );
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());

  // Refs for timer cleanup — prevents state updates on unmounted component
  const sendTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = (fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    sendTimers.current.push(id);
    return id;
  };

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      sendTimers.current.forEach(clearTimeout);
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    };
  }, []);

  // Now ticker — relative time display
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Derive safe kitchen state — fallback to draft on unexpected values
  const rawStatus = order?.kitchenStatus;
  const kitchenStatus: 'draft' | 'placed' = rawStatus === 'placed' ? 'placed' : 'draft';
  const hasUnsentItems = kitchenStatus === 'placed' ? (order?.hasUnsentItems ?? false) : false;

  const items = order?.items || [];
  const unpaidItems = items.filter((i) => i.status !== 'paid');
  const total = unpaidItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  // canPay=false (WAITER role) means the "Proceed to Payment" state is never reached
  const isProceedState = canPay && kitchenStatus === 'placed' && !hasUnsentItems;
  const isUpdateState = kitchenStatus === 'placed' && hasUnsentItems;

  const statusLabel = kitchenStatus === 'draft' ? 'Draft' : hasUnsentItems ? 'Updated' : 'Sent';
  const statusColor =
    kitchenStatus === 'draft'
      ? { background: 'rgba(148,163,184,0.12)', color: 'rgba(148,163,184,0.7)', border: '1px solid rgba(148,163,184,0.2)' }
      : hasUnsentItems
      ? { background: 'rgba(251,191,36,0.12)', color: 'rgba(251,191,36,0.8)', border: '1px solid rgba(251,191,36,0.25)' }
      : { background: 'rgba(52,211,153,0.12)', color: 'rgba(52,211,153,0.8)', border: '1px solid rgba(52,211,153,0.25)' };

  const primaryLabel =
    kitchenStatus === 'draft' ? 'Send to Kitchen'
    : isUpdateState ? 'Send Update'
    : 'Proceed to Payment →';

  const buttonLabel =
    sendPhase === 'sending' ? 'Sending...'
    : sendPhase === 'sent' ? 'Sent ✓'
    : items.length > 0 ? primaryLabel : 'Add items to order';

  const ariaLabel =
    sendPhase === 'sending' ? 'Sending to kitchen, please wait'
    : sendPhase === 'sent' ? 'Order sent to kitchen'
    : primaryLabel;

  const btnBackground = (() => {
    if (items.length === 0) return 'rgba(59,130,246,0.12)';
    if (sendPhase === 'sent') return 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
    if (isProceedState) return 'linear-gradient(135deg, #1d4ed8 0%, #60a5fa 60%, #3b82f6 100%)';
    if (isUpdateState) return 'linear-gradient(135deg, #1a3d9e 0%, #2d5dbf 100%)';
    return 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)';
  })();

  const btnShadow = (() => {
    if (items.length === 0) return 'none';
    if (sendPhase === 'sent') return '0 4px 20px -4px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.12)';
    if (isProceedState) return '0 6px 28px -4px rgba(59,130,246,0.75), inset 0 1px 0 rgba(255,255,255,0.18)';
    if (isUpdateState) return '0 4px 12px -4px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.08)';
    return '0 4px 20px -4px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.12)';
  })();

  const btnPy = isUpdateState && sendPhase === 'idle' ? '14px' : '16px';
  const isBtnDisabled = items.length === 0 || sendPhase === 'sending';

  const handleSend = () => {
    if (sendPhase !== 'idle') return; // race condition guard

    // Snapshot unsent IDs at click time — stable for flash
    const unsentSnapshot = items
      .filter((i) => !i.sentToKitchen && i.status !== 'paid')
      .map((i) => i.id);

    // Flash the unsent items — cancel any prior flash first
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
    if (isProceedState) {
      onPay();
    } else {
      handleSend();
    }
  };

  const handleClearConfirmed = () => {
    onClear?.();
    setShowClearConfirm(false);
  };

  // Grouping — derived from sentToKitchen flag on each item
  const hasGrouping = kitchenStatus === 'placed' && hasUnsentItems;
  const sentDisplayItems = hasGrouping
    ? items.filter((i) => i.sentToKitchen)
    : items;
  const unsentDisplayItems = hasGrouping
    ? items.filter((i) => !i.sentToKitchen && i.status !== 'paid')
    : [];

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

      {/* Top inner highlight */}
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <div className="absolute inset-x-0 top-0 h-16 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)' }} />

      {/* Header */}
      <div
        className="relative px-4 py-3 flex items-center gap-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
      >
        <ShoppingBag size={16} style={{ color: 'rgba(59,130,246,0.65)' }} />
        <h3 className="font-bold text-sm flex-1 text-white/80">
          {order ? `Table ${order.tableNumber}` : 'Order'}
        </h3>
        {order && (
          <span
            key={statusLabel}
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ ...statusColor, animation: 'op-fade-in-scale 0.22s ease' }}
          >
            {statusLabel}
          </span>
        )}
        {itemCount > 0 && (
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(59,130,246,0.16)', color: 'rgba(147,197,253,0.88)', border: '1px solid rgba(59,130,246,0.28)' }}
            >
              {itemCount} items
            </span>
            {onMoveTable && (
              <button
                onClick={moveDisabled ? undefined : onMoveTable}
                disabled={moveDisabled}
                data-testid="button-move-table"
                title={moveDisabled ? 'No available tables' : 'Move order to another table'}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={moveDisabled
                  ? { color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }
                  : { color: 'rgba(147,197,253,0.82)', border: '1px solid rgba(59,130,246,0.22)', background: 'rgba(59,130,246,0.09)' }
                }
              >
                <ArrowRightLeft size={11} />
                {moveDisabled ? 'No tables' : 'Move'}
              </button>
            )}
            {onClear && (
              <button
                onClick={() => setShowClearConfirm(true)}
                data-testid="button-clear-order"
                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white/35 transition-all active:scale-95 hover:text-red-400 hover:bg-red-500/10"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pax selector */}
      <div
        className="px-4 py-2.5 flex items-center gap-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Users size={14} className="text-white/28 flex-shrink-0" />
        <span className="text-xs font-semibold text-white/32 flex-1">Guests (Pax)</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPaxChange?.(Math.max(1, pax - 1))}
            disabled={pax <= 1}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/55 transition-all active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed hover:text-white hover:brightness-110"
            style={BLUE_BTN}
          >
            <Minus size={12} />
          </button>
          <span className="w-6 text-center font-black text-sm tabular-nums text-white/82">{pax}</span>
          <button
            onClick={() => onPaxChange?.(pax + 1)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/55 transition-all active:scale-90 hover:text-white hover:brightness-110"
            style={BLUE_BTN}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Item list — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12" style={{ color: 'rgba(255,255,255,0.22)' }}>
            <ShoppingBag size={38} className="mb-3 opacity-25" />
            <p className="text-base font-bold text-center">No items yet</p>
            <p className="text-xs opacity-60 mt-1.5 text-center">Tap items on the left to add</p>
          </div>
        ) : hasGrouping ? (
          <>
            {sentDisplayItems.map((item) => (
              <OrderItemRow
                key={item.id}
                item={item}
                onUpdateQty={onUpdateQty}
                onRemove={onRemove}
                isPaid={item.status === 'paid'}
                isUnsent={false}
                isFlashing={false}
              />
            ))}
            {unsentDisplayItems.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-1 pb-0.5">
                  <div className="flex-1 h-px" style={{ background: 'rgba(251,191,36,0.18)' }} />
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(251,191,36,0.55)' }}>
                    New items
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(251,191,36,0.18)' }} />
                </div>
                {unsentDisplayItems.map((item) => (
                  <OrderItemRow
                    key={item.id}
                    item={item}
                    onUpdateQty={onUpdateQty}
                    onRemove={onRemove}
                    isPaid={false}
                    isUnsent={true}
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
              isPaid={item.status === 'paid'}
              isUnsent={false}
              isFlashing={false}
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
            <span className="text-xs font-semibold uppercase tracking-wider text-white/30">Total</span>
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
            style={{ color: items.length > 0 ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.25)' }}
          >
            Rs. {fmt(total)}
          </span>
        </div>

        {/* Safety hint */}
        {kitchenStatus === 'draft' && items.length > 0 && (
          <p className="text-[10px] text-center font-medium" style={{ color: 'rgba(251,191,36,0.5)' }}>
            Send to kitchen before payment
          </p>
        )}

        {/* Primary action */}
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
            transition: 'background 0.35s ease, box-shadow 0.35s ease, padding 0.2s ease',
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
    </div>
  );
};

interface OrderItemRowProps {
  item: OrderItem;
  onUpdateQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  isPaid?: boolean;
  isUnsent?: boolean;
  isFlashing?: boolean;
}

const OrderItemRow = ({ item, onUpdateQty, onRemove, isPaid = false, isUnsent = false, isFlashing = false }: OrderItemRowProps) => (
  <div
    className="flex items-center gap-2 rounded-xl p-2.5"
    data-testid={`order-item-${item.menuItemId}`}
    style={{
      background: isPaid
        ? 'rgba(255,255,255,0.02)'
        : isUnsent
        ? 'rgba(251,191,36,0.05)'
        : 'rgba(255,255,255,0.05)',
      border: isPaid
        ? '1px solid rgba(255,255,255,0.04)'
        : isUnsent
        ? '1px solid rgba(251,191,36,0.2)'
        : '1px solid rgba(255,255,255,0.06)',
      opacity: isPaid ? 0.5 : 1,
      transition: 'background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
      animation: isFlashing ? 'op-item-flash 0.65s ease' : undefined,
    }}
  >
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <p
          className={`text-sm font-bold truncate ${isPaid ? 'line-through' : ''}`}
          style={{ color: isPaid ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.95)' }}
        >
          {item.name}
        </p>
        {isPaid && (
          <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.12)', color: 'rgba(52,211,153,0.7)' }}>
            Paid
          </span>
        )}
        {isUnsent && (
          <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: 'rgba(251,191,36,0.9)' }}>
            New
          </span>
        )}
      </div>
      <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.42)' }}>Rs. {fmt(item.price)} each</p>
    </div>
    <div className="flex items-center gap-1">
      <button
        onClick={() => !isPaid && onUpdateQty(item.id, -1)}
        disabled={isPaid}
        aria-label={`Decrease ${item.name} quantity`}
        data-testid={`button-decrease-${item.menuItemId}`}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 transition-colors active:scale-90 hover:text-red-400 hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-30"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        <Minus size={13} />
      </button>
      <span className="w-7 text-center font-black text-sm text-white/85" aria-label={`${item.quantity} of ${item.name}`}>{item.quantity}</span>
      <button
        onClick={() => !isPaid && onUpdateQty(item.id, 1)}
        disabled={isPaid}
        aria-label={`Increase ${item.name} quantity`}
        data-testid={`button-increase-${item.menuItemId}`}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/45 transition-colors active:scale-90 hover:text-blue-300 hover:brightness-110 disabled:pointer-events-none disabled:opacity-30"
        style={{ background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.24)' }}
      >
        <Plus size={13} />
      </button>
    </div>
    <p className="w-16 text-right text-sm font-bold" style={{ color: isPaid ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.88)' }}>
      Rs. {fmt(item.price * item.quantity)}
    </p>
    {!isPaid && (
      <button
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.name}`}
        data-testid={`button-remove-${item.menuItemId}`}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/22 transition-colors active:scale-90 hover:text-red-400 hover:bg-red-500/10"
      >
        <Trash2 size={13} />
      </button>
    )}
    {isPaid && <div className="w-7 h-7 flex-shrink-0" />}
  </div>
);

export default OrderPanel;

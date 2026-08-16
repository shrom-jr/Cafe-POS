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

const BLUE_BTN = { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.20)' };

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
    btnBackground = 'rgba(245,158,11,0.12)';
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
    btnBackground = '#f59e0b';
    btnShadow =
      sendPhase === 'sent'
        ? '0 4px 20px -4px rgba(16,185,129,0.55), inset 0 1px 0 rgba(255,255,255,0.12)'
        : '0 4px 20px -4px rgba(245,158,11,0.55), inset 0 1px 0 rgba(255,255,255,0.12)';
    if (sendPhase === 'sent') btnBackground = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
  } else {
    // allSent — show Proceed to Payment
    buttonLabel = 'Proceed to Payment →';
    ariaLabel = 'Proceed to payment';
    btnBackground = '#f59e0b';
    btnShadow = '0 6px 28px -4px rgba(245,158,11,0.75), inset 0 1px 0 rgba(255,255,255,0.18)';
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
    ? { background: 'rgba(245,158,11,0.20)', color: 'rgb(253,186,116)', border: '1px solid rgba(245,158,11,0.40)' }
    : { background: 'rgba(16,185,129,0.20)', color: 'rgb(110,231,183)', border: '1px solid rgba(16,185,129,0.40)' };

  return (
    <div
      className="w-full h-full min-h-0 rounded-3xl bg-[#13151F] border border-white/15 shadow-2xl flex flex-col justify-between overflow-hidden relative p-4 gap-3"
      style={{ background: '#13151F' }}
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

      {/* Consolidated metadata HUD */}
      <div className="p-4 rounded-2xl bg-[#13151F] border border-white/15 shadow-xl flex flex-col gap-2.5 flex-shrink-0">
        {/* Table and actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-xl font-black text-white tracking-tight truncate">
              {order ? tableDisplayName(order.tableNumber) : 'Order'}
            </h3>
            {order && (
              <span
                key={statusLabel}
                className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase tracking-wider flex-shrink-0"
                style={{ ...statusColor, animation: 'op-fade-in-scale 0.22s ease' }}
              >
                {statusLabel}
              </span>
            )}
          </div>
          {itemCount > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {onMoveTable && (
                <button
                  onClick={onMoveTable}
                  disabled={moveDisabled}
                  data-testid="button-move-table"
                  className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 font-black text-xs uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowRightLeft size={11} />
                  Move
                </button>
              )}
              {onClear && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  data-testid="button-clear-order"
                  className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-black text-xs uppercase tracking-wider flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                >
                  <Trash2 size={11} />
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Customer name and outstanding due */}
        <div className="pt-2 border-t border-white/10">
          {attachedCustomer ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#181B26] border border-white/10 shadow-inner">
              <span className="text-sm font-black text-amber-300 flex items-center gap-1.5 whitespace-nowrap">
                👤 {attachedCustomer.name}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {attachedCustomer.currentDue > 0 && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/30 border-2 border-rose-500 text-rose-200 text-xs font-black font-mono shadow-[0_0_10px_rgba(244,63,94,0.4)] whitespace-nowrap">
                    DUE: Rs. {fmt(attachedCustomer.currentDue)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleCustomerChange(null)}
                  className="p-1 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                  title="Detach customer"
                >
                  <XIcon size={12} />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomerPicker(true)}
              className="w-full py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm"
            >
              + Attach Customer
            </button>
          )}
        </div>

        {/* Server metadata and pax */}
        <div className="flex items-center justify-between text-xs font-bold text-zinc-200 pt-1">
          <span>{serverName ? `Served by ${serverName}` : 'No server assigned'} • {itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1.5 bg-[#181B26] border border-white/15 px-2.5 py-1 rounded-xl flex-shrink-0">
            <span className="text-[10px] font-black uppercase text-amber-400 mr-1">Pax</span>
            <button
              type="button"
              onClick={() => onPaxChange?.(Math.max(1, pax - 1))}
              disabled={pax <= 1}
              className="w-5 h-5 rounded-md bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed"
            >
              -
            </button>
            <span className="text-xs font-black text-white font-mono w-3 text-center">{pax || 1}</span>
            <button
              type="button"
              onClick={() => onPaxChange?.(pax + 1)}
              className="w-5 h-5 rounded-md bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Customer picker overlay */}
      {showCustomerPicker && (
        <CustomerPicker
          onSelect={(c) => { handleCustomerChange(c); setShowCustomerPicker(false); }}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}

      {/* Item list */}
      <div className="flex-1 min-h-0 overflow-y-auto py-3 space-y-2.5 pr-1">
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
        className="p-4 rounded-2xl bg-[#13151F] border border-white/15 flex flex-col gap-2.5 shadow-2xl flex-shrink-0 mt-auto"
      >
        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-black uppercase tracking-widest text-zinc-300">Total</span>
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
            className="text-3xl font-black text-white font-mono tracking-tight"
          >
            Rs. {fmt(total)}
          </span>
        </div>

        {hasDraft && items.length > 0 && (
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-400 text-center">
            ⚠️ Send to kitchen before payment
          </p>
        )}
        {allSent && items.length > 0 && (
          <p className="text-[11px] font-black uppercase tracking-wider text-emerald-400 text-center">
            ✓ Order active &amp; sent to kitchen
          </p>
        )}

        <button
          onClick={handlePrimary}
          disabled={isBtnDisabled}
          aria-disabled={isBtnDisabled}
          aria-label={ariaLabel}
          data-testid="button-proceed-to-bill"
          className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-xl shadow-amber-500/30 transition-all active:scale-[0.98] disabled:opacity-20 disabled:cursor-not-allowed"
          style={{
            background: btnBackground,
            color: sendPhase === 'sent' ? '#ffffff' : '#0f172a',
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

  const rowBg = '#181B26';

  const rowBorder = '1px solid rgba(255,255,255,0.15)';

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
      className="p-3.5 rounded-2xl bg-[#13151F] border border-white/15 shadow-md flex flex-col gap-2"
      data-testid={`order-item-${item.menuItemId}`}
      style={{
        background: rowBg,
        border: rowBorder,
        opacity: isPaid ? 0.5 : 1,
        transition: 'background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
        animation: isFlashing ? 'op-item-flash 0.65s ease' : undefined,
      }}
    >
      <div className="w-full flex items-start justify-between gap-3">
        <p
          className={`text-sm font-black text-white tracking-wide leading-snug min-w-0 ${isPaid ? 'line-through opacity-60' : ''}`}
          style={{ color: isPaid ? 'rgba(255,255,255,0.55)' : '#ffffff', wordBreak: 'break-word' }}
        >
          {item.name}
        </p>
        <p className={`text-sm font-black text-amber-400 font-mono whitespace-nowrap ${isPaid ? 'opacity-50' : ''}`}>
          Rs. {fmt(item.price * item.quantity)}
        </p>
      </div>
      <div className="w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-xs font-bold text-zinc-300 font-mono">
            Rs. {fmt(item.price)} each
          </span>
          {isPaid && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase tracking-wider font-mono">
              Paid
            </span>
          )}
          {isSent && !isPaid && (
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase tracking-wider font-mono">
              <Lock size={8} />
              Sent
            </span>
          )}
          {isDraft && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase tracking-wider font-mono">
              Draft
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
        {/* Decrease / void */}
        <button
          onClick={handleMinus}
          disabled={isPaid}
          aria-label={isSent ? `Void ${item.name}` : `Decrease ${item.name} quantity`}
          data-testid={`button-decrease-${item.menuItemId}`}
          className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 active:scale-90 border border-white/20 text-white font-black flex items-center justify-center transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-30"
          style={
            isSent && !isPaid
              ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: 'rgba(252,165,165,0.8)' }
              : { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.70)' }
          }
        >
          <Minus size={13} />
        </button>

        <span className="text-sm font-black text-white font-mono w-4 text-center tabular-nums"
          aria-label={`${item.quantity} of ${item.name}`}>
          {item.quantity}
        </span>

        {/* Increase — only for draft items */}
        <button
          onClick={() => isDraft && onUpdateQty(item.id, 1)}
          disabled={isPaid || isSent}
          aria-label={`Increase ${item.name} quantity`}
          data-testid={`button-increase-${item.menuItemId}`}
          className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 active:scale-90 border border-white/20 text-white font-black flex items-center justify-center transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-30"
        >
          <Plus size={13} />
        </button>
          {!isPaid && (
            <button
              onClick={handleTrash}
              aria-label={isSent ? `Void ${item.name}` : `Remove ${item.name}`}
              data-testid={`button-remove-${item.menuItemId}`}
              className="p-1.5 rounded-lg text-zinc-300 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer flex-shrink-0"
              style={isSent ? { color: 'rgba(252,165,165,0.6)', background: 'rgba(239,68,68,0.08)' } : undefined}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderPanel;

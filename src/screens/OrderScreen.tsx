import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { fmt } from '@/utils/format';
import { SEND_DELAY, SUCCESS_DURATION, FLASH_DURATION, NOW_TICK_INTERVAL } from '@/utils/kitchenTimings';
import { usePOSStore } from '@/store/usePOSStore';
import { useStaffStore } from '@/store/useStaffStore';
import { useOrders } from '@/hooks/useOrders';
import { useTables } from '@/hooks/useTables';
import { useCustomerStore } from '@/store/useCustomerStore';
import { ThemeToggle } from '@/components/ui/Navigation';
import MenuItemCard from '@/components/orders/MenuItemCard';
import OrderPanel from '@/components/orders/OrderPanel';
import CustomerPicker from '@/components/orders/CustomerPicker';
import { Customer, OrderItem } from '@/types/pos';
import { Search, ShoppingCart, ChevronUp, X, Info, ArrowRightLeft, UserCircle, Lock, Minus, Plus, Trash2 } from 'lucide-react';
import VoidItemModal from '@/components/orders/VoidItemModal';
import { playClick } from '@/utils/sounds';
import { getStaffName } from '@/utils/staffName';
import { filterMenuItems } from '@/utils/menuFilter';
import { compareTableNames, tableDisplayName } from '@/utils/tableName';
import { toast } from 'sonner';

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const formatRelativeTime = (ts: number, now: number): string => {
  const diffMin = Math.floor((now - ts) / 60000);
  if (diffMin < 1) return 'Sent just now';
  if (diffMin < 5) return `Sent ${diffMin} min ago`;
  return `Sent at ${formatTime(ts)}`;
};

const OrderScreen = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { tables } = useTables();
  const updateTableGuests = usePOSStore((s) => s.updateTableGuests);
  const moveOrder = usePOSStore((s) => s.moveOrder);
  const {
    getActiveOrder,
    createOrder,
    addItemToOrder,
    updateItemQuantity,
    removeItemFromOrder,
    clearOrder,
    sendToKitchen,
    orders,
  } = useOrders();
  const categories = usePOSStore((s) => s.categories);
  const menuItems = usePOSStore((s) => s.menuItems);
  const payments = usePOSStore((s) => s.payments);
  const settings   = usePOSStore((s) => s.settings);
  const currentUser = useStaffStore((s) => s.currentUser);
  const canPay = currentUser?.role !== 'WAITER';
  const pillars = usePOSStore((s) => s.pillars);

  const table = tables.find((t) => t.id === tableId);
  const [activePillar, setActivePillar] = useState(() => pillars[0] ?? 'Foods');
  const [activeSubCat, setActiveSubCat] = useState(() => {
    const first = categories.find((c) => c.parentCategory === (pillars[0] ?? 'Foods'));
    return first?.id || '';
  });
  const [search, setSearch] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [drawerSendPhase, setDrawerSendPhase] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [drawerSentAt, setDrawerSentAt] = useState<number | null>(null);
  const [drawerFlashingIds, setDrawerFlashingIds] = useState<Set<string>>(new Set());
  const [showKitchenWarning, setShowKitchenWarning] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [movePhase, setMovePhase] = useState<null | 'picker' | 'confirm'>(null);
  const [moveTargetTableId, setMoveTargetTableId] = useState<string | null>(null);
  const [moveIsProcessing, setMoveIsProcessing] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const attachCustomerToOrder = usePOSStore((s) => s.attachCustomerToOrder);
  const voidOrderItem = usePOSStore((s) => s.voidOrderItem);
  const [voidTarget, setVoidTarget] = useState<OrderItem | null>(null);
  const [moveSuccessBanner, setMoveSuccessBanner] = useState<string | null>(
    () => (location.state as { movedFrom?: number })?.movedFrom != null
      ? `Moved from Table ${(location.state as { movedFrom?: number }).movedFrom} ✓`
      : null
  );

  // Timer refs — prevent memory leaks and stale updates on unmount
  const sendTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swipe-to-close refs (portrait drawer only)
  const swipeTouchStartY = useRef(0);
  const swipeTouchCurrentY = useRef(0);

  // Landscape detection: any device where width > height gets split view
  const detectLandscape = () => window.innerWidth > window.innerHeight;
  const [isLandscape, setIsLandscape] = useState(detectLandscape);
  useEffect(() => {
    const update = () => setIsLandscape(detectLandscape());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Clean up all send/flash timers on unmount
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

  useEffect(() => {
    if (!moveSuccessBanner) return;
    const t = setTimeout(() => setMoveSuccessBanner(null), 2000);
    return () => clearTimeout(t);
  }, [moveSuccessBanner]);

  const order = useMemo(() => {
    if (!tableId || !table) return null;
    return getActiveOrder(tableId) || null;
  }, [tableId, table, getActiveOrder, orders]);


  // Sub-categories for the active pillar (direct children)
  const subCategories = useMemo(
    () => categories.filter((c) => c.parentCategory === activePillar),
    [categories, activePillar],
  );

  // When the pillar changes, default to the first sub-category
  useEffect(() => {
    const first = categories.find((c) => c.parentCategory === activePillar);
    setActiveSubCat(first?.id || '');
  }, [activePillar, categories]);

  const filteredItems = useMemo(() => {
    return filterMenuItems(menuItems, categories, activeSubCat, search);
  }, [menuItems, categories, activeSubCat, search]);

  const orderQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    (order?.items || []).forEach((i) => { map[i.menuItemId] = i.quantity; });
    return map;
  }, [order]);

  if (!table || !tableId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
        Table not found
      </div>
    );
  }

  const itemCount = order?.items.reduce((s, i) => s + i.quantity, 0) || 0;
  const runningTotal = order?.items.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.price * i.quantity, 0) || 0;
  const hasItems = itemCount > 0;

  const handlePay = () => {
    if (!order || order.items.length === 0) return;
    navigate(`/review/${tableId}`);
  };

  const handleAddItem = (item: typeof menuItems[0]) => {
    const takenBy = currentUser ? { id: currentUser.id, name: getStaffName(currentUser), role: currentUser.role } : undefined;
    const currentOrder = order || createOrder(tableId, table.number, takenBy);
    addItemToOrder(currentOrder.id, item);
    playClick();
  };

  const handleClear = () => {
    if (!order) return;
    clearOrder(order.id);
  };

  const attachedCustomer = order?.attachedCustomer ?? null;

  const handleAttachCustomer = (customer: Customer | null) => {
    if (!order) return;
    attachCustomerToOrder(order.id, customer);
  };

  // Fallback safety — default to draft if unexpected value
  const rawKitchenStatus = order?.kitchenStatus;
  const kitchenStatus: 'draft' | 'placed' = rawKitchenStatus === 'placed' ? 'placed' : 'draft';
  const hasUnsentItems = kitchenStatus === 'placed' ? (order?.hasUnsentItems ?? false) : false;

  const drawerStatusLabel =
    kitchenStatus === 'draft' ? 'Draft' : hasUnsentItems ? 'Updated' : 'Sent';
  const drawerStatusStyle =
    kitchenStatus === 'draft'
      ? { background: 'rgba(245,158,11,0.20)', color: 'rgb(253,186,116)', border: '1px solid rgba(245,158,11,0.40)' }
      : hasUnsentItems
      ? { background: 'rgba(251,191,36,0.12)', color: 'rgba(251,191,36,0.8)', border: '1px solid rgba(251,191,36,0.25)' }
      : { background: 'rgba(16,185,129,0.20)', color: 'rgb(110,231,183)', border: '1px solid rgba(16,185,129,0.40)' };

  /** True when the item has already been sent to the kitchen (backwards-compatible). */
  const isSentToKitchen = (item: OrderItem) =>
    item.kitchenStatus === 'sent' || item.sentToKitchen === true;

  // Per-item draft/sent counts
  const unpaidDrawerItems = (order?.items || []).filter((i) => i.status !== 'paid');
  const drawerDraftItems = unpaidDrawerItems.filter((i) => !isSentToKitchen(i));
  const drawerHasDraft = drawerDraftItems.length > 0;
  const drawerDraftUnitCount = drawerDraftItems.reduce((s, i) => s + i.quantity, 0);
  const drawerAllSent = unpaidDrawerItems.length > 0 && !drawerHasDraft;

  const drawerPrimaryLabel =
    drawerHasDraft
      ? `Send ${drawerDraftUnitCount} item${drawerDraftUnitCount !== 1 ? 's' : ''} to Kitchen`
      : 'Proceed to Payment →';

  const drawerButtonLabel =
    drawerSendPhase === 'sending' ? 'Sending...'
    : drawerSendPhase === 'sent' ? 'Sent ✓'
    : drawerPrimaryLabel;

  const handleSendToKitchen = () => {
    if (!order || drawerSendPhase !== 'idle') return; // race condition guard

    // Snapshot unsent IDs at click time — stable for flash
    const unsentSnapshot = order.items
      .filter((i) => !isSentToKitchen(i) && i.status !== 'paid')
      .map((i) => i.id);

    // Cancel any prior flash and start a new one from the snapshot
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    if (unsentSnapshot.length > 0) {
      setDrawerFlashingIds(new Set(unsentSnapshot));
      flashTimer.current = setTimeout(() => {
        setDrawerFlashingIds(new Set());
        flashTimer.current = null;
      }, FLASH_DURATION);
    }

    setDrawerSendPhase('sending');
    const ts = Date.now();
    setDrawerSentAt(ts);
    setNow(ts);
    setShowKitchenWarning(false);

    sendToKitchen(order.id);
    // Tickets are now written to Firebase by sendToKitchen; the designated
    // print-hub device (pos_is_print_hub === 'true') picks them up via
    // usePrintQueue and dispatches to the printer. Waiter phones never
    // open a print dialog here.

    const t1 = setTimeout(() => setDrawerSendPhase('sent'), SEND_DELAY);
    const t2 = setTimeout(() => setDrawerSendPhase('idle'), SEND_DELAY + SUCCESS_DURATION);
    sendTimers.current.push(t1, t2);
  };

  const handleDrawerPrimary = () => {
    if (drawerSendPhase !== 'idle') return;
    if (drawerAllSent) {
      setShowCart(false);
      handlePay();
    } else if (drawerHasDraft && order && order.items.length > 0) {
      handleSendToKitchen();
    }
  };

  const handleVoidConfirm = (qty: number, reason: string) => {
    if (!voidTarget || !order) return;
    const cancelledBy = currentUser
      ? `${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`.trim() || currentUser.username || currentUser.name || 'Staff'
      : 'Staff';
    voidOrderItem(order.id, voidTarget.id, qty, reason, cancelledBy);
    setVoidTarget(null);
  };

  const handlePaxChange = (newPax: number) => {
    if (tableId) updateTableGuests(tableId, newPax);
  };

  const freeTables = useMemo(
    () => tables.filter((t) => t.status === 'free').slice().sort((a, b) => compareTableNames(a.number, b.number)),
    [tables]
  );

  const moveTargetTable = moveTargetTableId ? tables.find((t) => t.id === moveTargetTableId) : null;

  const handleMoveConfirm = () => {
    if (!order || !moveTargetTableId || moveIsProcessing) return;
    setMoveIsProcessing(true);
    const targetId = moveTargetTableId;
    const fromNumber = table.number;
    moveOrder(order.id, targetId);
    setMovePhase(null);
    setMoveTargetTableId(null);
    setMoveIsProcessing(false);
    navigate(`/order/${targetId}`, { state: { movedFrom: fromNumber }, replace: true });
  };

  const handleRepeatLast = () => {
    const tablePayments = payments
      .filter((p) => p.tableNumber === table.number)
      .sort((a, b) => b.createdAt - a.createdAt);
    if (!tablePayments.length) return;

    const lastPayment = tablePayments[0];
    const reorderTakenBy = currentUser ? { id: currentUser.id, name: getStaffName(currentUser), role: currentUser.role } : undefined;
    const currentOrder = order || createOrder(tableId, table.number, reorderTakenBy);

    lastPayment.items.forEach((orderItem) => {
      const menuItem = menuItems.find((m) => m.id === orderItem.menuItemId);
      if (!menuItem) return;
      for (let i = 0; i < orderItem.quantity; i++) {
        addItemToOrder(currentOrder.id, menuItem);
      }
    });
    playClick();
  };

  return (
    <div className="h-screen w-full bg-[#0A0B0E] p-3 flex gap-3 overflow-hidden">
      {/* Left Column — menu system */}
      <div className="flex-1 h-full flex flex-col min-w-0 overflow-y-auto pr-1 gap-3">
        {/* Top Bar */}
        <div className="flex items-center justify-between pb-1 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              data-testid="button-back"
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs flex items-center gap-1.5 transition-all active:scale-95"
            >
              ‹ Back
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-300">ORDER STATUS:</span>
              <span
                className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase tracking-wider"
                style={drawerStatusStyle}
              >
                {drawerStatusLabel}
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>

      {/* Move success banner */}
      {moveSuccessBanner && (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 flex-shrink-0 transition-all"
          style={{
            background: 'linear-gradient(90deg, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.08) 100%)',
            borderBottom: '1px solid rgba(16,185,129,0.3)',
            boxShadow: '0 0 20px rgba(16,185,129,0.12) inset',
          }}
        >
          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.5)' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2 2 4-4" stroke="rgba(52,211,153,0.95)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-xs font-bold" style={{ color: 'rgba(52,211,153,0.9)' }}>{moveSuccessBanner}</span>
        </div>
      )}

      {/* Payment-in-progress info banner */}
      {table.status === 'billing' && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-accent/10 border-b border-accent/20 text-accent/90 flex-shrink-0">
          <Info size={14} className="flex-shrink-0" />
          <p className="text-xs font-medium">Payment in progress — you can still modify the order</p>
        </div>
      )}

      {/* ── Main content area ──
          Mobile (<640px): full-width menu, floating cart button + drawer
          Tablet (sm, >=640px): side-by-side 2/3 menu + 1/3 cart
          Desktop (lg, >=1024px): same as tablet, larger cart panel
      */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

        {/* ── Menu area ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">

          {/* Search */}
          <div className="p-3 bg-[#0A0B0E] border-b border-white/10 flex-shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search menu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-menu"
                className="w-full bg-[#13151F] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-2xl px-5 py-3.5 pl-11 text-sm placeholder:text-zinc-400 outline-none shadow-inner mb-0"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* 4-pillar super-category tabs */}
          {!search && (
            <>
              <div className="flex gap-2 px-3 pt-3 pb-2.5 border-b border-white/10 flex-shrink-0 bg-[#0A0B0E] overflow-x-auto no-scrollbar">
                {pillars.map((pillar) => (
                  <button
                    key={pillar}
                    onClick={() => setActivePillar(pillar)}
                    data-testid={`button-pillar-${pillar.toLowerCase()}`}
                    className={`flex-1 px-6 py-3 rounded-xl whitespace-nowrap transition-all active:scale-95 ${
                      activePillar === pillar
                        ? 'bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25'
                        : 'bg-[#13151F] border border-white/20 text-zinc-100 hover:text-white hover:bg-white/10 font-bold text-xs uppercase tracking-wider'
                    }`}
                  >
                    {pillar}
                  </button>
                ))}
              </div>

              {/* Sub-category row — flex-nowrap, hidden scrollbar */}
              <div className="flex flex-nowrap gap-2 px-3 py-2.5 border-b border-white/10 no-scrollbar flex-shrink-0 overflow-x-auto bg-[#0A0B0E]">
                {subCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveSubCat(cat.id)}
                    data-testid={`button-category-${cat.id}`}
                    className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all active:scale-95 ${
                      activeSubCat === cat.id
                        ? 'bg-amber-500/20 text-amber-300 border-2 border-amber-500/60 font-black text-xs uppercase tracking-wider shadow-sm'
                        : 'bg-[#13151F] border border-white/15 text-zinc-200 hover:text-white hover:bg-white/10 font-bold text-xs uppercase tracking-wider'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Items grid — only this section scrolls */}
          <div className={`flex-1 min-h-0 overflow-y-auto p-3 lg:p-4 bg-[#0A0B0E] ${!isLandscape ? 'pb-24' : ''}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {filteredItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  quantityInOrder={orderQtyMap[item.id] || 0}
                  onAdd={() => handleAddItem(item)}
                />
              ))}
            </div>
            {filteredItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ShoppingCart size={36} className="mb-3 opacity-20" />
                <p className="text-sm font-medium">No items found</p>
                <p className="text-xs opacity-60 mt-1.5 text-center">Try a different category or search</p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

        {/* ── Cart panel — JS-conditional, shown in landscape on any device ── */}
        {isLandscape && (
          <div
            className="w-full lg:w-[410px] h-full flex-shrink-0 flex flex-col"
          >
            <OrderPanel
              order={order}
              onUpdateQty={(itemId, delta) =>
                order && updateItemQuantity(order.id, itemId, delta)
              }
              onRemove={(itemId) =>
                order && removeItemFromOrder(order.id, itemId)
              }
              onPay={handlePay}
              onSendToKitchen={handleSendToKitchen}
              onClear={handleClear}
              onMoveTable={order ? () => setMovePhase('picker') : undefined}
              moveDisabled={freeTables.length === 0}
              pax={table.pax ?? 1}
              onPaxChange={handlePaxChange}
              canPay={canPay}
              serverName={order?.takenBy?.name}
              attachedCustomer={attachedCustomer}
              onAttachCustomer={handleAttachCustomer}
            />
          </div>
        )}

      {/* ── Portrait mobile only: COLLAPSED ORDER BAR ── */}
      {!isLandscape && hasItems && (
        <div
          onClick={() => setShowCart(true)}
          className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-5 pt-3.5 pb-[max(16px,env(safe-area-inset-bottom,16px))] rounded-t-2xl bg-amber-500 shadow-[0_-4px_24px_rgba(245,158,11,0.35)] cursor-pointer active:bg-amber-400 transition-all select-none"
        >
          <span className="text-slate-950 font-black text-sm">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </span>
          <span className="text-slate-950 font-black text-base tracking-tight font-mono">
            Rs. {fmt(runningTotal)}
          </span>
          <span className="flex items-center gap-1 text-slate-950 font-black uppercase tracking-wider text-xs">
            Review <ChevronUp size={15} strokeWidth={2.5} />
          </span>
        </div>
      )}

      {/* ── Portrait mobile only: EXPANDABLE ORDER DRAWER ── */}
      {!isLandscape && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowCart(false)}
            className="sm:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
            style={{ opacity: showCart ? 1 : 0, pointerEvents: showCart ? 'auto' : 'none' }}
          />

          {/* Drawer panel */}
          <div
             className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-[#10121A] border-l border-white/15 p-5 rounded-t-3xl shadow-2xl"
             style={{
               maxHeight: '75dvh',
               minHeight: '40dvh',
               transform: showCart ? 'translateY(0)' : 'translateY(100%)',
               transition: 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
             }}
          >
            <style>{`
              @keyframes dr-item-flash {
                0%   { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
                35%  { box-shadow: 0 0 0 6px rgba(251,191,36,0.28); }
                100% { box-shadow: 0 0 0 0 rgba(251,191,36,0); }
              }
              @keyframes dr-fade-in {
                from { opacity: 0; transform: scale(0.88); }
                to   { opacity: 1; transform: scale(1); }
              }
              @keyframes dr-btn-pulse {
                0%   { opacity: 1; }
                50%  { opacity: 0.65; }
                100% { opacity: 1; }
              }
            `}</style>
            {/* Drag handle — swipe-to-close zone */}
            <div
              className="flex justify-center pt-3 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing"
              onTouchStart={(e) => { swipeTouchStartY.current = e.touches[0].clientY; swipeTouchCurrentY.current = e.touches[0].clientY; }}
              onTouchMove={(e) => { swipeTouchCurrentY.current = e.touches[0].clientY; }}
              onTouchEnd={() => {
                if (swipeTouchCurrentY.current - swipeTouchStartY.current > 60) setShowCart(false);
                swipeTouchCurrentY.current = 0;
              }}
            >
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between px-4 pb-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Your Order{itemCount > 0 ? ` · ${itemCount} item${itemCount !== 1 ? 's' : ''}` : ''}
              </h3>
              <div className="flex items-center gap-2">
                {order && (
                  <button
                    onClick={() => { if (freeTables.length > 0) setMovePhase('picker'); }}
                    disabled={freeTables.length === 0}
                    data-testid="button-move-table-drawer"
                    title={freeTables.length === 0 ? 'No available tables' : undefined}
                     className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ArrowRightLeft size={12} />
                    {freeTables.length === 0 ? 'No tables' : 'Move'}
                  </button>
                )}
                <button
                  onClick={() => setShowCart(false)}
                  data-testid="button-close-cart"
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.07)' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Customer (Khatta) row — portrait drawer */}
            <div
              className="flex items-center gap-3 px-0 py-3 flex-shrink-0 border-b border-white/10"
            >
              <UserCircle size={14} className="text-amber-400 flex-shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 flex-1">Customer</span>
              {attachedCustomer ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-white shadow-sm max-w-[70%]">
                  <span className="text-xs font-bold text-amber-300 truncate">
                    👤 {attachedCustomer.name.split(' ')[0]}
                  </span>
                  {attachedCustomer.currentDue > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black font-mono whitespace-nowrap">
                      Due: Rs. {fmt(attachedCustomer.currentDue)}
                    </span>
                  )}
                  <button
                    onClick={() => handleAttachCustomer(null)}
                    className="text-zinc-400 hover:text-white transition-colors ml-1 p-0.5 flex-shrink-0"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomerPicker(true)}
                   className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                >
                  <UserCircle size={11} />
                  Add
                </button>
              )}
            </div>

            {/* Customer picker overlay — portrait */}
            {showCustomerPicker && (
              <CustomerPicker
                onSelect={(c) => { handleAttachCustomer(c); setShowCustomerPicker(false); }}
                onClose={() => setShowCustomerPicker(false)}
              />
            )}

            {/* Guests (Pax) selector */}
            <div
              className="flex items-center justify-between px-0 py-3 flex-shrink-0 border-b border-white/10"
            >
              <span className="text-sm font-black text-white">Guests</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePaxChange(Math.max(1, (table.pax ?? 1) - 1))}
                  disabled={(table.pax ?? 1) <= 1}
                   className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 active:scale-90 text-white font-black flex items-center justify-center transition-all disabled:opacity-30"
                >
                  <span className="text-base leading-none select-none">−</span>
                </button>
                <span className="w-6 text-center font-black text-sm text-white/90 select-none tabular-nums">
                  {table.pax ?? 1}
                </span>
                <button
                  onClick={() => handlePaxChange((table.pax ?? 1) + 1)}
                   className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 active:scale-90 text-white font-black flex items-center justify-center transition-all"
                >
                   <span className="text-base leading-none text-white select-none">+</span>
                </button>
              </div>
            </div>

            {/* Items list — scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2">
              {(order?.items || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  <ShoppingCart size={32} className="mb-2 opacity-30" />
                  <p className="text-sm font-semibold">No items yet</p>
                  <p className="text-xs opacity-60 mt-1">Tap items on the menu to add</p>
                </div>
              ) : (() => {
                const allItems = order?.items || [];
                const sentGroupItems = allItems.filter((i) => isSentToKitchen(i));
                const draftGroupItems = allItems.filter((i) => !isSentToKitchen(i) && i.status !== 'paid');
                const hasGrouping = sentGroupItems.length > 0 && draftGroupItems.length > 0;

                // Items to render in main list (when no grouping, show everything)
                const mainItems = hasGrouping ? sentGroupItems : allItems;

                const renderItem = (item: typeof allItems[0]) => {
                  const isPaid = item.status === 'paid';
                  const isSent = isSentToKitchen(item);
                  const isDraft = !isSent && !isPaid;
                  const isFlashing = drawerFlashingIds.has(item.id);

                  const handleMinus = () => {
                    if (isPaid) return;
                    if (isSent) { setVoidTarget(item); }
                    else if (order) { updateItemQuantity(order.id, item.id, -1); }
                  };
                  const handleTrash = () => {
                    if (isPaid) return;
                    if (isSent) { setVoidTarget(item); }
                    else if (order) { removeItemFromOrder(order.id, item.id); }
                  };

                  return (
                    <div
                      key={item.id}
                       className="p-3.5 rounded-2xl bg-[#161824] border border-white/15 shadow-md mb-2.5 flex flex-col gap-2"
                      style={{
                        background: isPaid
                          ? 'rgba(255,255,255,0.02)'
                          : isDraft
                          ? 'rgba(251,191,36,0.06)'
                          : 'rgba(15,23,42,0.75)',
                        border: isPaid
                          ? '1px solid rgba(255,255,255,0.04)'
                          : isDraft
                          ? '1px solid rgba(251,191,36,0.22)'
                          : '1px solid rgba(30,41,59,0.85)',
                        opacity: isPaid ? 0.5 : 1,
                        transition: 'background 0.25s ease, border-color 0.25s ease',
                        animation: isFlashing ? 'dr-item-flash 0.65s ease' : undefined,
                      }}
                    >
                       <div className="w-full flex items-start justify-between gap-3">
                        <p
                           className={`text-sm font-black text-white tracking-wide leading-snug min-w-0 ${isPaid ? 'line-through opacity-60' : ''}`}
                          style={{ wordBreak: 'break-word' }}
                        >
                          {item.name}
                        </p>
                         <p className={`text-sm font-black text-amber-400 font-mono whitespace-nowrap ${isPaid ? 'opacity-50' : ''}`}>
                           Rs. {fmt(item.price * item.quantity)}
                         </p>
                       </div>
                       <div className="w-full flex items-center justify-between gap-3">
                         <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                           <span className="text-xs font-bold text-zinc-300 font-mono">Rs. {fmt(item.price)} each</span>
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
                          aria-label={isSent ? `Void ${item.name}` : `Decrease ${item.name}`}
                            className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 active:scale-90 border border-white/20 text-white font-black flex items-center justify-center transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-30"
                          style={
                            isSent && !isPaid
                              ? { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: 'rgba(252,165,165,0.8)' }
                              : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)' }
                          }
                        >
                          <Minus size={13} />
                        </button>
                         <span className="text-sm font-black text-white font-mono w-4 text-center select-none">{item.quantity}</span>
                        {/* Increase — draft only */}
                        <button
                          onClick={() => isDraft && order && updateItemQuantity(order.id, item.id, 1)}
                          disabled={isPaid || isSent}
                          aria-label={`Increase ${item.name}`}
                            className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 active:scale-90 border border-white/20 text-white font-black flex items-center justify-center transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-30"
                        >
                          <Plus size={13} />
                        </button>
                           {!isPaid && (
                             <button
                               onClick={handleTrash}
                               aria-label={isSent ? `Void ${item.name}` : `Remove ${item.name}`}
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

                return (
                  <>
                    {mainItems.map((item) => renderItem(item))}
                    {hasGrouping && draftGroupItems.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 pt-1 pb-0.5">
                          <div className="flex-1 h-px" style={{ background: 'rgba(251,191,36,0.18)' }} />
                          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(251,191,36,0.55)' }}>
                            New items — not yet sent
                          </span>
                          <div className="flex-1 h-px" style={{ background: 'rgba(251,191,36,0.18)' }} />
                        </div>
                        {draftGroupItems.map((item) => renderItem(item))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Footer — pinned */}
            <div
              className="flex-shrink-0 px-4 pt-3"
              style={{
                paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                background: '#0d1525',
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/35">Total</span>
                  {kitchenStatus === 'placed' && drawerSentAt && (
                    <span
                      key={Math.floor((now - drawerSentAt) / 60000)}
                      className="text-[10px] font-medium"
                      style={{ color: 'rgba(52,211,153,0.65)', animation: 'dr-fade-in 0.2s ease' }}
                    >
                      {formatRelativeTime(drawerSentAt, now)}
                    </span>
                  )}
                </div>
                <span className="text-2xl font-black text-white/95">Rs. {fmt(runningTotal)}</span>
              </div>

              {/* Safety hint — shown when drafts exist */}
              {(showKitchenWarning || drawerHasDraft) && hasItems && (
                <p
                  className="text-[11px] text-center font-semibold mb-2 mt-1"
                  style={{ color: showKitchenWarning ? 'rgba(251,191,36,0.9)' : 'rgba(251,191,36,0.5)' }}
                >
                  ⚠ Send to kitchen before payment
                </p>
              )}

              {hasItems && (
                <button
                  onClick={() => { handleClear(); setShowCart(false); }}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm mb-2.5 transition-all active:scale-[0.97]"
                  style={{ background: 'transparent', border: '1px solid #EF4444', color: '#EF4444' }}
                >
                  Clear Order
                </button>
              )}

              {/* Primary CTA — matches desktop OrderPanel button logic */}
              {(() => {
                const isEmpty = !order || order.items.length === 0;
                const isBtnDisabled = isEmpty || drawerSendPhase === 'sending';

                let bg: string;
                let shadow: string;
                if (drawerSendPhase === 'sent') {
                  bg = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
                  shadow = '0 4px 20px -4px rgba(16,185,129,0.6)';
                } else if (drawerAllSent) {
                  bg = 'linear-gradient(135deg, #1d4ed8 0%, #60a5fa 60%, #3b82f6 100%)';
                  shadow = '0 6px 28px -4px rgba(59,130,246,0.75)';
                } else {
                  bg = 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)';
                  shadow = '0 4px 20px -4px rgba(59,130,246,0.6)';
                }

                const ariaLabel = drawerSendPhase === 'sending'
                  ? 'Sending to kitchen, please wait'
                  : drawerSendPhase === 'sent'
                  ? 'Order sent to kitchen'
                  : drawerPrimaryLabel;

                return (
                  <button
                    onClick={handleDrawerPrimary}
                    disabled={isBtnDisabled}
                    aria-disabled={isBtnDisabled}
                    aria-label={ariaLabel}
                    data-testid="button-proceed-to-bill"
                    className="w-full rounded-2xl font-black text-base active:scale-[0.97] disabled:opacity-20 disabled:cursor-not-allowed"
                    style={{
                      paddingTop: '15px',
                      paddingBottom: '15px',
                      background: isEmpty ? 'rgba(59,130,246,0.12)' : bg,
                      color: '#ffffff',
                      boxShadow: isEmpty ? 'none' : shadow,
                      transition: 'background 0.35s ease, box-shadow 0.35s ease',
                      animation: drawerSendPhase === 'sending' ? 'dr-btn-pulse 0.7s ease' : undefined,
                    }}
                  >
                    {drawerButtonLabel}
                  </button>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── Void Item Modal (portrait drawer) ── */}
      {voidTarget && (
        <VoidItemModal
          item={voidTarget}
          onConfirm={handleVoidConfirm}
          onClose={() => setVoidTarget(null)}
        />
      )}

      {/* ── Move Table Modal ── */}
      {movePhase === 'picker' && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={() => setMovePhase(null)}
          />
          <div
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 flex flex-col gap-4"
            style={{
              background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)',
              border: '1px solid rgba(59,130,246,0.22)',
              boxShadow: '0 24px 64px -8px rgba(0,0,0,0.85)',
              maxWidth: 480,
              margin: '0 auto',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-white/90 text-base">Move Table</h2>
                <p className="text-xs text-white/40 mt-0.5">
                  Move order from <span className="text-blue-300 font-semibold">{tableDisplayName(table.number)}</span> to:
                </p>
              </div>
              <button
                onClick={() => setMovePhase(null)}
                className="p-1.5 rounded-lg"
                style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.07)' }}
              >
                <X size={16} />
              </button>
            </div>

            {freeTables.length === 0 ? (
              <div className="text-center py-8 text-white/30">
                <p className="text-sm font-semibold">No available tables</p>
                <p className="text-xs mt-1 opacity-60">All other tables are currently occupied</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto">
                {freeTables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setMoveTargetTableId(t.id); setMovePhase('confirm'); }}
                    className="flex flex-col items-center justify-center py-4 rounded-xl font-black text-2xl transition-all active:scale-95 hover:scale-[1.03]"
                    style={{
                      background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)',
                      border: '1px solid rgba(16,185,129,0.28)',
                      color: 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {tableDisplayName(t.number)}
                    <span className="text-[9px] font-semibold mt-1" style={{ color: 'rgba(52,211,153,0.7)' }}>
                      Available
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Move Table Confirmation ── */}
      {movePhase === 'confirm' && moveTargetTable && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={() => setMovePhase('picker')}
          />
          <div
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 flex flex-col gap-5"
            style={{
              background: 'linear-gradient(160deg, #0f1929 0%, #0b1220 100%)',
              border: '1px solid rgba(59,130,246,0.22)',
              boxShadow: '0 24px 64px -8px rgba(0,0,0,0.85)',
              maxWidth: 400,
              margin: '0 auto',
            }}
          >
            <div className="text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}
              >
                <ArrowRightLeft size={20} style={{ color: 'rgba(147,197,253,0.85)' }} />
              </div>
              <h2 className="font-black text-white/90 text-base">Confirm Move</h2>
              <p className="text-sm text-white/50 mt-1.5 leading-relaxed">
                Move order from{' '}
                <span className="text-white/80 font-bold">{tableDisplayName(table.number)}</span>
                {' '}to{' '}
                <span className="text-blue-300 font-bold">{tableDisplayName(moveTargetTable.number)}</span>?
              </p>
              <p className="text-xs text-white/35 mt-1.5 leading-relaxed">
                All items, kitchen status, and payments will remain unchanged.
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setMovePhase('picker')}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
              >
                Back
              </button>
              <button
                onClick={handleMoveConfirm}
                disabled={moveIsProcessing}
                className="flex-1 py-3 rounded-xl text-sm font-black transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)', color: '#fff', boxShadow: '0 4px 16px -4px rgba(59,130,246,0.55)' }}
              >
                <ArrowRightLeft size={14} />
                {moveIsProcessing ? 'Moving…' : 'Move Table'}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default OrderScreen;

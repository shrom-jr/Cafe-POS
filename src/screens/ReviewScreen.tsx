import { useState, useMemo, useRef, useEffect } from 'react';
import { firePrintJob, type PrintJob } from '@/utils/printEngine';
import { useParams, useNavigate } from 'react-router-dom';
import { usePOSStore } from '@/store/usePOSStore';
import { useStaffStore } from '@/store/useStaffStore';
import { useOrders } from '@/hooks/useOrders';
import { useTables } from '@/hooks/useTables';
import { calcBill } from '@/utils/calcBill';
import { fmt, resolvePaymentLabel } from '@/utils/format';
import { getStaffName } from '@/utils/staffName';
import { tableDisplayName } from '@/utils/tableName';
import { playSuccess } from '@/utils/sounds';
import { QRCodeSVG } from 'qrcode.react';
import {
  ChevronLeft, ChevronDown, ChevronUp, Banknote, Smartphone,
  CheckCircle2, Home, X, Loader2, Printer, Check,
} from 'lucide-react';
import { OrderItem, TablePayment } from '@/types/pos';

const PRESETS = [0, 5, 10, 15];

const ReviewScreen = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();

  const { tables } = useTables();
  const { getActiveOrder, updateOrderStatus, addPayment } = useOrders();
  const settings = usePOSStore((s) => s.settings);
  const resetTable = usePOSStore((s) => s.resetTable);
  const getNextBillNumber = usePOSStore((s) => s.getNextBillNumber);
  const markItemsPaid = usePOSStore((s) => s.markItemsPaid);
  const splitOrderItem = usePOSStore((s) => s.splitOrderItem);

  const table = tables.find((t) => t.id === tableId);
  const order = tableId ? getActiveOrder(tableId) : undefined;

  // Snapshot items and order ID so they survive order state changes on payment
  const itemsRef = useRef(order?.items || []);
  const orderIdRef = useRef(order?.id || '');
  useEffect(() => {
    if (order?.items.length) {
      itemsRef.current = [...order.items];
      orderIdRef.current = order.id;
    }
  }, [order]);
  const items = itemsRef.current;

  // ── Review state ──────────────────────────────────────────────
  const [discountMode, setDiscountMode] = useState<'percent' | 'fixed'>('percent');
  const [discountInput, setDiscountInput] = useState('');
  const [activePreset, setActivePreset] = useState<number | null>(0);

  const discountValue = useMemo(() => {
    const n = parseFloat(discountInput);
    return isNaN(n) || n < 0 ? 0 : n;
  }, [discountInput]);

  const unpaidItems = useMemo(
    () => items.filter((i) => i.status !== 'paid'),
    [items]
  );

  const bill = useMemo(
    () => calcBill(unpaidItems, settings, discountMode, discountValue),
    [unpaidItems, settings, discountMode, discountValue]
  );

  // ── Split / partial payment state ─────────────────────────────
  const [selectedQty, setSelectedQty] = useState<Map<string, number>>(new Map());
  const [partialSuccess, setPartialSuccess] = useState(false);
  const [printSession, setPrintSession] = useState<{
    items: OrderItem[];
    billNum: number;
    paidAt: number;
    paidMethod: string;
    subtotal: number;
    discountAmount: number;
    vatAmount: number;
    vatRate: number;
    vatEnabled: boolean;
    total: number;
  } | null>(null);

  const splitSelectedItems = useMemo(
    () =>
      items.flatMap((item) =>
        item.id && selectedQty.has(item.id) && item.status !== 'paid'
          ? [{ ...item, quantity: selectedQty.get(item.id)! }]
          : []
      ),
    [items, selectedQty]
  );

  const splitBill = useMemo(
    () => calcBill(splitSelectedItems, settings, 'percent', 0),
    [splitSelectedItems, settings]
  );

  const activeBill = selectedQty.size > 0 ? splitBill : bill;

  // ── Payment state ─────────────────────────────────────────────
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [paid, setPaid] = useState(false);
  const [billNum, setBillNum] = useState(0);
  const [paidAt, setPaidAt] = useState(0);
  const [paidMethod, setPaidMethod] = useState('');
  const [reprinting, setReprinting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const lastPrintJobRef = useRef<PrintJob | null>(null);
  const confirmingRef = useRef(false);
  const [billDetailsOpen, setBillDetailsOpen] = useState(false);

  // Landscape detection — matches OrderScreen logic
  const detectLandscape = () => window.innerWidth > window.innerHeight && window.innerHeight < 600;
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(detectLandscape);
  useEffect(() => {
    const update = () => setIsLandscapeMobile(detectLandscape());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // ── Discount handlers ─────────────────────────────────────────
  const handlePreset = (pct: number) => {
    setActivePreset(pct);
    setDiscountMode('percent');
    setDiscountInput(pct === 0 ? '' : String(pct));
  };
  const handleInputChange = (val: string) => {
    setDiscountInput(val);
    setActivePreset(null);
  };
  const handleModeToggle = (mode: 'percent' | 'fixed') => {
    setDiscountMode(mode);
    setDiscountInput('');
    setActivePreset(mode === 'percent' ? 0 : null);
  };

  // Trigger B: Print Pre-Bill (PRE_BILL layout) ─────────────────
  const handlePrintPreBill = () => {
    firePrintJob({
      type: 'PRE_BILL',
      data: {
        cafeName:       settings.cafeName,
        cafeAddress:    settings.cafeAddress,
        cafePan:        settings.cafePan,
        tableNumber,
        timestamp:      Date.now(),
        items:          unpaidItems.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        subtotal:       bill.subtotal,
        discountAmount: bill.discountAmount,
        vatEnabled:     bill.vatEnabled,
        vatAmount:      bill.vatAmount,
        vatRate:        bill.vatRate,
        total:          bill.total,
      },
    });
  };

  // ── Payment helpers ───────────────────────────────────────────
  const tableNumber = table?.number ?? 0;
  const reference = `${settings.cafeName.replace(/\s/g, '')}-T${tableNumber}-B${settings.billCounter + 1}`;

  const methods = [
    { id: 'cash', label: 'Cash', isQR: false },
    ...(settings.wallets.esewa.enabled ? [{ id: 'esewa', label: 'eSewa', isQR: true }] : []),
    ...(settings.wallets.khalti.enabled ? [{ id: 'khalti', label: 'Khalti', isQR: true }] : []),
    ...(settings.wallets.fonepay.enabled ? [{ id: 'fonepay', label: 'Fonepay', isQR: true }] : []),
    ...(settings.customWallets || []).filter((w) => w.enabled).map((w) => ({ id: w.id, label: w.name, isQR: true })),
  ];
  const qrMethods = methods.filter((m) => m.isQR);

  const getQRData = (method: string) => {
    if (method === 'esewa')
      return `eSewa://pay?eSewaID=${settings.esewaPhone || settings.esewaId}&amount=${activeBill.total}&table=${tableNumber}&ref=${reference}`;
    return `pay://${method}?amount=${activeBill.total}&ref=${reference}`;
  };

  const getQRImage = (method: string) => {
    const builtIn = ['esewa', 'khalti', 'fonepay'] as const;
    if (builtIn.includes(method as 'esewa' | 'khalti' | 'fonepay')) {
      return settings.wallets[method as 'esewa' | 'khalti' | 'fonepay']?.qrImage || null;
    }
    const custom = (settings.customWallets || []).find((w) => w.id === method);
    return custom?.qrImage || null;
  };

  const handleConfirmPayment = async (method: string) => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirming(true);

    const isSplit = selectedQty.size > 0;
    const payItems = isSplit ? splitSelectedItems : unpaidItems;
    const payBill = isSplit ? splitBill : bill;
    const resolvedMethod = resolvePaymentLabel(method, settings);
    const liveUser = useStaffStore.getState().currentUser;
    const processedBy = liveUser
      ? { id: liveUser.id, name: getStaffName(liveUser), role: liveUser.role }
      : undefined;
    const takenBy = order?.takenBy;

    const bn = getNextBillNumber();
    const now = Date.now();

    addPayment({
      orderId: orderIdRef.current,
      tableNumber,
      items: [...payItems],
      subtotal: payBill.subtotal,
      discount: isSplit ? 0 : discountValue,
      discountType: isSplit ? 'percent' : discountMode,
      vatAmount: payBill.vatAmount,
      vatRate: payBill.vatRate,
      vatMode: payBill.vatMode,
      vatEnabled: payBill.vatEnabled,
      total: payBill.total,
      method,
      reference,
      createdAt: now,
      cafeName: settings.cafeName,
      billNumber: bn,
      takenBy,
      processedBy,
    });

    // Build payItemIds — split item in store when only a partial quantity is being paid
    const payItemIds: string[] = [];
    if (isSplit) {
      for (const [itemId, qty] of selectedQty.entries()) {
        const item = items.find((i) => i.id === itemId);
        if (!item || item.status === 'paid') continue;
        if (qty >= item.quantity) {
          payItemIds.push(item.menuItemId);
        } else {
          const splitKey = splitOrderItem(orderIdRef.current, item.menuItemId, qty);
          payItemIds.push(splitKey);
        }
      }
    } else {
      unpaidItems.forEach((i) => payItemIds.push(i.menuItemId));
    }

    const tablePayment: TablePayment = {
      id: crypto.randomUUID(),
      itemIds: payItemIds,
      total: payBill.total,
      method,
      timestamp: now,
      billNumber: bn,
    };
    markItemsPaid(orderIdRef.current, payItemIds, tablePayment);

    const session = {
      items: [...payItems],
      billNum: bn,
      paidAt: now,
      paidMethod: resolvedMethod,
      subtotal: payBill.subtotal,
      discountAmount: payBill.discountAmount,
      vatAmount: payBill.vatAmount,
      vatRate: payBill.vatRate,
      vatEnabled: payBill.vatEnabled,
      total: payBill.total,
    };
    setPrintSession(session);

    // allDone: true when every unpaid item's full quantity is being paid in this transaction
    const allDone = isSplit
      ? items.every(
          (item) =>
            item.status === 'paid' ||
            (item.id !== undefined &&
              selectedQty.has(item.id) &&
              (selectedQty.get(item.id) ?? 0) >= item.quantity)
        )
      : true;

    // Trigger C: TAX_INVOICE — build structured job immediately, no polling needed
    const taxJob: PrintJob = {
      type: 'TAX_INVOICE',
      data: {
        cafeName:       settings.cafeName,
        cafeAddress:    settings.cafeAddress,
        cafePan:        settings.cafePan,
        billFooter:     settings.billFooter,
        tableNumber,
        billNumber:     bn,
        timestamp:      now,
        items:          payItems.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        subtotal:       payBill.subtotal,
        discountAmount: payBill.discountAmount,
        vatEnabled:     payBill.vatEnabled,
        vatAmount:      payBill.vatAmount,
        vatRate:        payBill.vatRate,
        total:          payBill.total,
        method:         resolvedMethod,
        takenBy,
        processedBy,
      },
    };
    lastPrintJobRef.current = taxJob;

    playSuccess();
    setShowQRModal(false);

    if (allDone) {
      updateOrderStatus(orderIdRef.current, 'paid');
      setBillNum(bn);
      setPaidAt(now);
      setPaidMethod(resolvedMethod);
      setPaid(true);
      if (tableId) resetTable(tableId);
      if (payItems.length > 0) firePrintJob(taxJob);
    } else {
      setSelectedQty(new Map());
      confirmingRef.current = false;
      setConfirming(false);
      setPartialSuccess(true);
      if (payItems.length > 0) firePrintJob(taxJob);
      setTimeout(() => setPartialSuccess(false), 2500);
    }
  };

  // ── Early exits ───────────────────────────────────────────────
  if (!table || !tableId || items.length === 0) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground text-sm text-center">No active order found.</p>
        <button
          onClick={() => navigate(tableId ? `/order/${tableId}` : '/')}
          className="px-5 py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)' }}
        >
          Back to Order
        </button>
      </div>
    );
  }

  // Receipt dispatched directly via firePrintJob — no DOM portal needed
  const receiptPortal = null;

  // ── Success screen ────────────────────────────────────────────
  if (paid) {
    const sessionItems = printSession?.items || [];
    const displayItems = sessionItems.slice(0, 3);
    const extraCount = sessionItems.length - displayItems.length;

    const handleReprint = () => {
      if (reprinting) return;
      setReprinting(true);
      if (lastPrintJobRef.current) firePrintJob(lastPrintJobRef.current);
      setTimeout(() => setReprinting(false), 1800);
    };

    /* ── Shared receipt card content ── */
    const receiptCard = (compact = false) => (
      <div
        className={`w-full bg-card border border-border rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)] ${compact ? 'p-3 space-y-1.5' : 'p-4 space-y-2'}`}
      >
        <div className={`text-center border-b border-dashed border-border/60 ${compact ? 'pb-1' : 'pb-1'}`}>
          <p className={`font-black text-foreground ${compact ? 'text-xs' : 'text-sm'}`}>{settings.cafeName}</p>
          <p className="text-xs text-muted-foreground font-mono">#{billNum} · {tableDisplayName(tableNumber)}</p>
        </div>
        <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
          {displayItems.map((item) => (
            <div key={item.menuItemId} className={`flex justify-between ${compact ? 'text-xs' : 'text-sm'}`}>
              <span className="text-muted-foreground truncate pr-2">
                {item.name} <span className="text-foreground font-semibold">×{item.quantity}</span>
              </span>
              <span className="font-semibold text-foreground whitespace-nowrap">Rs. {fmt(item.price * item.quantity)}</span>
            </div>
          ))}
          {extraCount > 0 && (
            <p className="text-xs text-muted-foreground">+{extraCount} more item{extraCount > 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="flex justify-between items-center border-t border-dashed border-border/60 pt-1.5">
          <span className={`font-semibold text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>Total</span>
          <span className={`font-black text-foreground ${compact ? 'text-base' : 'text-lg'}`}>Rs. {fmt(printSession?.total ?? 0)}</span>
        </div>
      </div>
    );

    return (
      <>
        {receiptPortal}
        <div className="h-[100dvh] bg-background overflow-hidden">

          {isLandscapeMobile ? (
            /* ── LANDSCAPE: 2-column layout ── */
            <div className="h-full flex flex-row">

              {/* Left (40%): success icon + amount + badge */}
              <div
                className="flex flex-col items-center justify-center gap-2 px-5"
                style={{ width: '40%', borderRight: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center shadow-[0_0_32px_-4px_hsl(var(--success)/0.4)]">
                  <CheckCircle2 size={30} className="text-success" />
                </div>
                <h2 className="text-base font-black text-foreground text-center leading-tight">Payment Successful</h2>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <span className="text-2xl font-black text-foreground tabular-nums">Rs. {fmt(printSession?.total ?? 0)}</span>
                  <span className="px-2 py-0.5 rounded-full bg-success/15 text-success text-xs font-bold uppercase">
                    {paidMethod}
                  </span>
                </div>
                {(printSession?.discountAmount ?? 0) > 0 && (
                  <span className="text-xs text-success font-medium">Saved Rs. {fmt(printSession?.discountAmount ?? 0)}</span>
                )}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Printer size={11} />
                  <span>Printing receipt...</span>
                </div>
              </div>

              {/* Right (60%): receipt + buttons */}
              <div
                className="flex flex-col justify-between pt-4 px-4 gap-2"
                style={{ width: '60%', paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}
              >
                {receiptCard(true)}
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={handleReprint}
                    disabled={reprinting}
                    className="w-full py-2.5 rounded-2xl border border-border bg-secondary text-foreground font-bold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] hover:bg-secondary/80 disabled:opacity-60"
                  >
                    <Printer size={14} />
                    {reprinting ? 'Reprinting...' : 'Reprint Receipt'}
                  </button>
                  <button
                    onClick={() => navigate('/', { replace: true })}
                    className="w-full py-3 rounded-2xl bg-success text-white font-black text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] hover:brightness-110 shadow-[0_4px_16px_-4px_hsl(var(--success)/0.4)]"
                  >
                    <Home size={16} /> Back to Tables
                  </button>
                </div>
              </div>

            </div>

          ) : (
            /* ── PORTRAIT: stacked layout, centred and width-constrained ── */
            <div className="flex-1 h-full flex flex-col items-center justify-center p-5 overflow-hidden">
              <div className="w-full max-w-sm mx-auto flex flex-col items-center gap-4">

                {/* Icon + amount */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center shadow-[0_0_32px_-4px_hsl(var(--success)/0.4)]">
                    <CheckCircle2 size={36} className="text-success" />
                  </div>
                  <h2 className="text-xl font-black text-foreground">Payment Successful</h2>
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <span className="text-3xl font-black text-foreground tabular-nums">Rs. {fmt(printSession?.total ?? 0)}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-success/15 text-success text-xs font-bold uppercase">
                      {paidMethod}
                    </span>
                  </div>
                  {(printSession?.discountAmount ?? 0) > 0 && (
                    <span className="text-xs text-success font-medium">Saved Rs. {fmt(printSession?.discountAmount ?? 0)}</span>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Printer size={12} />
                    <span>Printing receipt...</span>
                  </div>
                </div>

                {/* Receipt card — constrained to parent max-w-sm */}
                <div className="w-full">
                  {receiptCard()}
                </div>

                {/* Buttons */}
                <div className="w-full space-y-2.5">
                  <button
                    onClick={handleReprint}
                    disabled={reprinting}
                    className="w-full py-3.5 rounded-2xl border border-border bg-secondary text-foreground font-bold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] hover:bg-secondary/80 disabled:opacity-60"
                  >
                    <Printer size={15} />
                    {reprinting ? 'Reprinting...' : 'Reprint Receipt'}
                  </button>
                  <button
                    onClick={() => navigate('/', { replace: true })}
                    className="w-full py-4 rounded-2xl bg-success text-white font-black text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] hover:brightness-110 shadow-[0_4px_16px_-4px_hsl(var(--success)/0.4)]"
                  >
                    <Home size={18} /> Back to Tables
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>
      </>
    );
  }

  // ── Shared JSX sections (used in both portrait and landscape) ────

  const toggleItemSelection = (itemId: string, totalQty: number) => {
    setSelectedQty((prev) => {
      const next = new Map(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.set(itemId, totalQty);
      return next;
    });
  };

  const setItemSelectedQty = (itemId: string, qty: number, max: number) => {
    setSelectedQty((prev) => {
      const next = new Map(prev);
      next.set(itemId, Math.max(1, Math.min(max, qty)));
      return next;
    });
  };

  const getItemsCard = (tablet = false) => {
    const itemRows = items.map((item, idx) => {
      const isPaid = item.status === 'paid';
      const isSelected = !!item.id && selectedQty.has(item.id);
      const selQty = (item.id ? selectedQty.get(item.id) : undefined) ?? item.quantity;
      const showStepper = isSelected && item.quantity > 1;

      if (tablet) {
        return (
          <div
            key={item.id ?? `${item.menuItemId}-${idx}`}
            className={`flex items-center gap-3 px-5 select-none ${!isPaid ? 'cursor-pointer' : ''}`}
            style={{
              paddingTop: 12,
              paddingBottom: 12,
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              opacity: isPaid ? 0.4 : 1,
              background: isSelected ? 'rgba(59,130,246,0.1)' : 'transparent',
              borderLeft: isSelected ? '3px solid rgba(59,130,246,0.8)' : '3px solid transparent',
              transition: 'background 0.1s ease, border-color 0.1s ease',
            }}
            onClick={() => !isPaid && item.id && toggleItemSelection(item.id, item.quantity)}
          >
            {!isPaid && (
              <div
                className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center"
                style={{
                  background: isSelected ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.06)',
                  border: isSelected ? '1.5px solid rgba(96,165,250,1)' : '1.5px solid rgba(255,255,255,0.14)',
                }}
              >
                {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
              </div>
            )}
            {isPaid && <div className="flex-shrink-0 w-4 h-4" />}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-semibold truncate ${isPaid ? 'line-through' : ''}`}
                style={{ color: isPaid ? 'rgba(255,255,255,0.4)' : isSelected ? '#ffffff' : 'rgba(255,255,255,0.85)' }}
              >
                {item.name}
                {isPaid && <span className="ml-2 text-[10px] font-bold not-italic" style={{ color: '#34d399' }}>PAID</span>}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {showStepper ? `${selQty}/${item.quantity}` : item.quantity} × Rs. {fmt(item.price)}
              </p>
            </div>
            {showStepper && (
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  className="w-6 h-6 rounded flex items-center justify-center active:scale-90 transition-transform"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                  onClick={() => setItemSelectedQty(item.id!, selQty - 1, item.quantity)}
                >
                  <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>−</span>
                </button>
                <span className="text-xs font-bold tabular-nums w-5 text-center" style={{ color: 'rgba(255,255,255,0.9)' }}>{selQty}</span>
                <button
                  className="w-6 h-6 rounded flex items-center justify-center active:scale-90 transition-transform"
                  style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}
                  onClick={() => setItemSelectedQty(item.id!, selQty + 1, item.quantity)}
                >
                  <span className="text-xs font-bold" style={{ color: 'rgba(147,197,253,0.9)' }}>+</span>
                </button>
              </div>
            )}
            <p
              className="text-sm font-bold tabular-nums whitespace-nowrap ml-2"
              style={{ color: isPaid ? 'rgba(255,255,255,0.3)' : isSelected ? '#ffffff' : 'rgba(255,255,255,0.8)' }}
            >
              Rs. {fmt(item.price * (isSelected ? selQty : item.quantity))}
            </p>
          </div>
        );
      }

      return (
        <div
          key={item.id ?? `${item.menuItemId}-${idx}`}
          className={`flex items-center gap-3 px-3 py-2.5 select-none ${!isPaid ? 'cursor-pointer active:scale-[0.985]' : ''}`}
          style={{
            borderBottom: idx < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            opacity: isPaid ? 0.38 : 1,
            background: isSelected
              ? 'rgba(59,130,246,0.24)'
              : isPaid ? 'rgba(255,255,255,0.02)' : 'transparent',
            borderLeft: isSelected ? '3px solid rgba(59,130,246,0.85)' : '3px solid transparent',
            transition: 'background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease, transform 0.1s ease',
          }}
          onClick={() => !isPaid && item.id && toggleItemSelection(item.id, item.quantity)}
        >
          {!isPaid && (
            <div
              className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
              style={{
                background: isSelected ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.06)',
                border: isSelected ? '1.5px solid rgba(96,165,250,1)' : '1.5px solid rgba(255,255,255,0.16)',
                boxShadow: isSelected ? '0 0 8px rgba(59,130,246,0.45)' : 'none',
                transition: 'background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease',
              }}
            >
              {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>
          )}
          {isPaid && <div className="flex-shrink-0 w-5 h-5" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={`text-sm font-bold truncate leading-snug ${isPaid ? 'line-through' : ''}`} style={{ color: isPaid ? 'rgba(255,255,255,0.45)' : isSelected ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.88)' }}>
                {item.name}
              </p>
              {isPaid && (
                <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.12)', color: 'rgba(52,211,153,0.7)' }}>
                  Paid
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>
              {showStepper ? `${selQty}/${item.quantity}` : item.quantity} × Rs. {fmt(item.price)}
            </p>
          </div>
          {showStepper && (
            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                className="w-6 h-6 rounded flex items-center justify-center active:scale-90 transition-transform"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                onClick={() => setItemSelectedQty(item.id!, selQty - 1, item.quantity)}
              >
                <span className="text-xs font-bold leading-none" style={{ color: 'rgba(255,255,255,0.7)' }}>−</span>
              </button>
              <span className="text-xs font-black tabular-nums w-5 text-center" style={{ color: 'rgba(255,255,255,0.9)' }}>{selQty}</span>
              <button
                className="w-6 h-6 rounded flex items-center justify-center active:scale-90 transition-transform"
                style={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.3)' }}
                onClick={() => setItemSelectedQty(item.id!, selQty + 1, item.quantity)}
              >
                <span className="text-xs font-bold leading-none" style={{ color: 'rgba(147,197,253,0.9)' }}>+</span>
              </button>
            </div>
          )}
          <p className="text-sm font-bold tabular-nums whitespace-nowrap" style={{ color: isPaid ? 'rgba(255,255,255,0.35)' : isSelected ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.88)' }}>
            Rs. {fmt(item.price * (isSelected ? selQty : item.quantity))}
          </p>
        </div>
      );
    });

    if (tablet) {
      return (
        <div className="flex flex-col">
          <div
            className="flex items-center justify-between px-5 pb-3 mb-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              {items.length} Item{items.length !== 1 ? 's' : ''}
            </span>
            {selectedQty.size > 0 && (
              <span className="text-[10px] font-semibold" style={{ color: 'rgba(147,197,253,0.75)' }}>
                {selectedQty.size} selected for split
              </span>
            )}
          </div>
          {itemRows}
        </div>
      );
    }

    return (
      <div
        className="flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 4px 16px -8px rgba(0,0,0,0.3)',
        }}
      >
        <div
          className="flex-shrink-0 px-3 py-1.5 flex items-center justify-between"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <span className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.22)' }}>
            Order Items
          </span>
          {selectedQty.size > 0 && (
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: 'rgba(59,130,246,0.7)' }}>
              {selectedQty.size} selected
            </span>
          )}
        </div>
        <div className="relative flex-1 min-h-0">
          <div className="overflow-y-auto h-full">
            {itemRows}
          </div>
          <div
            className="absolute bottom-0 inset-x-0 h-8 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(9,14,28,0.95))' }}
          />
        </div>
      </div>
    );
  };

  const getBillCard = (compact = false) => (
    <div
      className="rounded-2xl overflow-hidden flex-shrink-0"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.09)',
      }}
    >
      {/* ── Order summary rows ── */}
      <div className={`px-4 ${compact ? 'pt-2 pb-1.5 space-y-1' : 'pt-3 pb-2 space-y-1.5'}`}>

        {/* Subtotal */}
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.52)' }}>Subtotal</span>
          <span className="text-sm font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.88)' }}>
            Rs. {fmt(bill.subtotal)}
          </span>
        </div>

        {/* Discount label + value */}
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.52)' }}>Discount</span>
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: bill.discountAmount > 0 ? 'rgba(52,211,153,0.92)' : 'rgba(255,255,255,0.22)' }}
          >
            −Rs. {fmt(bill.discountAmount)}
          </span>
        </div>

        {/* ── Discount controls: single fitted row ── */}
        <div
          className="rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            padding: compact ? '5px 6px' : '6px 8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {/* Preset chips — flex:1 so they share space evenly */}
            {PRESETS.map((pct) => {
              const isActive = activePreset === pct && discountMode === 'percent';
              return (
                <button
                  key={pct}
                  onClick={() => handlePreset(pct)}
                  className="transition-all active:scale-[0.93]"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '4px 0',
                    borderRadius: 7,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: '16px',
                    textAlign: 'center',
                    ...(isActive
                      ? { background: 'rgba(59,130,246,0.24)', color: 'rgba(147,197,253,0.97)', border: '1px solid rgba(59,130,246,0.42)' }
                      : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.42)', border: '1px solid rgba(255,255,255,0.08)' })
                  }}
                >
                  {pct}%
                </button>
              );
            })}

            {/* Vertical separator */}
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

            {/* % / Rs toggle */}
            <div
              className="flex text-[11px] font-bold"
              style={{
                borderRadius: 7,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.09)',
                background: 'rgba(255,255,255,0.04)',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => handleModeToggle('percent')}
                style={{
                  padding: '4px 7px',
                  lineHeight: '16px',
                  transition: 'background 0.15s',
                  ...(discountMode === 'percent'
                    ? { background: 'rgba(59,130,246,0.25)', color: 'rgba(147,197,253,0.95)' }
                    : { color: 'rgba(255,255,255,0.38)' })
                }}
              >%</button>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch' }} />
              <button
                onClick={() => handleModeToggle('fixed')}
                style={{
                  padding: '4px 7px',
                  lineHeight: '16px',
                  transition: 'background 0.15s',
                  ...(discountMode === 'fixed'
                    ? { background: 'rgba(59,130,246,0.25)', color: 'rgba(147,197,253,0.95)' }
                    : { color: 'rgba(255,255,255,0.38)' })
                }}
              >Rs</button>
            </div>

            {/* Input */}
            <input
              type="number"
              min="0"
              inputMode="decimal"
              placeholder={discountMode === 'percent' ? '%' : 'Rs'}
              value={discountInput}
              onChange={(e) => handleInputChange(e.target.value)}
              style={{
                width: 64,
                flexShrink: 0,
                padding: '4px 8px',
                borderRadius: 7,
                fontSize: 12,
                lineHeight: '16px',
                color: 'rgba(255,255,255,0.9)',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
          </div>
        </div>

        {/* VAT */}
        {bill.vatEnabled && (
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.52)' }}>
              VAT ({Math.round(bill.vatRate * 100)}%)
            </span>
            <span className="text-sm font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.88)' }}>
              Rs. {fmt(bill.vatAmount)}
            </span>
          </div>
        )}
      </div>

      {/* Separator above TOTAL */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '0 12px' }} />

      {/* TOTAL row */}
      <div
        className={`flex items-center justify-between px-4 ${compact ? 'py-2' : 'py-2.5'}`}
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <span className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.38)' }}>
          Total
        </span>
        <span
          className={`${compact ? 'text-[22px]' : 'text-[27px]'} font-black tracking-tight leading-none tabular-nums`}
          style={{
            color: '#ffffff',
            textShadow: '0 0 20px rgba(255,255,255,0.18)',
          }}
        >
          Rs. {fmt(bill.total)}
        </span>
      </div>
    </div>
  );

  const getPaymentCard = (compact = false) => {
    return (
    <div
      className="rounded-2xl px-4 flex-shrink-0"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 4px 20px -6px rgba(0,0,0,0.4)',
        paddingTop: compact ? '10px' : '8px',
        paddingBottom: compact ? '10px' : '10px',
      }}
    >
      <div className="flex items-center justify-between mb-2.5">
        <p className="font-black uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>
          Payment Method
        </p>
        {selectedQty.size > 0 && (
          <p className="text-[10px] font-semibold tabular-nums" style={{ color: 'rgba(147,197,253,0.65)' }}>
            Rs. {fmt(activeBill.total)} &bull; {selectedQty.size} item{selectedQty.size !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Unified 2-column grid — Cash + all digital wallets */}
      <div className={`grid grid-cols-2 ${compact ? 'gap-1.5' : 'gap-2'}`}>
        {/* Cash */}
        <button
          onClick={() => handleConfirmPayment('cash')}
          disabled={confirming}
          data-testid="button-payment-method-cash"
          className={`flex items-center gap-[10px] px-3 ${compact ? 'py-2' : 'py-2.5'} rounded-xl transition-all duration-100 active:scale-[0.97] hover:brightness-110 disabled:opacity-40`}
          style={{
            background: 'rgba(52,211,153,0.09)',
            border: '1px solid rgba(52,211,153,0.3)',
            boxShadow: '0 2px 12px -4px rgba(52,211,153,0.2)',
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(52,211,153,0.16)', border: '1px solid rgba(52,211,153,0.2)' }}
          >
            <Banknote size={20} className="text-success" />
          </div>
          <div className="text-left min-w-0">
            <p className="font-bold text-sm leading-tight" style={{ color: 'rgba(255,255,255,0.93)' }}>Cash</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>Tap to pay</p>
          </div>
        </button>

        {/* Digital wallets */}
        {qrMethods.map(({ id, label }) => {
          const builtInKeys = ['esewa', 'khalti', 'fonepay'] as const;
          const isBuiltIn = builtInKeys.includes(id as 'esewa' | 'khalti' | 'fonepay');
          const logoImage = isBuiltIn
            ? settings.wallets[id as 'esewa' | 'khalti' | 'fonepay']?.logoImage
            : (settings.customWallets || []).find((w) => w.id === id)?.logoImage;
          const brandColor =
            id === 'esewa' ? '#16a34a' :
            id === 'khalti' ? '#7c3aed' :
            id === 'fonepay' ? '#dc2626' :
            '#3b82f6';
          const iconBg =
            id === 'esewa' ? 'rgba(22,163,74,0.14)' :
            id === 'khalti' ? 'rgba(124,58,237,0.14)' :
            id === 'fonepay' ? 'rgba(220,38,38,0.14)' :
            'rgba(59,130,246,0.14)';
          return (
            <button
              key={id}
              onClick={() => { if (!confirming) { setSelectedMethod(id); setShowQRModal(true); } }}
              data-testid={`button-payment-method-${id}`}
              disabled={confirming}
              className={`flex items-center gap-[10px] px-3 ${compact ? 'py-2' : 'py-2.5'} rounded-xl transition-all duration-100 active:scale-[0.97] hover:scale-[1.015] disabled:opacity-40`}
              style={{
                background: 'rgba(255,255,255,0.045)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 1px 6px -2px rgba(0,0,0,0.3)',
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{ background: iconBg, border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {logoImage ? (
                  <img src={logoImage} alt={label} className="w-full h-full object-contain p-0.5" />
                ) : (
                  <Smartphone size={20} style={{ color: brandColor, opacity: 0.85 }} />
                )}
              </div>
              <div className="text-left min-w-0">
                <p className="font-bold text-sm leading-tight" style={{ color: brandColor }}>{label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Scan QR</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
    );
  };

  // ── Main review + payment screen ──
  return (
    <>
      {receiptPortal}
      <div
        className="h-[100dvh] flex flex-col overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #0d1525 0%, #060e1a 100%)' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(13,21,37,0.9)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <button
            onClick={() => navigate(`/order/${tableId}`)}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            <ChevronLeft size={17} />
          </button>
          <div>
            <p className="font-black text-white text-sm leading-tight">Review Order</p>
            <p className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.38)' }}>
              {tableDisplayName(table.number)}
            </p>
          </div>
        </div>

        {/* Body — portrait: stacked column | landscape: 2-column side-by-side */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {isLandscapeMobile ? (
            <div className="flex-1 flex flex-row overflow-hidden px-3 py-2 gap-3">

              {/* Left: items list (scrollable) */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {getItemsCard()}
              </div>

              {/* Right: Total → Payment (scrollable list) → Bill details (collapsible) */}
              <div
                className="w-[300px] flex-shrink-0 flex flex-col overflow-hidden gap-1.5"
                style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '12px' }}
              >

                {/* 1. TOTAL — always visible, top */}
                <div
                  className="flex-shrink-0 flex items-center justify-between px-4 py-2 rounded-xl"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Total
                    {selectedQty.size > 0 && (
                      <span className="ml-2 normal-case font-semibold tracking-normal" style={{ color: 'rgba(147,197,253,0.65)' }}>
                        {selectedQty.size} item{selectedQty.size !== 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                  <span className="text-[24px] font-black tracking-tight leading-none tabular-nums" style={{ color: '#ffffff' }}>
                    Rs. {fmt(activeBill.total)}
                  </span>
                </div>

                {/* Trigger B: Print Pre-Bill (landscape) */}
                <button
                  onClick={handlePrintPreBill}
                  data-testid="button-print-pre-bill"
                  className="flex-shrink-0 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-[0.97]"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.42)',
                  }}
                >
                  <Printer size={12} />
                  Print Pre-Bill
                </button>

                {/* 2. PAYMENT METHODS — flex-1 so it fills available space; list scrolls if needed */}
                <div
                  className="flex-1 min-h-0 flex flex-col rounded-xl px-3 pt-2 pb-2"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    boxShadow: '0 4px 20px -6px rgba(0,0,0,0.4)',
                  }}
                >
                  <div className="flex-shrink-0 mb-1.5">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.35)' }}>Payment Method</p>
                  </div>
                  {/* Unified 2-column grid — Cash + digital wallets */}
                  <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {/* Cash */}
                      <button
                        onClick={() => handleConfirmPayment('cash')}
                        disabled={confirming}
                        data-testid="button-payment-method-cash"
                        className="flex items-center gap-[10px] px-3 py-2 rounded-lg transition-all duration-100 active:scale-[0.97] hover:brightness-110 disabled:opacity-40"
                        style={{
                          background: 'rgba(52,211,153,0.09)',
                          border: '1px solid rgba(52,211,153,0.3)',
                          boxShadow: '0 2px 10px -4px rgba(52,211,153,0.2)',
                        }}
                      >
                        <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(52,211,153,0.16)', border: '1px solid rgba(52,211,153,0.2)' }}>
                          <Banknote size={20} className="text-success" />
                        </div>
                        <div className="text-left min-w-0">
                          <p className="font-bold text-sm leading-tight" style={{ color: 'rgba(255,255,255,0.93)' }}>Cash</p>
                          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>Tap to pay</p>
                        </div>
                      </button>

                      {/* Digital wallets */}
                      {qrMethods.map(({ id, label }) => {
                        const builtInKeys = ['esewa', 'khalti', 'fonepay'] as const;
                        const isBuiltIn = builtInKeys.includes(id as 'esewa' | 'khalti' | 'fonepay');
                        const logoImage = isBuiltIn
                          ? settings.wallets[id as 'esewa' | 'khalti' | 'fonepay']?.logoImage
                          : (settings.customWallets || []).find((w) => w.id === id)?.logoImage;
                        const brandColor =
                          id === 'esewa' ? '#16a34a' :
                          id === 'khalti' ? '#7c3aed' :
                          id === 'fonepay' ? '#dc2626' : '#3b82f6';
                        const iconBg =
                          id === 'esewa' ? 'rgba(22,163,74,0.14)' :
                          id === 'khalti' ? 'rgba(124,58,237,0.14)' :
                          id === 'fonepay' ? 'rgba(220,38,38,0.14)' :
                          'rgba(59,130,246,0.14)';
                        return (
                          <button
                            key={id}
                            onClick={() => { if (!confirming) { setSelectedMethod(id); setShowQRModal(true); } }}
                            data-testid={`button-payment-method-${id}`}
                            disabled={confirming}
                            className="flex items-center gap-[10px] px-3 py-2 rounded-lg transition-all duration-100 active:scale-[0.97] hover:scale-[1.015] disabled:opacity-40"
                            style={{
                              background: 'rgba(255,255,255,0.045)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              boxShadow: '0 1px 6px -2px rgba(0,0,0,0.3)',
                            }}
                          >
                            <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden"
                              style={{ background: iconBg, border: '1px solid rgba(255,255,255,0.08)' }}>
                              {logoImage
                                ? <img src={logoImage} alt={label} className="w-full h-full object-contain p-0.5" />
                                : <Smartphone size={20} style={{ color: brandColor, opacity: 0.85 }} />
                              }
                            </div>
                            <div className="text-left min-w-0">
                              <p className="font-bold text-sm leading-tight" style={{ color: brandColor }}>{label}</p>
                              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Scan QR</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 3. BILL DETAILS — collapsible, default closed, pinned at bottom */}
                <div
                  className="flex-shrink-0 rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  {/* Toggle header — always visible */}
                  <button
                    onClick={() => setBillDetailsOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 transition-all active:opacity-70"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.28)' }}>
                        Bill Details
                      </span>
                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: bill.discountAmount > 0 ? 'rgba(52,211,153,0.8)' : 'rgba(255,255,255,0.38)' }}>
                        {bill.discountAmount > 0 ? `−Rs. ${fmt(bill.discountAmount)}` : `Sub Rs. ${fmt(bill.subtotal)}`}
                        {bill.vatEnabled ? ` · VAT Rs. ${fmt(bill.vatAmount)}` : ''}
                      </span>
                    </div>
                    {billDetailsOpen
                      ? <ChevronUp size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                      : <ChevronDown size={13} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                    }
                  </button>

                  {/* Expandable body */}
                  {billDetailsOpen && (
                    <div className="px-3 pb-2 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex justify-between items-center pt-1.5">
                        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>Subtotal</span>
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.88)' }}>Rs. {fmt(bill.subtotal)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>Discount</span>
                        <span
                          className="text-[11px] font-semibold tabular-nums"
                          style={{ color: bill.discountAmount > 0 ? 'rgba(52,211,153,0.9)' : 'rgba(255,255,255,0.22)' }}
                        >
                          −Rs. {fmt(bill.discountAmount)}
                        </span>
                      </div>
                      {/* Discount controls */}
                      <div className="flex gap-1.5 items-center">
                        <div className="flex gap-1">
                          {PRESETS.map((pct) => {
                            const isActive = activePreset === pct && discountMode === 'percent';
                            return (
                              <button
                                key={pct}
                                onClick={() => handlePreset(pct)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold transition-all active:scale-95"
                                style={
                                  isActive
                                    ? { background: 'rgba(59,130,246,0.22)', color: 'rgba(147,197,253,0.95)', border: '1px solid rgba(59,130,246,0.38)' }
                                    : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.07)' }
                                }
                              >
                                {pct}%
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex rounded overflow-hidden flex-shrink-0 text-[10px] font-bold" style={{ border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)' }}>
                          <button
                            onClick={() => handleModeToggle('percent')}
                            className="px-1.5 py-0.5 transition-colors"
                            style={discountMode === 'percent' ? { background: 'rgba(59,130,246,0.25)', color: 'rgba(147,197,253,0.95)' } : { color: 'rgba(255,255,255,0.36)' }}
                          >%</button>
                          <button
                            onClick={() => handleModeToggle('fixed')}
                            className="px-1.5 py-0.5 transition-colors"
                            style={discountMode === 'fixed' ? { background: 'rgba(59,130,246,0.25)', color: 'rgba(147,197,253,0.95)' } : { color: 'rgba(255,255,255,0.36)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
                          >Rs</button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          inputMode="decimal"
                          placeholder={discountMode === 'percent' ? '%' : 'Rs'}
                          value={discountInput}
                          onChange={(e) => handleInputChange(e.target.value)}
                          className="w-[72px] flex-shrink-0 px-2 py-0.5 rounded text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none transition-all"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                        />
                      </div>
                      {bill.vatEnabled && (
                        <div className="flex justify-between items-center">
                          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                            VAT ({Math.round(bill.vatRate * 100)}%)
                          </span>
                          <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.88)' }}>
                            Rs. {fmt(bill.vatAmount)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : (
            <>
              {/* Mobile layout (< 768px): unchanged stacked */}
              <div className="flex md:hidden max-w-[460px] mx-auto w-full flex-col flex-1 min-h-0 px-4 pt-2.5 pb-2 gap-1.5">
                {getItemsCard()}
                <div className="flex-shrink-0 flex flex-col gap-1.5">
                  {getBillCard()}
                  {/* Trigger B: Print Pre-Bill */}
                  <button
                    onClick={handlePrintPreBill}
                    data-testid="button-print-pre-bill"
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.48)',
                    }}
                  >
                    <Printer size={13} />
                    Print Pre-Bill
                  </button>
                  {getPaymentCard()}
                </div>
              </div>

              {/* Tablet/Desktop layout (≥ 768px): card-based grid */}
              <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
                <div className="w-full h-full overflow-hidden" style={{ padding: '24px 28px' }}>
                  <div
                    style={{
                      maxWidth: 1360,
                      margin: '0 auto',
                      height: '100%',
                      display: 'grid',
                      gridTemplateColumns: '1.5fr 1fr',
                      gap: 24,
                      alignItems: 'stretch',
                    }}
                  >

                    {/* ── LEFT: Items card ── */}
                    <div
                      style={{
                        borderRadius: 16,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.02)',
                        overflow: 'hidden',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                      }}
                    >
                      {/* Card header — fixed */}
                      <div
                        className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          Order Items
                        </p>
                        <span
                          className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)' }}
                        >
                          {items.length}
                        </span>
                      </div>
                      {/* Scrollable item rows */}
                      <div className="pos-scroll-wrap">
                        <div className="pos-scroll" style={{ overflowY: 'auto', height: '100%', paddingRight: 6, paddingBottom: 8 }}>
                          {getItemsCard(true)}
                        </div>
                      </div>
                    </div>

                    {/* ── RIGHT: Summary + Payment cards stacked ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%', overflow: 'hidden', minHeight: 0 }}>

                      {/* ── Summary card ── */}
                      <div
                        style={{
                          flexShrink: 0,
                          borderRadius: 16,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.02)',
                          padding: '20px 20px 16px',
                          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                        }}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-4" style={{ color: 'rgba(255,255,255,0.42)' }}>
                          Order Summary
                        </p>

                        {/* Subtotal */}
                        <div className="flex justify-between items-center py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.55)' }}>Subtotal</span>
                          <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>
                            Rs. {fmt(bill.subtotal)}
                          </span>
                        </div>

                        {/* Discount */}
                        <div className="py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.55)' }}>Discount</span>
                            <span
                              className="text-[13px] font-semibold tabular-nums"
                              style={{ color: bill.discountAmount > 0 ? '#34d399' : 'rgba(255,255,255,0.22)' }}
                            >
                              −Rs. {fmt(bill.discountAmount)}
                            </span>
                          </div>
                          {/* Unified discount control container */}
                          <div
                            className="flex items-center gap-2"
                            style={{
                              background: 'rgba(255,255,255,0.04)',
                              borderRadius: 12,
                              border: '1px solid rgba(255,255,255,0.07)',
                              padding: '8px 10px',
                            }}
                          >
                            {/* Preset chips */}
                            <div className="flex gap-1.5">
                              {PRESETS.map((pct) => {
                                const isActive = activePreset === pct && discountMode === 'percent';
                                return (
                                  <button
                                    key={pct}
                                    onClick={() => handlePreset(pct)}
                                    className="transition-all active:scale-95"
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: 7,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      ...(isActive
                                        ? { background: 'rgba(59,130,246,0.28)', color: 'rgba(147,197,253,1)', border: '1px solid rgba(59,130,246,0.5)' }
                                        : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid transparent' })
                                    }}
                                  >
                                    {pct}%
                                  </button>
                                );
                              })}
                            </div>
                            {/* Vertical separator */}
                            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.09)', flexShrink: 0 }} />
                            {/* Mode toggle */}
                            <div
                              className="flex flex-shrink-0 text-[11px] font-bold"
                              style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}
                            >
                              <button
                                onClick={() => handleModeToggle('percent')}
                                className="px-2.5 py-1 transition-colors"
                                style={discountMode === 'percent' ? { background: 'rgba(59,130,246,0.25)', color: 'rgba(147,197,253,1)' } : { color: 'rgba(255,255,255,0.38)' }}
                              >%</button>
                              <button
                                onClick={() => handleModeToggle('fixed')}
                                className="px-2.5 py-1 transition-colors"
                                style={discountMode === 'fixed' ? { background: 'rgba(59,130,246,0.25)', color: 'rgba(147,197,253,1)' } : { color: 'rgba(255,255,255,0.38)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
                              >Rs</button>
                            </div>
                            {/* Input — blends in */}
                            <input
                              type="number"
                              min="0"
                              inputMode="decimal"
                              placeholder={discountMode === 'percent' ? '0' : '0.00'}
                              value={discountInput}
                              onChange={(e) => handleInputChange(e.target.value)}
                              className="w-[88px] flex-shrink-0 text-[12px] text-white placeholder:text-white/20 focus:outline-none bg-transparent"
                              style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 2 }}
                              onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'rgba(59,130,246,0.6)'; }}
                              onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'rgba(255,255,255,0.12)'; }}
                            />
                          </div>
                        </div>

                        {/* VAT */}
                        {bill.vatEnabled && (
                          <div className="flex justify-between items-center py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                            <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                              VAT ({Math.round(bill.vatRate * 100)}%)
                            </span>
                            <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>
                              Rs. {fmt(bill.vatAmount)}
                            </span>
                          </div>
                        )}

                        {/* TOTAL — dominant with top separator */}
                        <div
                          className="flex justify-between items-end"
                          style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16, marginTop: 6 }}
                        >
                          <span
                            className="font-bold uppercase pb-1"
                            style={{ fontSize: 11, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.4)' }}
                          >
                            {selectedQty.size > 0 ? 'Split Total' : 'Total'}
                          </span>
                          <span
                            className="font-bold tabular-nums leading-none text-white"
                            style={{ fontSize: 32, textShadow: '0 0 24px rgba(255,255,255,0.12)' }}
                          >
                            Rs. {fmt(activeBill.total)}
                          </span>
                        </div>
                        {selectedQty.size > 0 && (
                          <p className="text-xs text-right mt-1.5" style={{ color: 'rgba(147,197,253,0.6)' }}>
                            {selectedQty.size} item{selectedQty.size !== 1 ? 's' : ''} selected for split payment
                          </p>
                        )}
                      </div>

                      {/* Trigger B: Print Pre-Bill (tablet) */}
                      <button
                        onClick={handlePrintPreBill}
                        data-testid="button-print-pre-bill"
                        style={{
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '8px 16px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 600,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.42)',
                          cursor: 'pointer',
                          transition: 'all 0.1s ease',
                          letterSpacing: '0.02em',
                        }}
                      >
                        <Printer size={13} />
                        Print Pre-Bill
                      </button>

                      {/* ── Payment card ── */}
                      <div
                        className="rounded-[20px]"
                        style={{
                          background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                          border: '1px solid rgba(255,255,255,0.08)',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
                          flex: 1,
                          minHeight: 260,
                          display: 'flex',
                          flexDirection: 'column',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Fixed label */}
                        <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            Payment Method
                          </p>
                        </div>
                        {/* Scrollable buttons area */}
                        <div className="pos-scroll-wrap">
                        <div className="pos-scroll" style={{ overflowY: 'auto', height: '100%', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                        {/* Unified 2-column grid — Cash + all digital wallets */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>

                          {/* Cash */}
                          <button
                            onClick={() => handleConfirmPayment('cash')}
                            disabled={confirming}
                            data-testid="button-payment-method-cash"
                            className="pos-pay-card flex items-center gap-[10px] px-3 rounded-[14px] disabled:opacity-40"
                            style={{
                              minHeight: 66,
                              padding: '12px 14px',
                              background: 'linear-gradient(135deg, rgba(4,120,87,0.5) 0%, rgba(16,185,129,0.18) 100%)',
                              border: '1px solid rgba(52,211,153,0.35)',
                              boxShadow: '0 2px 14px rgba(16,185,129,0.2), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)',
                              ['--card-hover-shadow' as string]: '0 14px 32px rgba(16,185,129,0.4), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                            }}
                          >
                            <div
                              style={{
                                width: 36, height: 36,
                                borderRadius: 10,
                                background: 'rgba(52,211,153,0.2)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <Banknote size={20} style={{ color: '#34d399' }} />
                            </div>
                            <div className="text-left min-w-0">
                              <p className="text-[14px] font-bold leading-tight text-white">Cash</p>
                              <p className="text-[10px] font-medium mt-0.5" style={{ color: 'rgba(52,211,153,0.75)' }}>Tap to pay</p>
                            </div>
                          </button>

                          {/* Digital wallets */}
                          {qrMethods.map(({ id, label }) => {
                            const builtInKeys = ['esewa', 'khalti', 'fonepay'] as const;
                            const isBuiltIn = builtInKeys.includes(id as 'esewa' | 'khalti' | 'fonepay');
                            const logoImage = isBuiltIn
                              ? settings.wallets[id as 'esewa' | 'khalti' | 'fonepay']?.logoImage
                              : (settings.customWallets || []).find((w) => w.id === id)?.logoImage;

                            type BrandStyle = { color: string; bg1: string; bg2: string; border: string; shadow: string; hoverShadow: string; iconBg: string };
                            const brandMap: Record<string, BrandStyle> = {
                              esewa:   { color: '#4ade80', bg1: 'rgba(22,163,74,0.14)',   bg2: 'rgba(16,185,129,0.04)', border: 'rgba(34,197,94,0.28)',   shadow: '0 2px 14px rgba(22,163,74,0.2)',    hoverShadow: '0 14px 32px rgba(34,197,94,0.4), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',  iconBg: 'rgba(34,197,94,0.18)'  },
                              khalti:  { color: '#c084fc', bg1: 'rgba(124,58,237,0.14)',  bg2: 'rgba(139,92,246,0.04)', border: 'rgba(167,139,250,0.28)', shadow: '0 2px 14px rgba(124,58,237,0.2)',  hoverShadow: '0 14px 32px rgba(139,92,246,0.4), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)', iconBg: 'rgba(139,92,246,0.18)' },
                              fonepay: { color: '#f87171', bg1: 'rgba(220,38,38,0.14)',   bg2: 'rgba(239,68,68,0.04)',  border: 'rgba(239,68,68,0.28)',   shadow: '0 2px 14px rgba(220,38,38,0.2)',   hoverShadow: '0 14px 32px rgba(239,68,68,0.4), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',  iconBg: 'rgba(239,68,68,0.18)'  },
                            };
                            const b: BrandStyle = brandMap[id] ?? { color: '#93c5fd', bg1: 'rgba(59,130,246,0.12)', bg2: 'rgba(96,165,250,0.04)', border: 'rgba(96,165,250,0.25)', shadow: '0 2px 14px rgba(59,130,246,0.18)', hoverShadow: '0 14px 32px rgba(96,165,250,0.4), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)', iconBg: 'rgba(59,130,246,0.16)' };

                            return (
                              <button
                                key={id}
                                onClick={() => { if (!confirming) { setSelectedMethod(id); setShowQRModal(true); } }}
                                data-testid={`button-payment-method-${id}`}
                                disabled={confirming}
                                className="pos-pay-card flex items-center gap-[10px] rounded-[14px] disabled:opacity-40"
                                style={{
                                  minHeight: 66,
                                  padding: '12px 14px',
                                  background: `linear-gradient(145deg, ${b.bg1}, ${b.bg2})`,
                                  border: `1px solid ${b.border}`,
                                  boxShadow: `${b.shadow}, 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)`,
                                  ['--card-hover-shadow' as string]: b.hoverShadow,
                                }}
                              >
                                <div
                                  style={{
                                    width: 36, height: 36,
                                    borderRadius: 10,
                                    background: b.iconBg,
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    overflow: 'hidden',
                                  }}
                                >
                                  {logoImage ? (
                                    <img src={logoImage} alt={label} className="w-full h-full object-contain p-0.5" />
                                  ) : (
                                    <Smartphone size={20} style={{ color: b.color }} />
                                  )}
                                </div>
                                <div className="text-left min-w-0">
                                  <p className="text-[13px] font-semibold leading-tight" style={{ color: b.color }}>{label}</p>
                                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Scan QR</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        </div>{/* end pos-scroll */}
                        </div>{/* end pos-scroll-wrap */}
                      </div>{/* end payment card */}

                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* QR Modal */}
      {showQRModal && selectedMethod && selectedMethod !== 'cash' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md">

          {isLandscapeMobile ? (
            /* ── LANDSCAPE: 2-column layout ── */
            <div
              className="bg-card border border-border shadow-2xl overflow-hidden flex flex-row w-full"
              style={{ borderRadius: 20, maxWidth: 640, maxHeight: 'calc(100dvh - 24px)' }}
            >
              {/* Left — QR code, centered, fills column */}
              <div
                className="flex items-center justify-center p-4"
                style={{ width: '55%', borderRight: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.15)' }}
              >
                <div
                  className="p-3 bg-white rounded-2xl"
                  style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 4px 20px -4px rgba(0,0,0,0.3)' }}
                >
                  {getQRImage(selectedMethod) ? (
                    <img
                      src={getQRImage(selectedMethod)!}
                      alt={`${selectedMethod} QR`}
                      style={{ width: 160, height: 160, objectFit: 'contain' }}
                    />
                  ) : (
                    <QRCodeSVG value={getQRData(selectedMethod)} size={160} bgColor="#ffffff" fgColor="#000000" level="M" />
                  )}
                </div>
              </div>

              {/* Right — info + confirm button */}
              <div className="flex flex-col justify-between p-4" style={{ width: '45%' }}>
                {/* Top: close + wallet name + amount */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-foreground text-sm leading-tight">
                      {resolvePaymentLabel(selectedMethod, settings)} Payment
                    </h3>
                    <button
                      onClick={() => { setShowQRModal(false); setSelectedMethod(null); setConfirming(false); }}
                      className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all active:scale-90 flex-shrink-0"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Amount Due</p>
                    <p className="text-3xl font-black text-foreground tabular-nums leading-tight">Rs. {fmt(activeBill.total)}</p>
                    {activeBill.discountAmount > 0 && (
                      <p className="text-xs text-success font-semibold mt-0.5">Saved Rs. {fmt(activeBill.discountAmount)}</p>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    Scan the QR code and confirm after payment
                  </p>
                </div>

                {/* Bottom: confirm button */}
                <button
                  onClick={async () => {
                    if (confirming) return;
                    setConfirming(true);
                    await handleConfirmPayment(selectedMethod);
                  }}
                  disabled={confirming}
                  data-testid="button-confirm-payment"
                  className="w-full py-3 rounded-2xl text-white font-black text-sm transition-all active:scale-[0.97] disabled:opacity-80 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)',
                    boxShadow: '0 4px 16px -4px rgba(59,130,246,0.5)',
                  }}
                >
                  {confirming ? (
                    <><Loader2 size={16} className="animate-spin" /> Processing...</>
                  ) : (
                    'Confirm Payment'
                  )}
                </button>
              </div>
            </div>

          ) : (
            /* ── PORTRAIT: original stacked layout ── */
            <div className="bg-card rounded-3xl border border-border w-full max-w-sm shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="font-black text-foreground text-base">
                  {resolvePaymentLabel(selectedMethod, settings)} Payment
                </h3>
                <button
                  onClick={() => { setShowQRModal(false); setSelectedMethod(null); setConfirming(false); }}
                  className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-all active:scale-90"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="px-6 pt-5 pb-6 flex flex-col items-center gap-4">
                <div className="text-center">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">Amount Due</p>
                  <p className="text-5xl font-black text-foreground mt-1 tabular-nums">Rs. {fmt(activeBill.total)}</p>
                  {activeBill.discountAmount > 0 && (
                    <p className="text-xs text-success font-semibold mt-1">Saved Rs. {fmt(activeBill.discountAmount)}</p>
                  )}
                </div>
                <div
                  className="p-4 bg-white rounded-2xl"
                  style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 4px 20px -4px rgba(0,0,0,0.3)' }}
                >
                  {getQRImage(selectedMethod) ? (
                    <img src={getQRImage(selectedMethod)!} alt={`${selectedMethod} QR`} className="w-56 h-56 object-contain" />
                  ) : (
                    <QRCodeSVG value={getQRData(selectedMethod)} size={224} bgColor="#ffffff" fgColor="#000000" level="M" />
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground text-center">
                  Scan QR and confirm after payment
                </p>
                <button
                  onClick={async () => {
                    if (confirming) return;
                    setConfirming(true);
                    await handleConfirmPayment(selectedMethod);
                  }}
                  disabled={confirming}
                  data-testid="button-confirm-payment"
                  className="w-full py-4 rounded-2xl text-white font-black text-base transition-all active:scale-[0.97] disabled:opacity-80 flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #1e50d0 0%, #4186f5 100%)',
                    boxShadow: '0 4px 16px -4px rgba(59,130,246,0.5)',
                  }}
                >
                  {confirming ? (
                    <><Loader2 size={18} className="animate-spin" /> Processing...</>
                  ) : (
                    'Confirm Payment'
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Partial payment success overlay */}
      {partialSuccess && printSession && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center pb-8 px-4 pointer-events-none">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl pointer-events-auto"
            style={{
              background: 'rgba(17,24,39,0.95)',
              border: '1px solid rgba(52,211,153,0.3)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(52,211,153,0.15)',
            }}
          >
            <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={16} className="text-success" />
            </div>
            <div>
              <p className="text-sm font-black text-white">Partial Payment Recorded</p>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Rs. {fmt(printSession.total)} · {printSession.items.length} item{printSession.items.length !== 1 ? 's' : ''} paid
              </p>
            </div>
          </div>
        </div>
      )}

    </>
  );
};

export default ReviewScreen;

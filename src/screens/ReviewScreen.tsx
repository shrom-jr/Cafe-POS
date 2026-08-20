import { useState, useMemo, useRef, useEffect } from 'react';
import { type PrintJob } from '@/utils/printEngine';
import { fireSilentPrintJob } from '@/utils/silentPrint';
import { useParams, useNavigate } from 'react-router-dom';
import { usePOSStore } from '@/store/usePOSStore';
import { useStaffStore } from '@/store/useStaffStore';
import { useOrders } from '@/hooks/useOrders';
import { useTables } from '@/hooks/useTables';
import { useCustomerStore } from '@/store/useCustomerStore';
import { calcBill } from '@/utils/calcBill';
import { fmt, resolvePaymentLabel } from '@/utils/format';
import { getStaffName } from '@/utils/staffName';
import { toRepaymentMethod } from '@/utils/repaymentMethod';
import { tableDisplayName } from '@/utils/tableName';
import { playBillSettled } from '@/utils/sounds';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronDown, ChevronUp, Banknote, Smartphone,
  CheckCircle2, Home, X, Loader2, Printer, Check, UserCircle, FileText, Lock,
} from 'lucide-react';
import AdminPinGate from '@/components/ui/AdminPinGate';
import { OrderItem, TablePayment } from '@/types/pos';
import { isSelectiveResetMarkersHydrated } from '@/utils/firebaseSync';

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

  const { addToCustomerDue } = useCustomerStore();

  const table = tables.find((t) => t.id === tableId);
  const order = tableId ? getActiveOrder(tableId) : undefined;
  const attachedCustomer = order?.attachedCustomer ?? null;

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

  // ── Admin discount gate ────────────────────────────────────────────────────
  const [discountUnlocked, setDiscountUnlocked]         = useState(useStaffStore.getState().currentUser?.role === 'ADMIN');
  const [showDiscountGate, setShowDiscountGate]         = useState(false);
  const [pendingDiscountAction, setPendingDiscountAction] = useState<(() => void) | null>(null);

  const gateDiscount = (action: () => void) => {
    if (discountUnlocked) { action(); return; }
    setPendingDiscountAction(() => action);
    setShowDiscountGate(true);
  };

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
    amountAddedToCredit?: number;
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

  // ── Khatta / Customer state ───────────────────────────────────
  const currentUser = useStaffStore((s) => s.currentUser);
  const canSettleDues = currentUser?.permissions.canSettleDues === true;
  const isSplitMode = selectedQty.size > 0;
  const [includePrevDue, setIncludePrevDue] = useState(false);

  // The customer snapshot on the order is a point-in-time copy and goes stale as
  // soon as a due is collected elsewhere, so every amount we show, encode in a QR
  // payload, or charge is driven by the live balance in the customer store.
  const outstandingDue = useCustomerStore((s) =>
    attachedCustomer ? s.customers.find((c) => c.id === attachedCustomer.id)?.currentDue ?? 0 : 0
  );

  // Settling a previous due needs the whole order to be closed in one go, so the
  // option is withdrawn during split payments and for staff without permission.
  const canIncludePrevDue = canSettleDues && !isSplitMode && !!attachedCustomer && outstandingDue > 0;
  useEffect(() => {
    if (!canIncludePrevDue && includePrevDue) setIncludePrevDue(false);
  }, [canIncludePrevDue, includePrevDue]);

  const prevDueAmount = canIncludePrevDue && includePrevDue ? outstandingDue : 0;
  /** What the customer actually hands over: this bill plus any due being settled. */
  const chargeTotal = activeBill.total + prevDueAmount;

  // ── Payment state ─────────────────────────────────────────────
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [paid, setPaid] = useState(false);
  const [billNum, setBillNum] = useState(0);
  const [paidAt, setPaidAt] = useState(0);
  const [paidMethod, setPaidMethod] = useState('');
  const [reprinting, setReprinting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showCreditConfirmation, setShowCreditConfirmation] = useState(false);
  const lastPrintJobRef = useRef<PrintJob | null>(null);
  const confirmingRef = useRef(false);
  const [billDetailsOpen, setBillDetailsOpen] = useState(false);
  /** Previous due actually collected in the completed transaction. */
  const [settledDue, setSettledDue] = useState(0);
  /** Cash collected alongside a Credit (khatta) booking — Option D split. */
  const [creditAmountReceived, setCreditAmountReceived] = useState('0');

  const creditCashCollected = Math.min(
    Math.max(0, Math.round((Number(creditAmountReceived) || 0) * 100) / 100),
    bill.total,
  );
  const creditAmountAdded = Math.max(0, Math.round((bill.total - creditCashCollected) * 100) / 100);
  const creditNewBalance = Math.round((outstandingDue + creditAmountAdded) * 100) / 100;

  // The due quoted to the customer when the cashier chose to settle it. If the
  // balance moves afterwards — another device collected part of it — the figure
  // the customer was told (and any QR they are scanning) is stale, so payment is
  // blocked until the cashier acknowledges the new amount.
  const [quotedDue, setQuotedDue] = useState<number | null>(null);
  // Deliberately independent of `includePrevDue`: when the balance drops all the
  // way to zero the settlement option withdraws itself, and the cashier must
  // still be told the quoted figure no longer applies before taking any money.
  const quotedDueStale = quotedDue !== null && quotedDue !== outstandingDue;
  const toggleIncludePrevDue = (checked: boolean) => {
    setIncludePrevDue(checked);
    setQuotedDue(checked ? outstandingDue : null);
  };
  const openQRModal = (methodId: string) => {
    setSelectedMethod(methodId);
    setShowQRModal(true);
  };
  const closeQRModal = () => {
    setShowQRModal(false);
    setSelectedMethod(null);
    setConfirming(false);
  };
  const openCreditConfirmation = () => {
    if (confirming || quotedDueStale) return;
    setCreditAmountReceived('0');
    setShowCreditConfirmation(true);
  };
  const acknowledgeNewAmount = () => setQuotedDue(outstandingDue);
  const staleAmountNotice = quotedDueStale ? (
    <div
      data-testid="banner-amount-changed"
      className="rounded-xl px-3 py-2.5 space-y-2"
      style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)' }}
    >
      <p className="text-xs font-semibold" style={{ color: 'rgba(251,191,36,0.95)' }}>
        Amount changed — {attachedCustomer?.name ?? 'the customer'}'s due is now Rs. {fmt(outstandingDue)}.
        Ask them to rescan for Rs. {fmt(chargeTotal)}.
      </p>
      <button
        onClick={acknowledgeNewAmount}
        data-testid="button-acknowledge-amount"
        className="w-full py-2 rounded-lg text-xs font-black transition-all active:scale-[0.97]"
        style={{ background: 'rgba(251,191,36,0.18)', color: 'rgba(251,191,36,0.95)' }}
      >
        New amount confirmed with customer
      </button>
    </div>
  ) : null;

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
  const handleFixedPreset = (amount: number) => {
    setActivePreset(amount);
    setDiscountMode('fixed');
    setDiscountInput(amount === 0 ? '' : String(amount));
  };
  const clearDiscount = () => {
    setActivePreset(null);
    setDiscountInput('');
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

  // Trigger B: Print Pre-Bill (PRE_BILL layout) — silent ESC/POS dispatch ──
  const handlePrintPreBill = () => {
    void fireSilentPrintJob({
      type: 'PRE_BILL',
      data: {
        cafeName:       settings.cafeName,
        cafeAddress:    settings.cafeAddress,
        cafePan:        settings.cafePan,
        tableNumber,
        timestamp:      Date.now(),
        items:          unpaidItems.map((i) => ({ id: i.id, menuItemId: i.menuItemId, name: i.name, price: i.price, quantity: i.quantity })),
        subtotal:       bill.subtotal,
        discountAmount: bill.discountAmount,
        vatEnabled:     bill.vatEnabled,
        vatAmount:      bill.vatAmount,
        vatRate:        bill.vatRate,
        total:          bill.total,
        logo:           settings.cafeLogo ?? settings.logoUrl ?? settings.logo,
        showLogoOnBill: settings.showLogoOnBill,
      },
    });
  };

  // ── Payment helpers ───────────────────────────────────────────
  const tableNumber = String(table?.number ?? tableId ?? '');
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
      return `eSewa://pay?eSewaID=${settings.esewaPhone || settings.esewaId}&amount=${chargeTotal}&table=${tableNumber}&ref=${reference}`;
    return `pay://${method}?amount=${chargeTotal}&ref=${reference}`;
  };

  const getQRImage = (method: string) => {
    const builtIn = ['esewa', 'khalti', 'fonepay'] as const;
    if (builtIn.includes(method as 'esewa' | 'khalti' | 'fonepay')) {
      return settings.wallets[method as 'esewa' | 'khalti' | 'fonepay']?.qrImage || null;
    }
    const custom = (settings.customWallets || []).find((w) => w.id === method);
    return custom?.qrImage || null;
  };

  const qrProviderTheme = selectedMethod === 'khalti'
    ? {
        modal: 'border-2 border-purple-500/60 shadow-2xl shadow-purple-500/10',
        frame: 'p-3 rounded-2xl bg-white border-4 border-purple-500 shadow-lg',
        title: 'Khalti Payment',
        titleColor: 'text-purple-400',
        button: 'w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-purple-500/30 transition-all active:scale-[0.98]',
      }
    : selectedMethod === 'fonepay'
      ? {
          modal: 'border-2 border-rose-500/60 shadow-2xl shadow-rose-500/10',
          frame: 'p-3 rounded-2xl bg-white border-4 border-rose-500 shadow-lg',
          title: 'Fonepay Payment',
          titleColor: 'text-rose-400',
          button: 'w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-rose-500/30 transition-all active:scale-[0.98]',
        }
      : {
          modal: 'border-2 border-emerald-500/60 shadow-2xl shadow-emerald-500/10',
          frame: 'p-3 rounded-2xl bg-white border-4 border-emerald-500 shadow-lg',
          title: 'eSewa Payment',
          titleColor: 'text-emerald-400',
          button: 'w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.98]',
        };

  const handleConfirmPayment = async (method: string) => {
    if (!isSelectiveResetMarkersHydrated()) {
      toast.info('Syncing reset status. Please try payment again in a moment.');
      return;
    }
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setConfirming(true);

    // Hard guard: the customer's balance moved after they were quoted, so no
    // money changes hands on any payment path until the cashier acknowledges the
    // new figure. Covers the case where the due was cleared entirely elsewhere.
    if (quotedDueStale) {
      toast.error(
        outstandingDue > 0
          ? `${attachedCustomer?.name ?? 'This customer'}'s due changed to Rs. ${fmt(outstandingDue)}. Requote the customer and confirm again.`
          : `${attachedCustomer?.name ?? 'This customer'}'s due was already cleared elsewhere. Review the total and confirm again.`
      );
      confirmingRef.current = false;
      setConfirming(false);
      return;
    }

    // Pay Later books a new due, it never collects one. Letting it run while a
    // previous due is selected would show the customer a combined total that is
    // neither collected nor settled, so the two are mutually exclusive.
    if (method === 'khatta' && prevDueAmount > 0) {
      toast.error('Pay Later cannot settle a previous due. Uncheck "Include Previous Due" or collect the payment now.');
      confirmingRef.current = false;
      setConfirming(false);
      return;
    }

    // ── Credit (Pay Later / Khatta) path ────────────────────────
    if (method === 'khatta' && attachedCustomer) {
      const bn = getNextBillNumber();
      const now = Date.now();
      const cashCollected = Math.min(
        Math.max(0, Math.round((Number(creditAmountReceived) || 0) * 100) / 100),
        bill.total,
      );
      const amountAddedToCredit = Math.max(0, Math.round((bill.total - cashCollected) * 100) / 100);
      const liveUser = useStaffStore.getState().currentUser;
      const processedBy = liveUser
        ? { id: liveUser.id, name: getStaffName(liveUser), role: liveUser.role }
        : undefined;
      const settlementSucceeded = addPayment({
        orderId: orderIdRef.current,
        tableNumber,
        items: [...unpaidItems],
        subtotal: bill.subtotal,
        discount: discountValue,
        discountType: discountMode,
        vatAmount: bill.vatAmount,
        vatRate: bill.vatRate,
        vatMode: bill.vatMode,
        vatEnabled: bill.vatEnabled,
        total: bill.total,
        method: 'khatta',
        reference: `CREDIT-${attachedCustomer.name}`,
        createdAt: now,
        cafeName: settings.cafeName,
        billNumber: bn,
        takenBy: order?.takenBy,
        processedBy,
        customerId: attachedCustomer.id,
      });
      if (!settlementSucceeded) {
        toast.error('This payment was already submitted or the order is being settled. Please check the order status.');
        confirmingRef.current = false;
        setConfirming(false);
        return;
      }
      const khattaItemIds = unpaidItems.map((i) => i.menuItemId);
      const khattaTablePayment: TablePayment = {
        id: crypto.randomUUID(),
        itemIds: khattaItemIds,
        total: bill.total,
        method: 'khatta',
        timestamp: now,
        billNumber: bn,
      };
      markItemsPaid(orderIdRef.current, khattaItemIds, khattaTablePayment);
      // Adds today's bill to the customer's running credit balance.
      addToCustomerDue(attachedCustomer.id, bill.total);

      // Option D — partial cash received alongside the credit booking.
      // After addToCustomerDue the live balance = oldDue + today's bill.
      // Apply the partial payment against that combined figure.
      if (cashCollected > 0) {
        const liveDue = useCustomerStore.getState().getCustomer(attachedCustomer.id)?.currentDue ?? 0;
        const safeAmount = Math.min(cashCollected, liveDue);
        if (safeAmount > 0) {
          useCustomerStore.getState().receiveRepayment({
            customerId: attachedCustomer.id,
            amount: safeAmount,
            method: 'cash',
            notes: `Partial cash at credit booking · Bill #${bn}`,
            receivedBy: processedBy,
          });
        }
      }

      const session = {
        items: [...unpaidItems],
        billNum: bn,
        paidAt: now,
        paidMethod: `CREDIT · ${attachedCustomer.name}`,
        subtotal: bill.subtotal,
        discountAmount: bill.discountAmount,
        vatAmount: bill.vatAmount,
        vatRate: bill.vatRate,
        vatEnabled: bill.vatEnabled,
        total: bill.total,
        amountAddedToCredit,
      };
      setPrintSession(session);
      const creditTaxJob: PrintJob = {
        type: 'TAX_INVOICE',
        data: {
          cafeName: settings.cafeName,
          cafeAddress: settings.cafeAddress,
          cafePan: settings.cafePan,
          billFooter: settings.billFooter,
          tableNumber,
          billNumber: bn,
          timestamp: now,
          items: unpaidItems.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
          subtotal: bill.subtotal,
          discountAmount: bill.discountAmount,
          vatEnabled: bill.vatEnabled,
          vatAmount: bill.vatAmount,
          vatRate: bill.vatRate,
          total: bill.total,
          method: 'Credit',
          creditSettlement: { customerName: attachedCustomer.name, amount: amountAddedToCredit },
          takenBy: order?.takenBy,
          processedBy,
          logo: settings.cafeLogo ?? settings.logoUrl ?? settings.logo,
          showLogoOnBill: settings.showLogoOnBill,
        },
      };
      lastPrintJobRef.current = creditTaxJob;
      updateOrderStatus(orderIdRef.current, 'paid');
      playBillSettled();
      setBillNum(bn);
      setPaidAt(now);
      setPaidMethod(`CREDIT · ${attachedCustomer.name}`);
      setQuotedDue(null);
      setShowCreditConfirmation(false);
      setConfirming(false);
      confirmingRef.current = false;
      setPaid(true);
      if (tableId) resetTable(tableId);
      void fireSilentPrintJob(creditTaxJob);
      return;
    }

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

    // ── Previous-due settlement ─────────────────────────────────
    // Recorded BEFORE the order payment so the amount we claim to have
    // collected can never exceed what the ledger actually accepted. The
    // permission is re-checked against live state, not just the hidden UI.
    let dueSettlement: { customerId: string; amount: number; repaymentId: string } | undefined;
    if (prevDueAmount > 0 && attachedCustomer && !isSplit) {
      const liveStaff = useStaffStore.getState().currentUser;
      if (liveStaff?.permissions.canSettleDues !== true) {
        toast.error('You do not have permission to settle customer dues.');
        confirmingRef.current = false;
        setConfirming(false);
        return;
      }
      const customerState = useCustomerStore.getState();
      const liveDue = customerState.getCustomer(attachedCustomer.id)?.currentDue ?? 0;
      // The balance moved between the figure quoted to the customer and this
      // confirmation (another device collected part of it). Never silently charge
      // or settle a different amount than the one quoted — make the cashier requote.
      if (liveDue !== quotedDue || liveDue !== prevDueAmount) {
        toast.error(
          liveDue > 0
            ? `${attachedCustomer.name}'s due changed to Rs. ${fmt(liveDue)}. Requote the customer and confirm again.`
            : `${attachedCustomer.name}'s due was already cleared elsewhere. Review the total and confirm again.`
        );
        confirmingRef.current = false;
        setConfirming(false);
        return;
      }
      const settleAmount = liveDue;
      if (settleAmount > 0) {
        const result = customerState.receiveRepayment({
          customerId: attachedCustomer.id,
          amount: settleAmount,
          method: toRepaymentMethod(method),
          notes: `Previous due settled at checkout · Bill #${bn} · ${resolvedMethod}`,
          receivedBy: processedBy,
        });
        if (!result.ok) {
          toast.error(result.error);
          confirmingRef.current = false;
          setConfirming(false);
          return;
        }
        dueSettlement = {
          customerId: attachedCustomer.id,
          amount: result.repayment.amount,
          repaymentId: result.repayment.id,
        };
      }
    }
    const settledAmount = dueSettlement?.amount ?? 0;
    const tenderedTotal = payBill.total + settledAmount;

    const settlementSucceeded = addPayment({
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
      // `total` stays the order revenue — the settled due was already booked as
      // revenue by the original Khatta charge and must not be counted twice.
      total: payBill.total,
      method,
      reference,
      createdAt: now,
      cafeName: settings.cafeName,
      billNumber: bn,
      takenBy,
      processedBy,
      ...(dueSettlement ? { dueSettlement, amountTendered: tenderedTotal } : {}),
    });
    if (!settlementSucceeded) {
      toast.error('This payment was already submitted or the order is being settled. Please check the order status.');
      confirmingRef.current = false;
      setConfirming(false);
      return;
    }

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
        ...(dueSettlement
          ? {
              dueSettlement: { customerName: attachedCustomer?.name, amount: dueSettlement.amount },
              amountTendered: tenderedTotal,
            }
          : {}),
        takenBy,
        processedBy,
        logo:           settings.cafeLogo ?? settings.logoUrl ?? settings.logo,
        showLogoOnBill: settings.showLogoOnBill,
      },
    };
    lastPrintJobRef.current = taxJob;

    playBillSettled();
    setShowQRModal(false);

    if (allDone) {
      updateOrderStatus(orderIdRef.current, 'paid');
      setBillNum(bn);
      setPaidAt(now);
      setPaidMethod(resolvedMethod);
      setQuotedDue(null);
      setPaid(true);
      if (tableId) resetTable(tableId);
      if (payItems.length > 0) void fireSilentPrintJob(taxJob);
      if (settledAmount > 0) {
        setSettledDue(settledAmount);
        toast.success(`Rs. ${fmt(settledAmount)} previous due settled for ${attachedCustomer?.name ?? 'customer'}.`);
      }
    } else {
      setSelectedQty(new Map());
      confirmingRef.current = false;
      setConfirming(false);
      setPartialSuccess(true);
      if (payItems.length > 0) void fireSilentPrintJob(taxJob);
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
      if (lastPrintJobRef.current) void fireSilentPrintJob(lastPrintJobRef.current);
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
        {printSession?.amountAddedToCredit !== undefined && (
          <div className="flex justify-between items-center border-t border-dashed border-border/60 pt-1.5" data-testid="text-amount-added-to-credit">
            <span className={`font-semibold text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>Amount Added to Credit</span>
            <span className={`font-black text-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
              Rs. {fmt(printSession.amountAddedToCredit)}
            </span>
          </div>
        )}
        {settledDue > 0 && (
          <div className="space-y-1 border-t border-dashed border-border/60 pt-1.5" data-testid="text-settled-due">
            <div className="flex justify-between items-center">
              <span className={`font-semibold text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>Previous Due Settled</span>
              <span className={`font-bold text-foreground ${compact ? 'text-xs' : 'text-sm'}`}>Rs. {fmt(settledDue)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className={`font-semibold text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>Amount Collected</span>
              <span className={`font-black text-foreground ${compact ? 'text-base' : 'text-lg'}`}>
                Rs. {fmt((printSession?.total ?? 0) + settledDue)}
              </span>
            </div>
          </div>
        )}
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
            className={`p-4 rounded-2xl bg-[#181B26] border border-white/10 hover:border-white/20 transition-all flex items-center justify-between mb-2.5 shadow-sm gap-3 select-none ${!isPaid ? 'cursor-pointer' : ''}`}
            style={{
              opacity: isPaid ? 0.4 : 1,
              background: isSelected ? 'rgba(245,158,11,0.16)' : isPaid ? 'rgba(255,255,255,0.03)' : '#181B26',
              borderColor: isSelected ? 'rgba(251,191,36,0.65)' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.1s ease, border-color 0.1s ease',
            }}
            onClick={() => !isPaid && item.id && toggleItemSelection(item.id, item.quantity)}
          >
            {!isPaid && (
              <div
                className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center"
                style={{
                  background: isSelected ? 'rgba(245,158,11,0.95)' : 'rgba(255,255,255,0.05)',
                  border: isSelected ? '1.5px solid rgba(251,191,36,1)' : '1.5px solid rgba(255,255,255,0.2)',
                }}
              >
                {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
              </div>
            )}
            {isPaid && <div className="flex-shrink-0 w-4 h-4" />}
            <div className="flex-1 min-w-0">
              <p
                className={`text-base font-black tracking-wide truncate ${isPaid ? 'line-through' : ''}`}
                style={{ color: isPaid ? 'rgba(255,255,255,0.4)' : '#ffffff' }}
              >
                {item.name}
                {isPaid && <span className="ml-2 text-[10px] font-bold not-italic" style={{ color: '#34d399' }}>PAID</span>}
              </p>
              <p className="text-xs font-bold font-mono text-zinc-200 mt-0.5">
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
              className="text-base font-black text-amber-400 font-mono tracking-tight tabular-nums whitespace-nowrap ml-2"
              style={{ opacity: isPaid ? 0.5 : 1 }}
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
      return <div className="flex flex-col">{itemRows}</div>;
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
          className="relative rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            padding: compact ? '5px 6px' : '6px 8px',
          }}
        >
          {!discountUnlocked && (
            <button
              onClick={() => setShowDiscountGate(true)}
              className="absolute inset-0 z-10 rounded-xl flex items-center justify-center gap-1.5 hover:bg-white/5 transition-colors"
              aria-label="Admin PIN required to apply discount"
            >
              <Lock size={11} style={{ color: '#c084fc' }} />
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#c084fc' }}>
                Admin required
              </span>
            </button>
          )}
          <div
            className={!discountUnlocked ? 'opacity-25 pointer-events-none select-none' : ''}
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
                  onClick={() => pct === 0 ? handlePreset(pct) : gateDiscount(() => handlePreset(pct))}
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

  // ── Customer card (Credit) ─────────────────────────────────────
  const getCustomerCard = () => {
    if (!attachedCustomer) return null;
    return (
      <div
        className="rounded-2xl px-4 py-3 flex-shrink-0"
        style={{
          background: 'rgba(59,130,246,0.07)',
          border: '1px solid rgba(59,130,246,0.2)',
        }}
      >
        {/* Customer header */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-black text-base flex-shrink-0"
            style={{ background: 'rgba(59,130,246,0.22)', color: 'rgba(147,197,253,0.95)' }}
          >
            {attachedCustomer.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{attachedCustomer.name}</p>
            <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.65)' }}>
              {attachedCustomer.phone || 'No phone'}
            </p>
          </div>
          {/* Live credit balance — prominently shown */}
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(148,163,184,0.55)' }}>
              Credit Balance
            </p>
            <p
              className="text-base font-black tabular-nums leading-tight"
              style={{ color: outstandingDue > 0 ? '#f87171' : '#34d399' }}
            >
              {outstandingDue > 0 ? `Rs. ${fmt(outstandingDue)}` : '✓ Clear'}
            </p>
          </div>
        </div>

        {/* Merge Past Credit checkbox — settling requires permission */}
        {outstandingDue > 0 && !canIncludePrevDue && (
          <p className="text-xs font-medium" style={{ color: 'rgba(251,191,36,0.75)' }}>
            Rs. {fmt(outstandingDue)} outstanding credit
            {!canSettleDues
              ? ' — you do not have permission to settle dues'
              : isSplitMode
                ? ' — settle dues on a full payment, not a split'
                : ''}
          </p>
        )}
        {canIncludePrevDue && (
          <label
            className="flex items-center gap-3 py-2 px-2 rounded-xl cursor-pointer transition-all"
            style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}
          >
            <input
              type="checkbox"
              data-testid="checkbox-include-prev-due"
              checked={includePrevDue}
              onChange={(e) => toggleIncludePrevDue(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-400 cursor-pointer flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'rgba(251,191,36,0.9)' }}>
                Merge Past Credit (+ Rs. {fmt(outstandingDue)})
              </p>
              <p className="text-[11px]" style={{ color: 'rgba(251,191,36,0.6)' }}>
                Collect full balance now in one payment
              </p>
            </div>
            {includePrevDue && (
              <span
                className="flex-shrink-0 text-xs font-black"
                style={{ color: 'rgba(251,191,36,0.9)' }}
                data-testid="text-charge-total"
              >
                Total Rs. {fmt(chargeTotal)}
              </span>
            )}
          </label>
        )}
        {outstandingDue === 0 && (
          <p className="text-xs font-medium" style={{ color: 'rgba(52,211,153,0.7)' }}>
            ✓ No outstanding credit — account is clear
          </p>
        )}
        {includePrevDue && (
          <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.45)' }} data-testid="text-khatta-unavailable">
            Credit booking is unavailable while merging past credit — collect the full amount now.
          </p>
        )}
        {quotedDueStale && <div className="mt-2">{staleAmountNotice}</div>}
      </div>
    );
  };

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
          disabled={confirming || quotedDueStale}
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

        {/* Credit (Pay Later) — only when customer attached and not merging past credit */}
        {attachedCustomer && !selectedQty.size && !includePrevDue && (
            <button
              onClick={openCreditConfirmation}
              data-testid="button-payment-method-khatta"
              disabled={confirming || quotedDueStale}
              className={`flex items-center gap-[10px] px-3 ${compact ? 'py-2' : 'py-2.5'} rounded-xl transition-all duration-100 active:scale-[0.97] hover:brightness-110 disabled:opacity-40`}
              style={{
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.28)',
                boxShadow: '0 2px 12px -4px rgba(251,191,36,0.15)',
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(251,191,36,0.14)', border: '1px solid rgba(251,191,36,0.22)' }}
              >
                <FileText size={18} style={{ color: 'hsl(32 90% 68%)' }} />
              </div>
              <div className="text-left min-w-0">
                <p className="font-bold text-sm leading-tight" style={{ color: 'hsl(32 90% 68%)' }}>Credit</p>
                <p className="text-[10px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.38)' }}>
                  {attachedCustomer.name.split(' ')[0]}
                </p>
              </div>
            </button>
        )}

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
              onClick={() => { if (!confirming) openQRModal(id); }}
              data-testid={`button-payment-method-${id}`}
              disabled={confirming || quotedDueStale}
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
       <div className="h-screen w-full bg-[#0A0B0E] p-4 flex flex-col justify-between overflow-hidden text-white">
        {/* Header */}
         <div className="flex items-center gap-3 mb-3 flex-shrink-0">
          <button
            onClick={() => navigate(`/order/${tableId}`)}
             className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-black text-xs uppercase tracking-wider transition-all active:scale-95"
          >
            <ChevronLeft size={17} />
          </button>
           <div className="min-w-0">
             <p className="text-xl font-black text-white tracking-tight truncate">
               Review Order &amp; Settle • Table {tableDisplayName(table.number)}
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
                    {prevDueAmount > 0 ? 'To Collect' : 'Total'}
                    {selectedQty.size > 0 && (
                      <span className="ml-2 normal-case font-semibold tracking-normal" style={{ color: 'rgba(147,197,253,0.65)' }}>
                        {selectedQty.size} item{selectedQty.size !== 1 ? 's' : ''}
                      </span>
                    )}
                    {prevDueAmount > 0 && (
                      <span className="ml-2 normal-case font-semibold tracking-normal" style={{ color: 'rgba(251,191,36,0.7)' }}>
                        incl. Rs. {fmt(prevDueAmount)} due
                      </span>
                    )}
                  </span>
                  <span className="text-[24px] font-black tracking-tight leading-none tabular-nums" style={{ color: '#ffffff' }}>
                    Rs. {fmt(chargeTotal)}
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

                {/* Customer (Khatta) card — landscape */}
                {getCustomerCard()}

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
                        disabled={confirming || quotedDueStale}
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

                      {/* Credit (Pay Later) — landscape inline, only if customer attached */}
                      {attachedCustomer && !selectedQty.size && !includePrevDue && (
                          <button
                            onClick={openCreditConfirmation}
                            data-testid="button-payment-method-khatta"
                            disabled={confirming || quotedDueStale}
                            className="flex items-center gap-[10px] px-3 py-2 rounded-lg transition-all duration-100 active:scale-[0.97] hover:brightness-110 disabled:opacity-40"
                            style={{
                              background: 'rgba(251,191,36,0.08)',
                              border: '1px solid rgba(251,191,36,0.28)',
                              boxShadow: '0 2px 10px -4px rgba(251,191,36,0.15)',
                            }}
                          >
                            <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                              style={{ background: 'rgba(251,191,36,0.14)', border: '1px solid rgba(251,191,36,0.22)' }}>
                              <FileText size={18} style={{ color: 'hsl(32 90% 68%)' }} />
                            </div>
                            <div className="text-left min-w-0">
                              <p className="font-bold text-sm leading-tight" style={{ color: 'hsl(32 90% 68%)' }}>Credit</p>
                              <p className="text-[10px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                {attachedCustomer.name.split(' ')[0]}
                              </p>
                            </div>
                          </button>
                      )}

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
                            onClick={() => { if (!confirming) openQRModal(id); }}
                            data-testid={`button-payment-method-${id}`}
                            disabled={confirming || quotedDueStale}
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
                      <div className="relative">
                        {!discountUnlocked && (
                          <button onClick={() => setShowDiscountGate(true)} className="absolute inset-0 z-10 rounded flex items-center justify-center gap-1 hover:bg-white/5 transition-colors">
                            <Lock size={10} style={{ color: '#c084fc' }} />
                            <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: '#c084fc' }}>Admin required</span>
                          </button>
                        )}
                      <div className={`flex gap-1.5 items-center${!discountUnlocked ? ' opacity-25 pointer-events-none select-none' : ''}`}>
                        <div className="flex gap-1">
                          {PRESETS.map((pct) => {
                            const isActive = activePreset === pct && discountMode === 'percent';
                            return (
                              <button
                                key={pct}
                                onClick={() => pct === 0 ? handlePreset(pct) : gateDiscount(() => handlePreset(pct))}
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
                  {getCustomerCard()}
                  {getPaymentCard()}
                </div>
              </div>

              {/* Tablet/Desktop layout (≥ 768px): card-based grid */}
              <div className="hidden md:grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 w-full max-w-7xl mx-auto items-stretch overflow-hidden">

                    {/* ── LEFT: Items card ── */}
                    <div className="col-span-12 lg:col-span-6 bg-[#13151F] border border-white/15 p-5 rounded-3xl shadow-xl flex flex-col h-full min-h-0">
                      {/* Card header — fixed */}
                      <div
                        className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center justify-between flex-shrink-0 pb-2 border-b border-white/10"
                      >
                         <p className="text-sm font-black uppercase tracking-wider text-amber-400">
                          Order Items
                        </p>
                        <span
                           className="px-3 py-0.5 rounded-full bg-white/10 border border-white/15 text-xs font-black text-white font-mono"
                        >
                          {items.length}
                        </span>
                      </div>
                      {/* Scrollable item rows */}
                      <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1 mt-3 overscroll-contain">
                        <div className="pb-2">
                          {getItemsCard(true)}
                        </div>
                      </div>
                    </div>

                    {/* ── RIGHT: Summary + Payment cards stacked ── */}
                    <div className="col-span-12 lg:col-span-6 bg-[#13151F] border border-white/15 p-5 rounded-3xl shadow-xl flex flex-col justify-between h-full min-h-0 gap-3 overflow-hidden">

                      {/* ── Summary card ── */}
                      <div className="flex flex-col gap-3 flex-shrink-0">
                        <p className="text-xs font-black uppercase tracking-widest text-amber-400 mb-1">
                          Order Summary
                        </p>

                        {/* Subtotal */}
                         <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-zinc-200 py-2 border-b border-white/10">
                           <span>Subtotal</span>
                           <span className="text-base font-black text-white font-mono tabular-nums">
                            Rs. {fmt(bill.subtotal)}
                          </span>
                        </div>

                        {/* Discount */}
                         <div className="relative py-2 border-b border-white/10">
                            {!discountUnlocked && (
                              <button onClick={() => setShowDiscountGate(true)} className="absolute inset-0 z-10 flex items-center justify-center gap-1.5 hover:bg-white/5 transition-colors rounded">
                                <Lock size={12} style={{ color: '#c084fc' }} />
                                <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#c084fc' }}>Admin required</span>
                              </button>
                            )}
                            <div className={!discountUnlocked ? 'opacity-25 pointer-events-none select-none' : ''}>
                           <div className="flex items-center justify-between">
                             <span className="text-xs font-black uppercase tracking-wider text-zinc-200">Discount</span>
                             <span className="text-sm font-black text-rose-400 font-mono tabular-nums">
                               - Rs. {fmt(bill.discountAmount)}
                             </span>
                           </div>
                           <div className="flex items-center gap-2 bg-[#181B26] p-1.5 rounded-2xl border border-white/15 mt-2">
                             <button
                               onClick={() => handleModeToggle('fixed')}
                                className={`flex-1 py-1.5 rounded-xl text-xs uppercase tracking-wider transition-all text-center ${discountMode === 'fixed' ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-zinc-300 hover:text-white font-bold'}`}
                             >
                               CASH DISCOUNT (RS.)
                             </button>
                             <button
                               onClick={() => handleModeToggle('percent')}
                                className={`flex-1 py-1.5 rounded-xl text-xs uppercase tracking-wider transition-all text-center ${discountMode === 'percent' ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-zinc-300 hover:text-white font-bold'}`}
                             >
                               % PERCENTAGE (%)
                             </button>
                           </div>
                            <div className="flex items-stretch mt-2 rounded-xl bg-[#181B26] border-2 border-white/20 focus-within:border-amber-400 overflow-hidden">
                              <span className="px-3 flex items-center text-sm font-black text-amber-400 font-mono">
                                {discountMode === 'fixed' ? 'Rs.' : '%'}
                              </span>
                             <input
                               type="number"
                               min="0"
                               inputMode="decimal"
                                placeholder="0"
                               value={discountInput}
                               onChange={(e) => handleInputChange(e.target.value)}
                                className="w-full bg-[#181B26] text-white font-black text-base font-mono py-2.5 px-3 outline-none"
                             />
                           </div>
                           <div className="flex flex-wrap gap-2 mt-2">
                             {(discountMode === 'fixed' ? [50, 100, 200] : [5, 10, 15]).map((value) => {
                               const isActive = activePreset === value && discountMode === (discountMode === 'fixed' ? 'fixed' : 'percent');
                               return (
                                 <button
                                   key={value}
                                   onClick={() => gateDiscount(() => discountMode === 'fixed' ? handleFixedPreset(value) : handlePreset(value))}
                                    className={`px-3.5 py-1.5 rounded-xl border border-white/15 text-xs font-bold text-zinc-100 transition-all cursor-pointer ${isActive ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-white/10 hover:bg-amber-500 hover:text-slate-950'}`}
                                 >
                                   {discountMode === 'fixed' ? `Rs. ${value}` : `${value}%`}
                                 </button>
                               );
                             })}
                             <button
                               onClick={clearDiscount}
                                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-amber-500 hover:text-slate-950 border border-white/15 text-xs font-bold text-zinc-100 transition-all cursor-pointer"
                             >
                                ✕ Clear
                             </button>
                           </div>
                            </div>
                         </div>

                        {/* VAT */}
                        {bill.vatEnabled && (
                           <div className="flex justify-between items-center py-2 border-b border-white/10">
                             <span className="text-xs font-black uppercase tracking-wider text-zinc-200">
                              VAT ({Math.round(bill.vatRate * 100)}%)
                            </span>
                             <span className="text-base font-black text-white font-mono tabular-nums">
                              Rs. {fmt(bill.vatAmount)}
                            </span>
                          </div>
                        )}

                        {/* TOTAL — dominant with top separator */}
                         <div className="flex justify-between items-end border-t border-white/10 pt-4 mt-2">
                          <span
                             className="text-xs font-black uppercase tracking-widest text-amber-400 pb-1"
                          >
                            {selectedQty.size > 0 ? 'Split Total' : prevDueAmount > 0 ? 'To Collect' : 'Total'}
                          </span>
                          <span
                             className="text-4xl font-black text-white font-mono tracking-tight tabular-nums leading-none"
                          >
                            Rs. {fmt(chargeTotal)}
                          </span>
                        </div>
                        {selectedQty.size > 0 && (
                          <p className="text-xs text-right mt-1.5" style={{ color: 'rgba(147,197,253,0.6)' }}>
                            {selectedQty.size} item{selectedQty.size !== 1 ? 's' : ''} selected for split payment
                          </p>
                        )}
                        {prevDueAmount > 0 && (
                          <p className="text-xs text-right mt-1.5" style={{ color: 'rgba(251,191,36,0.7)' }}>
                            Rs. {fmt(activeBill.total)} bill + Rs. {fmt(prevDueAmount)} previous due
                          </p>
                        )}
                      </div>

                      {/* Trigger B: Print Pre-Bill (tablet) */}
                      <button
                        type="button"
                        onClick={handlePrintPreBill}
                        data-testid="button-print-pre-bill"
                        className="w-full py-3.5 rounded-2xl bg-[#181B26] hover:bg-amber-500 hover:text-slate-950 border-2 border-white/20 hover:border-amber-400 text-white font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2.5 active:scale-[0.98] cursor-pointer group"
                      >
                        <Printer className="w-4 h-4 text-amber-400 group-hover:text-slate-950 transition-colors" />
                        <span>Print Guest Pre-Bill</span>
                      </button>

                      {/* ── Payment card ── */}
                        <div className="flex flex-col gap-2 mt-1 min-h-0 overflow-hidden">
                        {/* Fixed label */}
                         <div className="flex-shrink-0 mb-1">
                           <p className="text-xs font-black uppercase tracking-widest text-amber-400">
                            Payment Method
                          </p>
                        </div>
                        {/* Scrollable buttons area */}
                          <div className="flex-1 min-h-0 overflow-hidden">
                           <div className="grid grid-cols-2 gap-2.5 mt-2">

                        {/* Unified 2-column grid — Cash + all digital wallets */}
                          {/* Cash */}
                          <button
                            onClick={() => handleConfirmPayment('cash')}
                            disabled={confirming || quotedDueStale}
                            data-testid="button-payment-method-cash"
                             className="p-3 rounded-2xl bg-[#0F1916] border-2 border-emerald-500/40 hover:border-emerald-400 flex items-center gap-2.5 transition-all cursor-pointer group shadow-md shadow-emerald-500/5 disabled:opacity-40"
                            style={{
                               minHeight: 54,
                               padding: '10px 12px',
                               background: '#0F1916',
                               border: '2px solid rgba(16,185,129,0.4)',
                               boxShadow: '0 8px 20px rgba(16,185,129,0.05)',
                              ['--card-hover-shadow' as string]: '0 14px 32px rgba(16,185,129,0.4), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                            }}
                          >
                            <div className="text-left min-w-0">
                                <p className="text-xs font-black text-white group-hover:text-emerald-200">Cash</p>
                                <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Tap to pay</p>
                            </div>
                          </button>

                          {/* Credit (Pay Later) — tablet inline */}
                          {attachedCustomer && !selectedQty.size && !includePrevDue && (() => {
                            const creditColor = 'hsl(32 90% 68%)';
                            return (
                                <button
                                  onClick={openCreditConfirmation}
                                  data-testid="button-payment-method-khatta"
                                  disabled={confirming || quotedDueStale}
                                    className="p-3 rounded-2xl bg-[#181510] border-2 border-amber-500/40 hover:border-amber-400 flex items-center gap-2.5 transition-all cursor-pointer group shadow-md shadow-amber-500/5 disabled:opacity-40"
                                  style={{
                                    minHeight: 54,
                                    padding: '10px 12px',
                                     background: '#181510',
                                     border: '2px solid rgba(245,158,11,0.4)',
                                     boxShadow: '0 8px 20px rgba(245,158,11,0.05)',
                                  }}
                                >
                                  <div style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(251,191,36,0.18)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <FileText size={20} style={{ color: creditColor }} />
                                  </div>
                                  <div className="text-left min-w-0">
                                      <p className="text-xs font-black text-white group-hover:text-amber-200">Credit</p>
                                      <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wider truncate">{attachedCustomer.name.split(' ')[0]}</p>
                                  </div>
                                </button>
                            );
                          })()}

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
                                onClick={() => { if (!confirming) openQRModal(id); }}
                                data-testid={`button-payment-method-${id}`}
                                disabled={confirming || quotedDueStale}
                                  className={`p-3 rounded-2xl border-2 flex items-center gap-2.5 transition-all cursor-pointer group shadow-md disabled:opacity-40 ${
                                   id === 'esewa'
                                         ? 'bg-[#0F1916] border-emerald-500/40 hover:border-emerald-400 shadow-emerald-500/5'
                                     : id === 'khalti'
                                       ? 'bg-[#161224] border-purple-500/40 hover:border-purple-400 shadow-purple-500/5'
                                       : id === 'fonepay'
                                          ? 'p-3.5 rounded-2xl bg-[#1A1116] border-2 border-rose-500/40 hover:border-rose-400 flex flex-col justify-center gap-0.5 transition-all cursor-pointer shadow-md'
                                         : 'bg-[#13151F] border-white/15 hover:border-white/30'
                                 }`}
                                style={{
                                  minHeight: 54,
                                  padding: '10px 12px',
                                   background: id === 'esewa' ? '#0F1916' : id === 'khalti' ? '#161224' : id === 'fonepay' ? '#1A1116' : '#13151F',
                                   border: `2px solid ${b.border}`,
                                   boxShadow: b.shadow,
                                  ['--card-hover-shadow' as string]: b.hoverShadow,
                                }}
                              >
                                 {logoImage && (
                                   <div
                                     style={{
                                       width: 30, height: 30,
                                       borderRadius: 10,
                                       background: b.iconBg,
                                       boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                                       display: 'flex', alignItems: 'center', justifyContent: 'center',
                                       flexShrink: 0,
                                       overflow: 'hidden',
                                     }}
                                   >
                                     <img src={logoImage} alt={label} className="w-full h-full object-contain p-0.5" />
                                   </div>
                                 )}
                                <div className="text-left min-w-0">
                                    <p className="text-xs font-black text-white group-hover:text-emerald-200 uppercase tracking-wider" style={{ color: id === 'khalti' ? '#e9d5ff' : id === 'fonepay' ? '#fecdd3' : '#ffffff' }}>{label}</p>
                                   <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: id === 'khalti' ? '#d8b4fe' : id === 'fonepay' ? '#fda4af' : '#a7f3d0' }}>Scan QR</p>
                                </div>
                              </button>
                            );
                          })}
                         </div>
                         </div>
                      </div>{/* end payment card */}

                     </div>
                   </div>
              </>
          )}
        </div>
      </div>

      {/* QR Modal */}
      {showCreditConfirmation && attachedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div
            className="max-w-md w-full p-6 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col gap-4"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(251,191,36,0.14)', color: 'hsl(32 90% 68%)' }}
              >
                <FileText size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-black text-white flex items-center gap-2">Confirm Credit Settlement</h3>
                <p className="text-xs font-bold text-zinc-300 mt-0.5">This order will be added to the customer ledger.</p>
              </div>
              <button
                onClick={() => setShowCreditConfirmation(false)}
                disabled={confirming}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <X size={17} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="p-4 rounded-2xl bg-[#181B26] border border-white/15 flex items-center justify-between shadow-inner">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-black text-amber-300 truncate">{attachedCustomer.name}</p>
                    <p className="text-xs font-mono font-bold text-zinc-200 mt-0.5">{attachedCustomer.phone || 'No phone number'}</p>
                  </div>
                  <FileText size={18} className="text-amber-300 flex-shrink-0" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-black uppercase text-zinc-300">
                  <span>Today's Order Total</span>
                  <span className="text-sm font-black text-white font-mono tabular-nums">Rs. {fmt(bill.total)}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-black uppercase text-zinc-300">
                  <span>Customer Existing Due</span>
                  <span className="text-sm font-black text-rose-400 font-mono tabular-nums">Rs. {fmt(outstandingDue)}</span>
                </div>
                <div className="flex items-center justify-between text-xs font-black uppercase text-rose-300 pt-2 border-t border-white/10">
                  <span>New Total Due Balance</span>
                  <span className="text-base font-black text-rose-400 font-mono drop-shadow-[0_0_8px_rgba(244,63,94,0.3)] tabular-nums">Rs. {fmt(creditNewBalance)}</span>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400 block mb-1">Cash Collected Today (Rs.)</span>
                <input
                  type="number"
                  min="0"
                  max={bill.total}
                  step="0.01"
                  inputMode="decimal"
                  value={creditAmountReceived}
                  onChange={(e) => setCreditAmountReceived(e.target.value)}
                  className="w-full bg-[#181B26] border-2 border-white/20 focus:border-amber-400 text-white font-bold rounded-xl px-4 py-3 text-base font-mono outline-none"
                  autoFocus
                />
              </label>

              <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between text-amber-300 font-black text-sm">
                <span>Net Amount Added to Credit</span>
                <span className="font-mono tabular-nums">Rs. {fmt(creditAmountAdded)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={() => setShowCreditConfirmation(false)}
                  disabled={confirming}
                  className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider transition-all disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConfirmPayment('khatta')}
                  disabled={confirming || quotedDueStale}
                  className="flex-1 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {confirming ? <><Loader2 size={15} className="animate-spin" /> Processing...</> : 'Confirm Credit & Settle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQRModal && selectedMethod && selectedMethod !== 'cash' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">

          {isLandscapeMobile ? (
            /* ── LANDSCAPE: 2-column layout ── */
            <div
              className={`max-w-xl w-full p-4 rounded-[28px] bg-[#0E1017] ${qrProviderTheme.modal} text-white relative flex flex-row`}
              style={{ borderRadius: 20, maxWidth: 640, maxHeight: 'calc(100dvh - 24px)' }}
            >
              {/* Left — QR code, centered, fills column */}
              <div
                className="flex items-center justify-center p-4"
                style={{ width: '55%', borderRight: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.15)' }}
              >
                <div
                  className={`${qrProviderTheme.frame} my-1`}
                >
                  {getQRImage(selectedMethod) ? (
                    <img
                      src={getQRImage(selectedMethod)!}
                      alt={`${selectedMethod} QR`}
                      style={{ width: 160, height: 160, objectFit: 'contain' }}
                    />
                  ) : (
                    <span data-testid="qr-payload" data-qr-value={getQRData(selectedMethod)}>
                      <QRCodeSVG value={getQRData(selectedMethod)} size={160} bgColor="#ffffff" fgColor="#000000" level="M" />
                    </span>
                  )}
                </div>
              </div>

              {/* Right — info + confirm button */}
              <div className="flex flex-col justify-between p-4" style={{ width: '45%' }}>
                {/* Top: close + wallet name + amount */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className={`font-black text-lg ${qrProviderTheme.titleColor}`}>
                      {qrProviderTheme.title}
                    </h3>
                    <button
                      onClick={closeQRModal}
                       className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Amount Due</p>
                    <p className="text-3xl font-black text-white font-mono mt-0.5 leading-tight">Rs. {fmt(chargeTotal)}</p>
                    {prevDueAmount > 0 && (
                      <p className="text-xs font-semibold mt-0.5" style={{ color: 'rgba(251,191,36,0.9)' }}>
                        Rs. {fmt(activeBill.total)} bill + Rs. {fmt(prevDueAmount)} previous due
                      </p>
                    )}
                    {activeBill.discountAmount > 0 && (
                      <p className="text-xs text-success font-semibold mt-0.5">Saved Rs. {fmt(activeBill.discountAmount)}</p>
                    )}
                  </div>
                   <p className="text-xs font-bold text-zinc-200 text-center mt-1">
                     Scan QR code with provider app and confirm payment.
                  </p>
                  {staleAmountNotice}
                </div>

                {/* Bottom: confirm button */}
                <button
                  onClick={async () => {
                    if (confirming) return;
                    setConfirming(true);
                    await handleConfirmPayment(selectedMethod);
                  }}
                  disabled={confirming || quotedDueStale}
                  data-testid="button-confirm-payment"
                    className={`${qrProviderTheme.button} disabled:opacity-70 flex items-center justify-center gap-2`}
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
              <div className={`max-w-xs w-full p-6 rounded-[28px] bg-[#0E1017] ${qrProviderTheme.modal} text-white relative flex flex-col items-center gap-3`}>
               <div className="w-full flex items-center justify-between">
                  <h3 className={`font-black text-lg ${qrProviderTheme.titleColor}`}>
                   {qrProviderTheme.title}
                </h3>
                <button
                  onClick={closeQRModal}
                   className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={17} />
                </button>
              </div>
               <div className="w-full flex flex-col items-center gap-3">
                <div className="text-center">
                   <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Amount Due</p>
                   <p className="text-3xl font-black text-white font-mono mt-0.5">Rs. {fmt(chargeTotal)}</p>
                  {prevDueAmount > 0 && (
                    <p className="text-xs font-semibold mt-1" style={{ color: 'rgba(251,191,36,0.9)' }}>
                      Rs. {fmt(activeBill.total)} bill + Rs. {fmt(prevDueAmount)} previous due
                    </p>
                  )}
                  {activeBill.discountAmount > 0 && (
                    <p className="text-xs text-success font-semibold mt-1">Saved Rs. {fmt(activeBill.discountAmount)}</p>
                  )}
                </div>
                <div
                    className={`${qrProviderTheme.frame} my-1`}
                >
                  {getQRImage(selectedMethod) ? (
                    <img src={getQRImage(selectedMethod)!} alt={`${selectedMethod} QR`} className="w-56 h-56 object-contain" />
                  ) : (
                    <span data-testid="qr-payload" data-qr-value={getQRData(selectedMethod)}>
                      <QRCodeSVG value={getQRData(selectedMethod)} size={224} bgColor="#ffffff" fgColor="#000000" level="M" />
                    </span>
                  )}
                </div>
                 <p className="text-xs font-bold text-zinc-200 text-center mt-1">
                   Scan QR code with provider app and confirm payment.
                </p>
                {staleAmountNotice}
                <button
                  onClick={async () => {
                    if (confirming) return;
                    setConfirming(true);
                    await handleConfirmPayment(selectedMethod);
                  }}
                  disabled={confirming || quotedDueStale}
                  data-testid="button-confirm-payment"
                    className={`${qrProviderTheme.button} disabled:opacity-70 flex items-center justify-center gap-2`}
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

      {/* Admin discount gate */}
      {showDiscountGate && (
        <AdminPinGate
          prompt="Authorize discount application"
          onSuccess={() => {
            setDiscountUnlocked(true);
            pendingDiscountAction?.();
            setPendingDiscountAction(null);
            setShowDiscountGate(false);
          }}
          onCancel={() => { setPendingDiscountAction(null); setShowDiscountGate(false); }}
        />
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

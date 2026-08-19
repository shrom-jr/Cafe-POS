import { useState, useRef, useEffect } from 'react';
import { type PrintJob } from '@/utils/printEngine';
import { fireSilentPrintJob } from '@/utils/silentPrint';
import { getStaffName } from '@/utils/staffName';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { usePOSStore } from '@/store/usePOSStore';
import { useStaffStore } from '@/store/useStaffStore';
import { useOrders } from '@/hooks/useOrders';
import { useTables } from '@/hooks/useTables';
import { TopBar } from '@/components/ui/Navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Banknote, Smartphone, CheckCircle2, Home, X, Loader2, Printer } from 'lucide-react';
import { resolvePaymentLabel } from '@/utils/format';
import { OrderItem } from '@/types/pos';
import { playBillSettled } from '@/utils/sounds';
import { tableDisplayName } from '@/utils/tableName';
import { toast } from 'sonner';
import { isSelectiveResetMarkersHydrated } from '@/utils/firebaseSync';

const PaymentScreen = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const { tables } = useTables();
  const { getActiveOrder, updateOrderStatus, addPayment } = useOrders();
  const resetTable = usePOSStore((s) => s.resetTable);
  const getNextBillNumber = usePOSStore((s) => s.getNextBillNumber);
  const settings = usePOSStore((s) => s.settings);
  // Subscribed for reactivity; we also read .getState() inside the handler to
  // guarantee freshness at the exact moment payment is confirmed.
  const currentUser = useStaffStore((s) => s.currentUser);

  const rawState = location.state as {
    discountValue?: number;
    discountType?: 'percent' | 'fixed';
    subtotal?: number;
    discountAmount?: number;
    vatAmount?: number;
    vatRate?: number;
    vatMode?: 'excluded' | 'included';
    vatEnabled?: boolean;
    total?: number;
  } | null;

  const table = tables.find((t) => t.id === tableId);
  const order = tableId ? getActiveOrder(tableId) : undefined;
  const attachedCustomer = order?.attachedCustomer ?? null;

  const orderSnapshot = useRef<{ id: string; items: OrderItem[]; tableNumber: string; takenBy?: { id: string; name: string; role: string } } | null>(null);
  useEffect(() => {
    if (order && !orderSnapshot.current) {
      orderSnapshot.current = { id: order.id, items: [...order.items], tableNumber: order.tableNumber, takenBy: order.takenBy };
    }
  }, [order]);

  const snap =
    orderSnapshot.current ||
    (order ? { id: order.id, items: order.items, tableNumber: order.tableNumber, takenBy: order.takenBy } : null);

  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [paid, setPaid] = useState(false);
  const [billNum, setBillNum] = useState<number>(0);
  const [paidAt, setPaidAt] = useState<number>(0);
  const [paidMethod, setPaidMethod] = useState<string>('');
  const [reprinting, setReprinting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const lastPrintJobRef = useRef<PrintJob | null>(null);

  const subtotal = rawState?.subtotal ?? 0;
  const discountAmount = rawState?.discountAmount ?? 0;
  const discountValue = rawState?.discountValue ?? 0;
  const discountType = rawState?.discountType ?? 'percent';
  const vatAmount = rawState?.vatAmount ?? 0;
  const vatRate = rawState?.vatRate ?? 0.13;
  const vatMode = rawState?.vatMode ?? 'excluded';
  const vatEnabled = rawState?.vatEnabled ?? false;
  const finalTotal = rawState?.total ?? 0;

  if (!table || !snap || !rawState?.total) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-foreground">Please start an order before proceeding to payment.</p>
        <button
          onClick={() => navigate(tableId ? `/order/${tableId}` : '/')}
          className="px-6 py-3 rounded-xl bg-success text-white font-bold flex items-center gap-2 transition-all active:scale-95"
        >
          <Home size={18} /> Go to Order
        </button>
      </div>
    );
  }

  const reference = `${settings.cafeName.replace(/\s/g, '')}-T${snap.tableNumber}-B${settings.billCounter + 1}`;

  const methods = [
    { id: 'cash', label: 'Cash', icon: Banknote, isQR: false },
    ...(settings.wallets.esewa.enabled ? [{ id: 'esewa', label: 'eSewa', icon: Smartphone, isQR: true }] : []),
    ...(settings.wallets.khalti.enabled ? [{ id: 'khalti', label: 'Khalti', icon: Smartphone, isQR: true }] : []),
    ...(settings.wallets.fonepay.enabled ? [{ id: 'fonepay', label: 'Fonepay', icon: Smartphone, isQR: true }] : []),
    ...(settings.customWallets || []).filter((w) => w.enabled).map((w) => ({ id: w.id, label: w.name, icon: Smartphone, isQR: true })),
  ];

  const getQRData = (method: string) => {
    if (method === 'esewa')
      return `eSewa://pay?eSewaID=${settings.esewaPhone || settings.esewaId}&amount=${finalTotal}&table=${snap.tableNumber}&ref=${reference}`;
    return `pay://${method}?amount=${finalTotal}&ref=${reference}`;
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
    if (!isSelectiveResetMarkersHydrated()) {
      toast.info('Syncing reset status. Please try payment again in a moment.');
      return;
    }
    const bn = getNextBillNumber();
    const now = Date.now();
    setBillNum(bn);
    setPaidAt(now);
    setPaidMethod(resolvePaymentLabel(method, settings));

    // Always read fresh from store state — the subscribed hook value can be one
    // render behind if the user just logged in during this payment flow.
    const liveUser = useStaffStore.getState().currentUser;

    const processedBy = liveUser
      ? { id: liveUser.id, name: getStaffName(liveUser), role: liveUser.role }
      : undefined;

    // Keep the original server attribution from order creation. The store
    // applies the final missing-attribution fallback for legacy orders.
    const resolvedTakenBy = snap.takenBy;
    const resolvedProcessedBy = processedBy;

    addPayment({
      orderId: snap.id,
      tableNumber: snap.tableNumber,
      items: [...snap.items],
      subtotal,
      discount: discountValue,
      discountType,
      vatAmount,
      vatRate,
      vatMode,
      vatEnabled,
      total: finalTotal,
      method,
      reference,
      createdAt: now,
      cafeName: settings.cafeName,
      billNumber: bn,
      takenBy:    resolvedTakenBy,
      processedBy: resolvedProcessedBy,
    });

    updateOrderStatus(snap.id, 'paid');
    if (tableId) resetTable(tableId);
    playBillSettled();
    setShowQRModal(false);
    setPaid(true);

    // Trigger C: TAX_INVOICE — build structured job and fire immediately
    const printJob: PrintJob = {
      type: 'TAX_INVOICE',
      data: {
        cafeName:       settings.cafeName,
        cafeAddress:    settings.cafeAddress,
        cafePan:        settings.cafePan,
        billFooter:     settings.billFooter,
        tableNumber:    snap.tableNumber,
        billNumber:     bn,
        timestamp:      now,
        items:          snap.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        subtotal,
        discountAmount,
        vatEnabled,
        vatAmount,
        vatRate,
        total:          finalTotal,
        method:         resolvePaymentLabel(method, settings),
        serverName:     resolvedTakenBy?.name,
        cashierName:    resolvedProcessedBy?.name,
        takenBy:        resolvedTakenBy,
        processedBy:    resolvedProcessedBy,
        logo:           settings.cafeLogo ?? settings.logoUrl ?? settings.logo,
        showLogoOnBill: settings.showLogoOnBill,
      },
    };
    lastPrintJobRef.current = printJob;
    console.log('PRINT STAFF DATA:', { takenBy: resolvedTakenBy, processedBy: resolvedProcessedBy, liveUser });
    void fireSilentPrintJob(printJob);
  };

  // Receipt dispatched via firePrintJob — no DOM portal needed
  const receiptPortal = null;

  /* ── SUCCESS SCREEN ──────────────────────────────────────── */
  if (paid) {
    const displayItems = snap.items.slice(0, 3);
    const extraCount = snap.items.length - displayItems.length;

    const handleReprint = () => {
      if (reprinting) return;
      setReprinting(true);
      if (lastPrintJobRef.current) void fireSilentPrintJob(lastPrintJobRef.current);
      setTimeout(() => setReprinting(false), 1800);
    };

    return (
      <>
        {receiptPortal}
        <div className="h-[100dvh] bg-[#0A0B0E] flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center p-5 gap-4 overflow-hidden">

            {/* Success icon + amount */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center text-3xl shadow-xl shadow-emerald-500/20 mb-3">
                <CheckCircle2 size={36} />
              </div>
              <h2 className="text-2xl font-black text-white">Payment Successful</h2>
              <div className="flex items-center gap-2">
                <span className="text-4xl font-black text-emerald-400 font-mono mt-1">Rs. {finalTotal}</span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-xs font-black uppercase tracking-wider border border-emerald-500/30">
                  {paidMethod}
                </span>
              </div>
              {discountAmount > 0 && (
                <span className="text-xs text-success font-medium">Saved Rs. {discountAmount}</span>
              )}
              {/* Permanent print indicator */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Printer size={12} />
                  <span className="text-zinc-300 font-bold">Printing receipt...</span>
              </div>
            </div>

            {/* Compact receipt preview */}
            <div className="p-5 rounded-2xl bg-[#13151F] border border-white/15 max-w-sm w-full my-4 text-left shadow-lg text-white space-y-2">
              <div className="text-center pb-1 border-b border-dashed border-white/15">
                <p className="font-black text-sm text-white">{settings.cafeName}</p>
                <p className="text-xs text-zinc-300 font-mono">
                  #{billNum} · {tableDisplayName(snap.tableNumber)}
                </p>
              </div>
              <div className="space-y-1">
                {displayItems.map((item) => (
                  <div key={item.menuItemId} className="flex justify-between text-sm">
                    <span className="text-zinc-300 truncate pr-2">
                      {item.name} <span className="text-white font-semibold">×{item.quantity}</span>
                    </span>
                    <span className="font-semibold text-white whitespace-nowrap">
                      Rs. {item.price * item.quantity}
                    </span>
                  </div>
                ))}
                {extraCount > 0 && (
                  <p className="text-xs text-zinc-300">+{extraCount} more item{extraCount > 1 ? 's' : ''}</p>
                )}
              </div>
              <div className="flex justify-between items-center border-t border-dashed border-white/15 pt-2">
                <span className="text-sm font-semibold text-zinc-300">Total</span>
                <span className="text-lg font-black text-white font-mono">Rs. {finalTotal}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="w-full max-w-sm space-y-2.5">
              <button
                onClick={handleReprint}
                disabled={reprinting}
                data-testid="button-reprint"
                className="w-full max-w-sm py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-xs uppercase tracking-wider transition-all mb-2.5 flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <Printer size={15} />
                {reprinting ? 'Reprinting...' : 'Reprint Receipt'}
              </button>

              <button
                onClick={() => navigate('/', { replace: true })}
                data-testid="button-back-home"
                className="w-full max-w-sm py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-xl shadow-emerald-500/30 transition-all flex items-center justify-center gap-1.5"
              >
                <Home size={18} /> Back to Tables
              </button>
            </div>

          </div>
        </div>
      </>
    );
  }

  /* ── PAYMENT SCREEN ──────────────────────────────────────── */
  const qrMethods = methods.filter((m) => m.isQR);

  return (
    <div className="min-h-screen bg-[#0A0B0E]">
      <TopBar title={`Payment — ${tableDisplayName(snap.tableNumber)}`} showBack onBack={() => navigate(`/review/${tableId}`)} />

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">

        {/* Total amount card */}
        <div className="p-6 rounded-3xl bg-[#13151F] border border-white/15 shadow-xl flex flex-col gap-4">
          <p className="text-xs font-black text-amber-400 uppercase tracking-widest text-center">Amount Due</p>
          <p className="text-5xl font-black text-white font-mono mt-1 tracking-tight text-center tabular-nums">
            Rs. {finalTotal}
          </p>
          <p className="text-xs text-zinc-300 mt-1 font-mono text-center">{tableDisplayName(snap.tableNumber)}</p>

          <div className="mt-4 pt-3 border-t border-border/40 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground font-medium">Rs. {subtotal}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-success font-semibold">-Rs. {discountAmount}</span>
              </div>
            )}
            {vatEnabled && vatAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT ({Math.round(vatRate * 100)}%)</span>
                <span className="text-foreground font-medium">Rs. {vatAmount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Attached Customer Card — prominent credit balance display */}
        {attachedCustomer && (
          <div
            className="rounded-2xl px-4 py-3"
            style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.22)' }}
          >
            <div className="flex items-center gap-3">
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
              <div className="flex-shrink-0 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(148,163,184,0.5)' }}>
                  Credit Balance
                </p>
                <p
                  className="text-base font-black tabular-nums leading-tight"
                  style={{ color: attachedCustomer.currentDue > 0 ? '#f87171' : '#34d399' }}
                >
                  {attachedCustomer.currentDue > 0 ? `Rs. ${attachedCustomer.currentDue}` : '✓ Clear'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Payment methods */}
        <div className="space-y-2.5">
           <p className="text-xs font-black text-amber-400 uppercase tracking-wider">Payment Method</p>

          <button
            onClick={() => handleConfirmPayment('cash')}
            data-testid="button-payment-method-cash"
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#0F1916] border-2 border-emerald-500/40 hover:border-emerald-400 text-emerald-300 font-black transition-all cursor-pointer shadow-lg active:scale-[0.97]"
          >
             <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
               <Banknote size={22} className="text-emerald-400" />
            </div>
            <div className="flex-1 text-left">
               <p className="font-black text-base text-emerald-300">Cash</p>
               <p className="text-[11px] text-zinc-300">Tap to complete payment</p>
            </div>
             <span className="text-sm font-black text-emerald-300 font-mono">Rs. {finalTotal}</span>
          </button>

          {qrMethods.length > 0 && (
            <div className={`grid gap-2.5 ${qrMethods.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {qrMethods.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => { setSelectedMethod(id); setShowQRModal(true); }}
                  data-testid={`button-payment-method-${id}`}
                   className={`flex items-center gap-3 p-4 rounded-2xl font-black transition-all cursor-pointer shadow-lg active:scale-[0.97] ${
                     id === 'khalti'
                       ? 'bg-[#161224] border-2 border-purple-500/40 hover:border-purple-400 text-purple-300'
                       : id === 'fonepay'
                       ? 'bg-[#1A1116] border-2 border-rose-500/40 hover:border-rose-400 text-rose-300'
                       : 'bg-[#0F1916] border-2 border-emerald-500/40 hover:border-emerald-400 text-emerald-300'
                   }`}
                >
                   <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                     <Smartphone size={18} />
                  </div>
                  <div className="text-left min-w-0">
                     <p className="font-black text-sm">{label}</p>
                     <p className="text-[10px] text-zinc-300">Scan QR</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* QR Modal */}
      {showQRModal && selectedMethod && selectedMethod !== 'cash' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="max-w-xs w-full p-7 rounded-[28px] bg-[#0E1017] border border-white/20 shadow-2xl shadow-black text-white relative flex flex-col items-center gap-3">

            <div className="w-full flex items-center justify-between">
              <h3 className="font-black text-white text-base">
                {resolvePaymentLabel(selectedMethod, settings)} Payment
              </h3>
              <button
                onClick={() => { setShowQRModal(false); setSelectedMethod(null); setConfirming(false); }}
                className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-all active:scale-90"
              >
                <X size={17} />
              </button>
            </div>

            <div className="w-full flex flex-col items-center gap-3">
              <div className="text-center">
                <p className="text-[11px] text-amber-400 uppercase tracking-widest font-black">Amount Due</p>
                <p className="text-3xl font-black text-white font-mono mt-1">Rs. {finalTotal}</p>
                {discountAmount > 0 && (
                  <p className="text-xs text-success font-semibold mt-1">Saved Rs. {discountAmount}</p>
                )}
              </div>

              <div
                className="p-3 rounded-2xl bg-white border-2 border-amber-400 shadow-xl my-2"
              >
                {getQRImage(selectedMethod) ? (
                  <img
                    src={getQRImage(selectedMethod)!}
                    alt={`${selectedMethod} QR`}
                    className="w-56 h-56 object-contain"
                  />
                ) : (
                  <QRCodeSVG
                    value={getQRData(selectedMethod)}
                    size={224}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                  />
                )}
              </div>

                <p className="text-sm font-bold text-zinc-200 text-center">
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
                 className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-80 flex items-center justify-center gap-2"
                style={{
                   opacity: confirming ? 0.7 : 1,
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
        </div>
      )}
    </div>
  );
};

export default PaymentScreen;

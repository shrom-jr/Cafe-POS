import { useState, useRef, useEffect } from 'react';
import { firePrintJob, type PrintJob } from '@/utils/printEngine';
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
import { playSuccess } from '@/utils/sounds';
import { tableDisplayName } from '@/utils/tableName';

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
    playSuccess();
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
    firePrintJob(printJob);
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
      if (lastPrintJobRef.current) firePrintJob(lastPrintJobRef.current);
      setTimeout(() => setReprinting(false), 1800);
    };

    return (
      <>
        {receiptPortal}
        <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center p-5 gap-4 overflow-hidden">

            {/* Success icon + amount */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center shadow-[0_0_32px_-4px_hsl(var(--success)/0.4)]">
                <CheckCircle2 size={36} className="text-success" />
              </div>
              <h2 className="text-xl font-black text-foreground">Payment Successful</h2>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black text-foreground">Rs. {finalTotal}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-success/15 text-success text-xs font-bold uppercase">
                  {paidMethod}
                </span>
              </div>
              {discountAmount > 0 && (
                <span className="text-xs text-success font-medium">Saved Rs. {discountAmount}</span>
              )}
              {/* Permanent print indicator */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Printer size={12} />
                <span>Printing receipt...</span>
              </div>
            </div>

            {/* Compact receipt preview */}
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 space-y-2 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)]">
              <div className="text-center pb-1 border-b border-dashed border-border/60">
                <p className="font-black text-sm text-foreground">{settings.cafeName}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  #{billNum} · {tableDisplayName(snap.tableNumber)}
                </p>
              </div>
              <div className="space-y-1">
                {displayItems.map((item) => (
                  <div key={item.menuItemId} className="flex justify-between text-sm">
                    <span className="text-muted-foreground truncate pr-2">
                      {item.name} <span className="text-foreground font-semibold">×{item.quantity}</span>
                    </span>
                    <span className="font-semibold text-foreground whitespace-nowrap">
                      Rs. {item.price * item.quantity}
                    </span>
                  </div>
                ))}
                {extraCount > 0 && (
                  <p className="text-xs text-muted-foreground">+{extraCount} more item{extraCount > 1 ? 's' : ''}</p>
                )}
              </div>
              <div className="flex justify-between items-center border-t border-dashed border-border/60 pt-2">
                <span className="text-sm font-semibold text-muted-foreground">Total</span>
                <span className="text-lg font-black text-foreground">Rs. {finalTotal}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="w-full max-w-sm space-y-2.5">
              <button
                onClick={handleReprint}
                disabled={reprinting}
                data-testid="button-reprint"
                className="w-full py-3.5 rounded-2xl border border-border bg-secondary text-foreground font-bold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] hover:bg-secondary/80 disabled:opacity-60"
              >
                <Printer size={15} />
                {reprinting ? 'Reprinting...' : 'Reprint Receipt'}
              </button>

              <button
                onClick={() => navigate('/', { replace: true })}
                data-testid="button-back-home"
                className="w-full py-4 rounded-2xl bg-success text-white font-black text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] hover:brightness-110 shadow-[0_4px_16px_-4px_hsl(var(--success)/0.4)]"
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
    <div className="min-h-screen bg-background">
      <TopBar title={`Payment — ${tableDisplayName(snap.tableNumber)}`} showBack onBack={() => navigate(`/review/${tableId}`)} />

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">

        {/* Total amount card */}
        <div className="rounded-2xl border border-border bg-gradient-to-b from-card to-card/70 p-5 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center">Amount Due</p>
          <p className="text-6xl font-black text-foreground mt-1 tracking-tight text-center tabular-nums">
            Rs. {finalTotal}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1 font-mono text-center">{tableDisplayName(snap.tableNumber)}</p>

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

        {/* Payment methods */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Method</p>

          <button
            onClick={() => handleConfirmPayment('cash')}
            data-testid="button-payment-method-cash"
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-success/60 bg-success/8 transition-all active:scale-[0.97] hover:bg-success/12 hover:border-success shadow-[0_2px_16px_-6px_hsl(var(--success)/0.35)]"
          >
            <div className="w-11 h-11 rounded-xl bg-success/15 flex items-center justify-center flex-shrink-0">
              <Banknote size={22} className="text-success" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-black text-base text-foreground">Cash</p>
              <p className="text-[11px] text-muted-foreground">Tap to complete payment</p>
            </div>
            <span className="text-sm font-black text-success">Rs. {finalTotal}</span>
          </button>

          {qrMethods.length > 0 && (
            <div className={`grid gap-2.5 ${qrMethods.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {qrMethods.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => { setSelectedMethod(id); setShowQRModal(true); }}
                  data-testid={`button-payment-method-${id}`}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card transition-all active:scale-[0.97] hover:scale-[1.015] hover:bg-secondary/50 hover:border-foreground/20 hover:shadow-sm"
                >
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    <Smartphone size={18} className="text-muted-foreground" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-semibold text-sm text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground">Scan QR</p>
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
          <div className="bg-card rounded-3xl border border-border w-full max-w-sm shadow-2xl overflow-hidden">

            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-black text-foreground text-base">
                {resolvePaymentLabel(selectedMethod, settings)} Payment
              </h3>
              <button
                onClick={() => { setShowQRModal(false); setSelectedMethod(null); setConfirming(false); }}
                className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all active:scale-90"
              >
                <X size={17} />
              </button>
            </div>

            <div className="px-6 pt-5 pb-6 flex flex-col items-center gap-4">
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-semibold">Amount Due</p>
                <p className="text-5xl font-black text-foreground mt-1 tabular-nums">Rs. {finalTotal}</p>
                {discountAmount > 0 && (
                  <p className="text-xs text-success font-semibold mt-1">Saved Rs. {discountAmount}</p>
                )}
              </div>

              <div
                className="p-4 bg-white rounded-2xl"
                style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 4px 20px -4px rgba(0,0,0,0.3)' }}
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
                  background: confirming ? 'hsl(var(--success) / 0.7)' : 'hsl(var(--success))',
                  boxShadow: '0 4px 16px -4px hsl(var(--success) / 0.5)',
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

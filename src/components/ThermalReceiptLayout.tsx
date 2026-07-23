import { useEffect } from 'react';
import { format } from 'date-fns';
import { numberToWords } from '@/utils/printer';
import { buildReceiptText } from '@/utils/buildReceiptText';
import { setReceiptText } from '@/utils/print';
import { useStaffStore } from '@/store/useStaffStore';
import { tableDisplayName } from '@/utils/tableName';

interface ThermalReceiptLayoutProps {
  cafeName: string;
  cafeLogo?: string;
  cafeAddress?: string;
  cafePan?: string;
  billFooter?: string;
  tableNumber: string;
  billNumber: number;
  createdAt: number;
  items: Array<{ name: string; price: number; quantity: number }>;
  subtotal: number;
  discountAmount: number;
  vatEnabled: boolean;
  vatAmount: number;
  vatRate: number;
  total: number;
  method: string;
  /** Logo / font settings */
  showLogoOnBill?: boolean;
  receiptFontSize?: number;
  receiptFontFamily?: string;
  /** Plain-string fallbacks (legacy) */
  serverName?: string;
  cashierName?: string;
  /** Full attribution objects — preferred over plain strings */
  takenBy?:     { id?: string; name?: string; fullName?: string; role?: string };
  processedBy?: { id?: string; name?: string; fullName?: string; role?: string };
}

const HR = () => (
  <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }} />
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 1, fontWeight: 700 }}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const ThermalReceiptLayout = ({
  cafeName,
  cafeLogo,
  cafeAddress,
  cafePan,
  billFooter,
  tableNumber,
  billNumber,
  createdAt,
  items,
  subtotal,
  discountAmount,
  vatEnabled,
  vatAmount,
  vatRate,
  total,
  method,
  showLogoOnBill = true,
  receiptFontSize = 10,
  receiptFontFamily = 'monospace',
  serverName,
  cashierName,
  takenBy,
  processedBy,
}: ThermalReceiptLayoutProps) => {
  const taxableAmount = subtotal - discountAmount;
  const dateStr = format(createdAt, 'dd/MM/yyyy');
  const timeStr = format(createdAt, 'hh:mm aa');
  // Live staff fallback — reactive, used when attribution objects are absent.
  const liveStaff = useStaffStore((s) => s.currentUser?.name) || 'Cashier Desk';

  // Register plain-text receipt so triggerPrint() can use it instead of HTML
  useEffect(() => {
    setReceiptText(buildReceiptText({
      cafeName,
      cafeAddress,
      cafePan,
      billFooter,
      tableNumber,
      billNumber,
      createdAt,
      items,
      subtotal,
      discountAmount,
      vatEnabled,
      vatAmount,
      vatRate,
      total,
      method,
      serverName,
      cashierName,
      takenBy,
      processedBy,
    }));
  }, [cafeName, cafeAddress, cafePan, billFooter, tableNumber, billNumber, createdAt, items, subtotal, discountAmount, vatEnabled, vatAmount, vatRate, total, method, serverName, cashierName, takenBy, processedBy]);

  const fontStack =
    receiptFontFamily === 'monospace'  ? "'Consolas', 'Courier New', 'Lucida Console', monospace" :
    receiptFontFamily === 'sans-serif' ? "'Arial', 'Helvetica', sans-serif" :
    receiptFontFamily === 'serif'      ? 'Georgia, serif' :
                                         "'Consolas', 'Courier New', 'Lucida Console', monospace";

  return (
    <div style={{ color: '#000000', fontWeight: 700, backgroundColor: '#ffffff', fontSize: receiptFontSize, fontFamily: fontStack, lineHeight: 1.2, letterSpacing: '0.2px' }}>
      {/* Thermal print CSS — suppress antialiasing, fix ink bleed */}
      <style>{`
        @media print {
          * {
            color: #000000 !important;
            -webkit-text-fill-color: #000000 !important;
            background-color: #ffffff !important;
            text-shadow: none !important;
            box-shadow: none !important;
            -webkit-font-smoothing: none !important;
            -moz-osx-font-smoothing: unset !important;
            font-smooth: never !important;
            text-rendering: optimizeSpeed !important;
          }
          b, strong {
            font-weight: 600 !important;
          }
          img {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            display: block !important;
            margin: 0 auto 6px auto !important;
            max-width: 110px !important;
            height: auto !important;
          }
        }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        {showLogoOnBill && cafeLogo && (
          <img
            src={cafeLogo}
            alt="Logo"
            style={{
              display: 'block',
              margin: '0 auto 6px',
              maxWidth: 110,
              height: 'auto',
              objectFit: 'contain',
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div style={{ fontSize: 15, fontWeight: 900 }}>{cafeName}</div>
        {cafeAddress && <div style={{ fontSize: 11 }}>{cafeAddress}</div>}
        {cafePan && <div style={{ fontSize: 11 }}>PAN: {cafePan}</div>}
      </div>

      <HR />

      <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 12, letterSpacing: 1, marginBottom: 5 }}>
        TAX INVOICE
      </div>

      <HR />

      <div style={{ fontSize: 11, marginBottom: 5, fontWeight: 700 }}>
        <div><strong>Payment:</strong> {method}</div>
        <div><strong>Date:</strong> {dateStr}</div>
        <div><strong>Bill No:</strong> #{billNumber}</div>
        <div><strong>Table:</strong> {tableDisplayName(tableNumber)}</div>
        <div><strong>Served By:</strong> {takenBy?.name || takenBy?.fullName || processedBy?.name || ''}</div>
      </div>

      <HR />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '18px 1fr 28px 44px 48px',
          gap: 2,
          fontSize: 10,
          fontWeight: 800,
          paddingBottom: 3,
          borderBottom: '1px solid #000',
          marginBottom: 2,
        }}
      >
        <span>SN</span>
        <span>Particulars</span>
        <span style={{ textAlign: 'center' }}>Qty</span>
        <span style={{ textAlign: 'right' }}>Rate</span>
        <span style={{ textAlign: 'right' }}>Amt</span>
      </div>

      {items.map((item, idx) => (
        <div
          key={idx}
          style={{
            display: 'grid',
            gridTemplateColumns: '18px 1fr 28px 44px 48px',
            gap: 2,
            fontSize: 10,
            fontWeight: 700,
            paddingBottom: 2,
            borderBottom: '1px dashed #000000',
            marginBottom: 2,
          }}
        >
          <span>{idx + 1}</span>
          <span>{item.name}</span>
          <span style={{ textAlign: 'center' }}>{item.quantity}</span>
          <span style={{ textAlign: 'right' }}>{item.price.toFixed(2)}</span>
          <span style={{ textAlign: 'right' }}>{(item.price * item.quantity).toFixed(2)}</span>
        </div>
      ))}

      <HR />

      <div style={{ fontSize: 11 }}>
        <Row label="Basic Amount :" value={`Rs. ${subtotal.toFixed(2)}`} />
        {discountAmount > 0 && (
          <Row label="Discount :" value={`-Rs. ${discountAmount.toFixed(2)}`} />
        )}
        <Row label="Taxable Amount :" value={`Rs. ${taxableAmount.toFixed(2)}`} />
        {(vatEnabled ?? false) && vatAmount > 0 && (
          <Row label={`VAT (${Math.round(vatRate * 100)}%) :`} value={`Rs. ${vatAmount.toFixed(2)}`} />
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 900,
            fontSize: 13,
            borderTop: '1px solid #000',
            paddingTop: 3,
            marginTop: 3,
          }}
        >
          <span>Total :</span>
          <span>Rs. {total.toFixed(2)}</span>
        </div>
      </div>

      <HR />

      <div style={{ fontSize: 10, marginBottom: 2, fontWeight: 700 }}>
        In word: {numberToWords(Math.round(total))}
      </div>

      <HR />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700 }}>
        <span>Cashier: {processedBy?.name || processedBy?.fullName || liveStaff}</span>
        <span>Time: {timeStr}</span>
      </div>

      <HR />

      <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700 }}>
        {billFooter || 'Thank you for visiting!'}
      </div>
    </div>
  );
};

export default ThermalReceiptLayout;

import { useEffect } from 'react';
import { format } from 'date-fns';
import { numberToWords } from '@/utils/printer';
import { buildReceiptText } from '@/utils/buildReceiptText';
import { setReceiptText } from '@/utils/print';

interface ThermalReceiptLayoutProps {
  cafeName: string;
  cafeLogo?: string;
  cafeAddress?: string;
  cafePan?: string;
  billFooter?: string;
  tableNumber: number;
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
  serverName,
  cashierName,
  takenBy,
  processedBy,
}: ThermalReceiptLayoutProps) => {
  const taxableAmount = subtotal - discountAmount;
  const dateStr = format(createdAt, 'dd/MM/yyyy');
  const timeStr = format(createdAt, 'hh:mm aa');

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

  return (
    <div style={{ color: '#000000', fontWeight: 700, backgroundColor: '#ffffff' }}>
      {/* Heavy Print Matrix Override Stylesheet */}
      <style>{`
        @media print {
          *, html, body, div, span, strong, td, th {
            color: #000000 !important;
            -webkit-text-fill-color: #000000 !important;
            font-weight: 800 !important;
            background-color: #ffffff !important;
            text-shadow: none !important;
          }
          img {
            filter: brightness(0) !important;
          }
        }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        {cafeLogo && (
          <img
            src={cafeLogo}
            alt="Logo"
            style={{
              display: 'block',
              margin: '0 auto 4px',
              maxWidth: 80,
              maxHeight: 80,
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
        <div><strong>Table:</strong> {tableNumber}</div>
        <div><strong>Served By:</strong> {takenBy?.fullName || takenBy?.name || serverName || processedBy?.fullName || processedBy?.name || cashierName || 'Staff'}</div>
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
        <span>Cashier: {processedBy?.fullName || processedBy?.name || cashierName || takenBy?.fullName || takenBy?.name || serverName || 'Cashier'}</span>
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

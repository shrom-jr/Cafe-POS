import { OrderItem } from '@/types/pos';
import ThermalReceiptLayout from './ThermalReceiptLayout';

interface ReceiptPreviewProps {
  cafeName: string;
  cafeLogo?: string;
  cafeAddress?: string;
  cafePhone?: string;
  cafePan?: string;
  billFooter?: string;
  tableNumber: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountType: 'percent' | 'fixed';
  vatAmount?: number;
  vatRate?: number;
  vatEnabled?: boolean;
  total: number;
  method?: string;
  billNumber?: number;
  date?: number;
  showLogoOnBill?: boolean;
  receiptFontSize?: number;
  receiptFontFamily?: string;
}

const ReceiptPreview = ({
  cafeName,
  cafeLogo,
  cafeAddress,
  cafePan,
  billFooter,
  tableNumber,
  items,
  subtotal,
  discount,
  discountType,
  vatAmount = 0,
  vatRate = 0.13,
  vatEnabled = false,
  total,
  method,
  billNumber = 1001,
  date,
  showLogoOnBill = true,
  receiptFontSize = 10,
  receiptFontFamily = 'monospace',
}: ReceiptPreviewProps) => {
  const discountAmount =
    discountType === 'percent' ? Math.round((subtotal * discount) / 100) : discount;

  const resolvedFont = receiptFontFamily === 'monospace'
    ? "'Courier New', Courier, monospace"
    : receiptFontFamily === 'sans-serif'
    ? 'Arial, Helvetica, sans-serif'
    : receiptFontFamily === 'serif'
    ? 'Georgia, serif'
    : "'Courier New', Courier, monospace";

  return (
    <div
      data-testid="receipt-preview"
      style={{
        fontFamily: resolvedFont,
        fontSize: receiptFontSize ?? 12,
        lineHeight: 1.5,
        color: '#000',
        background: '#fff',
        border: '1px solid #ccc',
        padding: '8mm',
        maxWidth: 320,
        margin: '0 auto',
      }}
    >
      <ThermalReceiptLayout
        cafeName={cafeName}
        cafeLogo={cafeLogo}
        cafeAddress={cafeAddress}
        cafePan={cafePan}
        billFooter={billFooter}
        tableNumber={tableNumber}
        billNumber={billNumber}
        createdAt={date || Date.now()}
        items={items}
        subtotal={subtotal}
        discountAmount={discountAmount}
        vatEnabled={vatEnabled}
        vatAmount={vatAmount}
        vatRate={vatRate}
        total={total}
        method={method || 'Cash'}
        showLogoOnBill={showLogoOnBill}
        receiptFontSize={receiptFontSize}
        receiptFontFamily={receiptFontFamily}
      />
    </div>
  );
};

export default ReceiptPreview;

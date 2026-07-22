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
}: ReceiptPreviewProps) => {
  const discountAmount =
    discountType === 'percent' ? Math.round((subtotal * discount) / 100) : discount;

  return (
    <div
      data-testid="receipt-preview"
      style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 12,
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
      />
    </div>
  );
};

export default ReceiptPreview;

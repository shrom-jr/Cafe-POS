import { describe, expect, it } from 'vitest';
import { buildReceiptText } from '@/utils/buildReceiptText';

const receiptBase = {
  cafeName: 'Test Cafe',
  tableNumber: 1,
  billNumber: 1,
  createdAt: Date.now(),
  items: [{ name: 'Coffee', price: 100, quantity: 1 }],
  subtotal: 100,
  discountAmount: 0,
  vatEnabled: false,
  vatAmount: 0,
  vatRate: 0.13,
  total: 100,
  method: 'Cash',
};

describe('staff attribution on receipts', () => {
  it('keeps the waiter as served by and cashier as cashier', () => {
    const receipt = buildReceiptText({
      ...receiptBase,
      takenBy: { id: 'waiter', name: 'Waiter One', role: 'waiter' },
      processedBy: { id: 'cashier', name: 'Cashier One', role: 'cashier' },
    });

    expect(receipt).toContain('Served By: Waiter One');
    expect(receipt).toContain('Cashier: Cashier One');
    expect(receipt).not.toContain('Served By: Cashier One');
  });

  it('uses the processed staff name when the order has no takenBy', () => {
    const receipt = buildReceiptText({
      ...receiptBase,
      processedBy: { id: 'cashier', name: 'Cashier One', role: 'cashier' },
    });

    expect(receipt).toContain('Served By: Cashier One');
    expect(receipt).toContain('Cashier: Cashier One');
  });
});
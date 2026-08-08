import type { CustomerRepayment } from '@/types/pos';

/**
 * Maps a checkout payment method id (cash, esewa, khalti, fonepay, or a custom
 * wallet id) onto the two settlement semantics a Khatta repayment supports.
 * Cash stays cash; every digital wallet settles as a Fonepay-style transfer.
 */
export const toRepaymentMethod = (method: string): CustomerRepayment['method'] =>
  method === 'cash' ? 'cash' : 'fonepay';

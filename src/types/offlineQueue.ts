/** Domains covered by the offline mutation outbox. */
export type OfflineMutationDomain = 'orders' | 'tables' | 'payments' | 'customers';

/**
 * Discrete actions that can be stored in the outbox and replayed against
 * Firebase when connectivity is restored.
 */
export type OfflineMutationAction =
  | 'create_order'
  | 'update_order'
  | 'delete_order'
  | 'update_table'
  | 'add_payment'
  | 'update_customer_due'
  | 'record_repayment'
  | 'write_customer';

/**
 * A single atomic mutation that was performed locally while the device was
 * offline. Mutations are stored in localStorage and replayed in strict
 * chronological (FIFO) order when connectivity is restored.
 *
 * Payload shapes per action:
 *   create_order / update_order  → { order: Order, table?: CafeTable }
 *   delete_order                 → { orderId: string }
 *   update_table                 → { table: CafeTable }
 *   add_payment                  → { payment: Payment }
 *   write_customer / update_customer_due / record_repayment
 *                                → { customer: Customer & { repayments: CustomerRepayment[] } }
 */
export interface OfflineMutation {
  /** Unique ID for this queued entry (UUID). */
  id: string;
  domain: OfflineMutationDomain;
  action: OfflineMutationAction;
  /** The full serialised payload needed to re-issue the Firebase write. */
  payload: Record<string, unknown>;
  /** Unix ms timestamp of when the mutation was enqueued. */
  timestamp: number;
  /**
   * The observed reset-generation string for the relevant domain at the time
   * of enqueuing (syncMutationId or "baseline"). Used to detect mutations that
   * predate a factory reset so stale records are never resurrected.
   */
  resetGeneration: string;
  /** Number of replay attempts made for this entry. */
  retryCount: number;
}

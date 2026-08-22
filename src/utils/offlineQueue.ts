/**
 * Durable offline mutation outbox.
 *
 * Mutations are persisted to localStorage so they survive page refreshes.
 * The Firebase Realtime Database SDK already handles in-session retries
 * internally; this queue specifically covers the "page refreshed while
 * offline" scenario where the SDK's in-memory queue is lost.
 *
 * All functions are synchronous and deliberately lightweight — they must not
 * block the UI thread or delay cashier/waiter workflows.
 */
import type {
  OfflineMutation,
  OfflineMutationDomain,
  OfflineMutationAction,
} from '@/types/offlineQueue';
import { isTrainingSandboxActive } from '@/utils/trainingSandbox';

export const OFFLINE_QUEUE_KEY = 'pos_offline_mutation_queue';

/** Drop a mutation from the outbox after this many failed replay attempts. */
const MAX_RETRY = 5;

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Notify any listening UI components (e.g. the AppLayout status badge) that
 * the queue contents have changed. Safe to call in non-browser environments.
 */
function dispatchQueueChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('offline-queue-changed'));
  }
}

function readQueue(): OfflineMutation[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as OfflineMutation[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineMutation[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Quota exceeded or private-browsing restriction — fail silently.
    // The write was already applied to local state so the UI remains consistent.
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a new mutation to the end of the persistent FIFO outbox.
 * Called by store actions when a Firebase write is skipped because the device
 * is offline.
 */
export function enqueueMutation(
  domain: OfflineMutationDomain,
  action: OfflineMutationAction,
  payload: Record<string, unknown>,
  resetGeneration: string,
): void {
  if (isTrainingSandboxActive()) return;
  const mutation: OfflineMutation = {
    id: crypto.randomUUID(),
    domain,
    action,
    payload,
    timestamp: Date.now(),
    resetGeneration,
    retryCount: 0,
  };
  const queue = readQueue();
  queue.push(mutation);
  writeQueue(queue);
  dispatchQueueChanged();
}

/** Returns the oldest pending mutation without removing it (FIFO head). */
export function peekQueue(): OfflineMutation | undefined {
  return readQueue()[0];
}

/** Permanently remove a successfully replayed mutation from the outbox. */
export function dequeueMutation(id: string): void {
  if (isTrainingSandboxActive()) return;
  writeQueue(readQueue().filter((m) => m.id !== id));
  dispatchQueueChanged();
}

/** Increment the retry counter for a mutation that failed to replay. */
export function incrementRetry(id: string): void {
  if (isTrainingSandboxActive()) return;
  writeQueue(
    readQueue().map((m) =>
      m.id === id ? { ...m, retryCount: m.retryCount + 1 } : m,
    ),
  );
}

/** Remove all mutations that have exceeded the maximum retry limit. */
export function dropExhaustedMutations(): void {
  if (isTrainingSandboxActive()) return;
  writeQueue(readQueue().filter((m) => m.retryCount < MAX_RETRY));
}

/** Total number of pending (un-replayed) mutations in the outbox. */
export function getPendingQueueCount(): number {
  return readQueue().length;
}

/**
 * Clear the entire outbox. Called when a full factory reset is performed so no
 * stale mutations can be replayed afterwards.
 */
export function clearQueue(): void {
  if (isTrainingSandboxActive()) return;
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
  dispatchQueueChanged();
}

/**
 * Remove all queued mutations whose domain is in the provided set.
 * Called during a *selective* factory reset to drop mutations only for the
 * domains that were wiped, leaving unrelated queued writes intact.
 */
export function clearQueueForDomains(domains: Set<OfflineMutationDomain>): void {
  if (isTrainingSandboxActive()) return;
  const remaining = readQueue().filter((m) => !domains.has(m.domain));
  if (remaining.length === 0) {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } else {
    writeQueue(remaining);
  }
  dispatchQueueChanged();
}

/** Return a snapshot of all pending mutations, oldest first (FIFO order). */
export function getAllPendingMutations(): OfflineMutation[] {
  return readQueue();
}

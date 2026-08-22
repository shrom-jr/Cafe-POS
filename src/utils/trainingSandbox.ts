/**
 * Runtime boundary for Staff Practice sessions.
 *
 * The session intentionally lives only in memory. Store snapshots are registered
 * by App so this small module can be imported by persistence utilities without
 * creating store import cycles.
 */
type TrainingCallbacks = {
  capture: () => void;
  restore: () => void;
  /** Applies already-mounted live sync snapshots before writes are unblocked. */
  reconcile?: () => void;
};

let active = false;
let reconciling = false;
let callbacks: TrainingCallbacks | null = null;

export const TRAINING_STAFF_ID = '__staff_practice__';
export const TRAINING_RECEIPT_NOTICE = '*** TRAINING RECEIPT — NOT A TAX INVOICE ***';

function notify(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('training-sandbox-changed'));
  }
}

export function configureTrainingSandbox(nextCallbacks: TrainingCallbacks): void {
  callbacks = nextCallbacks;
}

export function isTrainingSandboxActive(): boolean {
  return active;
}

export function isTrainingSandboxReconciling(): boolean {
  return reconciling;
}

export function isTrainingAccessConfirmation(value: string): boolean {
  return value.trim().toLowerCase() === 'test';
}

export function beginTrainingSandbox(): void {
  if (active) return;
  callbacks?.capture();
  active = true;
  notify();
}

export function endTrainingSandbox(): void {
  if (!active) return;
  // Restore while the sandbox guard is still enabled so restoration cannot
  // accidentally persist or sync the live snapshot.
  callbacks?.restore();
  // Existing Firebase listeners cache their latest snapshots while practice is
  // active. Apply those snapshots before unblocking outbound effects so a stale
  // restored clone can never be echoed back to the live database.
  reconciling = true;
  callbacks?.reconcile?.();
  reconciling = false;
  active = false;
  notify();
}
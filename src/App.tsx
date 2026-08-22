import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import TableOverview from '@/screens/TableOverview';
import OrderScreen from '@/screens/OrderScreen';
import ReviewScreen from '@/screens/ReviewScreen';
import PaymentScreen from '@/screens/PaymentScreen';
import BillHistory from '@/screens/BillHistory';
import AdminPanel from '@/screens/AdminPanel';
import KitchenPortal from '@/screens/KitchenPortal';
import BarPortal from '@/screens/BarPortal';
import CustomersPortal from '@/screens/CustomersPortal';
import PinLoginScreen from '@/screens/PinLoginScreen';
import NotFound from './pages/NotFound.tsx';
import { useStaffStore } from '@/store/useStaffStore';
import { useFirebaseSync } from '@/hooks/useFirebaseSync';
import { usePrintQueue } from '@/hooks/usePrintQueue';
import { subscribeToStaff } from '@/utils/firebaseSync';
import { subscribeToCustomers, writeCustomer, subscribeToTables } from '@/utils/firebaseSync';
import { ensureVenueSeed } from '@/utils/venueSeed';
import { useCustomerStore } from '@/store/useCustomerStore';
import { usePOSStore } from '@/store/usePOSStore';
import OfflineBanner from '@/components/OfflineBanner';
import { StaffPermissions } from '@/types/staff';
import { canAccessCustomers, canAccessManagement } from '@/utils/permissions';
import { getFirstPermittedRoute } from '@/utils/permissions';
import { ensureFirebaseAuth } from '@/firebase';
import { configureTrainingSandbox } from '@/utils/trainingSandbox';
import { reconcileTrainingFirebaseSnapshots } from '@/utils/firebaseSync';
import { useInventoryStore } from '@/store/useInventoryStore';
import { useKitchenPurchasesStore } from '@/store/useKitchenPurchasesStore';
import { useMeatTrackerStore } from '@/store/useMeatTrackerStore';
import { useMaintenanceStore } from '@/store/useMaintenanceStore';
import { useBarRestockStore } from '@/store/useBarRestockStore';

type Snapshot = Record<string, unknown>;

const cloneStoreState = (state: Record<string, unknown>): Snapshot =>
  JSON.parse(JSON.stringify(
    Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function')),
  )) as Snapshot;

/**
 * Permission-based route guard.
 * Redirects to the first route the user actually has access to when
 * they try to visit a page they lack permission for.
 */
const RequirePermission = ({
  perm,
  children,
}: {
  perm: keyof StaffPermissions;
  children: React.ReactNode;
}) => {
  const currentUser = useStaffStore((s) => s.currentUser);
  const allowed = currentUser && (
    perm === 'customers'
      ? canAccessCustomers(currentUser.permissions)
      : currentUser.permissions[perm]
  );
  if (!allowed) {
    const fallback = currentUser ? getFirstPermittedRoute(currentUser.permissions) : '/';
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
};

const RequireManagement = ({ children }: { children: React.ReactNode }) => {
  const currentUser = useStaffStore((s) => s.currentUser);
  const hasManagementPermission = canAccessManagement(currentUser?.role, currentUser?.permissions);
  if (!hasManagementPermission) {
    const fallback = currentUser ? getFirstPermittedRoute(currentUser.permissions) : '/';
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
};

const App = () => {
  const [printBlocked, setPrintBlocked] = useState(false);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [firebaseAuthError, setFirebaseAuthError] = useState<string | null>(null);
  const currentUser = useStaffStore((s) => s.currentUser);
  const orders = usePOSStore((s) => s.orders);
  const trainingSnapshot = useRef<Record<string, Snapshot> | null>(null);

  configureTrainingSandbox({
    capture: () => {
      trainingSnapshot.current = {
        pos: cloneStoreState(usePOSStore.getState() as unknown as Record<string, unknown>),
        customers: cloneStoreState(useCustomerStore.getState() as unknown as Record<string, unknown>),
        inventory: cloneStoreState(useInventoryStore.getState() as unknown as Record<string, unknown>),
        kitchenPurchases: cloneStoreState(useKitchenPurchasesStore.getState() as unknown as Record<string, unknown>),
        meatTracker: cloneStoreState(useMeatTrackerStore.getState() as unknown as Record<string, unknown>),
        maintenance: cloneStoreState(useMaintenanceStore.getState() as unknown as Record<string, unknown>),
        barRestocks: cloneStoreState(useBarRestockStore.getState() as unknown as Record<string, unknown>),
        staff: cloneStoreState(useStaffStore.getState() as unknown as Record<string, unknown>),
      };
    },
    restore: () => {
      const snapshot = trainingSnapshot.current;
      if (!snapshot) return;
      usePOSStore.setState(snapshot.pos);
      useCustomerStore.setState(snapshot.customers);
      useInventoryStore.setState(snapshot.inventory);
      useKitchenPurchasesStore.setState(snapshot.kitchenPurchases);
      useMeatTrackerStore.setState(snapshot.meatTracker);
      useMaintenanceStore.setState(snapshot.maintenance);
      useBarRestockStore.setState(snapshot.barRestocks);
      useStaffStore.setState(snapshot.staff);
      trainingSnapshot.current = null;
    },
    reconcile: reconcileTrainingFirebaseSnapshots,
  });

  // Sync orders bidirectionally with Firebase Realtime Database
  useFirebaseSync(firebaseAuthReady);

  useEffect(() => {
    let cancelled = false;

    void ensureFirebaseAuth()
      .then(() => {
        if (!cancelled) setFirebaseAuthReady(true);
      })
      .catch((error) => {
        console.error('[Firebase Authentication] Unable to establish an anonymous database session.', error);
        if (!cancelled) {
          setFirebaseAuthError('Unable to connect this terminal to the secure database.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Background auto-print listener — only dispatches when this device has
  // "Enable Auto-Print Listener" turned on in Admin → Settings → Printers.
  usePrintQueue();

  // Subscribe to staff accounts immediately on mount — before any login check.
  // This runs in its own isolated effect with [] so it is never torn down and
  // re-registered by dependency changes in useFirebaseSync.
  useEffect(() => {
    if (!firebaseAuthReady) return;
    const unsubscribe = subscribeToStaff({
      setUsers: (users) => useStaffStore.getState().setUsers(users),
    });
    return unsubscribe;
  }, [firebaseAuthReady]);

  // Customer attachment is stored on the order snapshot, not on the customer
  // itself. Persist the referenced customer when a new order/customer pairing
  // appears so the Firebase customer node remains present across devices.
  const attachedCustomerByOrder = useRef(new Map<string, string>());
  useEffect(() => {
    if (!firebaseAuthReady) return;
    const customerState = useCustomerStore.getState();
    for (const order of orders) {
      const customerId = order.attachedCustomer?.id;
      if (!customerId || attachedCustomerByOrder.current.get(order.id) === customerId) continue;

      attachedCustomerByOrder.current.set(order.id, customerId);
      const customer = customerState.getCustomer(customerId);
      if (customer) {
        void writeCustomer({
          ...customer,
          repayments: customerState.repayments.filter((repayment) => repayment.customerId === customer.id),
        });
      }
    }
  }, [orders, firebaseAuthReady]);

  // Customer balances and repayment ledgers are shared across all POS devices.
  // Firebase is authoritative: an empty remote collection, including one just
  // cleared by a factory reset, must never be repopulated from a stale browser
  // cache.
  useEffect(() => {
    if (!firebaseAuthReady) return;

    const unsubscribe = subscribeToCustomers(
      (remoteCustomers) => {
        const localState = useCustomerStore.getState();
        localState.hydrateFromFirebase(remoteCustomers);
      },
      (error) => {
        console.warn('[Firebase Customer Sync] Offline or unavailable; using local customer data.', error);
      },
    );

    return unsubscribe;
  }, [firebaseAuthReady]);

  // Seed the 19 venue tables into Firebase on the very first snapshot (idempotent).
  useEffect(() => {
    if (!firebaseAuthReady) return;
    let done = false;
    let unsub: (() => void) | undefined;
    unsub = subscribeToTables((tables) => {
      if (done) return;
      done = true;
      unsub?.();
      void ensureVenueSeed(tables);
    });
    return () => unsub?.();
  }, [firebaseAuthReady]);

  useEffect(() => {
    const handler = () => setPrintBlocked(true);
    window.addEventListener('print-blocked', handler);
    return () => window.removeEventListener('print-blocked', handler);
  }, []);

  if (!firebaseAuthReady) {
    return (
      <div className="min-h-screen bg-[#0A0B0E] text-white flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-white/10 bg-[#10121A] p-6 text-center shadow-2xl">
          <h1 className="text-lg font-bold">Connecting POS terminal</h1>
          <p className="mt-2 text-sm text-zinc-300">
            {firebaseAuthError ?? 'Establishing a secure database session…'}
          </p>
        </div>
      </div>
    );
  }


  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <div className="flex min-h-0 flex-1 flex-col">
        <TooltipProvider>
          <Toaster />
          <SonnerToaster position="top-right" richColors />

          {printBlocked && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-xl shadow-lg z-50 text-sm font-semibold whitespace-nowrap">
              Enable popups to print receipt
            </div>
          )}

          {!currentUser ? (
            <PinLoginScreen />
          ) : (
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes>
                {/* Tables / POS — requires pos permission */}
                <Route
                  path="/"
                  element={
                    <RequirePermission perm="pos">
                      <TableOverview />
                    </RequirePermission>
                  }
                />
                <Route path="/order/:tableId" element={<OrderScreen />} />
                <Route path="/review/:tableId" element={<ReviewScreen />} />
                {/* UNUSED ROUTE - DO NOT USE */}
                <Route path="/payment/:tableId" element={<PaymentScreen />} />

                {/* History — requires pos permission */}
                <Route
                  path="/history"
                  element={
                    <RequirePermission perm="pos">
                      <BillHistory />
                    </RequirePermission>
                  }
                />
                <Route
                  path="/customers"
                  element={
                    <RequirePermission perm="customers">
                      <CustomersPortal />
                    </RequirePermission>
                  }
                />

                {/* Management — Admin or granular Manager permission */}
                <Route
                  path="/admin"
                  element={
                    <RequireManagement>
                      <AdminPanel />
                    </RequireManagement>
                  }
                />

                {/* Kitchen Portal — requires kitchen permission */}
                <Route
                  path="/kitchen"
                  element={
                    <RequirePermission perm="kitchen">
                      <KitchenPortal />
                    </RequirePermission>
                  }
                />

                {/* Bar Portal — requires bar permission */}
                <Route
                  path="/bar"
                  element={
                    <RequirePermission perm="bar">
                      <BarPortal />
                    </RequirePermission>
                  }
                />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
};

export default App;

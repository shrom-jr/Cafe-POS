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
import { subscribeToCustomers, writeCustomer, writeCustomersToFirebase, type FirebaseCustomerRecord, subscribeToTables } from '@/utils/firebaseSync';
import { ensureVenueSeed } from '@/utils/venueSeed';
import { useCustomerStore } from '@/store/useCustomerStore';
import { usePOSStore } from '@/store/usePOSStore';
import OfflineBanner from '@/components/OfflineBanner';
import { StaffPermissions } from '@/types/staff';
import { getFirstPermittedRoute } from '@/utils/permissions';

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
  if (!currentUser || !currentUser.permissions[perm]) {
    const fallback = currentUser ? getFirstPermittedRoute(currentUser.permissions) : '/';
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
};


const App = () => {
  const [printBlocked, setPrintBlocked] = useState(false);
  const currentUser = useStaffStore((s) => s.currentUser);
  const orders = usePOSStore((s) => s.orders);

  // Sync orders bidirectionally with Firebase Realtime Database
  useFirebaseSync();

  // Background auto-print listener — only dispatches when this device has
  // "Enable Auto-Print Listener" turned on in Admin → Settings → Printers.
  usePrintQueue();

  // Subscribe to staff accounts immediately on mount — before any login check.
  // This runs in its own isolated effect with [] so it is never torn down and
  // re-registered by dependency changes in useFirebaseSync.
  useEffect(() => {
    const unsubscribe = subscribeToStaff({
      setUsers: (users) => useStaffStore.getState().setUsers(users),
    });
    return unsubscribe;
  }, []);

  // Customer attachment is stored on the order snapshot, not on the customer
  // itself. Persist the referenced customer when a new order/customer pairing
  // appears so the Firebase customer node remains present across devices.
  const attachedCustomerByOrder = useRef(new Map<string, string>());
  useEffect(() => {
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
  }, [orders]);

  // Customer balances and repayment ledgers are shared across all POS devices.
  // Keep localStorage as the offline fallback, and seed Firebase once when the
  // new node is empty so existing local customer history is not discarded.
  useEffect(() => {
    let seedingLocalCustomers = false;
    let hasReceivedRemoteSnapshot = false;

    const unsubscribe = subscribeToCustomers(
      (remoteCustomers) => {
        const localState = useCustomerStore.getState();
        if (!hasReceivedRemoteSnapshot && remoteCustomers.length === 0 && localState.customers.length > 0) {
          if (seedingLocalCustomers) return;
          seedingLocalCustomers = true;
          const records: FirebaseCustomerRecord[] = localState.customers.map((customer) => ({
            ...customer,
            repayments: localState.repayments.filter((repayment) => repayment.customerId === customer.id),
          }));
          void writeCustomersToFirebase(records).finally(() => {
            seedingLocalCustomers = false;
          });
          return;
        }

        hasReceivedRemoteSnapshot = true;
        localState.hydrateFromFirebase(remoteCustomers);
      },
      (error) => {
        console.warn('[Firebase Customer Sync] Offline or unavailable; using local customer data.', error);
      },
    );

    return unsubscribe;
  }, []);

  // Seed the 19 venue tables into Firebase on the very first snapshot (idempotent).
  useEffect(() => {
    let done = false;
    let unsub: (() => void) | undefined;
    unsub = subscribeToTables((tables) => {
      if (done) return;
      done = true;
      unsub?.();
      void ensureVenueSeed(tables);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const handler = () => setPrintBlocked(true);
    window.addEventListener('print-blocked', handler);
    return () => window.removeEventListener('print-blocked', handler);
  }, []);

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
                    <RequirePermission perm="canViewCustomers">
                      <CustomersPortal />
                    </RequirePermission>
                  }
                />

                {/* Admin — requires admin permission */}
                <Route
                  path="/admin"
                  element={
                    <RequirePermission perm="admin">
                      <AdminPanel />
                    </RequirePermission>
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

import { useState, useEffect } from 'react';
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
import PinLoginScreen from '@/screens/PinLoginScreen';
import NotFound from './pages/NotFound.tsx';
import { useStaffStore } from '@/store/useStaffStore';
import { useFirebaseSync } from '@/hooks/useFirebaseSync';
import { subscribeToStaff } from '@/utils/firebaseSync';
import OfflineBanner from '@/components/OfflineBanner';

/** Redirects non-admin users away from /admin to / */
const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  const currentUser = useStaffStore((s) => s.currentUser);
  if (!currentUser || currentUser.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

/** Redirects non-kitchen users away from /kitchen */
const RequireKitchen = ({ children }: { children: React.ReactNode }) => {
  const currentUser = useStaffStore((s) => s.currentUser);
  if (!currentUser || currentUser.role !== 'KITCHEN') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};


const App = () => {
  const [printBlocked, setPrintBlocked] = useState(false);
  const currentUser = useStaffStore((s) => s.currentUser);

  // Sync orders bidirectionally with Firebase Realtime Database
  useFirebaseSync();

  // Subscribe to staff accounts immediately on mount — before any login check.
  // This runs in its own isolated effect with [] so it is never torn down and
  // re-registered by dependency changes in useFirebaseSync.
  useEffect(() => {
    const unsubscribe = subscribeToStaff({
      setUsers: (users) => useStaffStore.getState().setUsers(users),
    });
    return unsubscribe;
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
                {/* Kitchen users go straight to their portal */}
                <Route
                  path="/"
                  element={currentUser?.role === 'KITCHEN'
                    ? <Navigate to="/kitchen" replace />
                    : <TableOverview />}
                />
                <Route path="/order/:tableId" element={<OrderScreen />} />
                <Route path="/review/:tableId" element={<ReviewScreen />} />
                {/* UNUSED ROUTE - DO NOT USE */}
                <Route path="/payment/:tableId" element={<PaymentScreen />} />
                <Route path="/history" element={<BillHistory />} />
                <Route path="/admin" element={<RequireAdmin><AdminPanel /></RequireAdmin>} />
                <Route path="/kitchen" element={<RequireKitchen><KitchenPortal /></RequireKitchen>} />
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

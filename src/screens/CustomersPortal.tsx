import AppLayout from '@/components/ui/AppLayout';
import CustomersView from '@/components/customers/CustomersView';

const CustomersPortal = () => (
  <AppLayout title="Customers">
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6 border-b border-white/[0.06] pb-5">
          <h1 className="text-xl font-semibold text-white">Customers</h1>
          <p className="mt-0.5 text-sm text-slate-300">Check Khatta balances, receive repayments, and review customer ledgers.</p>
        </div>
        <CustomersView compact />
      </div>
    </main>
  </AppLayout>
);

export default CustomersPortal;
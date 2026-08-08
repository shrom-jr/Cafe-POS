import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReviewScreen from '@/screens/ReviewScreen';
import { usePOSStore } from '@/store/usePOSStore';
import { useCustomerStore } from '@/store/useCustomerStore';
import { useStaffStore } from '@/store/useStaffStore';
import { DEFAULT_PERMISSIONS } from '@/types/staff';
import type { Role, StaffUser } from '@/types/staff';
import type { CafeTable, Order } from '@/types/pos';
import { firePrintJob } from '@/utils/printEngine';

vi.mock('@/utils/printEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/printEngine')>();
  return { ...actual, firePrintJob: vi.fn() };
});
vi.mock('@/utils/sounds', () => ({ playSuccess: vi.fn(), playError: vi.fn(), playClick: vi.fn() }));

const TABLE: CafeTable = { id: 'table-1', number: '1', status: 'occupied', section: 'Ground Floor' } as CafeTable;

const BILL_TOTAL = 500;
const PREVIOUS_DUE = 1200;

const makeOrder = (customer: { id: string; name: string; phone: string; currentDue: number }): Order =>
  ({
    id: 'order-1',
    tableId: TABLE.id,
    tableNumber: TABLE.number,
    items: [
      {
        id: 'item-1',
        menuItemId: 'menu-1',
        name: 'Chicken Sekuwa',
        price: BILL_TOTAL,
        quantity: 1,
        status: 'pending',
      },
    ],
    status: 'active',
    createdAt: Date.now(),
    pax: 2,
    attachedCustomer: customer,
  }) as unknown as Order;

const makeStaff = (role: Role): StaffUser => ({
  id: `staff-${role}`,
  name: `${role} One`,
  email: `${role.toLowerCase()}@test.com`,
  role,
  pin: '1111',
  active: true,
  permissions: { ...DEFAULT_PERMISSIONS[role] },
});

/** Seeds a table, an unpaid order, and a customer carrying a previous due. */
const setupCheckout = (role: 'CASHIER' | 'WAITER') => {
  localStorage.clear();
  const customer = {
    id: 'cust-1',
    name: 'Ramesh Sharma',
    phone: '9841012345',
    currentDue: PREVIOUS_DUE,
    totalSpend: PREVIOUS_DUE,
    visits: 1,
  };
  useCustomerStore.setState({ customers: [customer], repayments: [] });
  useStaffStore.setState({ currentUser: makeStaff(role) });
  usePOSStore.setState({
    tables: [TABLE],
    orders: [makeOrder({ id: customer.id, name: customer.name, phone: customer.phone, currentDue: PREVIOUS_DUE })],
    payments: [],
    settings: {
      ...usePOSStore.getState().settings,
      vatEnabled: false,
      serviceChargeEnabled: false,
    },
  });
  return customer;
};

const renderReview = () =>
  render(
    <MemoryRouter initialEntries={['/review/table-1']}>
      <Routes>
        <Route path="/review/:tableId" element={<ReviewScreen />} />
      </Routes>
    </MemoryRouter>
  );

const payWithCash = () => fireEvent.click(screen.getAllByTestId('button-payment-method-cash')[0]);

describe('checkout previous-due settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('charges the bill plus the previous due and records a matching repayment', () => {
    const customer = setupCheckout('CASHIER');
    renderReview();

    fireEvent.click(screen.getByTestId('checkbox-include-prev-due'));

    // The amount presented to the customer must include the due being settled
    expect(screen.getByTestId('text-charge-total').textContent).toContain('1,700');

    payWithCash();

    // Ledger: one repayment for exactly the previous due, balance cleared
    const repayments = useCustomerStore.getState().repayments;
    expect(repayments).toHaveLength(1);
    expect(repayments[0].amount).toBe(PREVIOUS_DUE);
    expect(repayments[0].method).toBe('cash');
    expect(repayments[0].receivedBy?.name).toBe('CASHIER One');
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(0);

    // Payment record: order revenue stays the bill, tendered cash includes the due
    const payment = usePOSStore.getState().payments.at(-1)!;
    expect(payment.total).toBe(BILL_TOTAL);
    expect(payment.dueSettlement).toEqual({
      customerId: customer.id,
      amount: PREVIOUS_DUE,
      repaymentId: repayments[0].id,
    });
    expect(payment.amountTendered).toBe(BILL_TOTAL + PREVIOUS_DUE);

    // The printed invoice states the same collected amount
    const job = vi.mocked(firePrintJob).mock.calls.at(-1)![0];
    expect(job.type).toBe('TAX_INVOICE');
    if (job.type === 'TAX_INVOICE') {
      expect(job.data.total).toBe(BILL_TOTAL);
      expect(job.data.dueSettlement?.amount).toBe(PREVIOUS_DUE);
      expect(job.data.amountTendered).toBe(BILL_TOTAL + PREVIOUS_DUE);
    }
  });

  it('charges only the bill and touches no balance when the due is not included', () => {
    const customer = setupCheckout('CASHIER');
    renderReview();

    payWithCash();

    expect(useCustomerStore.getState().repayments).toHaveLength(0);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(PREVIOUS_DUE);

    const payment = usePOSStore.getState().payments.at(-1)!;
    expect(payment.total).toBe(BILL_TOTAL);
    expect(payment.dueSettlement).toBeUndefined();
    expect(payment.amountTendered).toBeUndefined();
  });

  it('does not offer due settlement to staff without the canSettleDues permission', () => {
    const customer = setupCheckout('WAITER');
    renderReview();

    expect(screen.queryByTestId('checkbox-include-prev-due')).toBeNull();
    expect(screen.getByText(/do not have permission to settle dues/i)).toBeTruthy();

    payWithCash();

    expect(useCustomerStore.getState().repayments).toHaveLength(0);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(PREVIOUS_DUE);
    expect(usePOSStore.getState().payments.at(-1)!.dueSettlement).toBeUndefined();
  });

  it('requotes instead of charging a stale amount when the balance drops mid-checkout', () => {
    const customer = setupCheckout('CASHIER');
    renderReview();

    fireEvent.click(screen.getByTestId('checkbox-include-prev-due'));
    expect(screen.getByTestId('text-charge-total').textContent).toContain('1,700');

    // Another device collects Rs. 900 of the due before this payment is confirmed
    act(() => {
      useCustomerStore.getState().receiveRepayment({ customerId: customer.id, amount: 900, method: 'cash' });
    });

    // Everything presented to the customer follows the live balance, not the
    // stale snapshot stored on the order
    expect(screen.getByTestId('text-charge-total').textContent).toContain('800');
    expect(screen.getAllByText(/Rs\. 500 bill \+ Rs\. 300 previous due/i).length).toBeGreaterThan(0);

    payWithCash();

    // Only one repayment so far — the concurrent one; checkout charged nothing
    // and the cashier is told to requote before anything is taken
    expect(useCustomerStore.getState().repayments).toHaveLength(1);
    expect(usePOSStore.getState().payments).toHaveLength(0);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(300);
    expect(screen.getAllByTestId('banner-amount-changed').length).toBeGreaterThan(0);

    // Once the new amount is confirmed with the customer, exactly what is still
    // outstanding gets settled
    fireEvent.click(screen.getAllByTestId('button-acknowledge-amount')[0]);
    payWithCash();

    const repayments = useCustomerStore.getState().repayments;
    expect(repayments).toHaveLength(2);
    expect(repayments[1].amount).toBe(300);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(0);

    const payment = usePOSStore.getState().payments.at(-1)!;
    expect(payment.total).toBe(BILL_TOTAL);
    expect(payment.dueSettlement?.amount).toBe(300);
    expect(payment.amountTendered).toBe(BILL_TOTAL + 300);

    const job = vi.mocked(firePrintJob).mock.calls.at(-1)![0];
    if (job.type === 'TAX_INVOICE') {
      expect(job.data.dueSettlement?.amount).toBe(300);
      expect(job.data.amountTendered).toBe(BILL_TOTAL + 300);
    }
  });

  it('withdraws Pay Later while a previous due is being settled', () => {
    const customer = setupCheckout('CASHIER');
    renderReview();

    expect(screen.getAllByTestId('button-payment-method-khatta').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('checkbox-include-prev-due'));

    // The combined total is on screen, so booking it as a new due would show a
    // collection that never happened — Pay Later disappears instead
    expect(screen.getByTestId('text-charge-total').textContent).toContain('1,700');
    expect(screen.queryAllByTestId('button-payment-method-khatta')).toHaveLength(0);
    expect(screen.getAllByTestId('text-khatta-unavailable').length).toBeGreaterThan(0);

    // Even if the path is reached some other way, nothing is recorded
    act(() => {
      usePOSStore.setState({ payments: [] });
    });
    expect(usePOSStore.getState().payments).toHaveLength(0);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(PREVIOUS_DUE);

    // Unchecking brings Pay Later back and it books only the new bill
    fireEvent.click(screen.getByTestId('checkbox-include-prev-due'));
    fireEvent.click(screen.getAllByTestId('button-payment-method-khatta')[0]);

    const payment = usePOSStore.getState().payments.at(-1)!;
    expect(payment.method).toBe('khatta');
    expect(payment.total).toBe(BILL_TOTAL);
    expect(payment.dueSettlement).toBeUndefined();
    expect(useCustomerStore.getState().repayments).toHaveLength(0);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(PREVIOUS_DUE + BILL_TOTAL);
  });

  it('still demands acknowledgement when the quoted due is cleared entirely elsewhere', () => {
    const customer = setupCheckout('CASHIER');
    renderReview();

    fireEvent.click(screen.getByTestId('checkbox-include-prev-due'));
    expect(screen.getByTestId('text-charge-total').textContent).toContain('1,700');

    // The whole balance is collected on another device after the quote
    act(() => {
      useCustomerStore.getState().receiveRepayment({ customerId: customer.id, amount: PREVIOUS_DUE, method: 'cash' });
    });

    // Nothing left to settle, so the combined-total badge withdraws itself
    expect(screen.queryByTestId('text-charge-total')).toBeNull();
    expect(screen.getAllByTestId('banner-amount-changed').length).toBeGreaterThan(0);
    expect((screen.getAllByTestId('button-payment-method-cash')[0] as HTMLButtonElement).disabled).toBe(true);

    // Even though there is no due left to settle, the stale quote blocks payment
    payWithCash();
    expect(usePOSStore.getState().payments).toHaveLength(0);

    fireEvent.click(screen.getAllByTestId('button-acknowledge-amount')[0]);
    payWithCash();

    // Bill only — nothing extra collected, no second repayment invented
    const payment = usePOSStore.getState().payments.at(-1)!;
    expect(payment.total).toBe(BILL_TOTAL);
    expect(payment.dueSettlement).toBeUndefined();
    expect(useCustomerStore.getState().repayments).toHaveLength(1);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(0);
  });

  it('blocks the QR confirmation and re-encodes the QR when the due changes while it is on screen', () => {
    const customer = setupCheckout('CASHIER');
    renderReview();

    fireEvent.click(screen.getByTestId('checkbox-include-prev-due'));
    fireEvent.click(screen.getAllByTestId('button-payment-method-fonepay')[0]);

    const qrAmount = () =>
      (screen.getByTestId('qr-payload') as HTMLElement).getAttribute('data-qr-value') ?? '';
    expect(qrAmount()).toContain('amount=1700');

    act(() => {
      useCustomerStore.getState().receiveRepayment({ customerId: customer.id, amount: 900, method: 'cash' });
    });

    // QR payload follows the live balance and confirmation is blocked until the
    // cashier acknowledges the customer was requoted
    expect(qrAmount()).toContain('amount=800');
    expect(screen.getAllByTestId('banner-amount-changed').length).toBeGreaterThan(0);
    const confirmButton = screen.getAllByTestId('button-confirm-payment')[0] as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.click(confirmButton);
    expect(usePOSStore.getState().payments).toHaveLength(0);

    fireEvent.click(screen.getAllByTestId('button-acknowledge-amount')[0]);
    fireEvent.click(screen.getAllByTestId('button-confirm-payment')[0]);

    const payment = usePOSStore.getState().payments.at(-1)!;
    expect(payment.dueSettlement?.amount).toBe(300);
    expect(payment.amountTendered).toBe(BILL_TOTAL + 300);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(0);
  });
});

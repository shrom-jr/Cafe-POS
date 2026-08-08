import { beforeEach, describe, expect, it } from 'vitest';
import { useCustomerStore } from '@/store/useCustomerStore';
import { toRepaymentMethod } from '@/utils/repaymentMethod';

const resetStore = () => {
  localStorage.clear();
  useCustomerStore.setState({ customers: [], repayments: [] });
};

const collectedTotal = () =>
  useCustomerStore.getState().repayments.reduce((sum, r) => sum + r.amount, 0);

describe('Khatta customer ledger', () => {
  beforeEach(resetStore);

  it('credits a Khatta charge to the attached customer', () => {
    const customer = useCustomerStore.getState().addCustomer({ name: 'Ramesh', phone: '9800000001' });
    useCustomerStore.getState().addToCustomerDue(customer.id, 450);

    const updated = useCustomerStore.getState().getCustomer(customer.id)!;
    expect(updated.currentDue).toBe(450);
    expect(updated.totalSpend).toBe(450);
    expect(updated.visits).toBe(1);
    // A charge is not a repayment — collected dues must stay untouched
    expect(collectedTotal()).toBe(0);
  });

  it('records a partial repayment and leaves the remainder outstanding', () => {
    const customer = useCustomerStore.getState().addCustomer({ name: 'Sunita', phone: '9800000002' });
    useCustomerStore.getState().addToCustomerDue(customer.id, 1000);

    const result = useCustomerStore.getState().receiveRepayment({
      customerId: customer.id,
      amount: 400,
      method: 'cash',
    });

    expect(result.ok).toBe(true);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(600);
    expect(useCustomerStore.getState().repayments).toHaveLength(1);
    expect(collectedTotal()).toBe(400);
  });

  it('records a full repayment and clears the balance', () => {
    const customer = useCustomerStore.getState().addCustomer({ name: 'Binod', phone: '9800000003' });
    useCustomerStore.getState().addToCustomerDue(customer.id, 350);

    const result = useCustomerStore.getState().receiveRepayment({
      customerId: customer.id,
      amount: 350,
      method: 'fonepay',
    });

    expect(result.ok).toBe(true);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(0);
    expect(collectedTotal()).toBe(350);
  });

  it('rejects repayments that are not positive or exceed the current due', () => {
    const customer = useCustomerStore.getState().addCustomer({ name: 'Gita', phone: '9800000004' });
    useCustomerStore.getState().addToCustomerDue(customer.id, 200);

    expect(useCustomerStore.getState().receiveRepayment({ customerId: customer.id, amount: 0, method: 'cash' }).ok).toBe(false);
    expect(useCustomerStore.getState().receiveRepayment({ customerId: customer.id, amount: 500, method: 'cash' }).ok).toBe(false);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(200);
    expect(useCustomerStore.getState().repayments).toHaveLength(0);
  });

  it('settles a previous due at checkout as an auditable ledger entry', () => {
    const customer = useCustomerStore.getState().addCustomer({ name: 'Hari', phone: '9800000005' });
    useCustomerStore.getState().addToCustomerDue(customer.id, 1200);

    // Mirrors the ReviewScreen "Include Previous Due" path
    const prevDueAmount = useCustomerStore.getState().getCustomer(customer.id)!.currentDue;
    const result = useCustomerStore.getState().receiveRepayment({
      customerId: customer.id,
      amount: prevDueAmount,
      method: toRepaymentMethod('esewa'),
      notes: 'Previous due settled at checkout · Bill #12 · eSewa',
      receivedBy: { id: 'cashier-1', name: 'Cashier One', role: 'cashier' },
    });

    expect(result.ok).toBe(true);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(0);

    const ledger = useCustomerStore.getState().repayments;
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(1200);
    expect(ledger[0].method).toBe('fonepay');
    expect(ledger[0].receivedBy?.name).toBe('Cashier One');
    expect(ledger[0].notes).toContain('checkout');
    expect(collectedTotal()).toBe(1200);
  });

  it('refuses to move a balance through the generic profile update', () => {
    const customer = useCustomerStore.getState().addCustomer({ name: 'Kiran', phone: '9800000009' });
    useCustomerStore.getState().addToCustomerDue(customer.id, 1000);

    // A balance may only change through an auditable ledger action
    useCustomerStore.getState().updateCustomer(customer.id, { currentDue: 0, name: 'Kiran B.' } as never);

    expect(useCustomerStore.getState().getCustomer(customer.id)!.currentDue).toBe(1000);
    expect(useCustomerStore.getState().getCustomer(customer.id)!.name).toBe('Kiran B.');
    expect(useCustomerStore.getState().repayments).toHaveLength(0);
  });

  it('persists the repayment ledger across store reloads', () => {
    const customer = useCustomerStore.getState().addCustomer({ name: 'Maya', phone: '9800000006' });
    useCustomerStore.getState().addToCustomerDue(customer.id, 500);
    useCustomerStore.getState().receiveRepayment({ customerId: customer.id, amount: 200, method: 'cash' });

    const stored = JSON.parse(localStorage.getItem('pos_customer_repayments') ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].amount).toBe(200);
  });
});

describe('checkout payment method mapping', () => {
  it('keeps cash as cash and settles every wallet as fonepay', () => {
    expect(toRepaymentMethod('cash')).toBe('cash');
    expect(toRepaymentMethod('fonepay')).toBe('fonepay');
    expect(toRepaymentMethod('esewa')).toBe('fonepay');
    expect(toRepaymentMethod('khalti')).toBe('fonepay');
    expect(toRepaymentMethod('custom-wallet-id')).toBe('fonepay');
  });
});

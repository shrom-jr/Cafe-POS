import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CustomersView } from '@/components/customers/CustomersView';
import { useCustomerStore } from '@/store/useCustomerStore';
import { useStaffStore } from '@/store/useStaffStore';
import { DEFAULT_PERMISSIONS } from '@/types/staff';
import type { StaffUser } from '@/types/staff';

vi.mock('@/utils/sounds', () => ({ playSuccess: vi.fn(), playError: vi.fn(), playClick: vi.fn() }));

const cashier = (): StaffUser => ({
  id: 'staff-cashier',
  name: 'Cashier One',
  email: 'cashier@test.com',
  role: 'CASHIER',
  pin: '1111',
  active: true,
  permissions: { ...DEFAULT_PERMISSIONS.CASHIER },
});

const seed = () => {
  localStorage.clear();
  useCustomerStore.setState({
    customers: [
      { id: 'cust-1', name: 'Ramesh Sharma', phone: '9841012345', currentDue: 1200, totalSpend: 1200, visits: 1 },
    ],
    repayments: [],
  });
  useStaffStore.setState({ currentUser: cashier() });
};

describe('standalone repayment modal', () => {
  beforeEach(seed);

  it('records a repayment for staff allowed to settle dues', () => {
    render(<CustomersView />);

    fireEvent.click(screen.getByText('Receive Payment'));
    fireEvent.change(screen.getByPlaceholderText(/^Up to/), { target: { value: '500' } });
    fireEvent.click(screen.getByTestId('button-submit-repayment'));

    const repayments = useCustomerStore.getState().repayments;
    expect(repayments).toHaveLength(1);
    expect(repayments[0].amount).toBe(500);
    expect(useCustomerStore.getState().getCustomer('cust-1')!.currentDue).toBe(700);
  });

  it('follows the live balance and demands acknowledgement when it changes while the modal is open', () => {
    render(<CustomersView />);

    fireEvent.click(screen.getByText('Receive Payment'));
    fireEvent.change(screen.getByPlaceholderText(/^Up to/), { target: { value: '1200' } });
    expect(screen.getByTestId('text-modal-current-due').textContent).toContain('1,200');

    // Another device collects Rs. 900 while this modal is open
    act(() => {
      useCustomerStore.getState().receiveRepayment({ customerId: 'cust-1', amount: 900, method: 'cash' });
    });

    // Displayed due, input ceiling, and full-amount shortcut all follow the store
    expect(screen.getByTestId('text-modal-current-due').textContent).toContain('300');
    expect(screen.getByPlaceholderText(/^Up to/).getAttribute('max')).toBe('300');
    expect(screen.getByText(/Use full amount · Rs\. 300/)).toBeTruthy();
    expect(screen.getByTestId('banner-due-changed')).toBeTruthy();

    // The stale Rs. 1,200 cannot be collected
    const submitButton = screen.getByTestId('button-submit-repayment') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
    fireEvent.click(submitButton);
    expect(useCustomerStore.getState().repayments).toHaveLength(1);

    // Acknowledging clears the stale amount; the live balance can then be settled
    fireEvent.click(screen.getByTestId('button-acknowledge-due'));
    fireEvent.change(screen.getByPlaceholderText(/^Up to/), { target: { value: '300' } });
    fireEvent.click(screen.getByTestId('button-submit-repayment'));

    const repayments = useCustomerStore.getState().repayments;
    expect(repayments).toHaveLength(2);
    expect(repayments[1].amount).toBe(300);
    expect(useCustomerStore.getState().getCustomer('cust-1')!.currentDue).toBe(0);
  });

  it('rejects the repayment when settle-dues permission is withdrawn while the modal is open', () => {
    render(<CustomersView />);

    fireEvent.click(screen.getByText('Receive Payment'));
    fireEvent.change(screen.getByPlaceholderText(/^Up to/), { target: { value: '500' } });

    // Permission revoked by an admin after the modal was opened
    act(() => {
      const user = useStaffStore.getState().currentUser!;
      useStaffStore.setState({
        currentUser: { ...user, permissions: { ...user.permissions, canSettleDues: false } },
      });
    });

    fireEvent.click(screen.getAllByTestId('button-submit-repayment')[0]);

    expect(useCustomerStore.getState().repayments).toHaveLength(0);
    expect(useCustomerStore.getState().getCustomer('cust-1')!.currentDue).toBe(1200);
  });
});

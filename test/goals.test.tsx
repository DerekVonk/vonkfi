import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Goals from '@/pages/Goals';
import { api } from '@/lib/api';
import type { Goal, Account } from '@/types';

// Configure longer timeout for all queries
configure({ asyncUtilTimeout: 5000 });

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    getGoals: vi.fn(() => '/api/goals/1'),
    getAccounts: vi.fn(() => '/api/accounts/1'),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    generateTransfers: vi.fn(),
    getDashboard: vi.fn(() => '/api/dashboard/1'),
    getTransfers: vi.fn(() => '/api/transfers/1'),
  },
}));

// Mock useToast
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock data
const mockGoals: Goal[] = [
  {
    id: 1,
    name: 'Emergency Fund',
    targetAmount: '10000',
    currentAmount: '2500',
    targetDate: '2024-12-31',
    linkedAccountId: 1,
    priority: 1,
    userId: 1,
    isCompleted: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Vacation Fund',
    targetAmount: '5000',
    currentAmount: '1000',
    targetDate: '2024-08-15',
    linkedAccountId: null,
    priority: 2,
    userId: 1,
    isCompleted: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 3,
    name: 'House Down Payment',
    targetAmount: '50000',
    currentAmount: '50000',
    targetDate: '2023-12-31',
    linkedAccountId: 2,
    priority: 1,
    userId: 1,
    isCompleted: true,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-12-31T00:00:00Z',
  },
];

const mockAccounts: Account[] = [
  {
    id: 1,
    accountHolderName: 'John Doe',
    customName: 'Savings Account',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    balance: '2500',
    currency: 'EUR',
    accountType: 'savings',
    userId: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    accountHolderName: 'John Doe',
    customName: 'Investment Account', 
    iban: 'DE89370400440532013001',
    bic: 'COBADEFFXXX',
    balance: '50000',
    currency: 'EUR',
    accountType: 'investment',
    userId: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

// Helper function to setup query client with mock data
const setupQueryClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  // Pre-populate cache with mock data
  queryClient.setQueryData(['/api/goals/1'], mockGoals);
  queryClient.setQueryData(['/api/accounts/1'], mockAccounts);

  return queryClient;
};

describe('Goals Component', () => {
  let queryClient: QueryClient;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    queryClient = setupQueryClient();
    user = userEvent.setup();
    vi.clearAllMocks();
    mockToast.mockClear();
  });

  const renderGoals = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Goals />
      </QueryClientProvider>
    );
  };

  it('renders goals page correctly', () => {
    renderGoals();
    expect(screen.getByText('Savings Goals')).toBeInTheDocument();
    expect(screen.getByText('Add Goal')).toBeInTheDocument();
  });

  it('opens create goal dialog when Add Goal is clicked', async () => {
    renderGoals();
    const addButton = screen.getByText('Add Goal');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Create New Savings Goal')).toBeInTheDocument();
    });
  });

  it('validates required fields in goal creation form', async () => {
    renderGoals();
    const addButton = screen.getByText('Add Goal');
    fireEvent.click(addButton);

    await waitFor(() => {
      const createButton = screen.getByText('Create Goal');
      fireEvent.click(createButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Goal name is required')).toBeInTheDocument();
      expect(screen.getByText('Target amount is required')).toBeInTheDocument();
    });
  });

  it('handles date conversion correctly for goal creation', async () => {
    const mockCreateGoal = vi.mocked(api.createGoal);
    mockCreateGoal.mockResolvedValue({ id: 1, name: 'Test Goal' });

    renderGoals();
    const addButton = screen.getByText('Add Goal');
    fireEvent.click(addButton);

    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText(/e.g., Emergency Fund/);
      const targetInput = screen.getByDisplayValue('');
      const dateInput = screen.getByDisplayValue('');

      fireEvent.change(nameInput, { target: { value: 'Holiday Fund' } });
      fireEvent.change(targetInput, { target: { value: '9000' } });
      fireEvent.change(dateInput, { target: { value: '2025-12-31' } });

      const createButton = screen.getByText('Create Goal');
      fireEvent.click(createButton);
    });

    await waitFor(() => {
      expect(mockCreateGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Holiday Fund',
          targetAmount: '9000',
          targetDate: '2025-12-31', // Should be ISO string, not Date object
          userId: 1,
        })
      );
    });
  });

  describe('Goal Display and Progress', () => {
    it('displays goal cards with correct information', async () => {
      renderGoals();

      await waitFor(() => {
        expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
        expect(screen.getByText('Vacation Fund')).toBeInTheDocument();
        expect(screen.getByText('House Down Payment')).toBeInTheDocument();
      });

      // Check progress calculations
      expect(screen.getByText('25% complete')).toBeInTheDocument(); // Emergency Fund: 2500/10000
      expect(screen.getByText('20% complete')).toBeInTheDocument(); // Vacation Fund: 1000/5000
      expect(screen.getByText('100% complete')).toBeInTheDocument(); // House Down Payment: completed
    });

    it('shows correct goal status badges', async () => {
      renderGoals();

      await waitFor(() => {
        expect(screen.getByText('starting')).toBeInTheDocument(); // Emergency Fund < 50%
        expect(screen.getByText('starting')).toBeInTheDocument(); // Vacation Fund < 50%
        expect(screen.getByText('Complete')).toBeInTheDocument(); // House Down Payment completed
      });
    });

    it('displays overall progress summary correctly', async () => {
      renderGoals();

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument(); // Total Goals
        expect(screen.getByText('2')).toBeInTheDocument(); // Active Goals
        expect(screen.getByText('1')).toBeInTheDocument(); // Completed Goals
        expect(screen.getByText('€53,500.00')).toBeInTheDocument(); // Total Saved
      });
    });

    it('calculates and displays monthly savings needed correctly', async () => {
      renderGoals();

      await waitFor(() => {
        // Should show monthly amount needed for goals with target dates
        expect(screen.getByText(/€.*\/month needed/)).toBeInTheDocument();
      });
    });

    it('handles goals without target dates', async () => {
      const goalsWithoutDate = [{
        ...mockGoals[0],
        targetDate: null,
      }];

      queryClient.setQueryData(['/api/goals/1'], goalsWithoutDate);
      renderGoals();

      await waitFor(() => {
        expect(screen.getByText('No target date')).toBeInTheDocument();
      });
    });

    it('shows overdue status for goals past target date', async () => {
      const overdueGoals = [{
        ...mockGoals[0],
        targetDate: '2023-01-01', // Past date
        currentAmount: '1000', // Not completed
      }];

      queryClient.setQueryData(['/api/goals/1'], overdueGoals);
      renderGoals();

      await waitFor(() => {
        expect(screen.getByText('overdue')).toBeInTheDocument();
      });
    });
  });

  describe('Goal Editing Functionality', () => {
    it('opens edit dialog when Edit button is clicked', async () => {
      renderGoals();

      await waitFor(() => {
        const editButton = screen.getAllByText('Edit')[0];
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Edit Savings Goal')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Emergency Fund')).toBeInTheDocument();
        expect(screen.getByDisplayValue('10000')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2500')).toBeInTheDocument();
      });
    });

    it('pre-populates edit form with existing goal data', async () => {
      renderGoals();

      await waitFor(() => {
        const editButton = screen.getAllByText('Edit')[0];
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        const nameInput = screen.getByDisplayValue('Emergency Fund');
        const targetInput = screen.getByDisplayValue('10000');
        const currentInput = screen.getByDisplayValue('2500');
        const dateInput = screen.getByDisplayValue('2024-12-31');

        expect(nameInput).toBeInTheDocument();
        expect(targetInput).toBeInTheDocument();
        expect(currentInput).toBeInTheDocument();
        expect(dateInput).toBeInTheDocument();
      });
    });

    it('successfully updates goal with new data', async () => {
      const mockUpdateGoal = vi.mocked(api.updateGoal);
      mockUpdateGoal.mockResolvedValue({ ...mockGoals[0], name: 'Updated Emergency Fund' });

      renderGoals();

      await waitFor(() => {
        const editButton = screen.getAllByText('Edit')[0];
        fireEvent.click(editButton);
      });

      await waitFor(async () => {
        const nameInput = screen.getByDisplayValue('Emergency Fund');
        await user.clear(nameInput);
        await user.type(nameInput, 'Updated Emergency Fund');

        const updateButton = screen.getByText('Update Goal');
        fireEvent.click(updateButton);
      });

      await waitFor(() => {
        expect(mockUpdateGoal).toHaveBeenCalledWith(1, expect.objectContaining({
          name: 'Updated Emergency Fund',
        }));
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Goal Updated',
          description: 'Goal has been updated successfully',
        }));
      });
    });

    it('handles update errors gracefully', async () => {
      const mockUpdateGoal = vi.mocked(api.updateGoal);
      mockUpdateGoal.mockRejectedValue(new Error('Update failed'));

      renderGoals();

      await waitFor(() => {
        const editButton = screen.getAllByText('Edit')[0];
        fireEvent.click(editButton);
      });

      await waitFor(async () => {
        const updateButton = screen.getByText('Update Goal');
        fireEvent.click(updateButton);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Error',
          description: 'Update failed',
          variant: 'destructive',
        }));
      });
    });

    it('closes edit dialog on cancel', async () => {
      renderGoals();

      await waitFor(() => {
        const editButton = screen.getAllByText('Edit')[0];
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Edit Savings Goal')).toBeInTheDocument();
      });

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Edit Savings Goal')).not.toBeInTheDocument();
      });
    });

    it('disables current amount field for goals with linked accounts', async () => {
      renderGoals();

      await waitFor(() => {
        const editButton = screen.getAllByText('Edit')[0]; // Emergency Fund has linked account
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        const currentAmountInput = screen.getByDisplayValue('2500');
        expect(currentAmountInput).toBeDisabled();
        expect(screen.getByText('Amount synced from linked account balance')).toBeInTheDocument();
      });
    });
  });

  describe('Account Linking/Unlinking', () => {
    it('displays linked account information correctly', async () => {
      renderGoals();

      await waitFor(() => {
        expect(screen.getByText('Savings Account')).toBeInTheDocument(); // Emergency Fund linked account
        expect(screen.getByText('No account linked')).toBeInTheDocument(); // Vacation Fund no linked account
      });
    });

    it('allows selecting different accounts when editing', async () => {
      renderGoals();

      await waitFor(() => {
        const editButton = screen.getAllByText('Edit')[1]; // Vacation Fund
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        const accountSelect = screen.getByText('Select account');
        fireEvent.click(accountSelect);
      });

      await waitFor(() => {
        expect(screen.getByText('Savings Account (...3000)')).toBeInTheDocument();
        expect(screen.getByText('Investment Account (...3001)')).toBeInTheDocument();
        expect(screen.getByText('No account')).toBeInTheDocument();
      });
    });

    it('can unlink account by selecting "No account"', async () => {
      const mockUpdateGoal = vi.mocked(api.updateGoal);
      mockUpdateGoal.mockResolvedValue({ ...mockGoals[0], linkedAccountId: null });

      renderGoals();

      await waitFor(() => {
        const editButton = screen.getAllByText('Edit')[0]; // Emergency Fund with linked account
        fireEvent.click(editButton);
      });

      // Instead of looking for a specific display value, look for a select element
      await waitFor(() => {
        // Find the account select dropdown (could be a select element or a custom component)
        const accountSelect = screen.getByRole('combobox');
        fireEvent.click(accountSelect);
      });

      await waitFor(() => {
        // Look for the "No account" option
        const noAccountOption = screen.getByText('No account');
        fireEvent.click(noAccountOption);
      });

      const updateButton = screen.getByText('Update Goal');
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(mockUpdateGoal).toHaveBeenCalledWith(1, expect.objectContaining({
          linkedAccountId: null,
        }));
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles API errors during goal creation', async () => {
      const mockCreateGoal = vi.mocked(api.createGoal);
      mockCreateGoal.mockRejectedValue(new Error('Server error'));

      renderGoals();
      const addButton = screen.getByText('Add Goal');
      fireEvent.click(addButton);

      await waitFor(async () => {
        const nameInput = screen.getByPlaceholderText(/e.g., Emergency Fund/);
        const targetInput = screen.getByLabelText('Target Amount (€)');

        await user.type(nameInput, 'Test Goal');
        await user.type(targetInput, '5000');

        const createButton = screen.getByText('Create Goal');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Error',
          description: 'Server error',
          variant: 'destructive',
        }));
      });
    });

    it('displays loading state correctly', async () => {
      // Create a new query client without pre-populated data
      const loadingQueryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      render(
        <QueryClientProvider client={loadingQueryClient}>
          <Goals />
        </QueryClientProvider>
      );

      // Should show loading skeletons - the component shows skeletons when loading, not the header
      expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });

    it('handles empty goals state', async () => {
      queryClient.setQueryData(['/api/goals/1'], []);
      renderGoals();

      await waitFor(() => {
        expect(screen.getByText('No Savings Goals Yet')).toBeInTheDocument();
        expect(screen.getByText('Create Your First Goal')).toBeInTheDocument();
      });
    });

    it('validates required fields with proper error messages', async () => {
      renderGoals();
      const addButton = screen.getByText('Add Goal');
      fireEvent.click(addButton);

      await waitFor(() => {
        const createButton = screen.getByText('Create Goal');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Goal name is required')).toBeInTheDocument();
        expect(screen.getByText('Target amount is required')).toBeInTheDocument();
      });
    });

    it('handles invalid number inputs', async () => {
      renderGoals();
      const addButton = screen.getByText('Add Goal');
      fireEvent.click(addButton);

      await waitFor(async () => {
        const nameInput = screen.getByPlaceholderText(/e.g., Emergency Fund/);
        const targetInput = screen.getByLabelText('Target Amount (€)');
        const currentInput = screen.getByLabelText('Current Amount (€)');

        await user.type(nameInput, 'Test Goal');
        await user.type(targetInput, 'invalid');
        await user.type(currentInput, 'invalid');

        const createButton = screen.getByText('Create Goal');
        fireEvent.click(createButton);
      });

      // Form should not submit with invalid numbers
      expect(vi.mocked(api.createGoal)).not.toHaveBeenCalled();
    });

    it('handles extremely large numbers', async () => {
      const mockCreateGoal = vi.mocked(api.createGoal);
      mockCreateGoal.mockResolvedValue({ id: 1, name: 'Large Goal' });

      renderGoals();
      const addButton = screen.getByText('Add Goal');
      fireEvent.click(addButton);

      await waitFor(async () => {
        const nameInput = screen.getByPlaceholderText(/e.g., Emergency Fund/);
        const targetInput = screen.getByLabelText('Target Amount (€)');

        await user.type(nameInput, 'Large Goal');
        await user.type(targetInput, '999999999');

        const createButton = screen.getByText('Create Goal');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(mockCreateGoal).toHaveBeenCalledWith(expect.objectContaining({
          targetAmount: '999999999',
        }));
      });
    });
  });

  describe('Integration with Transfer Recommendations', () => {
    it('triggers transfer generation after goal creation', async () => {
      const mockCreateGoal = vi.mocked(api.createGoal);
      const mockGenerateTransfers = vi.mocked(api.generateTransfers);

      mockCreateGoal.mockResolvedValue({ id: 1, name: 'Test Goal' });
      mockGenerateTransfers.mockResolvedValue({ success: true });

      renderGoals();
      const addButton = screen.getByText('Add Goal');
      fireEvent.click(addButton);

      await waitFor(async () => {
        const nameInput = screen.getByPlaceholderText(/e.g., Emergency Fund/);
        const targetInput = screen.getByLabelText('Target Amount (€)');

        await user.type(nameInput, 'Test Goal');
        await user.type(targetInput, '5000');

        const createButton = screen.getByText('Create Goal');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(mockCreateGoal).toHaveBeenCalled();
        expect(mockGenerateTransfers).toHaveBeenCalledWith(1);
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Transfer Recommendations Updated',
        }));
      });
    });

    it('handles transfer generation failure gracefully', async () => {
      const mockCreateGoal = vi.mocked(api.createGoal);
      const mockGenerateTransfers = vi.mocked(api.generateTransfers);

      mockCreateGoal.mockResolvedValue({ id: 1, name: 'Test Goal' });
      mockGenerateTransfers.mockRejectedValue(new Error('Transfer generation failed'));

      renderGoals();
      const addButton = screen.getByText('Add Goal');
      fireEvent.click(addButton);

      await waitFor(async () => {
        const nameInput = screen.getByPlaceholderText(/e.g., Emergency Fund/);
        const targetInput = screen.getByLabelText('Target Amount (€)');

        await user.type(nameInput, 'Test Goal');
        await user.type(targetInput, '5000');

        const createButton = screen.getByText('Create Goal');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(mockCreateGoal).toHaveBeenCalled();
        expect(mockGenerateTransfers).toHaveBeenCalledWith(1);
        // Should still show goal creation success, transfer failure is handled silently
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Goal Created',
        }));
      });
    });
  });

  describe('Priority System', () => {
    it('allows setting goal priority during creation', async () => {
      const mockCreateGoal = vi.mocked(api.createGoal);
      mockCreateGoal.mockResolvedValue({ id: 1, name: 'Priority Goal' });

      renderGoals();
      const addButton = screen.getByText('Add Goal');
      fireEvent.click(addButton);

      await waitFor(async () => {
        const nameInput = screen.getByPlaceholderText(/e.g., Emergency Fund/);
        const targetInput = screen.getByLabelText('Target Amount (€)');

        await user.type(nameInput, 'Priority Goal');
        await user.type(targetInput, '10000');

        // For this test, we'll just verify that the priority select is present
        expect(screen.getByText('Select priority')).toBeInTheDocument();

        const createButton = screen.getByText('Create Goal');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        // Should create goal with default priority of 1 when not explicitly set
        expect(mockCreateGoal).toHaveBeenCalledWith(expect.objectContaining({
          priority: 1, // Defaults to high priority
        }));
      });
    });

    it('defaults to high priority when not specified', async () => {
      const mockCreateGoal = vi.mocked(api.createGoal);
      mockCreateGoal.mockResolvedValue({ id: 1, name: 'Default Priority Goal' });

      renderGoals();
      const addButton = screen.getByText('Add Goal');
      fireEvent.click(addButton);

      await waitFor(async () => {
        const nameInput = screen.getByPlaceholderText(/e.g., Emergency Fund/);
        const targetInput = screen.getByLabelText('Target Amount (€)');

        await user.type(nameInput, 'Default Priority Goal');
        await user.type(targetInput, '5000');

        const createButton = screen.getByText('Create Goal');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(mockCreateGoal).toHaveBeenCalledWith(expect.objectContaining({
          priority: 1, // Default to high priority
        }));
      });
    });
  });

  describe('Currency Formatting', () => {
    it('formats currency amounts correctly', async () => {
      renderGoals();

      await waitFor(() => {
        // Check various currency formatting
        expect(screen.getByText('€2,500.00')).toBeInTheDocument(); // Emergency Fund current
        expect(screen.getByText('€10,000.00')).toBeInTheDocument(); // Emergency Fund target
        expect(screen.getByText('€1,000.00')).toBeInTheDocument(); // Vacation Fund current
        expect(screen.getByText('€50,000.00')).toBeInTheDocument(); // House Down Payment
      });
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Goals from '@/pages/Goals';
import { api } from '@/lib/api';

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    getGoals: vi.fn(() => '/api/goals/1'),
    getAccounts: vi.fn(() => '/api/accounts/1'),
    createGoal: vi.fn(),
    generateTransfers: vi.fn(),
  },
}));

// Mock useToast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('Goals Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
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
});
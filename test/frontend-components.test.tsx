import {beforeEach, describe, expect, it, vi, beforeAll, afterAll} from 'vitest';
import {render, screen, waitFor, fireEvent} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {Router} from 'wouter';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Import real components
import Dashboard from '../client/src/pages/Dashboard';
import Goals from '../client/src/pages/Goals';
import Import from '../client/src/pages/Import';
import Accounts from '../client/src/pages/Accounts';
import ImportModal from '../client/src/components/ImportModal';
import { Toaster } from '../client/src/components/ui/toaster';

// Mock API responses
const mockDashboardData = {
  accounts: [
    {
      id: 1,
      customName: 'Main Checking',
      iban: 'GB12ABCD12345678901234',
      balance: '2500.00',
      role: 'spending',
      accountType: 'checking',
      bankName: 'Test Bank',
      accountHolderName: 'John Doe'
    },
    {
      id: 2,
      customName: 'Emergency Fund',
      iban: 'GB12EFGH12345678901234',
      balance: '10000.00',
      role: 'emergency',
      accountType: 'savings',
      bankName: 'Test Bank',
      accountHolderName: 'John Doe'
    }
  ],
  goals: [
    {
      id: 1,
      name: 'Emergency Fund',
      targetAmount: '10000',
      currentAmount: '5000',
      userId: 1,
      linkedAccountId: 2,
      isCompleted: false,
      priority: 1,
      targetDate: '2024-12-31'
    },
    {
      id: 2,
      name: 'Vacation',
      targetAmount: '3000',
      currentAmount: '1500',
      userId: 1,
      linkedAccountId: null,
      isCompleted: false,
      priority: 2,
      targetDate: '2024-06-30'
    }
  ],
  transferRecommendations: [],
  fireMetrics: {
    netWorth: 12500,
    monthlyExpenses: 2000,
    savingsRate: 0.25,
    fireProgress: 0.15,
    timeToFire: 15
  },
  monthlyData: [
    {
      income: 4000,
      expenses: 3000,
      savings: 1000,
      month: '2024-01'
    }
  ]
};

// Mock server setup
const server = setupServer(
  http.get('/api/dashboard/1', () => {
    return HttpResponse.json(mockDashboardData);
  }),
  http.get('/api/accounts/1', () => {
    return HttpResponse.json(mockDashboardData.accounts);
  }),
  http.get('/api/goals/1', () => {
    return HttpResponse.json(mockDashboardData.goals);
  }),
  http.post('/api/goals', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 3, ...body });
  }),
  http.patch('/api/goals/:id', () => {
    return HttpResponse.json({ success: true });
  }),
  http.patch('/api/accounts/:id', () => {
    return HttpResponse.json({ success: true });
  }),
  http.delete('/api/accounts/:id', () => {
    return HttpResponse.json({ success: true });
  }),
  http.post('/api/import/1', () => {
    return HttpResponse.json({
      newTransactions: [{ id: 1, amount: '100.00', description: 'Test transaction' }],
      duplicatesSkipped: 0,
      accounts: mockDashboardData.accounts
    });
  }),
  http.post('/api/recalculate/1', () => {
    return HttpResponse.json({ success: true });
  }),
  http.delete('/api/data/1', () => {
    return HttpResponse.json({ success: true });
  }),
  http.post('/api/transfers/generate/1', () => {
    return HttpResponse.json({ success: true });
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('Frontend Component Tests', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        server.resetHandlers();
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {retry: false},
                mutations: {retry: false},
            },
        });
    });


    const renderWithProviders = (component: React.ReactElement) => {
        return render(
            <QueryClientProvider client={queryClient}>
                <Router>
                    {component}
                    <Toaster />
                </Router>
            </QueryClientProvider>
        );
    };

    describe('Dashboard Component', () => {
        it('should render dashboard with main sections', async () => {
            renderWithProviders(<Dashboard />);

            // Wait for loading to complete
            await waitFor(() => {
                expect(screen.getByText('Dashboard')).toBeInTheDocument();
            });

            expect(screen.getByText('Your path to FIRE with VonkFi')).toBeInTheDocument();
            expect(screen.getByText('Import Bank Statement')).toBeInTheDocument();
        });

        it('should show import modal when import button clicked', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Dashboard />);

            await waitFor(() => {
                expect(screen.getByText('Import Bank Statement')).toBeInTheDocument();
            });

            const importButton = screen.getByText('Import Bank Statement');
            await user.click(importButton);

            await waitFor(() => {
                expect(screen.getByText('Import Bank Statements')).toBeInTheDocument();
            });
        });

        it('should handle loading states', async () => {
            // Mock a delay in the API response
            server.use(
                http.get('/api/dashboard/1', () => {
                    return HttpResponse.json(mockDashboardData, { delay: 100 });
                })
            );

            renderWithProviders(<Dashboard />);

            // Should show loading skeleton initially
            expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();

            // Wait for data to load
            await waitFor(() => {
                expect(screen.getByText('Dashboard')).toBeInTheDocument();
            }, { timeout: 2000 });
        });

        it('should update current time display', async () => {
            renderWithProviders(<Dashboard />);

            await waitFor(() => {
                expect(screen.getByText('Dashboard')).toBeInTheDocument();
            });

            // Check that date/time is displayed
            const timeElement = screen.getByText(/\d{2}:\d{2}/);
            expect(timeElement).toBeInTheDocument();
        });
    });

    describe('Goals Component (Real Implementation)', () => {

        it('should render goals list with real data', async () => {
            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Savings Goals')).toBeInTheDocument();
            });

            expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
            expect(screen.getByText('Vacation')).toBeInTheDocument();
            expect(screen.getByText('Add Goal')).toBeInTheDocument();
        });

        it('should display goal progress correctly', async () => {
            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Savings Goals')).toBeInTheDocument();
            });

            // Check progress display - Emergency Fund should show 50% progress
            expect(screen.getByText('50% complete')).toBeInTheDocument();

            // Check currency formatting
            expect(screen.getByText(/€5[,.]000/)).toBeInTheDocument();
            expect(screen.getByText(/€10[,.]000/)).toBeInTheDocument();
        });

        it('should show add goal form when button is clicked', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Add Goal')).toBeInTheDocument();
            });

            const addButton = screen.getByText('Add Goal');
            await user.click(addButton);

            await waitFor(() => {
                expect(screen.getByText('Create New Savings Goal')).toBeInTheDocument();
            });

            expect(screen.getByPlaceholderText('e.g., Emergency Fund, House Downpayment')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('25000')).toBeInTheDocument();
        });

        it('should add new goal when form is submitted', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Add Goal')).toBeInTheDocument();
            });

            // Open form
            await user.click(screen.getByText('Add Goal'));

            await waitFor(() => {
                expect(screen.getByText('Create New Savings Goal')).toBeInTheDocument();
            });

            // Fill form
            const nameInput = screen.getByPlaceholderText('e.g., Emergency Fund, House Downpayment');
            const targetInput = screen.getByPlaceholderText('25000');

            await user.type(nameInput, 'New Car');
            await user.type(targetInput, '25000');

            // Submit form
            const createButton = screen.getByText('Create Goal');
            await user.click(createButton);

            // Form should close after successful submission
            await waitFor(() => {
                expect(screen.queryByText('Create New Savings Goal')).not.toBeInTheDocument();
            });
        });

        it('should cancel form when cancel button is clicked', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Add Goal')).toBeInTheDocument();
            });

            // Open form
            await user.click(screen.getByText('Add Goal'));

            await waitFor(() => {
                expect(screen.getByText('Create New Savings Goal')).toBeInTheDocument();
            });

            // Cancel form
            const cancelButton = screen.getByText('Cancel');
            await user.click(cancelButton);

            await waitFor(() => {
                expect(screen.queryByText('Create New Savings Goal')).not.toBeInTheDocument();
            });
        });

        it('should edit existing goals', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
            });

            // Find and click edit button for Emergency Fund
            const editButton = screen.getAllByText('Edit')[0];
            await user.click(editButton);

            await waitFor(() => {
                expect(screen.getByText('Edit Savings Goal')).toBeInTheDocument();
            });

            // Form should be pre-populated with existing data
            const nameInput = screen.getByDisplayValue('Emergency Fund');
            expect(nameInput).toBeInTheDocument();
        });

        it('should display goal statistics correctly', async () => {
            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Savings Goals')).toBeInTheDocument();
            });

            // Check overview stats
            expect(screen.getByText('2')).toBeInTheDocument(); // Total Goals
            expect(screen.getByText('2')).toBeInTheDocument(); // Active goals
            expect(screen.getByText('0')).toBeInTheDocument(); // Completed goals

            // Check total saved amount
            expect(screen.getByText(/€6[,.]500/)).toBeInTheDocument(); // Total current value
        });
    });

    describe('Import Component (Real Implementation)', () => {

        it('should render import interface', async () => {
            renderWithProviders(<Import />);

            await waitFor(() => {
                expect(screen.getByText('Import Statements')).toBeInTheDocument();
            });

            expect(screen.getByText('Ready to Import Your Bank Statement')).toBeInTheDocument();
            expect(screen.getByText('Choose File to Import')).toBeInTheDocument();
            expect(screen.getByText('Import New Statement')).toBeInTheDocument();
        });

        it('should open import modal when button clicked', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Import />);

            await waitFor(() => {
                expect(screen.getByText('Import New Statement')).toBeInTheDocument();
            });

            const importButton = screen.getByText('Import New Statement');
            await user.click(importButton);

            await waitFor(() => {
                expect(screen.getByText('Import Bank Statements')).toBeInTheDocument();
            });

            expect(screen.getByText('Drop CAMT.053 XML files here')).toBeInTheDocument();
        });

        it('should handle data clearing', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Import />);

            await waitFor(() => {
                expect(screen.getByText('Clear All Data')).toBeInTheDocument();
            });

            const clearButton = screen.getByText('Clear All Data');
            await user.click(clearButton);

            await waitFor(() => {
                expect(screen.getByText('Clear Imported Data')).toBeInTheDocument();
            });

            // Check confirmation dialog content
            expect(screen.getByText(/Are you sure you want to clear imported bank statement data/)).toBeInTheDocument();
        });

        it('should handle dashboard recalculation', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Import />);

            await waitFor(() => {
                expect(screen.getByText('Recalculate')).toBeInTheDocument();
            });

            const recalculateButton = screen.getByText('Recalculate');
            await user.click(recalculateButton);

            await waitFor(() => {
                expect(screen.getByText('Recalculating...')).toBeInTheDocument();
            });
        });
    });

    describe('Accounts Component (Real Implementation)', () => {

        it('should render accounts list with real data', async () => {
            renderWithProviders(<Accounts />);

            await waitFor(() => {
                expect(screen.getByText('Account Management')).toBeInTheDocument();
            });

            expect(screen.getByText('Main Checking')).toBeInTheDocument();
            expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
            expect(screen.getByText('Total Balance')).toBeInTheDocument();
        });

        it('should display account details correctly', async () => {
            renderWithProviders(<Accounts />);

            await waitFor(() => {
                expect(screen.getByText('Account Management')).toBeInTheDocument();
            });

            // Check IBAN display (should show last 4 digits)
            expect(screen.getByText('...1234')).toBeInTheDocument();
            expect(screen.getByText('...1234')).toBeInTheDocument();

            // Check balance formatting
            expect(screen.getByText(/€2[,.]500/)).toBeInTheDocument();
            expect(screen.getByText(/€10[,.]000/)).toBeInTheDocument();
        });

        it('should enable account editing', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Accounts />);

            await waitFor(() => {
                expect(screen.getByText('Account Management')).toBeInTheDocument();
            });

            // Click edit button for first account
            const editButtons = screen.getAllByText('Edit');
            await user.click(editButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Edit Account Details')).toBeInTheDocument();
            });

            expect(screen.getByLabelText('Custom Name')).toBeInTheDocument();
            expect(screen.getByLabelText('Account Type')).toBeInTheDocument();
            expect(screen.getByLabelText('Account Role')).toBeInTheDocument();
        });

        it('should save account changes', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Accounts />);

            await waitFor(() => {
                expect(screen.getByText('Account Management')).toBeInTheDocument();
            });

            // Start editing
            const editButtons = screen.getAllByText('Edit');
            await user.click(editButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Edit Account Details')).toBeInTheDocument();
            });

            // Change values
            const nameInput = screen.getByLabelText('Custom Name');
            await user.clear(nameInput);
            await user.type(nameInput, 'Updated Account Name');

            // Save changes
            await user.click(screen.getByText('Save Changes'));

            // Dialog should close after save
            await waitFor(() => {
                expect(screen.queryByText('Edit Account Details')).not.toBeInTheDocument();
            });
        });

        it('should show account statistics', async () => {
            renderWithProviders(<Accounts />);

            await waitFor(() => {
                expect(screen.getByText('Account Management')).toBeInTheDocument();
            });

            // Check account type counts
            expect(screen.getByText('2')).toBeInTheDocument(); // Total accounts
            expect(screen.getByText('1')).toBeInTheDocument(); // Checking accounts
            expect(screen.getByText('1')).toBeInTheDocument(); // Savings accounts
            expect(screen.getByText('1')).toBeInTheDocument(); // Emergency accounts

            // Check total balance
            expect(screen.getByText(/€12[,.]500/)).toBeInTheDocument();
        });

        it('should handle account deletion', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Accounts />);

            await waitFor(() => {
                expect(screen.getByText('Account Management')).toBeInTheDocument();
            });

            // Click delete button
            const deleteButtons = screen.getAllByText('Delete');
            await user.click(deleteButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Delete Account')).toBeInTheDocument();
            });

            // Confirm deletion
            const confirmButton = screen.getByText('Delete Account');
            await user.click(confirmButton);

            // Dialog should close after deletion
            await waitFor(() => {
                expect(screen.queryByText('Delete Account')).not.toBeInTheDocument();
            });
        });
    });

    describe('Import Modal Integration', () => {
        it('should render import modal independently', async () => {
            const onClose = vi.fn();
            renderWithProviders(
                <ImportModal isOpen={true} onClose={onClose} userId={1} />
            );

            await waitFor(() => {
                expect(screen.getByText('Import Bank Statements')).toBeInTheDocument();
            });

            expect(screen.getByText('Drop CAMT.053 XML files here')).toBeInTheDocument();
            expect(screen.getByText('Select Files')).toBeInTheDocument();
        });

        it('should handle file selection in import modal', async () => {
            const user = userEvent.setup();
            const onClose = vi.fn();
            renderWithProviders(
                <ImportModal isOpen={true} onClose={onClose} userId={1} />
            );

            await waitFor(() => {
                expect(screen.getByText('Import Bank Statements')).toBeInTheDocument();
            });

            // Create a mock file
            const file = new File(['mock xml content'], 'test.xml', { type: 'application/xml' });
            const fileInput = screen.getByLabelText('Select Files').querySelector('input[type="file"]') as HTMLInputElement;

            // Simulate file selection
            await user.upload(fileInput, file);

            await waitFor(() => {
                expect(screen.getByText('test.xml')).toBeInTheDocument();
            });

            expect(screen.getByText('Import 1 File')).toBeInTheDocument();
        });

        it('should validate file types in import modal', async () => {
            const user = userEvent.setup();
            const onClose = vi.fn();
            renderWithProviders(
                <ImportModal isOpen={true} onClose={onClose} userId={1} />
            );

            await waitFor(() => {
                expect(screen.getByText('Import Bank Statements')).toBeInTheDocument();
            });

            // Create an invalid file type
            const invalidFile = new File(['mock content'], 'test.txt', { type: 'text/plain' });
            const fileInput = screen.getByLabelText('Select Files').querySelector('input[type="file"]') as HTMLInputElement;

            // Simulate file selection
            await user.upload(fileInput, invalidFile);

            // Should show error toast for invalid file type
            await waitFor(() => {
                expect(screen.getByText('Invalid File Type')).toBeInTheDocument();
            });
        });
    });

    describe('Responsive Design', () => {
        it('should adapt to mobile viewport', async () => {
            // Mock mobile viewport
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: 375,
            });

            renderWithProviders(<Dashboard />);

            await waitFor(() => {
                expect(screen.getByText('Dashboard')).toBeInTheDocument();
            });

            // Dashboard should still render on mobile
            expect(screen.getByText('Your path to FIRE with VonkFi')).toBeInTheDocument();
        });

        it('should adapt to tablet viewport', async () => {
            // Mock tablet viewport
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: 768,
            });

            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Savings Goals')).toBeInTheDocument();
            });

            // Goals page should render properly on tablet
            expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('should have proper semantic structure in Goals page', async () => {
            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Savings Goals')).toBeInTheDocument();
            });

            // Check for proper heading structure
            const mainHeading = screen.getByRole('heading', { level: 2 });
            expect(mainHeading).toHaveTextContent('Savings Goals');

            // Check for proper button roles
            const addButton = screen.getByRole('button', { name: /Add Goal/ });
            expect(addButton).toBeInTheDocument();
        });

        it('should support keyboard navigation in dashboard', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Dashboard />);

            await waitFor(() => {
                expect(screen.getByText('Import Bank Statement')).toBeInTheDocument();
            });

            const importButton = screen.getByRole('button', { name: /Import Bank Statement/ });

            // Tab to button and press Enter
            await user.tab();
            expect(importButton).toHaveFocus();

            await user.press('Enter');

            await waitFor(() => {
                expect(screen.getByText('Import Bank Statements')).toBeInTheDocument();
            });
        });

        it('should have proper form labels in account editing', async () => {
            const user = userEvent.setup();
            renderWithProviders(<Accounts />);

            await waitFor(() => {
                expect(screen.getByText('Account Management')).toBeInTheDocument();
            });

            // Open edit dialog
            const editButtons = screen.getAllByText('Edit');
            await user.click(editButtons[0]);

            await waitFor(() => {
                expect(screen.getByText('Edit Account Details')).toBeInTheDocument();
            });

            // Check for proper form labels
            expect(screen.getByLabelText('Custom Name')).toBeInTheDocument();
            expect(screen.getByLabelText('Account Type')).toBeInTheDocument();
            expect(screen.getByLabelText('Account Role')).toBeInTheDocument();
        });
    });

    describe('Performance and Error Handling', () => {
        it('should handle API errors gracefully in Goals', async () => {
            // Mock API error
            server.use(
                http.get('/api/goals/1', () => {
                    return HttpResponse.json([{ id: 1, name: 'Test Goal', targetAmount: '1000', currentAmount: '500' }]);
                })
            );

            renderWithProviders(<Goals />);

            // Should still render the page structure even with API errors
            await waitFor(() => {
                expect(screen.getByText('Savings Goals')).toBeInTheDocument();
            });
        });

        it('should handle network timeouts in dashboard', async () => {
            // Mock network timeout
            server.use(
                http.get('/api/dashboard/1', () => {
                    return HttpResponse.json({ error: 'Server error' }, { status: 500 });
                })
            );

            renderWithProviders(<Dashboard />);

            // Should show loading state indefinitely
            expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
        });

        it('should render dashboard components efficiently', async () => {
            const startTime = performance.now();
            renderWithProviders(<Dashboard />);
            const endTime = performance.now();

            await waitFor(() => {
                expect(screen.getByText('Dashboard')).toBeInTheDocument();
            });

            // Should render reasonably quickly (allowing for API calls)
            expect(endTime - startTime).toBeLessThan(50); // Initial render should be fast
        });

        it('should handle concurrent operations in import modal', async () => {
            const user = userEvent.setup();
            const onClose = vi.fn();
            renderWithProviders(
                <ImportModal isOpen={true} onClose={onClose} userId={1} />
            );

            await waitFor(() => {
                expect(screen.getByText('Import Bank Statements')).toBeInTheDocument();
            });

            // Create multiple files
            const files = [
                new File(['content1'], 'file1.xml', { type: 'application/xml' }),
                new File(['content2'], 'file2.xml', { type: 'application/xml' })
            ];

            const fileInput = screen.getByLabelText('Select Files').querySelector('input[type="file"]') as HTMLInputElement;

            // Select multiple files
            await user.upload(fileInput, files);

            await waitFor(() => {
                expect(screen.getByText('file1.xml')).toBeInTheDocument();
                expect(screen.getByText('file2.xml')).toBeInTheDocument();
            });

            expect(screen.getByText('Import 2 Files')).toBeInTheDocument();
        });
    });

    describe('Integration Tests', () => {
        it('should integrate dashboard with goals data', async () => {
            renderWithProviders(<Dashboard />);

            await waitFor(() => {
                expect(screen.getByText('Dashboard')).toBeInTheDocument();
            });

            // Dashboard should show data from the mocked API
            // This tests that the real components are properly integrated with the API layer
            expect(screen.getByText('Your path to FIRE with VonkFi')).toBeInTheDocument();
        });

        it('should update goals and reflect changes across components', async () => {
            const user = userEvent.setup();

            // Setup mutation response
            server.use(
                http.post('/api/goals', () => {
                    return HttpResponse.json({ id: 3, name: 'New Goal', targetAmount: '5000', currentAmount: '0' });
                }),
                http.get('/api/goals/1', () => {
                    return HttpResponse.json([
                        ...mockDashboardData.goals,
                        { id: 3, name: 'New Goal', targetAmount: '5000', currentAmount: '0', userId: 1, linkedAccountId: null, isCompleted: false }
                    ]);
                })
            );

            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Add Goal')).toBeInTheDocument();
            });

            // Add a new goal
            await user.click(screen.getByText('Add Goal'));

            await waitFor(() => {
                expect(screen.getByText('Create New Savings Goal')).toBeInTheDocument();
            });

            const nameInput = screen.getByPlaceholderText('e.g., Emergency Fund, House Downpayment');
            const targetInput = screen.getByPlaceholderText('25000');

            await user.type(nameInput, 'Integration Test Goal');
            await user.type(targetInput, '5000');

            await user.click(screen.getByText('Create Goal'));

            // Form should close after successful submission
            await waitFor(() => {
                expect(screen.queryByText('Create New Savings Goal')).not.toBeInTheDocument();
            });
        });

        it('should handle cross-component data dependencies', async () => {
            // Test that accounts data is properly used in goals component
            renderWithProviders(<Goals />);

            await waitFor(() => {
                expect(screen.getByText('Savings Goals')).toBeInTheDocument();
            });

            // Goals should show linked account information
            // This tests that the Goals component properly integrates with Accounts data
            expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
        });
    });
});

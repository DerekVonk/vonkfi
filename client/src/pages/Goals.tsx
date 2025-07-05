import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Target, Plus, TrendingUp, DollarSign, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Goal, Account } from "@/types";

const DEMO_USER_ID = 1;

const createGoalSchema = z.object({
  name: z.string().min(1, "Goal name is required"),
  targetAmount: z.string().min(1, "Target amount is required"),
  currentAmount: z.string().optional(),
  targetDate: z.string().optional(),
  linkedAccountId: z.string().optional(),
  priority: z.string().optional(),
});

type CreateGoalForm = z.infer<typeof createGoalSchema>;

export default function Goals() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: goals, isLoading: goalsLoading } = useQuery<Goal[]>({
    queryKey: ['goals', DEMO_USER_ID],
    queryFn: async () => {
      const response = await fetch(api.getGoals(DEMO_USER_ID));
      if (!response.ok) {
        throw new Error('Failed to fetch goals');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', DEMO_USER_ID],
    queryFn: async () => {
      const response = await fetch(api.getAccounts(DEMO_USER_ID));
      if (!response.ok) {
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const createGoalMutation = useMutation({
    mutationFn: (data: any) => api.createGoal(data),
    onSuccess: async () => {
      toast({
        title: "Goal Created",
        description: "New savings goal has been created successfully",
        duration: 5000,
      });
      
      // Automatically generate transfer recommendations after goal creation
      try {
        await api.generateTransfers(DEMO_USER_ID);
        toast({
          title: "Transfer Recommendations Updated",
          description: "New transfer instructions generated based on your goals",
          duration: 5000,
        });
      } catch (error) {
        console.log("Transfer generation completed");
      }
      
      queryClient.invalidateQueries({ queryKey: ['goals', DEMO_USER_ID] });
      queryClient.invalidateQueries({ queryKey: ['transfers', DEMO_USER_ID] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', DEMO_USER_ID] });
      setShowCreateDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create goal",
        variant: "destructive",
      });
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ goalId, updates }: { goalId: number; updates: any }) => 
      api.updateGoal(goalId, updates),
    onSuccess: () => {
      toast({
        title: "Goal Updated",
        description: "Goal has been updated successfully",
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: ['goals', DEMO_USER_ID] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', DEMO_USER_ID] });
      setShowEditDialog(false);
      setEditingGoal(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update goal",
        variant: "destructive",
      });
    },
  });

  const form = useForm<CreateGoalForm>({
    resolver: zodResolver(createGoalSchema),
    defaultValues: {
      name: "",
      targetAmount: "",
      currentAmount: "0",
    },
  });

  const editForm = useForm<CreateGoalForm>({
    resolver: zodResolver(createGoalSchema),
    defaultValues: {
      name: "",
      targetAmount: "",
      currentAmount: "0",
    },
  });

  const onSubmit = (data: CreateGoalForm) => {
    const goalData = {
      name: data.name,
      targetAmount: parseFloat(data.targetAmount).toString(),
      currentAmount: data.currentAmount ? parseFloat(data.currentAmount).toString() : "0",
      targetDate: data.targetDate || null,
      linkedAccountId: (data.linkedAccountId && data.linkedAccountId !== "none") ? parseInt(data.linkedAccountId) : null,
      priority: data.priority ? parseInt(data.priority) : 1,
      userId: DEMO_USER_ID,
    };
    createGoalMutation.mutate(goalData);
  };

  const formatCurrency = (amount: number | string | null) => {
    const num = typeof amount === 'string' ? parseFloat(amount || '0') : (amount || 0);
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(num);
  };

  const getGoalProgress = (goal: Goal) => {
    const current = parseFloat(goal.currentAmount || '0');
    const target = parseFloat(goal.targetAmount || '0');
    if (target === 0) return 0;
    return Math.min((current / target) * 100, 100);
  };

  const getGoalStatus = (goal: Goal) => {
    const progress = getGoalProgress(goal);
    const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
    const now = new Date();
    
    if (progress >= 100) return { status: 'completed', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    if (targetDate && targetDate < now) return { status: 'overdue', color: 'bg-red-100 text-red-800', icon: AlertTriangle };
    if (progress >= 80) return { status: 'near completion', color: 'bg-blue-100 text-blue-800', icon: TrendingUp };
    if (progress >= 50) return { status: 'in progress', color: 'bg-yellow-100 text-yellow-800', icon: Clock };
    return { status: 'starting', color: 'bg-gray-100 text-gray-800', icon: Target };
  };

  const getAccountName = (accountId: number | null) => {
    if (!accountId) return 'No account linked';
    const account = accounts?.find(a => a.id === accountId);
    return account?.customName || account?.accountHolderName || 'Unknown Account';
  };

  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    
    // Populate edit form with existing goal data
    editForm.reset({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount || '0',
      targetDate: goal.targetDate || "",
      linkedAccountId: goal.linkedAccountId ? goal.linkedAccountId.toString() : "none",
    });
    
    setShowEditDialog(true);
  };

  const onEditSubmit = (data: CreateGoalForm) => {
    if (!editingGoal) return;
    
    const updates = {
      name: data.name,
      targetAmount: parseFloat(data.targetAmount).toString(),
      currentAmount: data.currentAmount ? parseFloat(data.currentAmount).toString() : editingGoal.currentAmount,
      targetDate: data.targetDate || null,
      linkedAccountId: (data.linkedAccountId && data.linkedAccountId !== "none") ? parseInt(data.linkedAccountId) : null,
    };
    
    updateGoalMutation.mutate({ goalId: editingGoal.id, updates });
  };

  const goalsArray = Array.isArray(goals) ? goals : [];
  const activeGoals = goalsArray.filter(g => !g.isCompleted);
  const completedGoals = goalsArray.filter(g => g.isCompleted);
  const totalTargetValue = goalsArray.reduce((sum, g) => sum + parseFloat(g.targetAmount || '0'), 0);
  const totalCurrentValue = goalsArray.reduce((sum, g) => sum + parseFloat(g.currentAmount || '0'), 0);

  if (goalsLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="animate-pulse space-y-4 sm:space-y-6">
          <div className="h-6 sm:h-8 bg-gray-200 rounded w-1/2 sm:w-1/4"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-40 sm:h-48 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl font-semibold text-neutral-800">Savings Goals</h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Track your progress towards financial independence with targeted savings goals
            </p>
          </div>
          
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="fire-button-primary w-full sm:w-auto flex-shrink-0">
                <Plus className="w-4 h-4 mr-2" />
                Add Goal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Savings Goal</DialogTitle>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Goal Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Emergency Fund, House Downpayment" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="targetAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Amount (€)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="25000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="currentAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Amount (€)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="targetDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="linkedAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Linked Account (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No account</SelectItem>
                            {accounts?.map((account) => (
                              <SelectItem key={account.id} value={account.id.toString()}>
                                {account.customName || account.accountHolderName} (...{account.iban.slice(-4)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">High Priority</SelectItem>
                            <SelectItem value="2">Medium Priority</SelectItem>
                            <SelectItem value="3">Low Priority</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex space-x-3 pt-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setShowCreateDialog(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createGoalMutation.isPending}
                      className="flex-1 fire-button-primary"
                    >
                      {createGoalMutation.isPending ? "Creating..." : "Create Goal"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Goals Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Target className="text-blue-600" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold text-neutral-800">{goalsArray.length}</p>
                <p className="text-xs sm:text-sm text-neutral-400 truncate">Total Goals</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="text-yellow-600" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold text-neutral-800">{activeGoals.length}</p>
                <p className="text-xs sm:text-sm text-neutral-400 truncate">Active</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle className="text-green-600" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold text-neutral-800">{completedGoals.length}</p>
                <p className="text-xs sm:text-sm text-neutral-400 truncate">Completed</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <DollarSign className="text-purple-600" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-lg font-bold text-neutral-800 truncate">{formatCurrency(totalCurrentValue)}</p>
                <p className="text-xs sm:text-sm text-neutral-400 truncate">Total Saved</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Overall Progress */}
        {goalsArray.length > 0 && (
          <Card className="p-6">
            <CardHeader className="px-0 pt-0">
              <CardTitle>Overall Goals Progress</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">Total Progress</span>
                  <span className="font-medium text-neutral-800">
                    {formatCurrency(totalCurrentValue)} of {formatCurrency(totalTargetValue)}
                  </span>
                </div>
                <Progress value={(totalCurrentValue / totalTargetValue) * 100} className="h-3" />
                <div className="flex items-center justify-between text-sm text-neutral-400">
                  <span>Saved: {((totalCurrentValue / totalTargetValue) * 100).toFixed(1)}%</span>
                  <span>Remaining: {formatCurrency(totalTargetValue - totalCurrentValue)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Goals */}
        {activeGoals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Active Goals</span>
                <Badge className="bg-blue-100 text-blue-800">
                  {activeGoals.length} active
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeGoals.map((goal) => {
                  const progress = getGoalProgress(goal);
                  const status = getGoalStatus(goal);
                  const StatusIcon = status.icon;
                  
                  return (
                    <div key={goal.id} className="p-4 border border-neutral-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-neutral-800">{goal.name}</h4>
                        <div className="flex items-center space-x-2">
                          <button 
                            onClick={() => handleEditGoal(goal)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                          <Badge className={status.color}>
                            {status.status}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <StatusIcon className="text-neutral-400" size={16} />
                          <span className="text-xs text-neutral-500">
                            {getAccountName(goal.linkedAccountId)}
                          </span>
                        </div>
                        
                        <div>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-neutral-600">{formatCurrency(goal.currentAmount || '0')}</span>
                            <span className="text-neutral-600">{formatCurrency(goal.targetAmount || '0')}</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                        
                        <div className="flex items-center justify-between text-xs text-neutral-400">
                          <span>
                            {goal.targetDate 
                              ? `Target: ${new Date(goal.targetDate).toLocaleDateString()}`
                              : 'No target date'
                            }
                          </span>
                          <span>{progress.toFixed(0)}% complete</span>
                        </div>
                        
                        {goal.targetDate && (
                          <div className="text-xs text-neutral-500">
                            {(() => {
                              const remaining = parseFloat(goal.targetAmount || '0') - parseFloat(goal.currentAmount || '0');
                              const daysLeft = Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                              const monthlyNeeded = daysLeft > 0 ? (remaining / (daysLeft / 30)) : 0;
                              return `€${monthlyNeeded.toFixed(0)}/month needed`;
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Completed Goals */}
        {completedGoals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Completed Goals</span>
                <Badge className="bg-green-100 text-green-800">
                  {completedGoals.length} completed
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {completedGoals.map((goal) => (
                  <div key={goal.id} className="p-4 border border-green-200 rounded-lg bg-green-50/50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-neutral-800">{goal.name}</h4>
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle size={12} className="mr-1" />
                        Complete
                      </Badge>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-600">Final Amount</span>
                        <span className="font-semibold text-green-600">{formatCurrency(goal.currentAmount || '0')}</span>
                      </div>
                      
                      <Progress value={100} className="h-2" />
                      
                      <div className="text-xs text-neutral-500">
                        Goal achieved! 🎉
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {goalsArray.length === 0 && (
          <Card className="p-8 text-center">
            <Target className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Savings Goals Yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Create your first savings goal to start tracking your progress towards financial independence.
            </p>
            <Button onClick={() => setShowCreateDialog(true)} className="fire-button-primary">
              Create Your First Goal
            </Button>
          </Card>
        )}
      </div>

      {/* Edit Goal Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Savings Goal</DialogTitle>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Goal Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Emergency Fund" 
                        {...field} 
                        defaultValue={editingGoal?.name || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="targetAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Amount (€)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="5000" 
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="currentAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Amount (€)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="0" 
                        {...field}
                        disabled={!!editingGoal?.linkedAccountId}
                      />
                    </FormControl>
                    {editingGoal?.linkedAccountId && (
                      <p className="text-xs text-blue-600">
                        Amount synced from linked account balance
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="targetDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Date (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="linkedAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linked Account (Optional)</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No account</SelectItem>
                        {accounts?.map((account) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            {account.customName || account.accountHolderName} (...{account.iban.slice(-4)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-600">
                      Link to account to auto-sync current amount from account balance
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex space-x-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingGoal(null);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateGoalMutation.isPending}
                  className="flex-1 fire-button-primary"
                >
                  {updateGoalMutation.isPending ? "Updating..." : "Update Goal"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

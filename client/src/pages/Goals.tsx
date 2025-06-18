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
import { Target, Plus, TrendingUp, Calendar, DollarSign, CheckCircle, Clock, AlertTriangle } from "lucide-react";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: goals, isLoading: goalsLoading } = useQuery<Goal[]>({
    queryKey: [api.getGoals(DEMO_USER_ID)],
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: [api.getAccounts(DEMO_USER_ID)],
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
      
      queryClient.invalidateQueries({ queryKey: [api.getGoals(DEMO_USER_ID)] });
      queryClient.invalidateQueries({ queryKey: [api.getTransfers(DEMO_USER_ID)] });
      queryClient.invalidateQueries({ queryKey: [api.getDashboard(DEMO_USER_ID)] });
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

  const form = useForm<CreateGoalForm>({
    resolver: zodResolver(createGoalSchema),
    defaultValues: {
      name: "",
      targetAmount: "",
      currentAmount: "0",
      priority: "1",
    },
  });

  const onSubmit = (data: CreateGoalForm) => {
    const goalData = {
      name: data.name,
      targetAmount: parseFloat(data.targetAmount).toString(),
      currentAmount: data.currentAmount ? parseFloat(data.currentAmount).toString() : "0",
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      linkedAccountId: (data.linkedAccountId && data.linkedAccountId !== "none") ? parseInt(data.linkedAccountId) : null,
      priority: data.priority ? parseInt(data.priority) : 1,
      userId: DEMO_USER_ID,
    };
    createGoalMutation.mutate(goalData);
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(num);
  };

  const getGoalProgress = (goal: Goal) => {
    const current = parseFloat(goal.currentAmount);
    const target = parseFloat(goal.targetAmount);
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

  const activeGoals = goals?.filter(g => !g.isCompleted) || [];
  const completedGoals = goals?.filter(g => g.isCompleted) || [];
  const totalTargetValue = goals?.reduce((sum, g) => sum + parseFloat(g.targetAmount), 0) || 0;
  const totalCurrentValue = goals?.reduce((sum, g) => sum + parseFloat(g.currentAmount), 0) || 0;

  if (goalsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-800">Savings Goals</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Track your progress towards financial independence with targeted savings goals
            </p>
          </div>
          
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="fire-button-primary">
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

      <div className="p-6 space-y-6">
        {/* Goals Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Target className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{goals?.length || 0}</p>
                <p className="text-sm text-neutral-400">Total Goals</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock className="text-yellow-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{activeGoals.length}</p>
                <p className="text-sm text-neutral-400">Active</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{completedGoals.length}</p>
                <p className="text-sm text-neutral-400">Completed</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <DollarSign className="text-purple-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{formatCurrency(totalCurrentValue)}</p>
                <p className="text-sm text-neutral-400">Total Saved</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Overall Progress */}
        {goals && goals.length > 0 && (
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
                        <Badge className={status.color}>
                          {status.status}
                        </Badge>
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
                            <span className="text-neutral-600">{formatCurrency(goal.currentAmount)}</span>
                            <span className="text-neutral-600">{formatCurrency(goal.targetAmount)}</span>
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
                              const remaining = parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount);
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
                        <span className="font-semibold text-green-600">{formatCurrency(goal.currentAmount)}</span>
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

        {(!goals || goals.length === 0) && (
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
    </>
  );
}

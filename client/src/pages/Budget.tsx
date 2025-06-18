import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Calculator, Plus, Target, TrendingUp, AlertCircle, CheckCircle, DollarSign, Calendar } from "lucide-react";
import { api } from "@/lib/api";

const DEMO_USER_ID = 1;

interface BudgetPeriod {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  totalIncome: string;
  totalAllocated: string;
  isActive: boolean;
}

interface BudgetCategory {
  id: number;
  categoryId: number;
  allocatedAmount: string;
  spentAmount: string;
  priority: number;
  isFixed: boolean;
  categoryName: string;
  categoryType: string;
}

interface BudgetAccount {
  id: number;
  accountId: number;
  role: string;
  targetBalance: string;
  allocatedAmount: string;
  accountName: string;
  bankName: string;
  balance: string;
}

export default function Budget() {
  const [showCreatePeriodDialog, setShowCreatePeriodDialog] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [newPeriod, setNewPeriod] = useState({
    name: "",
    startDate: "",
    endDate: "",
    totalIncome: "",
  });
  const [syncData, setSyncData] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const [categoryData, setCategoryData] = useState({
    categoryId: "",
    allocatedAmount: "",
    priority: "1",
    isFixed: false,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activePeriod, isLoading: periodLoading } = useQuery<BudgetPeriod>({
    queryKey: [`/api/budget/periods/active/${DEMO_USER_ID}`],
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<BudgetCategory[]>({
    queryKey: [`/api/budget/categories/${activePeriod?.id}`],
    enabled: !!activePeriod,
  });

  const { data: budgetAccounts = [], isLoading: accountsLoading } = useQuery<BudgetAccount[]>({
    queryKey: [`/api/budget/accounts/${activePeriod?.id}`],
    enabled: !!activePeriod,
  });

  const { data: availableCategories = [] } = useQuery<any[]>({
    queryKey: ['/api/categories'],
  });

  const { data: accounts = [] } = useQuery({
    queryKey: [`/api/accounts/${DEMO_USER_ID}`],
  });

  const incomeAccount = accounts.find((acc: any) => acc.role === 'income');

  const syncMonthlyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/budget/sync-monthly/${DEMO_USER_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to sync monthly budget');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Monthly Budget Synced",
        description: `Created ${data.period.name} with ${data.categoriesCreated} categories from ${data.transactionCount} transactions (${formatCurrency(data.totalIncome)} income)`,
      });
      queryClient.invalidateQueries();
      setShowSyncDialog(false);
    },
  });

  const createPeriodMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/budget/periods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, userId: DEMO_USER_ID }),
      });
      if (!response.ok) throw new Error('Failed to create budget period');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Budget Period Created",
        description: "New budget period created successfully. Start allocating your income!",
      });
      queryClient.invalidateQueries();
      setShowCreatePeriodDialog(false);
      setNewPeriod({ name: "", startDate: "", endDate: "", totalIncome: "" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await fetch(`/api/budget/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update budget category');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Budget Updated",
        description: "Category allocation updated successfully",
      });
      queryClient.invalidateQueries();
      setShowCategoryDialog(false);
      setEditingCategory(null);
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/budget/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          budgetPeriodId: activePeriod?.id,
        }),
      });
      if (!response.ok) throw new Error('Failed to add budget category');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Category Added",
        description: "Budget category added successfully",
      });
      queryClient.invalidateQueries();
      setShowCategoryDialog(false);
      setCategoryData({ categoryId: "", allocatedAmount: "", priority: "1", isFixed: false });
    },
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(num);
  };

  const totalAllocated = categories.reduce((sum, cat) => sum + parseFloat(cat.allocatedAmount), 0);
  const totalSpent = categories.reduce((sum, cat) => sum + parseFloat(cat.spentAmount), 0);
  const totalIncome = parseFloat(activePeriod?.totalIncome || '0');
  const remainingToBudget = totalIncome - totalAllocated;
  const isFullyBudgeted = Math.abs(remainingToBudget) < 0.01;

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'bg-red-100 text-red-800'; // Needs
      case 2: return 'bg-yellow-100 text-yellow-800'; // Wants
      case 3: return 'bg-green-100 text-green-800'; // Savings
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1: return 'Need';
      case 2: return 'Want';
      case 3: return 'Save';
      default: return 'Other';
    }
  };

  if (periodLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="animate-pulse space-y-4 sm:space-y-6">
          <div className="h-6 sm:h-8 bg-gray-200 rounded w-1/2 sm:w-1/4"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!activePeriod) {
    return (
      <div className="p-4 sm:p-6">
        <header className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-4 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-semibold text-neutral-800">Zero Based Budget</h2>
              <p className="text-xs sm:text-sm text-neutral-400 mt-1">
                Every euro gets a job. Allocate your income to categories until you reach zero.
              </p>
            </div>
          </div>
        </header>

        <Card className="p-8 text-center">
          <Calculator className="w-16 h-16 text-blue-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Budget Period</h3>
          <p className="text-sm text-gray-500 mb-6">
            Create your first budget period to start using Zero Based Budgeting. 
            Assign every euro of income to specific categories until you reach zero remaining.
          </p>
          
          <Dialog open={showCreatePeriodDialog} onOpenChange={setShowCreatePeriodDialog}>
            <DialogTrigger asChild>
              <Button className="fire-button-primary">
                <Plus className="w-4 h-4 mr-2" />
                Create Budget Period
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Budget Period</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Period Name</Label>
                  <Input
                    id="name"
                    value={newPeriod.name}
                    onChange={(e) => setNewPeriod(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., January 2025"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={newPeriod.startDate}
                      onChange={(e) => setNewPeriod(prev => ({ ...prev, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={newPeriod.endDate}
                      onChange={(e) => setNewPeriod(prev => ({ ...prev, endDate: e.target.value }))}
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="totalIncome">Expected Income</Label>
                  <Input
                    id="totalIncome"
                    type="number"
                    step="0.01"
                    value={newPeriod.totalIncome}
                    onChange={(e) => setNewPeriod(prev => ({ ...prev, totalIncome: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                
                <div className="flex space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowCreatePeriodDialog(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => createPeriodMutation.mutate(newPeriod)}
                    disabled={createPeriodMutation.isPending}
                    className="flex-1 fire-button-primary"
                  >
                    {createPeriodMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl font-semibold text-neutral-800">Zero Based Budget</h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              {activePeriod.name} • Every euro gets a job
            </p>
          </div>
          
          <div className="flex space-x-2">
            <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
              <DialogTrigger asChild>
                <Button className="fire-button-primary flex-shrink-0">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Sync Monthly
                </Button>
              </DialogTrigger>
            </Dialog>
            
            <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex-shrink-0">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </DialogTrigger>
            </Dialog>
            
            <Dialog open={showCreatePeriodDialog} onOpenChange={setShowCreatePeriodDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex-shrink-0">
                  <Calendar className="w-4 h-4 mr-2" />
                  Manual Period
                </Button>
              </DialogTrigger>
            </Dialog>
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Budget Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <DollarSign className="text-blue-600" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-lg font-bold text-neutral-800 truncate">{formatCurrency(totalIncome)}</p>
                <p className="text-xs sm:text-sm text-neutral-400 truncate">Total Income</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Target className="text-green-600" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-lg font-bold text-neutral-800 truncate">{formatCurrency(totalAllocated)}</p>
                <p className="text-xs sm:text-sm text-neutral-400 truncate">Allocated</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <TrendingUp className="text-yellow-600" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm sm:text-lg font-bold text-neutral-800 truncate">{formatCurrency(totalSpent)}</p>
                <p className="text-xs sm:text-sm text-neutral-400 truncate">Spent</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isFullyBudgeted ? 'bg-green-100' : 'bg-orange-100'
              }`}>
                {isFullyBudgeted ? (
                  <CheckCircle className="text-green-600" size={16} />
                ) : (
                  <AlertCircle className="text-orange-600" size={16} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm sm:text-lg font-bold truncate ${
                  remainingToBudget > 0 ? 'text-orange-600' : remainingToBudget < 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {formatCurrency(Math.abs(remainingToBudget))}
                </p>
                <p className="text-xs sm:text-sm text-neutral-400 truncate">
                  {remainingToBudget > 0 ? 'To Allocate' : remainingToBudget < 0 ? 'Over Budget' : 'Balanced'}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Zero Based Budgeting Progress */}
        <Card className="p-4 sm:p-6">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle className="flex items-center space-x-2">
              <Calculator className="w-5 h-5" />
              <span>Budget Progress</span>
              {isFullyBudgeted && (
                <Badge className="bg-green-100 text-green-800">
                  ✓ Zero Based
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-600">Budget Allocation</span>
                <span className="font-medium text-neutral-800">
                  {formatCurrency(totalAllocated)} of {formatCurrency(totalIncome)}
                </span>
              </div>
              <Progress value={(totalAllocated / totalIncome) * 100} className="h-3" />
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>
                  {((totalAllocated / totalIncome) * 100).toFixed(1)}% allocated
                </span>
                <span>
                  {remainingToBudget !== 0 && (
                    remainingToBudget > 0 ? 
                      `${formatCurrency(remainingToBudget)} remaining` : 
                      `${formatCurrency(Math.abs(remainingToBudget))} over budget`
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Budget Categories */}
        <Card className="p-4 sm:p-6">
          <CardHeader className="px-0 pt-0 pb-4">
            <CardTitle>Budget Categories</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {categoriesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
                ))}
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8">
                <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-4">No budget categories yet</p>
                <Button 
                  onClick={() => setShowCategoryDialog(true)}
                  variant="outline"
                >
                  Add First Category
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map((category) => {
                  const progress = parseFloat(category.spentAmount) / parseFloat(category.allocatedAmount) * 100;
                  const isOverBudget = progress > 100;
                  
                  return (
                    <div 
                      key={category.id} 
                      className="p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer"
                      onClick={() => {
                        setEditingCategory(category);
                        setCategoryData({
                          categoryId: category.categoryId.toString(),
                          allocatedAmount: category.allocatedAmount,
                          priority: category.priority.toString(),
                          isFixed: category.isFixed,
                        });
                        setShowCategoryDialog(true);
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-medium text-neutral-800">{category.categoryName}</h4>
                          <Badge className={getPriorityColor(category.priority)}>
                            {getPriorityLabel(category.priority)}
                          </Badge>
                          {category.isFixed && (
                            <Badge variant="outline">Fixed</Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-neutral-800">
                            {formatCurrency(category.allocatedAmount)}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {formatCurrency(category.spentAmount)} spent
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <Progress 
                          value={Math.min(progress, 100)} 
                          className={`h-2 ${isOverBudget ? 'bg-red-100' : ''}`}
                        />
                        <div className="flex justify-between text-xs">
                          <span className={isOverBudget ? 'text-red-600' : 'text-neutral-500'}>
                            {progress.toFixed(1)}% used
                          </span>
                          <span className="text-neutral-500">
                            {formatCurrency(parseFloat(category.allocatedAmount) - parseFloat(category.spentAmount))} remaining
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Category Dialog */}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingCategory ? 'Edit Budget Category' : 'Add Budget Category'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="category">Category</Label>
            <Select 
              value={categoryData.categoryId} 
              onValueChange={(value) => setCategoryData(prev => ({ ...prev, categoryId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="amount">Allocated Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={categoryData.allocatedAmount}
              onChange={(e) => setCategoryData(prev => ({ ...prev, allocatedAmount: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Select 
              value={categoryData.priority} 
              onValueChange={(value) => setCategoryData(prev => ({ ...prev, priority: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Need (Essential)</SelectItem>
                <SelectItem value="2">Want (Discretionary)</SelectItem>
                <SelectItem value="3">Save (Future Goals)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isFixed"
              checked={categoryData.isFixed}
              onChange={(e) => setCategoryData(prev => ({ ...prev, isFixed: e.target.checked }))}
              className="rounded"
            />
            <Label htmlFor="isFixed">Fixed expense (same amount each period)</Label>
          </div>
          
          <div className="flex space-x-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setShowCategoryDialog(false);
                setEditingCategory(null);
                setCategoryData({ categoryId: "", allocatedAmount: "", priority: "1", isFixed: false });
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (editingCategory) {
                  updateCategoryMutation.mutate({
                    id: editingCategory.id,
                    data: {
                      allocatedAmount: categoryData.allocatedAmount,
                      priority: parseInt(categoryData.priority),
                      isFixed: categoryData.isFixed,
                    }
                  });
                } else {
                  addCategoryMutation.mutate({
                    categoryId: parseInt(categoryData.categoryId),
                    allocatedAmount: categoryData.allocatedAmount,
                    priority: parseInt(categoryData.priority),
                    isFixed: categoryData.isFixed,
                  });
                }
              }}
              disabled={updateCategoryMutation.isPending || addCategoryMutation.isPending}
              className="flex-1 fire-button-primary"
            >
              {(updateCategoryMutation.isPending || addCategoryMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Create Period Dialog Content */}
      <Dialog open={showCreatePeriodDialog} onOpenChange={setShowCreatePeriodDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Budget Period</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Period Name</Label>
              <Input
                id="name"
                value={newPeriod.name}
                onChange={(e) => setNewPeriod(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., January 2025"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={newPeriod.startDate}
                  onChange={(e) => setNewPeriod(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={newPeriod.endDate}
                  onChange={(e) => setNewPeriod(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="totalIncome">Expected Income</Label>
              <Input
                id="totalIncome"
                type="number"
                step="0.01"
                value={newPeriod.totalIncome}
                onChange={(e) => setNewPeriod(prev => ({ ...prev, totalIncome: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            
            <div className="flex space-x-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowCreatePeriodDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => createPeriodMutation.mutate(newPeriod)}
                disabled={createPeriodMutation.isPending}
                className="flex-1 fire-button-primary"
              >
                {createPeriodMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
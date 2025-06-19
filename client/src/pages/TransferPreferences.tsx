import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Settings, Plus, Target, Shield, TrendingUp, Edit2, Trash2, AlertCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { Account, Goal } from "@/types";
import type { TransferPreference } from "@shared/schema";

const createPreferenceSchema = z.object({
  userId: z.number(),
  preferenceType: z.enum(["buffer", "goal", "investment", "emergency"]),
  priority: z.number().min(1).max(10),
  accountId: z.number().optional(),
  accountRole: z.string().optional(),
  goalPattern: z.string().optional(),
});

type CreatePreferenceForm = z.infer<typeof createPreferenceSchema>;

export default function TransferPreferences() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingPreference, setEditingPreference] = useState<TransferPreference | null>(null);
  const [deletingPreference, setDeleteingPreference] = useState<TransferPreference | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userId = 1; // TODO: Get from auth context

  const { data: preferences, isLoading: preferencesLoading } = useQuery<TransferPreference[]>({
    queryKey: [`/api/transfer-preferences/${userId}`],
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: [`/api/accounts/${userId}`],
  });

  const { data: goals } = useQuery<Goal[]>({
    queryKey: [`/api/goals/${userId}`],
  });

  const createPreferenceMutation = useMutation({
    mutationFn: (data: CreatePreferenceForm) => 
      fetch('/api/transfer-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(res => res.json()),
    onSuccess: () => {
      toast({
        title: "Preference Created",
        description: "New transfer preference has been created successfully",
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/transfer-preferences/${userId}`] });
      setShowCreateDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create transfer preference",
        variant: "destructive",
      });
    },
  });

  const updatePreferenceMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePreferenceForm> }) => 
      fetch(`/api/transfer-preferences/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(res => res.json()),
    onSuccess: () => {
      toast({
        title: "Preference Updated",
        description: "Transfer preference has been updated successfully",
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/transfer-preferences/${userId}`] });
      setEditingPreference(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update transfer preference",
        variant: "destructive",
      });
    },
  });

  const deletePreferenceMutation = useMutation({
    mutationFn: (id: number) => 
      fetch(`/api/transfer-preferences/${id}`, {
        method: 'DELETE',
      }).then(res => res.json()),
    onSuccess: () => {
      toast({
        title: "Preference Deleted",
        description: "Transfer preference has been deleted successfully",
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/transfer-preferences/${userId}`] });
      setDeleteingPreference(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete transfer preference",
        variant: "destructive",
      });
    },
  });

  const initializeDefaultsMutation = useMutation({
    mutationFn: () => 
      fetch(`/api/transfer-preferences/initialize/${userId}`, {
        method: 'POST',
      }).then(res => res.json()),
    onSuccess: () => {
      toast({
        title: "Default Preferences Created",
        description: "Default transfer preferences have been set up",
        duration: 5000,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/transfer-preferences/${userId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to initialize default preferences",
        variant: "destructive",
      });
    },
  });

  const form = useForm<CreatePreferenceForm>({
    resolver: zodResolver(createPreferenceSchema),
    defaultValues: {
      userId,
      preferenceType: "buffer",
      priority: 1,
      accountRole: "",
    },
  });

  const editForm = useForm<CreatePreferenceForm>({
    resolver: zodResolver(createPreferenceSchema),
    defaultValues: {
      userId,
      preferenceType: "buffer",
      priority: 1,
      accountRole: "",
    },
  });

  const handleEditPreference = (preference: TransferPreference) => {
    setEditingPreference(preference);
    editForm.reset({
      userId: preference.userId,
      preferenceType: preference.preferenceType as "buffer" | "goal" | "investment" | "emergency",
      priority: preference.priority,
      accountId: preference.accountId || undefined,
      accountRole: preference.accountRole || "",
      goalPattern: preference.goalPattern || "",
    });
  };

  const getTypeIcon = (allocationType: string) => {
    switch (allocationType) {
      case 'buffer': return Shield;
      case 'goal': return Target;
      case 'investment': return TrendingUp;
      default: return Settings;
    }
  };

  const getTypeColor = (allocationType: string) => {
    switch (allocationType) {
      case 'buffer': return 'bg-blue-100 text-blue-800';
      case 'goal': return 'bg-green-100 text-green-800';
      case 'investment': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTargetDisplay = (preference: TransferPreference) => {
    switch (preference.targetType) {
      case 'account_role':
        return `Role: ${preference.targetValue}`;
      case 'specific_account':
        const account = accounts?.find(a => a.id.toString() === preference.targetValue);
        return account ? `Account: ${account.customName || account.accountHolderName}` : `Account ID: ${preference.targetValue}`;
      case 'goal_pattern':
        return `Pattern: ${preference.targetValue}`;
      default:
        return preference.targetValue;
    }
  };

  const groupedPreferences = preferences?.reduce((acc, pref) => {
    if (!acc[pref.allocationType]) {
      acc[pref.allocationType] = [];
    }
    acc[pref.allocationType].push(pref);
    return acc;
  }, {} as Record<string, TransferPreference[]>);

  if (preferencesLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-800">Transfer Preferences</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Configure where your budget allocations are transferred
            </p>
          </div>

          <div className="flex space-x-3">
            {(!preferences || preferences.length === 0) && (
              <Button 
                onClick={() => initializeDefaultsMutation.mutate()}
                disabled={initializeDefaultsMutation.isPending}
                variant="outline"
                className="fire-button-secondary"
              >
                {initializeDefaultsMutation.isPending ? "Setting up..." : "Set Defaults"}
              </Button>
            )}
            
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <Button onClick={() => setShowCreateDialog(true)} className="fire-button-primary">
                <Plus size={16} className="mr-2" />
                Add Preference
              </Button>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Transfer Preference</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((data) => createPreferenceMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="allocationType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Allocation Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select allocation type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="buffer">Emergency Buffer</SelectItem>
                              <SelectItem value="goal">Goal Savings</SelectItem>
                              <SelectItem value="investment">Investments</SelectItem>
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
                          <FormLabel>Priority (1-10)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="1" 
                              max="10" 
                              placeholder="1" 
                              {...field}
                              onChange={e => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="targetType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select target type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="account_role">Account Role</SelectItem>
                              <SelectItem value="specific_account">Specific Account</SelectItem>
                              <SelectItem value="goal_pattern">Goal Pattern</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="targetValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Value</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., emergency, savings, Holiday.*" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Optional description" {...field} />
                          </FormControl>
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
                        disabled={createPreferenceMutation.isPending}
                        className="flex-1 fire-button-primary"
                      >
                        {createPreferenceMutation.isPending ? "Creating..." : "Create Preference"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Shield className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {groupedPreferences?.buffer?.length || 0}
                </p>
                <p className="text-sm text-neutral-400">Buffer Rules</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Target className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {groupedPreferences?.goal?.length || 0}
                </p>
                <p className="text-sm text-neutral-400">Goal Rules</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-purple-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {groupedPreferences?.investment?.length || 0}
                </p>
                <p className="text-sm text-neutral-400">Investment Rules</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Preferences by Type */}
        {Object.entries(groupedPreferences || {}).map(([type, typePreferences]) => {
          const sortedPreferences = [...typePreferences].sort((a, b) => a.priority - b.priority);
          
          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="capitalize">{type} Preferences</span>
                  <Badge className={getTypeColor(type)}>
                    {typePreferences.length} rules
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sortedPreferences.map((preference) => {
                    const IconComponent = getTypeIcon(preference.allocationType);
                    
                    return (
                      <div
                        key={preference.id}
                        className="flex items-center justify-between p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center">
                            <IconComponent size={20} className="text-neutral-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <p className="text-sm font-medium text-neutral-800">
                                {getTargetDisplay(preference)}
                              </p>
                              <Badge variant="outline" className="text-xs">
                                Priority {preference.priority}
                              </Badge>
                            </div>
                            {preference.description && (
                              <p className="text-xs text-neutral-400 mt-1">{preference.description}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEditPreference(preference)}>
                            <Edit2 size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteingPreference(preference)} className="text-red-600 hover:text-red-700">
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(!preferences || preferences.length === 0) && (
          <Card className="p-8 text-center">
            <Settings className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Transfer Preferences</h3>
            <p className="text-sm text-gray-500 mb-4">
              Set up preferences to control where your budget allocations are transferred.
            </p>
            <div className="flex space-x-3 justify-center">
              <Button 
                onClick={() => initializeDefaultsMutation.mutate()}
                disabled={initializeDefaultsMutation.isPending}
                variant="outline"
              >
                {initializeDefaultsMutation.isPending ? "Setting up..." : "Set Defaults"}
              </Button>
              <Button onClick={() => setShowCreateDialog(true)} className="fire-button-primary">
                Create Preference
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Edit Preference Dialog */}
      <Dialog open={!!editingPreference} onOpenChange={() => setEditingPreference(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Transfer Preference</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => {
              if (editingPreference) {
                updatePreferenceMutation.mutate({
                  id: editingPreference.id,
                  data
                });
              }
            })} className="space-y-4">
              <FormField
                control={editForm.control}
                name="allocationType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allocation Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select allocation type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="buffer">Emergency Buffer</SelectItem>
                        <SelectItem value="goal">Goal Savings</SelectItem>
                        <SelectItem value="investment">Investments</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority (1-10)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="1" 
                        max="10" 
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="targetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select target type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="account_role">Account Role</SelectItem>
                        <SelectItem value="specific_account">Specific Account</SelectItem>
                        <SelectItem value="goal_pattern">Goal Pattern</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="targetValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Value</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., emergency, savings, Holiday.*" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex space-x-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setEditingPreference(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updatePreferenceMutation.isPending}
                  className="flex-1 fire-button-primary"
                >
                  {updatePreferenceMutation.isPending ? "Updating..." : "Update Preference"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Preference Confirmation */}
      <AlertDialog open={!!deletingPreference} onOpenChange={() => setDeleteingPreference(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transfer Preference</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transfer preference? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingPreference) {
                  deletePreferenceMutation.mutate(deletingPreference.id);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
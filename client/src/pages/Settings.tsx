import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Settings as SettingsIcon, Shield, Target, TrendingUp, Plus, Edit2, Trash2, Database, FileText, Calculator, Brain } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Account, Goal } from "@/types";
import type { TransferPreference } from "@shared/schema";

const createPreferenceSchema = z.object({
  userId: z.number(),
  preferenceType: z.enum(["buffer", "goal", "investment"]),
  priority: z.number().min(1).max(10),
  accountId: z.number().optional(),
  accountRole: z.string().optional(),
  goalPattern: z.string().optional(),
});

type CreatePreferenceForm = z.infer<typeof createPreferenceSchema>;

export default function Settings() {
  const [activeTab, setActiveTab] = useState<"transfer" | "data" | "budget" | "ai">("transfer");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingPreference, setEditingPreference] = useState<TransferPreference | null>(null);
  const [deletingPreference, setDeletingPreference] = useState<TransferPreference | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const userId = 1;

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
      });
      queryClient.invalidateQueries({ queryKey: [`/api/transfer-preferences/${userId}`] });
      setDeletingPreference(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete transfer preference",
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
    },
  });

  const editForm = useForm<CreatePreferenceForm>({
    resolver: zodResolver(createPreferenceSchema),
    defaultValues: {
      userId,
      preferenceType: "buffer",
      priority: 1,
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'buffer': return Shield;
      case 'goal': return Target;
      case 'investment': return TrendingUp;
      default: return SettingsIcon;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'buffer': return 'bg-blue-100 text-blue-800';
      case 'goal': return 'bg-green-100 text-green-800';
      case 'investment': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const renderTransferSettings = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800">Transfer Preferences</h2>
          <p className="text-sm text-neutral-400">Configure where budget allocations are transferred</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="fire-button-primary">
          <Plus size={16} className="mr-2" />
          Add Preference
        </Button>
      </div>

      {/* Preferences List */}
      {preferences && preferences.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {preferences.map((preference) => {
            const Icon = getTypeIcon(preference.preferenceType);
            return (
              <Card key={preference.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getTypeColor(preference.preferenceType)}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-800 capitalize">{preference.preferenceType} Allocation</p>
                      <p className="text-xs text-neutral-400">Priority: {preference.priority}</p>
                      <p className="text-xs text-neutral-400">
                        {preference.accountRole && `Role: ${preference.accountRole}`}
                        {preference.accountId && `Account ID: ${preference.accountId}`}
                        {preference.goalPattern && `Pattern: ${preference.goalPattern}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEditPreference(preference)}
                    >
                      <Edit2 size={14} />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setDeletingPreference(preference)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Transfer Preferences</h3>
          <p className="text-sm text-gray-500 mb-4">
            Create transfer preferences to control where your budget allocations go.
          </p>
          <Button onClick={() => setShowCreateDialog(true)} className="fire-button-primary">
            Create First Preference
          </Button>
        </Card>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-800">Settings</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Configure your VonkFi application preferences
            </p>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-neutral-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("transfer")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "transfer"
                ? "bg-white text-neutral-800 shadow-sm"
                : "text-neutral-600 hover:text-neutral-800"
            }`}
          >
            <Shield size={16} className="inline mr-2" />
            Transfer Rules
          </button>
          <button
            onClick={() => setActiveTab("data")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "data"
                ? "bg-white text-neutral-800 shadow-sm"
                : "text-neutral-600 hover:text-neutral-800"
            }`}
          >
            <Database size={16} className="inline mr-2" />
            Data Management
          </button>
          <button
            onClick={() => setActiveTab("budget")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "budget"
                ? "bg-white text-neutral-800 shadow-sm"
                : "text-neutral-600 hover:text-neutral-800"
            }`}
          >
            <Calculator size={16} className="inline mr-2" />
            Budget Settings
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "ai"
                ? "bg-white text-neutral-800 shadow-sm"
                : "text-neutral-600 hover:text-neutral-800"
            }`}
          >
            <Brain size={16} className="inline mr-2" />
            AI Features
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "transfer" && renderTransferSettings()}
        
        {activeTab === "data" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-neutral-800">Data Management</h2>
            <Card className="p-6">
              <h3 className="text-md font-medium text-neutral-800 mb-2">Import & Export</h3>
              <p className="text-sm text-neutral-400 mb-4">
                Manage your financial data imports and exports
              </p>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setLocation('/import-history')}
                >
                  <FileText size={16} className="mr-2" />
                  View Import History
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Export Feature",
                      description: "Data export functionality will be available soon",
                    });
                  }}
                >
                  <Database size={16} className="mr-2" />
                  Export All Data
                </Button>
              </div>
            </Card>
          </div>
        )}
        
        {activeTab === "budget" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-neutral-800">Budget Settings</h2>
            <Card className="p-6">
              <h3 className="text-md font-medium text-neutral-800 mb-2">Zero Based Budget</h3>
              <p className="text-sm text-neutral-400 mb-4">
                Configure your budgeting preferences and defaults
              </p>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setLocation('/categories')}
                >
                  <Calculator size={16} className="mr-2" />
                  Budget Categories
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setLocation('/budget')}
                >
                  <Target size={16} className="mr-2" />
                  Default Allocations
                </Button>
              </div>
            </Card>
          </div>
        )}

        {activeTab === "ai" && (
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-4">
              <Brain className="w-6 h-6 text-blue-600" />
              <h2 className="text-lg font-semibold text-neutral-800">AI Features Configuration</h2>
            </div>

            {/* AI Fixed Expense Settings */}
            <Card className="p-6">
              <h3 className="text-md font-medium text-neutral-800 mb-4 flex items-center space-x-2">
                <Target className="w-5 h-5 text-blue-600" />
                <span>Fixed Expense AI Optimization</span>
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Enable Fixed Expense Analysis</label>
                    <p className="text-xs text-neutral-500">Automatically analyze transaction patterns to identify recurring fixed expenses</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Seasonal Adjustments</label>
                    <p className="text-xs text-neutral-500">Apply seasonal factors to expense predictions (winter heating, etc.)</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Anomaly Detection</label>
                    <p className="text-xs text-neutral-500">Alert when fixed expenses deviate significantly from patterns</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-2">Analysis Lookback Period</label>
                  <Select defaultValue="12">
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                      <SelectItem value="24">24 months</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">How far back to analyze transaction history</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-2">Confidence Threshold</label>
                  <Select defaultValue="0.7">
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.6">60%</SelectItem>
                      <SelectItem value="0.7">70%</SelectItem>
                      <SelectItem value="0.8">80%</SelectItem>
                      <SelectItem value="0.9">90%</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">Minimum confidence level for expense pattern recognition</p>
                </div>
              </div>
            </Card>

            {/* AI Transfer Recommendations Settings */}
            <Card className="p-6">
              <h3 className="text-md font-medium text-neutral-800 mb-4 flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <span>Smart Transfer Recommendations</span>
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Auto-Generate Recommendations</label>
                    <p className="text-xs text-neutral-500">Automatically create transfer recommendations based on account balances</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Priority-Based Sorting</label>
                    <p className="text-xs text-neutral-500">Sort recommendations by urgency and financial impact</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Goal Integration</label>
                    <p className="text-xs text-neutral-500">Consider savings goals when generating transfer recommendations</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-2">Refresh Frequency</label>
                  <Select defaultValue="300">
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">Every minute</SelectItem>
                      <SelectItem value="300">Every 5 minutes</SelectItem>
                      <SelectItem value="900">Every 15 minutes</SelectItem>
                      <SelectItem value="3600">Every hour</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">How often to update AI recommendations</p>
                </div>
              </div>
            </Card>

            {/* Dashboard Integration Settings */}
            <Card className="p-6">
              <h3 className="text-md font-medium text-neutral-800 mb-4 flex items-center space-x-2">
                <SettingsIcon className="w-5 h-5 text-gray-600" />
                <span>Dashboard Integration</span>
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Show AI Insights Widget</label>
                    <p className="text-xs text-neutral-500">Display AI Fixed Expense insights on the main dashboard</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Show Transfer Recommendations Widget</label>
                    <p className="text-xs text-neutral-500">Display AI transfer recommendations on the main dashboard</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Real-time Updates</label>
                    <p className="text-xs text-neutral-500">Update AI insights automatically when new data is available</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-2">Widget Position Priority</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center space-x-2">
                      <input type="radio" name="ai-priority" value="top" defaultChecked className="h-4 w-4 text-blue-600" />
                      <label className="text-sm text-neutral-700">High Priority (Top)</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="radio" name="ai-priority" value="middle" className="h-4 w-4 text-blue-600" />
                      <label className="text-sm text-neutral-700">Medium Priority</label>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">Where to position AI widgets on the dashboard</p>
                </div>
              </div>
            </Card>

            {/* LLM Integration Settings */}
            <Card className="p-6">
              <h3 className="text-md font-medium text-neutral-800 mb-4 flex items-center space-x-2">
                <Brain className="w-5 h-5 text-purple-600" />
                <span>Large Language Model (LLM) Integration</span>
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Enable LLM Analysis</label>
                    <p className="text-xs text-neutral-500">Use advanced language models for deeper financial insights and explanations</p>
                  </div>
                  <input type="checkbox" className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-2">LLM Provider</label>
                  <Select defaultValue="none">
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Pattern Recognition Only</SelectItem>
                      <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                      <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                      <SelectItem value="local">Local Model</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">Choose your preferred LLM provider for enhanced analysis</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-2">API Key</label>
                  <input 
                    type="password" 
                    placeholder="Enter your LLM API key" 
                    className="w-full p-2 border border-neutral-300 rounded-md text-sm"
                  />
                  <p className="text-xs text-neutral-500 mt-1">Required for OpenAI or Anthropic integration</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-2">Analysis Depth</label>
                  <Select defaultValue="standard">
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="detailed">Detailed</SelectItem>
                      <SelectItem value="comprehensive">Comprehensive</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">More detailed analysis uses more API credits</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Natural Language Explanations</label>
                    <p className="text-xs text-neutral-500">Generate human-readable explanations for AI recommendations</p>
                  </div>
                  <input type="checkbox" className="h-4 w-4 text-blue-600" />
                </div>
              </div>
            </Card>

            {/* Advanced AI Settings */}
            <Card className="p-6">
              <h3 className="text-md font-medium text-neutral-800 mb-4 flex items-center space-x-2">
                <Brain className="w-5 h-5 text-indigo-600" />
                <span>Advanced AI Configuration</span>
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Machine Learning Optimization</label>
                    <p className="text-xs text-neutral-500">Allow AI to learn from your spending patterns and improve over time</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-neutral-700">Predictive Cash Flow</label>
                    <p className="text-xs text-neutral-500">Predict future cash flow needs based on historical patterns</p>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-2">AI Processing Mode</label>
                  <Select defaultValue="balanced">
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="aggressive">Aggressive</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">How aggressively AI should optimize your finances</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-2">Target Account Selection</label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="fixed-expenses" defaultChecked className="h-4 w-4 text-blue-600" />
                      <label htmlFor="fixed-expenses" className="text-sm text-neutral-700">Fixed Expenses Accounts</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="checking" defaultChecked className="h-4 w-4 text-blue-600" />
                      <label htmlFor="checking" className="text-sm text-neutral-700">Checking Accounts</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="savings" className="h-4 w-4 text-blue-600" />
                      <label htmlFor="savings" className="text-sm text-neutral-700">Savings Accounts</label>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">Select which account types to include in AI optimization</p>
                </div>
              </div>
            </Card>

            {/* Save Settings */}
            <div className="flex justify-end space-x-3">
              <Button variant="outline">Reset to Defaults</Button>
              <Button className="fire-button-primary">Save AI Settings</Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Transfer Preference</DialogTitle>
            <DialogDescription>
              Set up a new transfer preference to control where your budget allocations are directed.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createPreferenceMutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="preferenceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allocation Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="buffer">Emergency Buffer</SelectItem>
                        <SelectItem value="goal">Goal Allocation</SelectItem>
                        <SelectItem value="investment">Investment</SelectItem>
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
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accountRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Role (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., emergency, savings, investment" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="goalPattern"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Goal Pattern (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Holiday, Emergency" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="fire-button-primary"
                  disabled={createPreferenceMutation.isPending}
                >
                  {createPreferenceMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPreference} onOpenChange={() => setEditingPreference(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Transfer Preference</DialogTitle>
            <DialogDescription>
              Modify the settings for this transfer preference rule.
            </DialogDescription>
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
                name="preferenceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allocation Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="buffer">Emergency Buffer</SelectItem>
                        <SelectItem value="goal">Goal Allocation</SelectItem>
                        <SelectItem value="investment">Investment</SelectItem>
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
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="accountRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Role (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., emergency, savings, investment" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="goalPattern"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Goal Pattern (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Holiday, Emergency" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingPreference(null)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="fire-button-primary"
                  disabled={updatePreferenceMutation.isPending}
                >
                  {updatePreferenceMutation.isPending ? "Updating..." : "Update"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingPreference} onOpenChange={() => setDeletingPreference(null)}>
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
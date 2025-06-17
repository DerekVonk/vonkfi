import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bitcoin, Plus, Wallet, TrendingUp, DollarSign, ExternalLink, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { CryptoWallet } from "@/types";

const DEMO_USER_ID = 1;

const createWalletSchema = z.object({
  name: z.string().min(1, "Wallet name is required"),
  address: z.string().min(1, "Wallet address is required"),
  currency: z.string().min(1, "Currency is required"),
  provider: z.string().optional(),
});

type CreateWalletForm = z.infer<typeof createWalletSchema>;

const supportedCurrencies = [
  { code: 'BTC', name: 'Bitcoin', icon: '₿' },
  { code: 'ETH', name: 'Ethereum', icon: 'Ξ' },
  { code: 'ADA', name: 'Cardano', icon: '₳' },
  { code: 'DOT', name: 'Polkadot', icon: '●' },
];

export default function Crypto() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallets, isLoading } = useQuery<CryptoWallet[]>({
    queryKey: [api.getCrypto(DEMO_USER_ID)],
  });

  const createWalletMutation = useMutation({
    mutationFn: (data: any) => api.createCryptoWallet({
      ...data,
      userId: DEMO_USER_ID,
    }),
    onSuccess: () => {
      toast({
        title: "Wallet Added",
        description: "Crypto wallet has been added successfully",
      });
      queryClient.invalidateQueries({ queryKey: [api.getCrypto(DEMO_USER_ID)] });
      setShowCreateDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add wallet",
        variant: "destructive",
      });
    },
  });

  const form = useForm<CreateWalletForm>({
    resolver: zodResolver(createWalletSchema),
    defaultValues: {
      name: "",
      address: "",
      currency: "",
      provider: "",
    },
  });

  const onSubmit = (data: CreateWalletForm) => {
    createWalletMutation.mutate(data);
  };

  const getCurrencyInfo = (currency: string) => {
    return supportedCurrencies.find(c => c.code === currency) || { code: currency, name: currency, icon: '₿' };
  };

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getProviderBadgeColor = (provider: string | null) => {
    if (!provider || provider === 'self-custody') return 'bg-green-100 text-green-800';
    return 'bg-blue-100 text-blue-800';
  };

  // Mock portfolio data - in real app this would come from API
  const portfolioValue = 25420;
  const totalWallets = wallets?.length || 0;
  const activeWallets = wallets?.filter(w => w.isActive).length || 0;

  if (isLoading) {
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
            <h2 className="text-2xl font-semibold text-neutral-800">Crypto Portfolio</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Track your cryptocurrency investments and integrate them into your FIRE strategy
            </p>
          </div>
          
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="fire-button-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add Wallet
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Crypto Wallet</DialogTitle>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Wallet Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Main Bitcoin Wallet" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {supportedCurrencies.map((currency) => (
                              <SelectItem key={currency.code} value={currency.code}>
                                {currency.icon} {currency.name} ({currency.code})
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
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Wallet Address</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter wallet address or xpub key" 
                            className="font-mono text-xs"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="provider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provider (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Coinbase, Binance, Self-custody" {...field} />
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
                      disabled={createWalletMutation.isPending}
                      className="flex-1 fire-button-primary"
                    >
                      {createWalletMutation.isPending ? "Adding..." : "Add Wallet"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Portfolio Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Bitcoin className="text-orange-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  €{portfolioValue.toLocaleString()}
                </p>
                <p className="text-sm text-neutral-400">Portfolio Value</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Wallet className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{totalWallets}</p>
                <p className="text-sm text-neutral-400">Total Wallets</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Activity className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">{activeWallets}</p>
                <p className="text-sm text-neutral-400">Active</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-purple-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">+12.3%</p>
                <p className="text-sm text-neutral-400">24h Change</p>
              </div>
            </div>
          </Card>
        </div>

        {/* FIRE Integration */}
        <Card className="p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="text-green-600" size={20} />
              <span>FIRE Strategy Integration</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-2">Portfolio Allocation</h4>
                <p className="text-2xl font-bold text-blue-600">8.5%</p>
                <p className="text-sm text-blue-600">of total FIRE portfolio</p>
              </div>
              
              <div className="p-4 bg-green-50 rounded-lg">
                <h4 className="font-medium text-green-800 mb-2">Monthly Allocation</h4>
                <p className="text-2xl font-bold text-green-600">€320</p>
                <p className="text-sm text-green-600">recommended monthly DCA</p>
              </div>
              
              <div className="p-4 bg-purple-50 rounded-lg">
                <h4 className="font-medium text-purple-800 mb-2">Risk Assessment</h4>
                <p className="text-2xl font-bold text-purple-600">Moderate</p>
                <p className="text-sm text-purple-600">within FIRE risk tolerance</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Wallets List */}
        {wallets && wallets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Your Crypto Wallets</span>
                <Badge className="bg-blue-100 text-blue-800">
                  {wallets.length} wallets
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {wallets.map((wallet) => {
                  const currencyInfo = getCurrencyInfo(wallet.currency);
                  
                  return (
                    <div
                      key={wallet.id}
                      className="p-4 border border-neutral-200 rounded-lg hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                            <span className="text-orange-600 font-bold">{currencyInfo.icon}</span>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-neutral-800">{wallet.name}</h4>
                            <p className="text-xs text-neutral-400">{currencyInfo.name}</p>
                          </div>
                        </div>
                        
                        <Badge className={getProviderBadgeColor(wallet.provider)}>
                          {wallet.provider || 'Self-custody'}
                        </Badge>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-600">Address</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-mono text-neutral-800">
                              {formatAddress(wallet.address)}
                            </span>
                            <Button variant="ghost" size="sm">
                              <ExternalLink size={12} />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-600">Balance</span>
                          <span className="text-sm font-semibold text-neutral-800">
                            Not synced
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-600">Value (EUR)</span>
                          <span className="text-sm font-semibold text-neutral-800">
                            €--
                          </span>
                        </div>
                        
                        <div className="flex space-x-2 pt-2">
                          <Button variant="outline" size="sm" className="flex-1">
                            Sync Balance
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1">
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {(!wallets || wallets.length === 0) && (
          <Card className="p-8 text-center">
            <Bitcoin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Crypto Wallets Added</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add your cryptocurrency wallets to track their value and integrate them into your FIRE strategy.
            </p>
            <Button onClick={() => setShowCreateDialog(true)} className="fire-button-primary">
              Add Your First Wallet
            </Button>
          </Card>
        )}

        {/* Information Card */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <Bitcoin className="text-blue-600" size={16} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-blue-800 mb-2">Crypto & FIRE Strategy</h4>
                <p className="text-sm text-blue-700">
                  Cryptocurrency can be part of your FIRE portfolio, but should typically represent 5-15% of your total allocation.
                  The system will automatically suggest monthly allocations based on your risk tolerance and current portfolio balance.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

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
import { Tags, Plus, Settings, TrendingUp, ShoppingBag, Home, Car, Zap, Gamepad, ArrowUp } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { Category } from "@/types";

const createCategorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  type: z.enum(["income", "essential", "discretionary", "transfer"]),
  color: z.string().optional(),
  icon: z.string().optional(),
});

type CreateCategoryForm = z.infer<typeof createCategorySchema>;

const categoryIcons = {
  "fas fa-arrow-up": ArrowUp,
  "fas fa-home": Home,
  "fas fa-utensils": ShoppingBag,
  "fas fa-car": Car,
  "fas fa-bolt": Zap,
  "fas fa-gamepad": Gamepad,
  "fas fa-shopping-bag": ShoppingBag,
  "fas fa-exchange-alt": TrendingUp,
};

const categoryColors = [
  "#2E7D32", "#1565C0", "#FF6B35", "#9C27B0", "#607D8B", 
  "#E91E63", "#FF9800", "#00BCD4", "#4CAF50", "#F44336"
];

export default function Categories() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: [api.getCategories()],
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: CreateCategoryForm) => api.createCategory(data),
    onSuccess: () => {
      toast({
        title: "Category Created",
        description: "New category has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: [api.getCategories()] });
      setShowCreateDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create category",
        variant: "destructive",
      });
    },
  });

  const form = useForm<CreateCategoryForm>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: {
      name: "",
      type: "discretionary",
      color: categoryColors[0],
    },
  });

  const onSubmit = (data: CreateCategoryForm) => {
    createCategoryMutation.mutate(data);
  };

  const getCategoryTypeColor = (type: string) => {
    switch (type) {
      case 'income': return 'bg-green-100 text-green-800';
      case 'essential': return 'bg-blue-100 text-blue-800';
      case 'discretionary': return 'bg-purple-100 text-purple-800';
      case 'transfer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (iconString: string | null) => {
    if (!iconString || !categoryIcons[iconString as keyof typeof categoryIcons]) {
      return Tags;
    }
    return categoryIcons[iconString as keyof typeof categoryIcons];
  };

  const groupedCategories = categories?.reduce((acc, category) => {
    if (!acc[category.type]) {
      acc[category.type] = [];
    }
    acc[category.type].push(category);
    return acc;
  }, {} as Record<string, Category[]>);

  if (isLoading) {
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
    <>
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-800">Category Management</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Organize and manage transaction categories for better expense tracking and budgeting
            </p>
          </div>
          
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="fire-button-primary">
                <Plus className="w-4 h-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Category</DialogTitle>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter category name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="income">Income</SelectItem>
                            <SelectItem value="essential">Essential</SelectItem>
                            <SelectItem value="discretionary">Discretionary</SelectItem>
                            <SelectItem value="transfer">Transfer</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color</FormLabel>
                        <FormControl>
                          <div className="flex space-x-2">
                            {categoryColors.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`w-8 h-8 rounded-full border-2 ${
                                  field.value === color ? 'border-gray-400' : 'border-gray-200'
                                }`}
                                style={{ backgroundColor: color }}
                                onClick={() => field.onChange(color)}
                              />
                            ))}
                          </div>
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
                      disabled={createCategoryMutation.isPending}
                      className="flex-1 fire-button-primary"
                    >
                      {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Category Type Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <ArrowUp className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {groupedCategories?.income?.length || 0}
                </p>
                <p className="text-sm text-neutral-400">Income</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Home className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {groupedCategories?.essential?.length || 0}
                </p>
                <p className="text-sm text-neutral-400">Essential</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <ShoppingBag className="text-purple-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {groupedCategories?.discretionary?.length || 0}
                </p>
                <p className="text-sm text-neutral-400">Discretionary</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-gray-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">
                  {groupedCategories?.transfer?.length || 0}
                </p>
                <p className="text-sm text-neutral-400">Transfers</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Categories by Type */}
        {Object.entries(groupedCategories || {}).map(([type, typeCategories]) => (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="capitalize">{type} Categories</span>
                <Badge className={getCategoryTypeColor(type)}>
                  {typeCategories.length} categories
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {typeCategories.map((category) => {
                  const IconComponent = getCategoryIcon(category.icon);
                  
                  return (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ 
                            backgroundColor: category.color ? `${category.color}20` : '#f3f4f6',
                            color: category.color || '#6b7280'
                          }}
                        >
                          <IconComponent size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-800">{category.name}</p>
                          {category.isSystemCategory && (
                            <p className="text-xs text-neutral-400">System category</p>
                          )}
                        </div>
                      </div>
                      
                      <Button variant="ghost" size="sm">
                        <Settings size={16} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

        {(!categories || categories.length === 0) && (
          <Card className="p-8 text-center">
            <Tags className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Categories Found</h3>
            <p className="text-sm text-gray-500 mb-4">
              Create your first category to start organizing your transactions.
            </p>
            <Button onClick={() => setShowCreateDialog(true)} className="fire-button-primary">
              Create Category
            </Button>
          </Card>
        )}
      </div>
    </>
  );
}

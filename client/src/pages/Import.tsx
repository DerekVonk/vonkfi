import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, History, AlertCircle, Trash2, RefreshCw } from "lucide-react";
import ImportModal from "@/components/ImportModal";
import { api } from "@/lib/api";

const DEMO_USER_ID = 1;

export default function Import() {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showClearDataDialog, setShowClearDataDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const clearDataMutation = useMutation({
    mutationFn: () => api.clearUserData(DEMO_USER_ID),
    onSuccess: async () => {
      // Force invalidate all relevant queries and trigger refetch
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['goals'] });
      await queryClient.invalidateQueries({ queryKey: ['transfers'] });
      await queryClient.invalidateQueries({ queryKey: ['imports'] });
      
      // Force refetch dashboard data
      await queryClient.refetchQueries({ queryKey: ['dashboard'] });
      
      toast({
        title: "Import Data Cleared",
        description: "Bank statement data cleared and dashboard recalculated. Your configurations are preserved.",
        duration: 5000,
      });
      setShowClearDataDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear data",
        variant: "destructive",
      });
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: () => api.recalculateDashboard(DEMO_USER_ID),
    onSuccess: async () => {
      // Force invalidate and refetch all relevant queries
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['goals'] });
      await queryClient.invalidateQueries({ queryKey: ['transfers'] });
      
      // Force refetch dashboard data
      await queryClient.refetchQueries({ queryKey: ['dashboard'] });
      
      toast({
        title: "Dashboard Recalculated",
        description: "All financial calculations have been refreshed",
        duration: 5000,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to recalculate dashboard",
        variant: "destructive",
      });
    },
  });

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-800">Import Statements</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Upload CAMT.053 XML files to automatically process transactions and detect accounts
            </p>
          </div>
          
          <div className="flex space-x-3">
            <Button 
              variant="outline" 
              onClick={() => recalculateMutation.mutate()}
              disabled={recalculateMutation.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {recalculateMutation.isPending ? "Recalculating..." : "Recalculate"}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowClearDataDialog(true)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Data
            </Button>
            <Button onClick={() => setShowImportModal(true)} className="fire-button-primary">
              <Upload className="w-4 h-4 mr-2" />
              Import New Statement
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Quick Import Card */}
        <Card className="border-2 border-dashed border-blue-300 bg-blue-50/50">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="text-blue-600" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-neutral-800 mb-2">
              Ready to Import Your Bank Statement
            </h3>
            <p className="text-sm text-neutral-600 mb-6 max-w-md mx-auto">
              Drag and drop your CAMT.053 XML file here or click the button below to get started. 
              The system will automatically detect accounts and categorize transactions.
            </p>
            <Button onClick={() => setShowImportModal(true)} size="lg" className="fire-button-primary">
              <Upload className="w-5 h-5 mr-2" />
              Choose File to Import
            </Button>
          </CardContent>
        </Card>

        {/* Import Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <span>Import Guide</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-neutral-800 mb-2">Supported Format</h4>
                <ul className="text-sm text-neutral-600 space-y-1">
                  <li>• CAMT.053 XML files (European standard)</li>
                  <li>• Account and transaction data</li>
                  <li>• Multiple months in single file</li>
                  <li>• Automatic encoding detection</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-neutral-800 mb-2">What Happens Next</h4>
                <ul className="text-sm text-neutral-600 space-y-1">
                  <li>• Accounts automatically detected and named</li>
                  <li>• Transactions categorized intelligently</li>
                  <li>• Transfer recommendations generated</li>
                  <li>• FIRE metrics updated in real-time</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>


      </div>

      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)}
        userId={DEMO_USER_ID}
      />

      {/* Clear Data Confirmation */}
      <AlertDialog open={showClearDataDialog} onOpenChange={setShowClearDataDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Imported Data</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear imported bank statement data? This will delete:
              <br />• All imported transactions and bank statements
              <br />• All transfer recommendations and calculations
              <br />• Goal progress (amounts reset to 0)
              <br /><br />
              Your configurations will be preserved:
              <br />• Account settings and categories
              <br />• Goal definitions and targets
              <br />• Crypto wallet configurations
              <br /><br />
              You can re-import bank statements to restore your financial data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearDataMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
              disabled={clearDataMutation.isPending}
            >
              {clearDataMutation.isPending ? "Clearing..." : "Clear Import Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

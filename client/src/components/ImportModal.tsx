import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
}

export default function ImportModal({ isOpen, onClose, userId }: ImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importStatement(userId, file),
    onSuccess: (response) => {
      toast({
        title: "Import Successful",
        description: `Imported ${response.data?.newTransactions?.length || 0} transactions from ${response.data?.newAccounts?.length || 0} accounts`,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [api.getDashboard(userId)] });
      queryClient.invalidateQueries({ queryKey: [api.getAccounts(userId)] });
      queryClient.invalidateQueries({ queryKey: [api.getTransactions(userId)] });
      
      onClose();
      setSelectedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import statement",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.xml')) {
      toast({
        title: "Invalid File Type", 
        description: "Please select a CAMT.053 XML file",
        variant: "destructive",
      });
      return;
    }
    
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleImport = () => {
    if (!selectedFile) return;
    importMutation.mutate(selectedFile);
  };

  const handleClose = () => {
    if (importMutation.isPending) return;
    onClose();
    setSelectedFile(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Upload className="w-5 h-5" />
            <span>Import Bank Statement</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragOver 
                ? "border-blue-400 bg-blue-50" 
                : selectedFile 
                  ? "border-green-400 bg-green-50"
                  : "border-neutral-300 hover:border-blue-400 hover:bg-blue-50"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".xml"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
            
            {selectedFile ? (
              <div className="space-y-3">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="text-green-600" size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-medium text-neutral-800">File Selected</h4>
                  <p className="text-sm text-neutral-600">{selectedFile.name}</p>
                  <p className="text-xs text-neutral-400">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                  <FileText className="text-blue-600" size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-medium text-neutral-800">
                    Drop your CAMT.053 file here
                  </h4>
                  <p className="text-sm text-neutral-400 mb-4">or click to browse</p>
                  <Button variant="outline" size="sm">
                    Select File
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          {/* Info Box */}
          <div className="bg-neutral-50 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="text-blue-500 mt-0.5 flex-shrink-0" size={16} />
              <div className="text-xs text-neutral-600">
                <p className="font-medium mb-1">Supported format: CAMT.053 XML</p>
                <p>
                  The system will automatically detect accounts and categorize transactions. 
                  New accounts will prompt for custom naming.
                </p>
              </div>
            </div>
          </div>

          {/* Import Status */}
          {importMutation.isPending && (
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                <span className="text-sm text-blue-700">Processing import...</span>
              </div>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex space-x-3 pt-4">
          <Button 
            variant="outline" 
            onClick={handleClose}
            disabled={importMutation.isPending}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleImport}
            disabled={!selectedFile || importMutation.isPending}
            className="flex-1 fire-button-primary"
          >
            {importMutation.isPending ? "Processing..." : "Process Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

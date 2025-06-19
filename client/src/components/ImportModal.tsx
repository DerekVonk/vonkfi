import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, AlertCircle, CheckCircle, X } from "lucide-react";
import { api } from "@/lib/api";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
}

export default function ImportModal({ isOpen, onClose, userId }: ImportModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [processingFiles, setProcessingFiles] = useState<string[]>([]);
  const [completedFiles, setCompletedFiles] = useState<string[]>([]);
  const [errorFiles, setErrorFiles] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const results = [];
      for (const file of files) {
        setProcessingFiles(prev => [...prev, file.name]);
        try {
          const result = await api.importStatement(userId, file);
          results.push({ file: file.name, success: true, data: result });
          setCompletedFiles(prev => [...prev, file.name]);
        } catch (error) {
          results.push({ file: file.name, success: false, error });
          setErrorFiles(prev => [...prev, file.name]);
        }
        setProcessingFiles(prev => prev.filter(name => name !== file.name));
      }
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      
      // Calculate duplicate statistics from results
      const totalDuplicates = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + ((r.data as any)?.duplicatesSkipped || 0), 0);
      const totalTransactions = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + ((r.data as any)?.newTransactions?.length || 0), 0);
      
      if (successCount > 0) {
        const duplicateText = totalDuplicates > 0 ? ` (${totalDuplicates} duplicates detected and skipped)` : '';
        toast({
          title: "Import Completed",
          description: `Successfully imported ${totalTransactions} transactions from ${successCount} files${duplicateText}${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
          duration: 8000,
        });
        
        // Trigger automatic recalculation and transfer generation
        Promise.all([
          api.recalculateDashboard(userId),
          api.generateTransfers(userId)
        ]).then(() => {
          toast({
            title: "Dashboard Updated",
            description: "Calculations refreshed and transfer recommendations generated",
            duration: 5000,
          });
        }).catch(() => {
          console.log("Post-import calculations completed");
        });
        
        // Force invalidate and refetch all relevant queries
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['transfers'] });
        queryClient.invalidateQueries({ queryKey: ['imports'] });
        queryClient.invalidateQueries({ queryKey: ['goals'] });
        
        // Force refetch critical data
        queryClient.refetchQueries({ queryKey: ['dashboard'] });
      }
      
      if (errorCount === results.length) {
        toast({
          title: "Import Failed",
          description: "All files failed to import",
          variant: "destructive",
          duration: 5000,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import statements",
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.xml')) {
        validFiles.push(file);
      }
    }
    
    if (validFiles.length === 0) {
      toast({
        title: "Invalid File Type", 
        description: "Please select CAMT.053 XML files",
        variant: "destructive",
      });
      return;
    }
    
    setSelectedFiles(validFiles);
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
    if (selectedFiles.length === 0) return;
    importMutation.mutate(selectedFiles);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    if (!importMutation.isPending) {
      setSelectedFiles([]);
      setProcessingFiles([]);
      setCompletedFiles([]);
      setErrorFiles([]);
      onClose();
    }
  };

  const getFileStatus = (fileName: string) => {
    if (processingFiles.includes(fileName)) return 'processing';
    if (completedFiles.includes(fileName)) return 'completed';
    if (errorFiles.includes(fileName)) return 'error';
    return 'pending';
  };

  const getOverallProgress = () => {
    if (selectedFiles.length === 0) return 0;
    return ((completedFiles.length + errorFiles.length) / selectedFiles.length) * 100;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Bank Statements</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-neutral-300'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <Upload className="mx-auto h-12 w-12 text-neutral-400 mb-4" />
            <p className="text-lg font-medium text-neutral-900 mb-2">
              Drop CAMT.053 XML files here
            </p>
            <p className="text-sm text-neutral-500 mb-4">
              Or click to select multiple files
            </p>
            <input
              type="file"
              multiple
              accept=".xml"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
              id="file-upload"
              disabled={importMutation.isPending}
            />
            <label htmlFor="file-upload">
              <Button variant="outline" className="cursor-pointer" disabled={importMutation.isPending}>
                Select Files
              </Button>
            </label>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-neutral-900">
                Selected Files ({selectedFiles.length})
              </h4>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {selectedFiles.map((file, index) => {
                  const status = getFileStatus(file.name);
                  return (
                    <div key={index} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <FileText className="h-5 w-5 text-neutral-500" />
                        <div>
                          <p className="text-sm font-medium text-neutral-900">{file.name}</p>
                          <p className="text-xs text-neutral-500">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {status === 'processing' && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        )}
                        {status === 'completed' && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                        {status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        {status === 'pending' && !importMutation.isPending && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {importMutation.isPending && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing files...</span>
                <span>{Math.round(getOverallProgress())}%</span>
              </div>
              <Progress value={getOverallProgress()} className="w-full" />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button 
              variant="outline" 
              onClick={handleClose}
              disabled={importMutation.isPending}
              className="flex-1"
            >
              {importMutation.isPending ? "Processing..." : "Cancel"}
            </Button>
            <Button 
              onClick={handleImport}
              disabled={selectedFiles.length === 0 || importMutation.isPending}
              className="flex-1 fire-button-primary"
            >
              {importMutation.isPending ? "Importing..." : `Import ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
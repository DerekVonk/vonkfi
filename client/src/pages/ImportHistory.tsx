import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle, XCircle, Clock, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ImportRecord {
  id: number;
  userId: number;
  batchId?: number;
  fileName: string;
  fileSize?: number;
  statementId?: string;
  importDate: string;
  accountsFound: number;
  transactionsImported: number;
  duplicatesSkipped?: number;
  status: "processing" | "completed" | "failed";
  errorMessage?: string;
}

interface ImportBatch {
  id: number;
  userId: number;
  batchDate: string;
  totalFiles: number;
  totalTransactions: number;
  accountsAffected: string[];
  status: string;
  notes?: string;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "Unknown size";
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "processing":
      return <Clock className="w-4 h-4 text-blue-500" />;
    default:
      return <FileText className="w-4 h-4 text-gray-500" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="default" className="bg-green-100 text-green-800">Completed</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "processing":
      return <Badge variant="secondary">Processing</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function ImportHistory() {
  const { data: imports, isLoading, error } = useQuery<ImportRecord[]>({
    queryKey: ["/api/imports/1"], // Using userId 1 for demo
    refetchInterval: 5000, // Refresh every 5 seconds for processing updates
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center space-x-2">
          <Download className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Import History</h1>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-red-800 mb-2">Failed to Load Import History</h2>
            <p className="text-red-600">Please try refreshing the page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const importStats = imports ? {
    totalImports: imports.length,
    totalTransactions: imports.reduce((sum, imp) => sum + (imp.transactionsImported || 0), 0),
    totalDuplicates: imports.reduce((sum, imp) => sum + (imp.duplicatesSkipped || 0), 0),
    successfulImports: imports.filter(imp => imp.status === 'completed').length,
    failedImports: imports.filter(imp => imp.status === 'failed').length
  } : null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Download className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Import History</h1>
        </div>
        <div className="text-sm text-gray-500">
          {imports?.length || 0} import{(imports?.length || 0) !== 1 ? 's' : ''} total
        </div>
      </div>

      {/* Import Statistics Summary */}
      {importStats && importStats.totalImports > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{importStats.totalImports}</div>
              <div className="text-sm text-gray-500">Total Imports</div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{importStats.totalTransactions}</div>
              <div className="text-sm text-gray-500">Transactions Imported</div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{importStats.totalDuplicates}</div>
              <div className="text-sm text-gray-500">Duplicates Detected</div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{importStats.successfulImports}</div>
              <div className="text-sm text-gray-500">Successful</div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{importStats.failedImports}</div>
              <div className="text-sm text-gray-500">Failed</div>
            </div>
          </Card>
        </div>
      )}

      {!imports || imports.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-gray-600 mb-2">No Imports Yet</h2>
            <p className="text-gray-500">
              Upload your first CAMT.053 bank statement to see import history here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {imports.map((importRecord) => (
            <Card key={importRecord.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(importRecord.status)}
                    <div>
                      <CardTitle className="text-lg">{importRecord.fileName}</CardTitle>
                      <p className="text-sm text-gray-500">
                        Imported {formatDistanceToNow(new Date(importRecord.importDate), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(importRecord.status)}
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">File Size</p>
                    <p className="font-medium">{formatFileSize(importRecord.fileSize)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Accounts Found</p>
                    <p className="font-medium">{importRecord.accountsFound}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Transactions</p>
                    <p className="font-medium text-green-600">{importRecord.transactionsImported}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Duplicates Skipped</p>
                    <p className="font-medium text-orange-600">{importRecord.duplicatesSkipped || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Statement ID</p>
                    <p className="font-medium text-xs font-mono truncate">
                      {importRecord.statementId || "N/A"}
                    </p>
                  </div>
                </div>

                {importRecord.status === "failed" && importRecord.errorMessage && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-start space-x-2">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-800">Import Failed</p>
                        <p className="text-sm text-red-600">{importRecord.errorMessage}</p>
                      </div>
                    </div>
                  </div>
                )}

                {importRecord.status === "completed" && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <p className="text-sm text-green-800">
                        Successfully imported {importRecord.transactionsImported} transactions
                        {importRecord.accountsFound > 0 && ` and discovered ${importRecord.accountsFound} account${importRecord.accountsFound !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                )}

                {importRecord.status === "processing" && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-blue-500 animate-spin" />
                      <p className="text-sm text-blue-800">Import in progress...</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
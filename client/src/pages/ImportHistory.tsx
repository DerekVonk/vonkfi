import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle, XCircle, Clock, Download, ChevronDown, ChevronRight, Calendar, Files } from "lucide-react";
import { formatDistanceToNow, format, isSameDay } from "date-fns";
import { useState } from "react";

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

interface ImportGroup {
  date: string;
  imports: ImportRecord[];
  totalFiles: number;
  totalTransactions: number;
  totalDuplicates: number;
  successfulImports: number;
  failedImports: number;
}

export default function ImportHistory() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const { data: imports, isLoading, error } = useQuery<ImportRecord[]>({
    queryKey: ["/api/imports/1"], // Using userId 1 for demo
    refetchInterval: 5000, // Refresh every 5 seconds for processing updates
  });

  // Group imports by date
  const groupedImports: ImportGroup[] = imports ? 
    Object.entries(
      imports.reduce((groups, importRecord) => {
        const date = format(new Date(importRecord.importDate), 'yyyy-MM-dd');
        if (!groups[date]) {
          groups[date] = [];
        }
        groups[date].push(importRecord);
        return groups;
      }, {} as Record<string, ImportRecord[]>)
    ).map(([date, groupImports]) => ({
      date,
      imports: groupImports.sort((a, b) => new Date(b.importDate).getTime() - new Date(a.importDate).getTime()),
      totalFiles: groupImports.length,
      totalTransactions: groupImports.reduce((sum, imp) => sum + (imp.transactionsImported || 0), 0),
      totalDuplicates: groupImports.reduce((sum, imp) => sum + (imp.duplicatesSkipped || 0), 0),
      successfulImports: groupImports.filter(imp => imp.status === 'completed').length,
      failedImports: groupImports.filter(imp => imp.status === 'failed').length,
    })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  // Pagination
  const totalPages = Math.ceil(groupedImports.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedGroups = groupedImports.slice(startIndex, startIndex + itemsPerPage);

  const toggleGroup = (date: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedGroups(newExpanded);
  };

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
          {imports?.length || 0} import{(imports?.length || 0) !== 1 ? 's' : ''} total across {groupedImports.length} day{groupedImports.length !== 1 ? 's' : ''}
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
        <>
          {/* Grouped Import History */}
          <div className="space-y-4">
            {paginatedGroups.map((group) => (
              <Card key={group.date} className="transition-shadow hover:shadow-md">
                <CardHeader 
                  className="pb-3 cursor-pointer"
                  onClick={() => toggleGroup(group.date)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      <div>
                        <CardTitle className="text-lg">
                          {format(new Date(group.date), 'MMMM d, yyyy')}
                        </CardTitle>
                        <p className="text-sm text-gray-500">
                          {group.totalFiles} file{group.totalFiles !== 1 ? 's' : ''} imported
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="grid grid-cols-3 gap-4 text-center mr-4">
                        <div>
                          <div className="text-sm font-bold text-green-600">{group.totalTransactions}</div>
                          <div className="text-xs text-gray-500">Transactions</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-blue-600">{group.successfulImports}</div>
                          <div className="text-xs text-gray-500">Success</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-red-600">{group.failedImports}</div>
                          <div className="text-xs text-gray-500">Failed</div>
                        </div>
                      </div>
                      {expandedGroups.has(group.date) ? 
                        <ChevronDown className="w-5 h-5 text-gray-400" /> : 
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      }
                    </div>
                  </div>
                </CardHeader>
                
                {expandedGroups.has(group.date) && (
                  <CardContent className="pt-0 border-t border-gray-100">
                    <div className="space-y-4 mt-4">
                      {group.imports.map((importRecord) => (
                        <div key={importRecord.id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              {getStatusIcon(importRecord.status)}
                              <div>
                                <h4 className="font-medium">{importRecord.fileName}</h4>
                                <p className="text-sm text-gray-500">
                                  {format(new Date(importRecord.importDate), 'HH:mm:ss')}
                                </p>
                              </div>
                            </div>
                            {getStatusBadge(importRecord.status)}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wide">File Size</p>
                              <p className="font-medium text-sm">{formatFileSize(importRecord.fileSize)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Accounts Found</p>
                              <p className="font-medium text-sm">{importRecord.accountsFound}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Transactions</p>
                              <p className="font-medium text-sm text-green-600">{importRecord.transactionsImported}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wide">Duplicates Skipped</p>
                              <p className="font-medium text-sm text-orange-600">{importRecord.duplicatesSkipped || 0}</p>
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
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, groupedImports.length)} of {groupedImports.length} import sessions
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="w-10"
                    >
                      {page}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, History, AlertCircle } from "lucide-react";
import ImportModal from "@/components/ImportModal";

const DEMO_USER_ID = 1;

export default function Import() {
  const [showImportModal, setShowImportModal] = useState(false);

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
          
          <Button onClick={() => setShowImportModal(true)} className="fire-button-primary">
            <Upload className="w-4 h-4 mr-2" />
            Import New Statement
          </Button>
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

        {/* Import History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <History className="w-5 h-5" />
              <span>Import History</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              <History size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No imports yet</p>
              <p className="text-xs text-gray-400">Your import history will appear here</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)}
        userId={DEMO_USER_ID}
      />
    </>
  );
}

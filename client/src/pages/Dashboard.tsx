import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardData } from "@/types";
import ImportModal from "@/components/ImportModal";
import DraggableLayout from "@/components/DraggableLayout";

const DEMO_USER_ID = 1;

export default function Dashboard() {
  const [showImportModal, setShowImportModal] = useState(false);
  
  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: [api.getDashboard(DEMO_USER_ID)],
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="h-64 bg-gray-200 rounded-xl"></div>
            <div className="lg:col-span-2 h-64 bg-gray-200 rounded-xl"></div>
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
            <h2 className="text-2xl font-semibold text-neutral-800">Dashboard</h2>
            <p className="text-sm text-neutral-400 mt-1">
              Your path to Financial Independence, Retire Early
            </p>
          </div>
          
          <Button 
            onClick={() => setShowImportModal(true)}
            className="fire-button-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Import Bank Statement
          </Button>
        </div>
      </header>

      <div className="p-6">
        <DraggableLayout dashboardData={dashboardData} />
      </div>

      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)}
        userId={DEMO_USER_ID}
      />
    </>
  );
}
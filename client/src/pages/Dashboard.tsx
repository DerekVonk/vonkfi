import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Clock } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardData } from "@/types";
import ImportModal from "@/components/ImportModal";
import DraggableLayout from "@/components/DraggableLayout";
import OutdatedDataNotification from "@/components/OutdatedDataNotification";

const DEMO_USER_ID = 1;

export default function Dashboard() {
  const [showImportModal, setShowImportModal] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);
  
  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: [api.getDashboard(DEMO_USER_ID)],
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="animate-pulse space-y-4 sm:space-y-6">
          <div className="h-6 sm:h-8 bg-gray-200 rounded w-1/2 sm:w-1/4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="h-48 sm:h-64 bg-gray-200 rounded-xl"></div>
            <div className="lg:col-span-2 h-48 sm:h-64 bg-gray-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl font-semibold text-neutral-800">Dashboard</h2>
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 mt-1 space-y-1 sm:space-y-0">
              <p className="text-sm text-neutral-400">
                Your path to FIRE with VonkFi
              </p>
              <div className="flex items-center space-x-2 text-sm text-neutral-500">
                <Clock size={14} />
                <span>
                  {currentDateTime.toLocaleDateString('en-EU', { 
                    weekday: 'short',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })} • {currentDateTime.toLocaleTimeString('en-EU', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </div>
          </div>
          
          <Button 
            onClick={() => setShowImportModal(true)}
            className="fire-button-primary w-full sm:w-auto flex-shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" />
            <span className="truncate">Import Bank Statement</span>
          </Button>
        </div>
      </header>

      <div className="p-4 sm:p-6">
        <OutdatedDataNotification dashboardData={dashboardData} userId={DEMO_USER_ID} />
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
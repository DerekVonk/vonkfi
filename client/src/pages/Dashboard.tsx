import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Clock } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardData } from "@/types";
import ImportModal from "@/components/ImportModal";
import DraggableLayout from "@/components/DraggableLayout";
import OutdatedDataNotification from "@/components/OutdatedDataNotification";
import LoadingSkeleton from "@/components/LoadingSkeleton";

const DEMO_USER_ID = 1;

const Dashboard = memo(function Dashboard() {
  const [showImportModal, setShowImportModal] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);
  
  const { data: dashboardData, isLoading, error } = useQuery<DashboardData>({
    queryKey: [api.getDashboard(DEMO_USER_ID)],
  });

  // Memoize formatted current date time to prevent unnecessary re-renders
  const formattedDateTime = useMemo(() => {
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return {
      date: currentDateTime.toLocaleDateString('en-EU', dateOptions),
      time: currentDateTime.toLocaleTimeString('en-EU', timeOptions)
    };
  }, [currentDateTime]);

  if (isLoading) {
    return <LoadingSkeleton variant="dashboard" />;
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
                  {formattedDateTime.date} • {formattedDateTime.time}
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
});

export default Dashboard;
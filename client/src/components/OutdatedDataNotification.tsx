import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Upload, X } from "lucide-react";
import ImportModal from "./ImportModal";
import type { DashboardData } from "@/types";

interface OutdatedDataNotificationProps {
  dashboardData?: DashboardData;
  userId: number;
}

export default function OutdatedDataNotification({ dashboardData, userId }: OutdatedDataNotificationProps) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Check if data is outdated (more than 1 month old)
  const isDataOutdated = () => {
    if (!dashboardData?.fireMetrics?.currentMonth) return false;
    
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const dataMonth = dashboardData.fireMetrics!.currentMonth;
    
    const current = new Date(currentMonth + "-01");
    const data = new Date(dataMonth + "-01");
    
    // If data is more than 1 month old
    const monthsDifference = (current.getFullYear() - data.getFullYear()) * 12 + 
                            (current.getMonth() - data.getMonth());
    
    return monthsDifference > 1;
  };

  if (!isDataOutdated() || dismissed) {
    return null;
  }

  return (
    <>
      <Alert className="mb-6 border-orange-200 bg-orange-50">
        <AlertTriangle className="h-4 w-4 text-orange-600" />
        <AlertDescription className="flex items-center justify-between">
          <div className="text-orange-800">
            <strong>Bank statements may be outdated.</strong> Your calculations are based on data from{" "}
            {new Date(dashboardData?.fireMetrics?.currentMonth + "-01").toLocaleDateString('en-EU', { 
              month: 'long', 
              year: 'numeric' 
            })}. Import recent statements for accurate insights.
          </div>
          <div className="flex items-center space-x-2 ml-4">
            <Button
              size="sm"
              onClick={() => setShowImportModal(true)}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              <Upload size={14} className="mr-2" />
              Update Data
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
              className="text-orange-600 hover:bg-orange-100"
            >
              <X size={14} />
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)}
        userId={userId}
      />
    </>
  );
}
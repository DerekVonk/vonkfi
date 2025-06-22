import React, { Suspense, lazy } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

// Lazy load chart components
const IncomeVolatilityChart = lazy(() => import("./IncomeVolatilityChart"));

interface LazyChartWrapperProps {
  chartType: "income-volatility";
  data?: any;
  className?: string;
}

// Loading skeleton for charts
function ChartSkeleton() {
  return (
    <div className="h-48 w-full">
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center h-full p-6">
          <div className="animate-pulse flex flex-col items-center space-y-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-2 text-center">
              <div className="h-4 w-32 bg-muted rounded animate-pulse"></div>
              <div className="h-3 w-24 bg-muted rounded animate-pulse"></div>
            </div>
            <div className="w-full max-w-xs space-y-2">
              <div className="h-3 bg-muted rounded animate-pulse"></div>
              <div className="h-3 bg-muted rounded animate-pulse w-4/5"></div>
              <div className="h-3 bg-muted rounded animate-pulse w-3/5"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Error fallback for charts
function ChartErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="h-48 w-full">
      <Card className="h-full border-destructive/20">
        <CardContent className="flex flex-col items-center justify-center h-full p-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="p-3 bg-destructive/10 rounded-full">
              <TrendingUp className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">
                Failed to load chart
              </p>
              <p className="text-xs text-muted-foreground">
                Unable to load the chart component
              </p>
            </div>
            <button
              onClick={onRetry}
              className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Chart error boundary
class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode; onRetry: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onRetry: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Chart component error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ChartErrorFallback onRetry={this.props.onRetry} />;
    }

    return this.props.children;
  }
}

export default function LazyChartWrapper({
  chartType,
  data,
  className,
}: LazyChartWrapperProps) {
  const [retryKey, setRetryKey] = React.useState(0);

  const handleRetry = () => {
    setRetryKey(prev => prev + 1);
  };

  const renderChart = () => {
    switch (chartType) {
      case "income-volatility":
        return <IncomeVolatilityChart data={data} />;
      default:
        return <div>Unknown chart type</div>;
    }
  };

  return (
    <div className={className} key={retryKey}>
      <ChartErrorBoundary onRetry={handleRetry}>
        <Suspense fallback={<ChartSkeleton />}>
          {renderChart()}
        </Suspense>
      </ChartErrorBoundary>
    </div>
  );
}
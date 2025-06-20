import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  Calendar, 
  Target,
  Shield,
  Zap
} from "lucide-react";
import { format } from "date-fns";

const DEMO_USER_ID = 1;

interface FixedExpensePrediction {
  monthlyRequirement: number;
  seasonalAdjustment: number;
  confidenceScore: number;
  upcomingExpenses: {
    date: string;
    amount: number;
    merchant: string;
    type: 'fixed' | 'variable';
  }[];
  recommendedBufferAmount: number;
  targetAccounts: string[]; // User-configurable accounts for optimization
}

export default function AIFixedExpenseInsights() {
  const { data: prediction, isLoading } = useQuery<FixedExpensePrediction>({
    queryKey: [`/api/ai/fixed-expense-prediction/${DEMO_USER_ID}`],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const { data: anomalies } = useQuery<{
    anomalies: any[];
    totalAnomalies: number;
    highSeverityAnomalies: number;
    recentAnomalies: number;
  }>({
    queryKey: [`/api/ai/expense-anomalies/${DEMO_USER_ID}`],
    refetchInterval: 300000,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <span>AI Vaste Lasten Insights</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!prediction) {
    return (
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <span>AI Vaste Lasten Insights</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            AI analysis requires more transaction data to provide insights.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <span>AI Vaste Lasten Insights</span>
          </div>
          <Badge variant="outline" className="text-blue-600 border-blue-200">
            AI Powered
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Monthly Requirement */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Target className="w-4 h-4" />
              <span>Monthly Requirement</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(prediction.monthlyRequirement)}
            </div>
            <div className="text-xs text-gray-500">
              Confidence: {formatPercentage(prediction.confidenceScore)}
            </div>
            <Progress value={prediction.confidenceScore * 100} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <TrendingUp className="w-4 h-4" />
              <span>Seasonal Impact</span>
            </div>
            <div className={`text-2xl font-bold ${prediction.seasonalAdjustment >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {prediction.seasonalAdjustment >= 0 ? '+' : ''}{formatCurrency(prediction.seasonalAdjustment)}
            </div>
            <div className="text-xs text-gray-500">
              {prediction.seasonalAdjustment >= 0 ? 'Higher winter costs' : 'Lower seasonal costs'}
            </div>
          </div>
        </div>

        {/* Recommended Buffer */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center space-x-2 mb-1">
            <Shield className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">Recommended Buffer</span>
          </div>
          <div className="text-lg font-bold text-green-600">
            {formatCurrency(prediction.recommendedBufferAmount)}
          </div>
          <div className="text-xs text-green-700">
            2.5 months of fixed expenses coverage
          </div>
        </div>

        {/* Upcoming Expenses */}
        {prediction.upcomingExpenses && prediction.upcomingExpenses.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-sm font-medium text-gray-700">
              <Calendar className="w-4 h-4" />
              <span>Next Fixed Expenses (30 days)</span>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {prediction.upcomingExpenses.slice(0, 4).map((expense: any, index: number) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="truncate max-w-[120px]">{expense.merchant}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(expense.amount)}</div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(expense.date), 'MMM d')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Anomaly Alert */}
        {anomalies && anomalies.recentAnomalies > 0 && (
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {anomalies.recentAnomalies} expense anomal{anomalies.recentAnomalies === 1 ? 'y' : 'ies'} detected
                </span>
                <Zap className="w-4 h-4" />
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
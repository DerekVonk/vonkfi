import { useQuery } from "@tanstack/react-query";
import { memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, Target, TrendingUp, AlertTriangle } from "lucide-react";

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
  targetAccounts: string[];
}

const AIFixedExpenseInsights = memo(function AIFixedExpenseInsights() {
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

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  }, []);

  const formatPercentage = useCallback((value: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }, []);

  if (isLoading) {
    return (
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Brain className="w-5 h-5 text-blue-600" />
            <span>AI Fixed Expense Insights</span>
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
            <span>AI Fixed Expense Insights</span>
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
            <span>AI Fixed Expense Insights</span>
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
              <span>Buffer Recommendation</span>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(prediction.recommendedBufferAmount)}
            </div>
            <div className="text-xs text-gray-500">
              Safety buffer for variations
            </div>
          </div>
        </div>

        {/* Seasonal Adjustment */}
        {Math.abs(prediction.seasonalAdjustment) > 10 && (
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center space-x-2 text-sm text-yellow-800">
              <AlertTriangle className="w-4 h-4" />
              <span>Seasonal Adjustment</span>
            </div>
            <p className="text-sm text-yellow-700 mt-1">
              {prediction.seasonalAdjustment > 0 ? 'Increase' : 'Decrease'} by{' '}
              {formatCurrency(Math.abs(prediction.seasonalAdjustment))} for seasonal variations
            </p>
          </div>
        )}

        {/* Anomalies Alert */}
        {anomalies && anomalies.totalAnomalies > 0 && (
          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-red-800">
                <AlertTriangle className="w-4 h-4" />
                <span>Expense Anomalies Detected</span>
              </div>
              <Badge variant="destructive" className="text-xs">
                {anomalies.totalAnomalies}
              </Badge>
            </div>
            <p className="text-sm text-red-700 mt-1">
              {anomalies.highSeverityAnomalies} high severity, {anomalies.recentAnomalies} recent
            </p>
          </div>
        )}

        {/* Upcoming Expenses */}
        {prediction.upcomingExpenses.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Upcoming Fixed Expenses</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {prediction.upcomingExpenses.slice(0, 3).map((expense, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{expense.merchant}</p>
                    <p className="text-xs text-gray-500">{expense.date}</p>
                  </div>
                  <div className="text-sm font-medium">
                    {formatCurrency(expense.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default AIFixedExpenseInsights;
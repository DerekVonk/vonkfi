import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  Calendar, 
  DollarSign, 
  Target,
  ArrowRight,
  Zap,
  Shield,
  Clock
} from "lucide-react";
import { format, addMonths } from "date-fns";

const DEMO_USER_ID = 1;

interface FixedExpensePattern {
  merchantName: string;
  categoryName?: string;
  averageAmount: number;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'irregular';
  predictedNextAmount: number;
  predictedNextDate: string;
  confidence: number;
  variability: number;
  lastSeen: string;
  transactionCount: number;
}

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
  transferTiming: {
    recommendedDate: string;
    amount: number;
    reason: string;
  }[];
}

interface IntelligentRecommendation {
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  urgency: 'immediate' | 'weekly' | 'monthly';
  type: 'fixed_expense' | 'emergency_buffer' | 'goal_funding' | 'optimization';
  confidence: number;
  expectedImpact: {
    savingsRate: number;
    riskReduction: number;
    opportunityCost: number;
  };
  timing: {
    recommendedDate: string;
    deadline?: string;
    recurring?: 'monthly' | 'quarterly' | 'yearly';
  };
  metadata: {
    fixedExpensesCovered?: string[];
    goalContribution?: number;
    bufferOptimization?: boolean;
  };
}

export default function AIFixedExpenseOptimizer() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const { data: fixedExpenses, isLoading: expensesLoading } = useQuery<{
    patterns: FixedExpensePattern[];
    totalPatterns: number;
    highConfidencePatterns: number;
    monthlyTotal: number;
  }>({
    queryKey: [`/api/ai/fixed-expenses/${DEMO_USER_ID}`],
  });

  const { data: prediction, isLoading: predictionLoading } = useQuery<FixedExpensePrediction>({
    queryKey: [`/api/ai/fixed-expense-prediction/${DEMO_USER_ID}`],
  });

  const { data: intelligentRecommendations, isLoading: recommendationsLoading } = useQuery<{
    recommendations: IntelligentRecommendation[];
    totalRecommendations: number;
    highPriorityRecommendations: number;
    totalAmount: number;
    fixedExpenseRecommendations: number;
  }>({
    queryKey: [`/api/ai/intelligent-transfers/${DEMO_USER_ID}`],
  });

  const { data: anomalies, isLoading: anomaliesLoading } = useQuery<{
    anomalies: any[];
    totalAnomalies: number;
    highSeverityAnomalies: number;
    recentAnomalies: number;
  }>({
    queryKey: [`/api/ai/expense-anomalies/${DEMO_USER_ID}`],
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return <Zap className="w-4 h-4 text-red-500" />;
      case 'weekly': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'monthly': return <Calendar className="w-4 h-4 text-blue-500" />;
      default: return <Calendar className="w-4 h-4 text-gray-500" />;
    }
  };

  if (expensesLoading || predictionLoading || recommendationsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Brain className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold">AI-Enhanced Fixed Expense Optimization</h2>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Brain className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold">AI-Enhanced Fixed Expense Optimization</h2>
        </div>
        <Badge variant="outline" className="text-blue-600 border-blue-200">
          Powered by AI
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="patterns">Expense Patterns</TabsTrigger>
          <TabsTrigger value="recommendations">Smart Transfers</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Prediction Summary */}
          {prediction && prediction.monthlyRequirement !== undefined && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-blue-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Target className="w-5 h-5 text-blue-600" />
                    <span>Monthly Requirement</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    {formatCurrency(prediction.monthlyRequirement)}
                  </div>
                  <div className="text-sm text-gray-600">
                    Confidence: {formatPercentage(prediction.confidenceScore)}
                  </div>
                  <Progress 
                    value={prediction.confidenceScore * 100} 
                    className="mt-2"
                  />
                </CardContent>
              </Card>

              <Card className="border-orange-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    <span>Seasonal Adjustment</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-600 mb-2">
                    {prediction.seasonalAdjustment > 0 ? '+' : ''}{formatCurrency(prediction.seasonalAdjustment)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {prediction.seasonalAdjustment > 0 ? 'Higher winter costs' : 'Lower seasonal costs'}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Shield className="w-5 h-5 text-green-600" />
                    <span>Recommended Buffer</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600 mb-2">
                    {formatCurrency(prediction.recommendedBufferAmount)}
                  </div>
                  <div className="text-sm text-gray-600">
                    2.5 months of fixed expenses
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Upcoming Expenses */}
          {prediction && prediction.upcomingExpenses && prediction.upcomingExpenses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5" />
                  <span>Upcoming Fixed Expenses (Next 3 Months)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {prediction.upcomingExpenses.slice(0, 6).map((expense: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <div>
                          <div className="font-medium">{expense.merchant}</div>
                          <div className="text-sm text-gray-500">
                            {format(new Date(expense.date), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(expense.amount)}</div>
                        <Badge variant={expense.type === 'fixed' ? 'default' : 'secondary'} className="text-xs">
                          {expense.type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="patterns" className="space-y-6">
          {fixedExpenses && fixedExpenses.patterns && (
            <Card>
              <CardHeader>
                <CardTitle>Detected Fixed Expense Patterns</CardTitle>
                <p className="text-sm text-gray-600">
                  AI has identified {fixedExpenses.highConfidencePatterns} high-confidence patterns 
                  from {fixedExpenses.totalPatterns} total patterns
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fixedExpenses.patterns.slice(0, 8).map((pattern: FixedExpensePattern, index: number) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium">{pattern.merchantName}</div>
                        <Badge variant={pattern.confidence > 0.8 ? 'default' : pattern.confidence > 0.6 ? 'secondary' : 'outline'}>
                          {formatPercentage(pattern.confidence)} confidence
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Average Amount:</span>
                          <div className="font-medium">{formatCurrency(pattern.averageAmount)}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Frequency:</span>
                          <div className="font-medium capitalize">{pattern.frequency}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Variability:</span>
                          <div className="font-medium">{formatPercentage(pattern.variability)}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Next Expected:</span>
                          <div className="font-medium">
                            {format(new Date(pattern.predictedNextDate), 'MMM d')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-6">
          {intelligentRecommendations && intelligentRecommendations.recommendations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>AI Transfer Recommendations</span>
                  <Badge variant="outline">
                    {intelligentRecommendations.totalRecommendations} recommendations
                  </Badge>
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Total amount: {formatCurrency(intelligentRecommendations.totalAmount)} • 
                  High priority: {intelligentRecommendations.highPriorityRecommendations} • 
                  Fixed expense specific: {intelligentRecommendations.fixedExpenseRecommendations}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {intelligentRecommendations.recommendations.map((rec: IntelligentRecommendation, index: number) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          {getUrgencyIcon(rec.urgency)}
                          <div>
                            <div className="font-medium">{rec.reason}</div>
                            <div className="text-sm text-gray-500">
                              {rec.type.replace('_', ' ')} • {formatCurrency(parseFloat(rec.amount))}
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Badge className={getPriorityColor(rec.priority)}>
                            {rec.priority}
                          </Badge>
                          <Badge variant="outline">
                            {formatPercentage(rec.confidence)}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Savings Rate Impact:</span>
                          <div className="font-medium text-green-600">
                            +{formatPercentage(rec.expectedImpact.savingsRate)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500">Risk Reduction:</span>
                          <div className="font-medium text-blue-600">
                            {formatPercentage(rec.expectedImpact.riskReduction)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500">Recommended Date:</span>
                          <div className="font-medium">
                            {format(new Date(rec.timing.recommendedDate), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </div>

                      {rec.metadata.fixedExpensesCovered && rec.metadata.fixedExpensesCovered.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <span className="text-sm text-gray-500">Covers expenses: </span>
                          <span className="text-sm">
                            {rec.metadata.fixedExpensesCovered.slice(0, 3).join(', ')}
                            {rec.metadata.fixedExpensesCovered.length > 3 && ` +${rec.metadata.fixedExpensesCovered.length - 3} more`}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="anomalies" className="space-y-6">
          {anomalies && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  <span>Expense Anomalies Detected</span>
                </CardTitle>
                <p className="text-sm text-gray-600">
                  {anomalies.totalAnomalies} anomalies found • 
                  {anomalies.highSeverityAnomalies} high severity • 
                  {anomalies.recentAnomalies} in the last 30 days
                </p>
              </CardHeader>
              <CardContent>
                {anomalies.anomalies && anomalies.anomalies.length > 0 ? (
                  <div className="space-y-4">
                    {anomalies.anomalies.slice(0, 5).map((anomaly: any, index: number) => (
                      <Alert key={index} className={
                        anomaly.severity === 'high' ? 'border-red-200 bg-red-50' :
                        anomaly.severity === 'medium' ? 'border-yellow-200 bg-yellow-50' :
                        'border-blue-200 bg-blue-50'
                      }>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="flex items-center justify-between">
                            <div>
                              <strong>{anomaly.merchantName}</strong> - {anomaly.anomalyType.replace('_', ' ')}
                              <div className="text-sm mt-1">
                                Expected: {formatCurrency(anomaly.expectedAmount)} • 
                                Actual: {formatCurrency(anomaly.actualAmount)} • 
                                Deviation: {formatPercentage(anomaly.deviation)}
                              </div>
                            </div>
                            <Badge variant={
                              anomaly.severity === 'high' ? 'destructive' :
                              anomaly.severity === 'medium' ? 'secondary' : 'outline'
                            }>
                              {anomaly.severity}
                            </Badge>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Shield className="w-12 h-12 mx-auto mb-4 text-green-500" />
                    <p>No significant anomalies detected in your fixed expenses.</p>
                    <p className="text-sm">Your spending patterns are consistent and predictable.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
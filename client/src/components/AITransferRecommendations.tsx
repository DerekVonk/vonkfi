import { useQuery } from "@tanstack/react-query";
import { memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Brain, 
  ArrowRight, 
  Zap,
  Clock,
  Calendar,
  TrendingUp
} from "lucide-react";
import { format } from "date-fns";

const DEMO_USER_ID = 1;

interface IntelligentRecommendation {
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  urgency: 'immediate' | 'weekly' | 'monthly';
  type: 'vaste_lasten' | 'emergency_buffer' | 'goal_funding' | 'optimization';
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

const AITransferRecommendations = memo(function AITransferRecommendations() {
  const { data: intelligentRecommendations, isLoading } = useQuery<{
    recommendations: IntelligentRecommendation[];
    totalRecommendations: number;
    highPriorityRecommendations: number;
    totalAmount: number;
    vasteLastenRecommendations: number;
  }>({
    queryKey: [`/api/ai/intelligent-transfers/${DEMO_USER_ID}`],
    refetchInterval: 300000, // Refresh every 5 minutes
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'vaste_lasten': return '🏠';
      case 'emergency_buffer': return '🛡️';
      case 'goal_funding': return '🎯';
      case 'optimization': return '⚡';
      default: return '💰';
    }
  };

  if (isLoading) {
    return (
      <Card className="border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Brain className="w-5 h-5 text-purple-600" />
            <span>AI Transfer Recommendations</span>
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

  if (!intelligentRecommendations || intelligentRecommendations.totalRecommendations === 0) {
    return (
      <Card className="border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center space-x-2">
            <Brain className="w-5 h-5 text-purple-600" />
            <span>AI Transfer Recommendations</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <TrendingUp className="w-8 h-8 mx-auto mb-2 text-purple-400" />
            <p className="text-sm text-gray-500">
              Your accounts are optimally balanced. No transfers needed at this time.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const topRecommendations = intelligentRecommendations.recommendations.slice(0, 3);

  return (
    <Card className="border-purple-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Brain className="w-5 h-5 text-purple-600" />
            <span>AI Transfer Recommendations</span>
          </div>
          <Badge variant="outline" className="text-purple-600 border-purple-200">
            {intelligentRecommendations.totalRecommendations} recommendations
          </Badge>
        </CardTitle>
        <div className="text-sm text-gray-600">
          Total: {formatCurrency(intelligentRecommendations.totalAmount)} • 
          High priority: {intelligentRecommendations.highPriorityRecommendations} • 
          Vaste Lasten: {intelligentRecommendations.vasteLastenRecommendations}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {topRecommendations.map((rec: IntelligentRecommendation, index: number) => (
          <div key={index} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className="text-lg">{getTypeIcon(rec.type)}</div>
                <div className="flex-1">
                  <div className="font-medium text-sm leading-tight">{rec.reason}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatCurrency(parseFloat(rec.amount))} • 
                    {format(new Date(rec.timing.recommendedDate), 'MMM d')}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                {getUrgencyIcon(rec.urgency)}
                <Badge className={getPriorityColor(rec.priority)} variant="outline">
                  {rec.priority}
                </Badge>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Savings Impact:</span>
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
                <span className="text-gray-500">Confidence:</span>
                <div className="font-medium">
                  {formatPercentage(rec.confidence)}
                </div>
              </div>
            </div>

            {rec.metadata.fixedExpensesCovered && rec.metadata.fixedExpensesCovered.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-500">Covers: </span>
                <span className="text-xs">
                  {rec.metadata.fixedExpensesCovered.slice(0, 2).join(', ')}
                  {rec.metadata.fixedExpensesCovered.length > 2 && ` +${rec.metadata.fixedExpensesCovered.length - 2} more`}
                </span>
              </div>
            )}
          </div>
        ))}

        {intelligentRecommendations.totalRecommendations > 3 && (
          <div className="pt-2 border-t">
            <Button variant="ghost" size="sm" className="w-full text-purple-600 hover:text-purple-700">
              View All {intelligentRecommendations.totalRecommendations} Recommendations
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default AITransferRecommendations;
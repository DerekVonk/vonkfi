import { useState, useMemo, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, PiggyBank, ArrowLeftRight, Clock } from "lucide-react";
import type { DashboardData } from "@/types";

interface MonthlyOverviewProps {
  dashboardData?: DashboardData;
}

const MonthlyOverview = memo(function MonthlyOverview({ dashboardData }: MonthlyOverviewProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Memoize formatter functions
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

  const navigateMonth = useCallback((direction: 'prev' | 'next') => {
    const newDate = new Date(selectedMonth);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedMonth(newDate);
  }, [selectedMonth]);

  // Memoize expensive monthly data calculations
  const monthData = useMemo(() => {
    const monthKey = selectedMonth.toISOString().substring(0, 7); // YYYY-MM format
    const currentMonthKey = new Date().toISOString().substring(0, 7);

    // If looking at current month, always use the live fireMetrics data
    if (monthKey === currentMonthKey) {
      return {
        income: dashboardData?.fireMetrics?.monthlyIncome || 0,
        expenses: dashboardData?.fireMetrics?.monthlyExpenses || 0,
        savings: (dashboardData?.fireMetrics?.monthlyIncome || 0) - (dashboardData?.fireMetrics?.monthlyExpenses || 0),
        savingsRate: dashboardData?.fireMetrics?.savingsRate || 0
      };
    }

    // For historical months, look in monthlyBreakdown
    const monthData = dashboardData?.fireMetrics?.monthlyBreakdown?.find(
      m => m.month === monthKey
    );

    if (monthData) {
      return {
        income: monthData.income,
        expenses: monthData.expenses,
        savings: monthData.savings,
        savingsRate: monthData.income > 0 ? monthData.savings / monthData.income : 0
      };
    }

    // No data available for this month
    return {
      income: 0,
      expenses: 0,
      savings: 0,
      savingsRate: 0
    };
  }, [selectedMonth, dashboardData?.fireMetrics]);

  const isCurrentMonth = useMemo(() => {
    return selectedMonth.toISOString().substring(0, 7) === new Date().toISOString().substring(0, 7);
  }, [selectedMonth]);

  const formattedMonth = useMemo(() => {
    return selectedMonth.toLocaleDateString('en-EU', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  // Data freshness indicators
  const dataFreshness = useMemo(() => {
    const currentMonthKey = new Date().toISOString().substring(0, 7);
    const lastTransactionDate = dashboardData?.fireMetrics?.lastTransactionDate || '';

    if (!lastTransactionDate) {
      return {
        isDataCurrent: true,
        monthsOld: 0,
        lastTransactionDate: '',
        lastTransactionFormatted: 'Unknown',
        isStale: false
      };
    }

    const lastTransactionMonth = lastTransactionDate.substring(0, 7); // Extract YYYY-MM from date
    const isDataCurrent = lastTransactionMonth === currentMonthKey;
    const monthsOld = lastTransactionMonth ?
      ((new Date().getFullYear() - new Date(lastTransactionMonth + '-01').getFullYear()) * 12) +
      (new Date().getMonth() - new Date(lastTransactionMonth + '-01').getMonth()) : 0;

    const lastTransactionFormatted = lastTransactionMonth ?
      new Date(lastTransactionMonth + '-01').toLocaleDateString('en-EU', { month: 'long', year: 'numeric' }) :
      'Unknown';

    return {
      isDataCurrent,
      monthsOld,
      lastTransactionDate,
      lastTransactionFormatted,
      isStale: monthsOld > 0
    };
  }, [dashboardData?.fireMetrics?.lastTransactionDate]);

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateMonth('prev')}
          className="p-2"
        >
          <ChevronLeft size={16} />
        </Button>

        <div className="text-center">
          <h3 className="font-medium text-neutral-800">
            {formattedMonth}
          </h3>
          {isCurrentMonth && (
            <div className="space-y-1">
              <p className="text-xs text-green-600">Current Month</p>
              {dataFreshness.isStale && (
                <div className="flex items-center justify-center gap-1 text-xs text-amber-600 bg-amber-50 rounded-full px-3 py-1.5 border border-amber-200">
                  <Clock size={12} />
                  <span className="font-medium">Data through {dataFreshness.lastTransactionFormatted}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateMonth('next')}
          className="p-2"
          disabled={selectedMonth >= new Date()}
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      {/* Monthly Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mx-auto mb-3">
            <ArrowUp className="text-green-600" size={20} />
          </div>
          <div className="text-xl lg:text-2xl font-bold text-neutral-800 min-h-[2rem] flex items-center justify-center">
            {formatCurrency(monthData.income)}
          </div>
          <div className="text-sm text-neutral-400 truncate">Income</div>
          <div className="text-xs text-green-600 mt-1 truncate">
            {isCurrentMonth ? 
              (dataFreshness.isStale ? '6-month average' : 'Current month') : 
              'Historical'
            }
          </div>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 bg-neutral-100 rounded-lg flex items-center justify-center mx-auto mb-3">
            <ArrowDown className="text-neutral-600" size={20} />
          </div>
          <div className="text-xl lg:text-2xl font-bold text-neutral-800 min-h-[2rem] flex items-center justify-center">
            {formatCurrency(monthData.expenses)}
          </div>
          <div className="text-sm text-neutral-400 truncate">Essential</div>
          <div className="text-xs text-neutral-600 mt-1 truncate">
            {isCurrentMonth ? 
              (dataFreshness.isStale ? '6-month average' : 'Current month') : 
              'Historical'
            }
          </div>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center mx-auto mb-3">
            <PiggyBank className="text-purple-600" size={20} />
          </div>
          <div className="text-xl lg:text-2xl font-bold text-neutral-800 min-h-[2rem] flex items-center justify-center">
            {formatCurrency(monthData.savings)}
          </div>
          <div className="text-sm text-neutral-400 truncate">Savings</div>
          <div className="text-xs text-purple-600 mt-1 truncate">
            {formatPercentage(monthData.savingsRate)} rate
          </div>
        </div>

        <div className="text-center">
          <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center mx-auto mb-3">
            <ArrowLeftRight className="text-orange-500" size={20} />
          </div>
          <div className="text-xl lg:text-2xl font-bold text-neutral-800 min-h-[2rem] flex items-center justify-center">
            {isCurrentMonth ? (dashboardData?.transferRecommendations?.length || 0) : 0}
          </div>
          <div className="text-sm text-neutral-400 truncate">Transfers</div>
          <div className="text-xs text-orange-500 mt-1 truncate">
            {isCurrentMonth ? 'Recommended' : 'N/A'}
          </div>
        </div>
      </div>
    </div>
  );
});

export default MonthlyOverview;

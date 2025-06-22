import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { memo, useMemo, useCallback } from "react";
import type { FireMetrics } from "@/types";

interface IncomeVolatilityChartProps {
  data?: FireMetrics;
}

const IncomeVolatilityChart = memo(function IncomeVolatilityChart({ data }: IncomeVolatilityChartProps) {
  // Memoize chart data generation to prevent recalculation on every render
  const chartData = useMemo(() => {
    const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const baseIncome = data?.volatility.average || 4120;
    const stdDev = data?.volatility.standardDeviation || 315;
    
    // Use a seed for consistent "random" data
    let seed = 123;
    const seededRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    
    return months.map((month, index) => {
      // Generate realistic income variation with seeded random
      const variation = (seededRandom() - 0.5) * stdDev * 2;
      const income = baseIncome + variation;
      
      return {
        month,
        income: Math.round(income),
        average: Math.round(baseIncome),
        upperBound: Math.round(baseIncome + stdDev),
        lowerBound: Math.round(baseIncome - stdDev),
      };
    });
  }, [data?.volatility.average, data?.volatility.standardDeviation]);

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
    }).format(value);
  }, []);

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 12, fill: '#6b7280' }}
            axisLine={false}
          />
          <YAxis 
            tick={{ fontSize: 12, fill: '#6b7280' }}
            axisLine={false}
            tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip 
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === 'income' ? 'Monthly Income' :
              name === 'average' ? '6-Month Average' :
              name === 'upperBound' ? 'Upper Bound' : 'Lower Bound'
            ]}
            labelStyle={{ color: '#374151' }}
            contentStyle={{ 
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '12px'
            }}
          />
          
          {/* Average line */}
          <Line 
            type="monotone" 
            dataKey="average" 
            stroke="#9CA3AF" 
            strokeWidth={1}
            strokeDasharray="5 5"
            dot={false}
          />
          
          {/* Upper/Lower bounds */}
          <Line 
            type="monotone" 
            dataKey="upperBound" 
            stroke="#E5E7EB" 
            strokeWidth={1}
            dot={false}
          />
          <Line 
            type="monotone" 
            dataKey="lowerBound" 
            stroke="#E5E7EB" 
            strokeWidth={1}
            dot={false}
          />
          
          {/* Actual income line */}
          <Line 
            type="monotone" 
            dataKey="income" 
            stroke="#3B82F6" 
            strokeWidth={2}
            dot={{ fill: '#3B82F6', strokeWidth: 0, r: 4 }}
            activeDot={{ r: 6, fill: '#3B82F6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

export default IncomeVolatilityChart;

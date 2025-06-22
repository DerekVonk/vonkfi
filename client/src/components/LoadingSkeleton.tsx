import { memo } from 'react';

interface LoadingSkeletonProps {
  variant?: 'dashboard' | 'list' | 'card' | 'chart';
  count?: number;
  className?: string;
}

const LoadingSkeleton = memo(function LoadingSkeleton({ 
  variant = 'dashboard', 
  count = 1,
  className = '' 
}: LoadingSkeletonProps) {
  const renderSkeleton = () => {
    switch (variant) {
      case 'dashboard':
        return (
          <div className="p-4 sm:p-6">
            <div className="animate-pulse space-y-4 sm:space-y-6">
              {/* Header skeleton */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-3 sm:space-y-0">
                <div className="space-y-2">
                  <div className="h-6 sm:h-8 bg-gray-200 rounded w-32 sm:w-48"></div>
                  <div className="h-4 bg-gray-200 rounded w-48 sm:w-64"></div>
                </div>
                <div className="h-10 bg-gray-200 rounded w-full sm:w-40"></div>
              </div>
              
              {/* Cards grid skeleton */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="h-48 sm:h-64 bg-gray-200 rounded-xl"></div>
                <div className="lg:col-span-2 h-48 sm:h-64 bg-gray-200 rounded-xl"></div>
              </div>
              
              {/* Additional cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 sm:h-40 bg-gray-200 rounded-xl"></div>
                ))}
              </div>
            </div>
          </div>
        );
        
      case 'list':
        return (
          <div className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="w-20 h-6 bg-gray-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        );
        
      case 'card':
        return (
          <div className="space-y-4">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="animate-pulse border border-gray-200 rounded-xl p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                    <div className="h-5 bg-gray-200 rounded w-16"></div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
        
      case 'chart':
        return (
          <div className="animate-pulse">
            <div className="h-48 bg-gray-200 rounded-lg"></div>
            <div className="mt-4 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-1/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className={className}>
      {renderSkeleton()}
    </div>
  );
});

export default LoadingSkeleton;
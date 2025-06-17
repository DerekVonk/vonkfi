import { Link, useLocation } from "wouter";
import { Flame, TrendingUp, Upload, University, Tags, ArrowLeftRight, Target, Bitcoin, User } from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: TrendingUp },
  { name: "Import Statements", href: "/import", icon: Upload },
  { name: "Accounts", href: "/accounts", icon: University },
  { name: "Categories", href: "/categories", icon: Tags },
  { name: "Transfer Instructions", href: "/transfers", icon: ArrowLeftRight },
  { name: "Goals", href: "/goals", icon: Target },
  { name: "Crypto Portfolio", href: "/crypto", icon: Bitcoin },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <div className="min-h-screen flex bg-neutral-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-sm border-r border-neutral-200 flex flex-col">
        <div className="p-6 border-b border-neutral-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Flame className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-neutral-800">FIRE Budget</h1>
              <p className="text-xs text-neutral-400">Financial Independence</p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-6">
          <ul className="space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.name}>
                  <Link href={item.href}>
                    <div
                      className={`fire-sidebar-item ${
                        isActive(item.href)
                          ? "fire-sidebar-item-active"
                          : "fire-sidebar-item-inactive"
                      }`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                      {item.name}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        
        <div className="p-4 border-t border-neutral-200">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <User className="text-white" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800 truncate">Demo User</p>
              <p className="text-xs text-neutral-400">Premium User</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

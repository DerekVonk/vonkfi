import { Settings, Shield, Target, TrendingUp, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function TransferPreferences() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-800">Transfer Settings</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Configure where your budget allocations are transferred
            </p>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Shield className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">Smart</p>
                <p className="text-sm text-neutral-400">Buffer Rules</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Target className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">Goal</p>
                <p className="text-sm text-neutral-400">Targeting</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-purple-600" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-800">Auto</p>
                <p className="text-sm text-neutral-400">Investment</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Current Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Current Transfer Configuration</span>
              <Badge className="bg-green-100 text-green-800">Active</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 border border-neutral-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Shield size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-800">Emergency Buffer</p>
                    <p className="text-xs text-neutral-400">
                      Automatically transfers to emergency/savings accounts or creates new emergency fund recommendations
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-neutral-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Target size={20} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-800">Goal Allocations</p>
                    <p className="text-xs text-neutral-400">
                      Transfers to linked accounts for each active goal you've set up
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-neutral-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <TrendingUp size={20} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-800">Investment Allocations</p>
                    <p className="text-xs text-neutral-400">
                      Routes excess funds to investment accounts based on intelligent priority system
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuration Details */}
        <Card>
          <CardHeader>
            <CardTitle>How Transfer Destinations Work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Info className="text-blue-500 mt-1" size={16} />
                <div>
                  <p className="text-sm font-medium text-neutral-800">Priority-Based System</p>
                  <p className="text-xs text-neutral-400">
                    The system uses a configurable priority hierarchy to determine where budget allocations go
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Info className="text-blue-500 mt-1" size={16} />
                <div>
                  <p className="text-sm font-medium text-neutral-800">Smart Fallbacks</p>
                  <p className="text-xs text-neutral-400">
                    If preferred accounts don't exist, the system automatically finds suitable alternatives
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Info className="text-blue-500 mt-1" size={16} />
                <div>
                  <p className="text-sm font-medium text-neutral-800">Account Role Matching</p>
                  <p className="text-xs text-neutral-400">
                    Matches accounts by role (emergency, savings, investment) or specific account IDs
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import { Account, Goal, TransferPreference } from '@shared/schema';

export interface DestinationResolution {
  accountId: number;
  purpose: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'preference' | 'fallback' | 'auto';
}

export class TransferDestinationService {
  /**
   * Resolves the best destination account for a given allocation type
   */
  resolveDestination(
    allocationType: 'buffer' | 'goal' | 'investment' | 'emergency',
    accounts: Account[],
    goals: Goal[],
    preferences: TransferPreference[],
    goalId?: number
  ): DestinationResolution | null {
    
    // For goal allocations, use the linked account directly
    if (allocationType === 'goal' && goalId) {
      const goal = goals.find(g => g.id === goalId);
      if (goal && goal.linkedAccountId) {
        return {
          accountId: goal.linkedAccountId,
          purpose: `Transfer to ${goal.name}`,
          confidence: 'high',
          source: 'auto'
        };
      }
    }

    // Check user preferences first
    const typePreferences = preferences
      .filter(p => p.preferenceType === allocationType && p.isActive)
      .sort((a, b) => a.priority - b.priority);

    for (const pref of typePreferences) {
      const resolved = this.resolveFromPreference(pref, accounts, goals);
      if (resolved) {
        return {
          ...resolved,
          source: 'preference',
          confidence: 'high'
        };
      }
    }

    // Fallback to default logic based on allocation type
    return this.getDefaultDestination(allocationType, accounts, goals);
  }

  /**
   * Resolves destination from a specific user preference
   */
  private resolveFromPreference(
    preference: TransferPreference,
    accounts: Account[],
    goals: Goal[]
  ): { accountId: number; purpose: string } | null {
    
    // Direct account preference
    if (preference.accountId) {
      const account = accounts.find(a => a.id === preference.accountId);
      if (account) {
        return {
          accountId: account.id,
          purpose: `Transfer to ${account.customName || account.iban} (user preference)`
        };
      }
    }

    // Account role preference
    if (preference.accountRole) {
      const account = accounts.find(a => a.role === preference.accountRole);
      if (account) {
        return {
          accountId: account.id,
          purpose: `Transfer to ${account.customName || account.iban} (${preference.accountRole} account)`
        };
      }
    }

    // Goal pattern preference
    if (preference.goalPattern) {
      try {
        const regex = new RegExp(preference.goalPattern, 'i');
        const matchingGoal = goals.find(g => 
          regex.test(g.name) && g.linkedAccountId
        );
        if (matchingGoal) {
          return {
            accountId: matchingGoal.linkedAccountId!,
            purpose: `Transfer to ${matchingGoal.name} (pattern match)`
          };
        }
      } catch (error) {
        console.warn(`Invalid regex pattern in preference: ${preference.goalPattern}`);
      }
    }

    return null;
  }

  /**
   * Provides default destination logic when no preferences are configured
   */
  private getDefaultDestination(
    allocationType: string,
    accounts: Account[],
    goals: Goal[]
  ): DestinationResolution | null {
    
    switch (allocationType) {
      case 'buffer':
      case 'emergency':
        return this.getBufferDestination(accounts, goals);
      
      case 'investment':
        return this.getInvestmentDestination(accounts);
      
      default:
        return this.getGeneralSavingsDestination(accounts);
    }
  }

  private getBufferDestination(accounts: Account[], goals: Goal[]): DestinationResolution | null {
    // Priority: emergency > savings > goal-specific > spending
    const emergencyAccount = accounts.find(a => a.role === 'emergency');
    if (emergencyAccount) {
      return {
        accountId: emergencyAccount.id,
        purpose: "Emergency buffer maintenance",
        confidence: 'high',
        source: 'fallback'
      };
    }

    const savingsAccount = accounts.find(a => a.role === 'savings');
    if (savingsAccount) {
      return {
        accountId: savingsAccount.id,
        purpose: "Transfer to savings account for emergency buffer",
        confidence: 'medium',
        source: 'fallback'
      };
    }

    const goalSpecificAccount = accounts.find(a => a.role === 'goal-specific');
    if (goalSpecificAccount) {
      return {
        accountId: goalSpecificAccount.id,
        purpose: "Transfer to goal account for emergency buffer",
        confidence: 'medium',
        source: 'fallback'
      };
    }

    // Check for emergency goal with linked account
    const emergencyGoal = goals.find(g => 
      g.name.toLowerCase().includes('emergency') && g.linkedAccountId
    );
    if (emergencyGoal) {
      return {
        accountId: emergencyGoal.linkedAccountId!,
        purpose: `Transfer to ${emergencyGoal.name}`,
        confidence: 'medium',
        source: 'fallback'
      };
    }

    return null;
  }

  private getInvestmentDestination(accounts: Account[]): DestinationResolution | null {
    const investmentAccount = accounts.find(a => 
      a.role === 'investment' || 
      a.customName?.toLowerCase().includes('investment') ||
      a.customName?.toLowerCase().includes('broker')
    );
    
    if (investmentAccount) {
      return {
        accountId: investmentAccount.id,
        purpose: "Investment contribution",
        confidence: 'high',
        source: 'fallback'
      };
    }

    // Fallback to savings
    const savingsAccount = accounts.find(a => a.role === 'savings');
    if (savingsAccount) {
      return {
        accountId: savingsAccount.id,
        purpose: "Transfer to savings (no investment account configured)",
        confidence: 'low',
        source: 'fallback'
      };
    }

    return null;
  }

  private getGeneralSavingsDestination(accounts: Account[]): DestinationResolution | null {
    const savingsAccount = accounts.find(a => a.role === 'savings');
    if (savingsAccount) {
      return {
        accountId: savingsAccount.id,
        purpose: "Transfer to savings account",
        confidence: 'medium',
        source: 'fallback'
      };
    }

    return null;
  }

  /**
   * Creates default transfer preferences for a new user
   */
  createDefaultPreferences(userId: number) {
    return [
      // Buffer allocation preferences
      {
        userId,
        preferenceType: 'buffer',
        priority: 1,
        accountRole: 'emergency',
        accountId: null,
        goalPattern: null,
        isActive: true
      },
      {
        userId,
        preferenceType: 'buffer',
        priority: 2,
        accountRole: 'savings',
        accountId: null,
        goalPattern: null,
        isActive: true
      },
      {
        userId,
        preferenceType: 'buffer',
        priority: 3,
        accountRole: null,
        accountId: null,
        goalPattern: 'emergency',
        isActive: true
      },
      
      // Investment allocation preferences
      {
        userId,
        preferenceType: 'investment',
        priority: 1,
        accountRole: 'investment',
        accountId: null,
        goalPattern: null,
        isActive: true
      },
      {
        userId,
        preferenceType: 'investment',
        priority: 2,
        accountRole: 'savings',
        accountId: null,
        goalPattern: null,
        isActive: true
      }
    ];
  }
}
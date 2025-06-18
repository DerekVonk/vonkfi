import { db } from "./db";
import { users, categories } from "@shared/schema";

export async function seedDatabase() {
  try {
    // Create default user
    const [user] = await db.insert(users).values({
      username: "demo",
      email: "demo@fire-budget.com"
    }).returning();

    console.log("Created demo user:", user);

    // Create default categories
    const defaultCategories = [
      { name: "Salary", type: "income", color: "#22c55e", icon: "💰", isSystemCategory: true },
      { name: "Freelance", type: "income", color: "#10b981", icon: "💼", isSystemCategory: true },
      { name: "Investment Income", type: "income", color: "#06b6d4", icon: "📈", isSystemCategory: true },
      
      { name: "Housing", type: "expense", color: "#ef4444", icon: "🏠", isSystemCategory: true },
      { name: "Food & Dining", type: "expense", color: "#f97316", icon: "🍽️", isSystemCategory: true },
      { name: "Transportation", type: "expense", color: "#eab308", icon: "🚗", isSystemCategory: true },
      { name: "Utilities", type: "expense", color: "#8b5cf6", icon: "⚡", isSystemCategory: true },
      { name: "Healthcare", type: "expense", color: "#ec4899", icon: "🏥", isSystemCategory: true },
      { name: "Entertainment", type: "expense", color: "#06b6d4", icon: "🎭", isSystemCategory: true },
      { name: "Shopping", type: "expense", color: "#f59e0b", icon: "🛍️", isSystemCategory: true },
      { name: "Insurance", type: "expense", color: "#6366f1", icon: "🛡️", isSystemCategory: true },
      { name: "Investments", type: "expense", color: "#059669", icon: "💎", isSystemCategory: true },
      { name: "Emergency Fund", type: "expense", color: "#dc2626", icon: "🚨", isSystemCategory: true },
    ];

    const insertedCategories = await db.insert(categories).values(defaultCategories).returning();
    console.log(`Created ${insertedCategories.length} default categories`);

    return { user, categories: insertedCategories };
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

// Run seed if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log("Database seeded successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed to seed database:", error);
      process.exit(1);
    });
}
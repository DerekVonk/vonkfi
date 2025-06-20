# FIRE Budget Application - Personal Finance Management System

## Overview

This is a comprehensive personal finance management application focused on the FIRE (Financial Independence, Retire Early) methodology. The system helps users track accounts, categorize transactions, set financial goals, and receive intelligent transfer recommendations to optimize their financial journey toward independence.

The application is built as a full-stack web application with a React frontend and Express.js backend, using PostgreSQL for data persistence and featuring automated CAMT.053 bank statement processing.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for client-side routing
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite for development and production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ESM modules
- **Database**: PostgreSQL with Drizzle ORM
- **File Processing**: XML parsing for CAMT.053 bank statements
- **Session Management**: Express sessions with PostgreSQL storage

### Key Design Decisions
- **Monorepo Structure**: Client and server code in single repository with shared schema
- **Type Safety**: Full TypeScript coverage from database to frontend
- **Real-time Updates**: Optimistic updates with query invalidation
- **Mobile Responsive**: Tailwind-based responsive design

## Key Components

### Database Layer (Drizzle ORM)
- **Users**: Authentication and user management
- **Accounts**: Bank account tracking with IBAN/BIC support
- **Transactions**: Financial transaction records with categorization
- **Categories**: Hierarchical expense/income categorization system
- **Goals**: Financial targets with progress tracking
- **Transfer Recommendations**: AI-generated optimization suggestions

### Business Logic Services
- **CAMT Parser**: Processes standard European bank statement format
- **Transaction Categorizer**: Machine learning-based expense categorization
- **FIRE Calculator**: Calculates savings rates, volatility, and FIRE progress
- **Transfer Optimizer**: Generates intelligent money movement recommendations

### Frontend Components
- **Dashboard**: Overview of financial status and FIRE progress
- **Account Management**: Bank account configuration and monitoring
- **Transaction Processing**: Import and categorization workflows
- **Goal Tracking**: Financial objective setting and progress visualization
- **Transfer Instructions**: Automated optimization recommendations

## Data Flow

1. **Statement Import**: Users upload CAMT.053 XML files
2. **Data Parsing**: System extracts account and transaction information
3. **Account Discovery**: New accounts are automatically detected and created
4. **Transaction Categorization**: ML algorithms suggest expense categories
5. **FIRE Calculations**: System computes savings rates and financial metrics
6. **Transfer Optimization**: Algorithm generates money movement recommendations
7. **User Review**: Users can accept, modify, or reject automated suggestions

## External Dependencies

### Core Infrastructure
- **@neondatabase/serverless**: PostgreSQL database connectivity
- **drizzle-orm**: Type-safe database operations
- **express**: Web server framework
- **react**: Frontend user interface library

### Financial Processing
- **xml2js**: CAMT.053 statement parsing
- **multer**: File upload handling
- **date-fns**: Date manipulation for financial calculations

### UI/UX Libraries
- **@radix-ui**: Accessible component primitives
- **tailwindcss**: Utility-first CSS framework
- **@tanstack/react-query**: Server state management
- **react-hook-form**: Form validation and handling

## Deployment Strategy

### Development Environment
- **Runtime**: Node.js 20 with Replit hosting
- **Database**: PostgreSQL 16 managed instance
- **Development Server**: Vite dev server with HMR
- **Process Management**: tsx for TypeScript execution

### Production Build
- **Frontend**: Vite production build to static assets
- **Backend**: esbuild bundling with ESM output
- **Database**: Drizzle migrations for schema management
- **Deployment**: Replit autoscale deployment target

### Configuration Management
- **Environment Variables**: DATABASE_URL for database connection
- **Build Scripts**: Separate development and production workflows
- **Asset Management**: Public asset serving with Express static middleware

## Recent Changes

- June 19, 2025: AI-Enhanced Vaste Lasten Optimization System + Monthly Overview Transaction Allocation Fix
  - **FIXED**: Monthly Overview transaction allocation bug - removed hardcoded January 2025 logic that caused transactions imported in June to appear in both January and June
  - **IMPLEMENTED**: Comprehensive AI-Enhanced Fixed Expense Analysis System
    - FixedExpenseAnalyzer service with ML-based pattern recognition for recurring expenses
    - Predictive modeling for monthly "Vaste Lasten" requirements with seasonal adjustments
    - Anomaly detection for expense variations and new fixed expenses
    - Confidence scoring system for expense pattern reliability
  - **CREATED**: IntelligentTransferOptimizer with AI-driven transfer recommendations
    - Priority-based allocation system for "Vaste Lasten" account funding
    - Buffer optimization calculations with risk reduction analysis
    - Goal-aware transfer recommendations with progress tracking
    - Liquidity management across checking and savings accounts
  - **ADDED**: Six new AI API endpoints for financial intelligence
    - /api/ai/fixed-expenses/:userId - Analyze fixed expense patterns
    - /api/ai/vaste-lasten-prediction/:userId - Predict monthly requirements
    - /api/ai/expense-anomalies/:userId - Detect expense anomalies
    - /api/ai/intelligent-transfers/:userId - Generate smart transfer recommendations
    - /api/ai/cashflow-optimization/:userId - Optimize account liquidity
    - /api/ai/execute-transfer/:userId - Create AI-recommended transfers
  - **ENHANCED**: Import History page with datetime grouping, drill-down functionality, and pagination (10 sessions per page)
  - **CREATED**: VasteLastenAI component with tabbed interface for expense patterns, predictions, recommendations, and anomaly detection
  - AI system provides seasonal expense adjustments, transfer timing optimization, and confidence-based recommendation scoring
  - Transfer recommendations generation + Advanced Import System
  - Enhanced transfer generation to recognize goal-specific savings accounts as valid buffer destinations
  - Created comprehensive verification tests confirming transfer recommendation functionality
  - System now generates meaningful €2133.38 buffer transfer recommendations for current user data
  - Advanced Import System with Batch Processing and Duplicate Detection
  - Enhanced database schema with import batches, transaction hashes, and duplicate tracking tables
  - Implemented SHA-256 hash-based duplicate detection for transaction deduplication
  - Created comprehensive DuplicateDetectionService with transaction filtering capabilities
  - Added batch import functionality with drill-down capabilities for individual file inspection
  - Enhanced import routes with automatic duplicate detection and prevention
  - Implemented batch management API routes for creating, viewing, and updating import batches
  - Added comprehensive test suite covering duplicate detection, batch processing, and error handling
  - Updated Import History page to display duplicate statistics and batch information
  - Fixed category editing and deletion functionality with proper API routes and UI dialogs
  - Removed redundant import history from Import Statements page, creating dedicated Import History page
  - Implemented complete CRUD operations for categories with proper error handling
  - Enhanced storage interface with batch processing and duplicate detection methods

- June 18, 2025: PostgreSQL database integration and comprehensive functionality enhancement
  - Replaced in-memory storage with persistent PostgreSQL database
  - Added DatabaseStorage implementation with full CRUD operations
  - Database schema pushed successfully with all tables created
  - Essential categories seeded (income, expenses, investments)
  - Demo user created for testing
  - Fixed file upload functionality - resolved FormData handling in API client
  - CAMT.053 XML import now working correctly with database persistence
  - Fixed goal creation timestamp issue by changing database schema to text field
  - Implemented selective data clearing that preserves user configurations
  - Added comprehensive testing framework with Vitest, Testing Library, and Supertest
  - Created unit and integration tests for goal creation and API endpoints
  - Implemented goal editing functionality with account linking and balance synchronization
  - Added automatic dashboard recalculation after data clearing
  - Created comprehensive CAMT.053 import accuracy tests with expected transaction validation
  - Implemented business logic tests for goal management, account linking, and data integrity
  - Added comprehensive account balance tracking with database schema updates
  - Enhanced UI mobile responsiveness across all components with proper text truncation
  - Fixed text overflow issues in overview cards and improved mobile adaptability
  - Implemented responsive design patterns with proper spacing and grid layouts

## Changelog

Changelog:
- June 17, 2025. Initial setup
- June 18, 2025. PostgreSQL database integration and file upload fixes

## User Preferences

Preferred communication style: Simple, everyday language.
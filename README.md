# Texora - Smart Textile Manufacturing Management System

**Tagline:** "From Yarn to Delivery, All in One."

Texora is a textile factory management application designed to simplify factory operations, reduce manual work, and help manage textile production and subcontract stitching.

## Project Overview (Phase 1)
This repository contains the foundation for Phase 1 of Texora, which establishes the UI framework, design system (Texora Mint Industrial Pro), and authentication integration.

### Technology Stack
- **Framework:** React + TypeScript + Vite
- **Styling:** Tailwind CSS (v4)
- **Routing:** React Router
- **Forms & Validation:** React Hook Form + Zod
- **Icons:** Lucide React
- **Authentication/Backend:** Supabase

## Setup Instructions

### Prerequisites
- Node.js (v20+ recommended)
- npm or yarn

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Environment Configuration
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Update the `.env` file with your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   *Note: Never commit your `.env` file or actual credentials to source control.*

### Development
Start the local development server:
```bash
npm run dev
```

### Production Build
Create a production build:
```bash
npm run build
```

## Available Routes
- `/` - Welcome Page
- `/login/export` - Export Portal Login
- `/login/domestic` - Domestic Portal Login
- `/forgot-password` - Password Recovery
- `/:portal/dashboard` - Dashboard Placeholders
- `*` - 404 / Placeholder Routes

## Phase 1 Limitations
- No actual business logic (Inventory, Production, Invoicing) is implemented yet.
- Frontend role guards (`ProtectedRoute.tsx`) only check for session existence currently. True authorization and Role-Level Security (RLS) policies will be enforced in Phase 2.
- The AI chatbot is a placeholder.

## Safe Test-Account Setup
1. Configure your Supabase project with Email/Password auth enabled.
2. Create test users directly in the Supabase Authentication dashboard.
3. Login using those credentials in the application.

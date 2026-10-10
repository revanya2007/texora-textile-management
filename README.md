# Texora - Smart Textile Manufacturing Management System

**Tagline:** "From Yarn to Delivery, All in One."

[![Live Demo](https://img.shields.io/badge/Live_Deployment-texora--rho.vercel.app-26965D?style=for-the-badge&logo=vercel)](https://texora-rho.vercel.app)
[![Supabase](https://img.shields.io/badge/Backend-Supabase_PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com)
[![React](https://img.shields.io/badge/Frontend-React_+_TypeScript_+_Vite-61DAFB?style=for-the-badge&logo=react)](https://react.dev)

---

### 🌐 Live Production Application
👉 **[https://texora-rho.vercel.app](https://texora-rho.vercel.app)**

---

## Project Overview
Texora is an enterprise-grade textile factory management system designed to streamline spinning, weaving, dyeing, export operations, worker attendance, and domestic subcontract garmenting.

### 🚀 Key Features & Modules
1. **Export Operations**: Yarn inventory, export orders, suppliers, buyers, dispatch, invoices, and accounting.
2. **AI Production Time Prediction & Live Progress Tracking**: Duration range prediction for Spinning, Weaving, and Dyeing stages, milestone progress markers (0%-100%), and machine performance metrics.
3. **Worker & Wage Management**: Attendance logging, overtime, piece-rate and daily wage calculation, worker profiles.
4. **Domestic Subcontract Management**: Company profiles, work orders, piece tracking, deliveries, and payment tracking.
5. **Role-Based Access Control**: Dual-portal architecture with Row-Level Security (RLS) policies for Export, Domestic, and Admin roles.
6. **Authentication**: Supabase Auth with Email/Password and one-click Google OAuth authentication with onboarding role selection.

### Technology Stack
- **Framework:** React + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Routing:** React Router
- **Charts:** Recharts
- **Forms & Validation:** React Hook Form + Zod
- **Icons:** Lucide React
- **Backend & Database:** Supabase PostgreSQL + Auth + Row Level Security (RLS)
- **Deployment:** Vercel (SPA Rewrites)

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

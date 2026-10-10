import { useEffect } from 'react';
import { Globe, House } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function WelcomePage() {
  const navigate = useNavigate();
  const { session, isLoading, hasAccessToPortal } = useAuth();

  // If user is already authenticated, redirect them directly to their active portal
  useEffect(() => {
    if (!isLoading && session) {
      if (hasAccessToPortal('export')) {
        navigate('/export/dashboard', { replace: true });
      } else if (hasAccessToPortal('domestic')) {
        navigate('/domestic/dashboard', { replace: true });
      }
    }
  }, [isLoading, session, hasAccessToPortal, navigate]);

  return (
    <main className="relative w-full h-screen min-h-[640px] bg-[#F7FAF6] flex flex-col justify-between overflow-hidden select-none">
      {/* ========================================================================= */}
      {/* 1. AMBIENT BACKGROUND DECORATIVE SHAPES                                   */}
      {/* ========================================================================= */}
      {/* Top-Left soft mint ambient circle */}
      <div 
        className="absolute -top-36 -left-36 w-[480px] h-[480px] rounded-full bg-[#EAF5E9] opacity-75 pointer-events-none blur-2xl z-0" 
        aria-hidden="true" 
      />
      {/* Top-Right faint mint circle */}
      <div 
        className="absolute top-8 right-1/4 w-[280px] h-[280px] rounded-full bg-[#EAF5E9] opacity-50 pointer-events-none blur-3xl z-0" 
        aria-hidden="true" 
      />
      {/* Center-Left subtle atmospheric circle */}
      <div 
        className="absolute top-1/3 -left-12 w-[320px] h-[320px] rounded-full bg-[#E5F2E5] opacity-40 pointer-events-none blur-3xl z-0" 
        aria-hidden="true" 
      />
      {/* Center-Right subtle atmospheric circle */}
      <div 
        className="absolute top-1/2 -right-16 w-[360px] h-[360px] rounded-full bg-[#EAF5E9] opacity-45 pointer-events-none blur-3xl z-0" 
        aria-hidden="true" 
      />

      {/* ========================================================================= */}
      {/* 2. TOP SPACER                                                             */}
      {/* ========================================================================= */}
      <div className="w-full pt-6 sm:pt-8 z-10" aria-hidden="true" />

      {/* ========================================================================= */}
      {/* 3. CENTERED HERO CONTENT (Heading + Logo Medallion + Portal Buttons)      */}
      {/* ========================================================================= */}
      <section className="flex-1 flex flex-col items-center justify-center -mt-4 sm:-mt-6 z-20 px-4">
        {/* Welcome Heading */}
        <div className="text-center mb-5 sm:mb-6">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[44px] font-bold text-[#172B3F] tracking-tight">
            Welcome to
          </h1>
          <p className="text-5xl sm:text-6xl md:text-7xl lg:text-[68px] font-extrabold text-[#26965D] tracking-tight leading-none mt-1 sm:mt-1.5">
            Texora
          </p>
        </div>

        {/* Circular Texora Logo Medallion */}
        <div className="relative group">
          {/* Subtle outer halo ring */}
          <div 
            className="absolute -inset-3 rounded-full bg-[#EAF5E9] opacity-70 blur-md group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" 
            aria-hidden="true" 
          />
          
          {/* Main Circular Medallion */}
          <div className="relative w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 lg:w-80 lg:h-80 rounded-full bg-white border-2 sm:border-[3px] border-[#D6EADB] shadow-[0_12px_40px_rgba(38,150,93,0.12)] p-4 sm:p-5 flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02]">
            <img
              src="/texora-logo-full.jpg"
              alt="Texora - From Yarn to Delivery, All in One."
              className="w-full h-full object-contain rounded-full"
              loading="eager"
            />
          </div>
        </div>

        {/* Navigation Buttons Placed Directly Below Center Logo */}
        <nav aria-label="Portal selection" className="mt-6 sm:mt-8 flex items-center justify-center gap-3 sm:gap-4 z-30">
          {/* Export Portal Button (Green-filled pill with globe icon) */}
          <button
            type="button"
            id="export-portal-btn"
            onClick={() => navigate('/login/export')}
            className="group flex items-center gap-2 sm:gap-2.5 px-6 sm:px-7 py-2.5 sm:py-3 rounded-full bg-[#26965D] hover:bg-[#208250] text-white font-medium text-sm sm:text-base shadow-sm hover:shadow-md transition-all duration-200 transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#26965D] focus:ring-offset-2 cursor-pointer"
          >
            <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-white shrink-0 group-hover:rotate-12 transition-transform duration-300" aria-hidden="true" />
            <span>Export</span>
          </button>

          {/* Domestic Portal Button (White/pale pill with green border & house icon) */}
          <button
            type="button"
            id="domestic-portal-btn"
            onClick={() => navigate('/login/domestic')}
            className="group flex items-center gap-2 sm:gap-2.5 px-6 sm:px-7 py-2.5 sm:py-3 rounded-full bg-white hover:bg-[#F3F9F4] text-[#26965D] font-medium text-sm sm:text-base border border-[#26965D]/35 shadow-sm hover:shadow-md transition-all duration-200 transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#26965D] focus:ring-offset-2 cursor-pointer"
          >
            <House className="w-4 h-4 sm:w-5 sm:h-5 text-[#26965D] shrink-0 group-hover:-translate-y-0.5 transition-transform duration-300" aria-hidden="true" />
            <span>Domestic</span>
          </button>
        </nav>
      </section>

      {/* ========================================================================= */}
      {/* 4. TEXTILE INDUSTRIAL ILLUSTRATIONS (Framing the lower left & right)     */}
      {/* ========================================================================= */}
      {/* Lower-Left: Textile loom machinery, yarn cones & botanical leaves */}
      <div 
        className="absolute bottom-0 left-0 w-[42vw] max-w-[460px] min-w-[240px] pointer-events-none z-10 select-none"
        aria-hidden="true"
      >
        <img
          src="/textile-left.png"
          alt=""
          className="w-full h-auto object-contain object-left-bottom opacity-90 transition-opacity duration-300"
        />
      </div>

      {/* Lower-Right: Textile machinery, fabric rolls & botanical leaves */}
      <div 
        className="absolute bottom-0 right-0 w-[42vw] max-w-[460px] min-w-[240px] pointer-events-none z-10 select-none"
        aria-hidden="true"
      >
        <img
          src="/textile-right.png"
          alt=""
          className="w-full h-auto object-contain object-right-bottom opacity-90 transition-opacity duration-300"
        />
      </div>

      {/* Bottom spacer for viewport balance */}
      <footer className="w-full h-4 sm:h-6 pointer-events-none z-0" aria-hidden="true" />
    </main>
  );
}

import { useState, useEffect } from 'react';
import { Globe2, House, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function WelcomePage() {
  const [selectedPortal, setSelectedPortal] = useState<'export' | 'domestic' | null>(null);
  const navigate = useNavigate();
  const { session, isLoading, hasAccessToPortal } = useAuth();

  // Skip welcome & portal selection if user is already authenticated
  useEffect(() => {
    if (!isLoading && session) {
      if (hasAccessToPortal('export')) {
        navigate('/export/dashboard', { replace: true });
      } else if (hasAccessToPortal('domestic')) {
        navigate('/domestic/dashboard', { replace: true });
      }
    }
  }, [isLoading, session, hasAccessToPortal, navigate]);

  const handleContinue = () => {
    if (selectedPortal === 'export') {
      navigate('/login/export');
    } else if (selectedPortal === 'domestic') {
      navigate('/login/domestic');
    }
  };

  return (
    <div className="min-h-screen bg-soft-mint flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-5%] w-72 h-72 bg-light-mint rounded-full opacity-60 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-96 h-96 bg-primary opacity-10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-2xl flex flex-col items-center z-10 my-auto">
        
        {/* Central Brand Header */}
        <div className="text-center flex flex-col items-center mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold text-navy mb-1">Welcome to</h1>
          <h2 className="text-5xl md:text-6xl font-bold text-primary tracking-tight">Texora</h2>
        </div>

        {/* Central Logo Badge */}
        <div className="w-36 h-36 md:w-44 md:h-44 bg-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(205,232,208,0.8)] border-4 border-light-mint mb-6 p-6 transition-transform hover:scale-105 duration-300">
          <div className="text-navy text-center select-none">
            <span className="text-5xl md:text-6xl font-serif font-bold italic tracking-tighter">T</span>
            <span className="text-gold text-4xl md:text-5xl font-serif font-bold italic -ml-3">X</span>
            <div className="text-[10px] md:text-xs uppercase tracking-widest font-semibold mt-1 text-secondary-text">Texora</div>
          </div>
        </div>

        {/* Tagline */}
        <p className="text-lg md:text-xl text-secondary-text text-center mb-6 max-w-md">
          From Yarn to Delivery, <span className="text-primary font-medium">All in One.</span>
        </p>

        {/* Centered Portal Selection Controls */}
        <div className="flex flex-col items-center mb-8 w-full">
          <span className="text-xs uppercase tracking-widest font-semibold text-secondary-text mb-3">
            Select Your Portal
          </span>
          
          <div className="flex items-center gap-3 p-1.5 bg-white/90 backdrop-blur-md rounded-full border border-light-mint shadow-sm">
            <button
              type="button"
              onClick={() => setSelectedPortal('export')}
              className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full font-medium text-sm md:text-base transition-all duration-300 ${
                selectedPortal === 'export'
                  ? 'bg-primary text-white shadow-md scale-105'
                  : 'text-primary hover:bg-soft-mint/70'
              }`}
            >
              <Globe2 size={19} />
              Export
            </button>
            
            <button
              type="button"
              onClick={() => setSelectedPortal('domestic')}
              className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full font-medium text-sm md:text-base transition-all duration-300 ${
                selectedPortal === 'domestic'
                  ? 'bg-primary text-white shadow-md scale-105'
                  : 'text-primary hover:bg-soft-mint/70'
              }`}
            >
              <House size={19} />
              Domestic
            </button>
          </div>
        </div>

        {/* Decorative Divider */}
        <div className="w-24 h-1 bg-gradient-to-r from-transparent via-gold to-transparent opacity-40 mb-6"></div>

        {/* Centered Action Button */}
        <button
          onClick={handleContinue}
          disabled={!selectedPortal}
          className={`flex items-center justify-center gap-3 px-10 py-3.5 rounded-xl text-base md:text-lg font-semibold transition-all duration-300 shadow-lg ${
            selectedPortal 
              ? 'bg-primary text-white hover:bg-secondary hover:shadow-xl hover:-translate-y-0.5 cursor-pointer' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
          }`}
        >
          <span>Continue {selectedPortal ? `to ${selectedPortal === 'export' ? 'Export' : 'Domestic'}` : ''}</span>
          {selectedPortal && <ArrowRight size={18} />}
        </button>

      </div>
    </div>
  );
}

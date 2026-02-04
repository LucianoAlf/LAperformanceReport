import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { Tooltip } from '@/components/ui/Tooltip';

interface TourHelpButtonProps {
  tourName: string;
  className?: string;
}

export function TourHelpButton({ tourName, className = '' }: TourHelpButtonProps) {
  const { resetTour } = useOnboarding();

  const handleClick = () => {
    resetTour(tourName);
  };

  return (
    <Tooltip content="Ver tour desta página">
      <button
        onClick={handleClick}
        className={`fixed bottom-6 right-6 w-14 h-14 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full shadow-lg shadow-cyan-500/30 flex items-center justify-center transition-all hover:scale-110 z-40 border-2 border-cyan-400/50 ${className}`}
        aria-label="Ajuda - Ver tour desta página"
      >
        <HelpCircle className="w-7 h-7" />
      </button>
    </Tooltip>
  );
}

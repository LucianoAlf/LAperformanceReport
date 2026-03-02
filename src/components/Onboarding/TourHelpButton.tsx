import React from 'react';
import { HelpCircle } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useWidgetsHidden } from '@/contexts/WidgetVisibilityContext';
import { Tooltip } from '@/components/ui/Tooltip';

interface TourHelpButtonProps {
  tourName: string;
  className?: string;
}

export function TourHelpButton({ tourName, className = '' }: TourHelpButtonProps) {
  const { resetTour } = useOnboarding();
  const widgetsHidden = useWidgetsHidden();

  const handleClick = () => {
    resetTour(tourName);
  };

  return (
    <Tooltip content="Ver tour desta página">
      <button
        onClick={handleClick}
        className={`fixed bottom-6 right-6 w-14 h-14 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full shadow-lg shadow-cyan-500/30 flex items-center justify-center transition-all duration-300 ease-in-out hover:scale-110 z-40 border-2 border-cyan-400/50 ${widgetsHidden ? 'translate-y-24 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'} ${className}`}
        aria-label="Ajuda - Ver tour desta página"
      >
        <HelpCircle className="w-7 h-7" />
      </button>
    </Tooltip>
  );
}

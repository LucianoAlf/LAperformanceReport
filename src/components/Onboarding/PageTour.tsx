import React, { useEffect, useState, useMemo } from 'react';
import Joyride, { CallBackProps, STATUS, Step, ACTIONS, EVENTS } from 'react-joyride';
import { useOnboarding } from '@/contexts/OnboardingContext';

// Função para verificar se um elemento existe no DOM
const isTargetMounted = (target: string | HTMLElement): boolean => {
  if (typeof target === 'string') {
    return document.querySelector(target) !== null;
  }
  return document.body.contains(target);
};

interface PageTourProps {
  tourName: string;
  steps: Step[];
  onComplete?: () => void;
}

// Estilos customizados para o tema escuro do LA Report
const joyrideStyles = {
  options: {
    arrowColor: '#1e293b',
    backgroundColor: '#1e293b',
    overlayColor: 'rgba(0, 0, 0, 0.75)',
    primaryColor: '#06b6d4',
    spotlightShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
    textColor: '#f1f5f9',
    width: 380,
    zIndex: 10000,
  },
  buttonNext: {
    backgroundColor: '#06b6d4',
    borderRadius: '12px',
    color: '#fff',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 500,
  },
  buttonBack: {
    color: '#94a3b8',
    marginRight: 10,
    fontSize: '14px',
  },
  buttonSkip: {
    color: '#64748b',
    fontSize: '14px',
  },
  buttonClose: {
    color: '#94a3b8',
  },
  tooltip: {
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  },
  tooltipContainer: {
    textAlign: 'left' as const,
  },
  tooltipTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '8px',
    color: '#f1f5f9',
  },
  tooltipContent: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#cbd5e1',
  },
  spotlight: {
    borderRadius: '12px',
  },
  beacon: {
    display: 'none',
  },
  beaconInner: {
    backgroundColor: '#06b6d4',
  },
  beaconOuter: {
    backgroundColor: 'rgba(6, 182, 212, 0.3)',
  },
};

// Textos em português
const locale = {
  back: 'Voltar',
  close: 'Fechar',
  last: 'Finalizar',
  next: 'Próximo',
  open: 'Abrir',
  skip: 'Pular tour',
};

export function PageTour({ tourName, steps, onComplete }: PageTourProps) {
  const { 
    shouldShowTour, 
    markTourComplete, 
    runTour, 
    setRunTour,
    currentTour,
    setCurrentTour,
    clearResetTour,
    onboarding
  } = useOnboarding();
  
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [filteredSteps, setFilteredSteps] = useState<Step[]>([]);

  // Filtrar steps para incluir apenas elementos que existem no DOM
  const filterMountedSteps = () => {
    const mounted = steps.filter(step => isTargetMounted(step.target as string));
    setFilteredSteps(mounted);
    return mounted;
  };

  // Verificar se deve iniciar o tour automaticamente
  useEffect(() => {
    // Só inicia se o checklist estiver completo
    if (!onboarding?.checklist_completo) return;
    
    // Verificar se deve mostrar este tour
    if (shouldShowTour(tourName)) {
      // Pequeno delay para garantir que os elementos estejam renderizados
      const timer = setTimeout(() => {
        const mounted = filterMountedSteps();
        if (mounted.length > 0) {
          setRun(true);
          setCurrentTour(tourName);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [tourName, shouldShowTour, setCurrentTour, onboarding?.checklist_completo]);

  // Reagir ao reset do tour (botão ?)
  useEffect(() => {
    // Só inicia se runTour for true E o tour atual for este
    // E o tour não estiver já rodando
    if (runTour && currentTour === tourName && !run) {
      const mounted = filterMountedSteps();
      if (mounted.length > 0) {
        setStepIndex(0);
        setRun(true);
      }
    }
  }, [runTour, currentTour, tourName, run]);

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const { status, action, index, type, lifecycle } = data;

    // Log para debug
    console.log('[PageTour]', { status, action, index, type, lifecycle, tourName });

    // Se o target não foi encontrado, pular para o próximo
    if (type === EVENTS.TARGET_NOT_FOUND) {
      console.warn(`[PageTour] Target não encontrado no step ${index}, pulando...`);
      // Tentar ir para o próximo step
      if (index < filteredSteps.length - 1) {
        setStepIndex(index + 1);
      }
      return;
    }

    // Botão Fechar (X) foi clicado
    if (action === ACTIONS.CLOSE) {
      setRun(false);
      setRunTour(false);
      setCurrentTour(null);
      setStepIndex(0);
      clearResetTour(tourName);
      return;
    }

    // Atualizar índice do step após navegação
    if (type === EVENTS.STEP_AFTER) {
      if (action === ACTIONS.NEXT) {
        setStepIndex(index + 1);
      } else if (action === ACTIONS.PREV) {
        setStepIndex(index - 1);
      }
    }

    // Tour finalizado ou pulado
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
      setRunTour(false);
      setCurrentTour(null);
      setStepIndex(0);
      clearResetTour(tourName);
      
      // Marcar como completo apenas se finalizou (não pulou)
      if (status === STATUS.FINISHED) {
        await markTourComplete(tourName);
        onComplete?.();
      }
    }
  };

  // Não renderizar se não há steps filtrados ou não deve rodar
  if (!filteredSteps || filteredSteps.length === 0) return null;

  return (
    <Joyride
      steps={filteredSteps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      disableOverlayClose
      disableCloseOnEsc={false}
      spotlightClicks={false}
      scrollToFirstStep
      scrollOffset={100}
      callback={handleJoyrideCallback}
      styles={joyrideStyles}
      locale={locale}
      floaterProps={{
        disableAnimation: false,
      }}
    />
  );
}

// Exportar tipos para uso nos arquivos de tour
export type { Step };

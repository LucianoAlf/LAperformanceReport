import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

export interface OnboardingState {
  // Checklist inicial
  senha_alterada: boolean;
  foto_uploaded: boolean;
  perfil_completo: boolean;
  checklist_completo: boolean;
  
  // Tours por página
  tour_dashboard: boolean;
  tour_alunos: boolean;
  tour_comercial: boolean;
  tour_professores: boolean;
  tour_salas: boolean;
  tour_metas: boolean;
  tour_projetos: boolean;
  tour_administrativo: boolean;
  tour_config: boolean;
  
  // Metadados
  tours_completados: number;
}

interface OnboardingContextType {
  onboarding: OnboardingState | null;
  loading: boolean;
  showChecklist: boolean;
  setShowChecklist: (show: boolean) => void;
  
  // Ações do checklist
  markSenhaAlterada: () => Promise<void>;
  markFotoUploaded: () => Promise<void>;
  markPerfilCompleto: () => Promise<void>;
  completeChecklist: () => Promise<void>;
  
  // Ações dos tours
  markTourComplete: (tourName: string) => Promise<void>;
  shouldShowTour: (tourName: string) => boolean;
  resetTour: (tourName: string) => void;
  clearResetTour: (tourName: string) => void;
  
  // Estado local do tour atual
  currentTour: string | null;
  setCurrentTour: (tour: string | null) => void;
  runTour: boolean;
  setRunTour: (run: boolean) => void;
  
  // Refresh
  refreshOnboarding: () => Promise<void>;
}

const defaultOnboarding: OnboardingState = {
  senha_alterada: false,
  foto_uploaded: false,
  perfil_completo: false,
  checklist_completo: false,
  tour_dashboard: false,
  tour_alunos: false,
  tour_comercial: false,
  tour_professores: false,
  tour_salas: false,
  tour_metas: false,
  tour_projetos: false,
  tour_administrativo: false,
  tour_config: false,
  tours_completados: 0,
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChecklist, setShowChecklist] = useState(false);
  const [currentTour, setCurrentTour] = useState<string | null>(null);
  const [runTour, setRunTour] = useState(false);
  const [resetTours, setResetTours] = useState<Set<string>>(new Set());

  // Chave do localStorage para fallback
  const getStorageKey = (userId: number) => `onboarding_${userId}`;

  // Carregar do localStorage (fallback)
  const loadFromStorage = (userId: number): OnboardingState => {
    try {
      const stored = localStorage.getItem(getStorageKey(userId));
      if (stored) {
        return { ...defaultOnboarding, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Erro ao ler localStorage:', e);
    }
    return defaultOnboarding;
  };

  // Salvar no localStorage (fallback)
  const saveToStorage = (userId: number, data: OnboardingState) => {
    try {
      localStorage.setItem(getStorageKey(userId), JSON.stringify(data));
    } catch (e) {
      console.warn('Erro ao salvar localStorage:', e);
    }
  };

  // Carregar estado do onboarding
  const loadOnboarding = useCallback(async () => {
    if (!usuario?.id) {
      setOnboarding(null);
      setLoading(false);
      return;
    }

    try {
      // Buscar onboarding existente
      const { data, error } = await supabase
        .from('usuario_onboarding')
        .select('*')
        .eq('usuario_id', usuario.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // Não existe, criar novo registro
        const { data: newData, error: insertError } = await supabase
          .from('usuario_onboarding')
          .insert({ usuario_id: usuario.id })
          .select()
          .single();

        if (insertError) {
          console.error('Erro ao criar onboarding:', insertError);
          // Fallback para localStorage
          const storedData = loadFromStorage(usuario.id);
          setOnboarding(storedData);
          if (!storedData.checklist_completo) {
            setShowChecklist(true);
          }
        } else {
          setOnboarding(newData);
          saveToStorage(usuario.id, newData);
          // Primeiro acesso - mostrar checklist
          setShowChecklist(true);
        }
      } else if (error) {
        console.error('Erro ao carregar onboarding:', error);
        // Fallback para localStorage
        const storedData = loadFromStorage(usuario.id);
        setOnboarding(storedData);
        if (!storedData.checklist_completo) {
          setShowChecklist(true);
        }
      } else {
        setOnboarding(data);
        saveToStorage(usuario.id, data);
        // Mostrar checklist se não estiver completo
        if (!data.checklist_completo) {
          setShowChecklist(true);
        }
      }
    } catch (err) {
      console.error('Erro no onboarding:', err);
      // Fallback para localStorage
      const storedData = loadFromStorage(usuario.id);
      setOnboarding(storedData);
      if (!storedData.checklist_completo) {
        setShowChecklist(true);
      }
    } finally {
      setLoading(false);
    }
  }, [usuario?.id]);

  useEffect(() => {
    loadOnboarding();
  }, [loadOnboarding]);

  // Atualizar campo no banco
  const updateField = async (field: string, value: boolean | number) => {
    if (!usuario?.id) return;

    // Atualizar estado local primeiro
    const newState = onboarding ? { ...onboarding, [field]: value } : { ...defaultOnboarding, [field]: value };
    setOnboarding(newState);
    saveToStorage(usuario.id, newState);

    try {
      const { error } = await supabase
        .from('usuario_onboarding')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('usuario_id', usuario.id);

      if (error) {
        console.warn(`Erro ao atualizar ${field} no banco (usando localStorage):`, error);
      }
    } catch (err) {
      console.warn(`Erro ao atualizar ${field}:`, err);
    }
  };

  // Ações do checklist
  const markSenhaAlterada = async () => {
    await updateField('senha_alterada', true);
  };

  const markFotoUploaded = async () => {
    await updateField('foto_uploaded', true);
  };

  const markPerfilCompleto = async () => {
    await updateField('perfil_completo', true);
  };

  const completeChecklist = async () => {
    await updateField('checklist_completo', true);
    setShowChecklist(false);
  };

  // Ações dos tours
  const markTourComplete = async (tourName: string) => {
    const fieldName = `tour_${tourName}`;
    await updateField(fieldName, true);
    
    // Incrementar contador
    if (onboarding) {
      await updateField('tours_completados', onboarding.tours_completados + 1);
    }
    
    // Atualizar último tour
    if (usuario?.id) {
      await supabase
        .from('usuario_onboarding')
        .update({ ultimo_tour_em: new Date().toISOString() })
        .eq('usuario_id', usuario.id);
    }
  };

  const shouldShowTour = (tourName: string): boolean => {
    if (!onboarding) return false;
    
    // Se o tour foi resetado manualmente, mostrar
    if (resetTours.has(tourName)) {
      return true;
    }
    
    const fieldName = `tour_${tourName}` as keyof OnboardingState;
    return onboarding[fieldName] === false;
  };

  const resetTour = (tourName: string) => {
    setResetTours(prev => new Set(prev).add(tourName));
    setCurrentTour(tourName);
    setRunTour(true);
  };

  const clearResetTour = (tourName: string) => {
    setResetTours(prev => {
      const newSet = new Set(prev);
      newSet.delete(tourName);
      return newSet;
    });
  };

  const refreshOnboarding = async () => {
    await loadOnboarding();
  };

  return (
    <OnboardingContext.Provider
      value={{
        onboarding,
        loading,
        showChecklist,
        setShowChecklist,
        markSenhaAlterada,
        markFotoUploaded,
        markPerfilCompleto,
        completeChecklist,
        markTourComplete,
        shouldShowTour,
        resetTour,
        clearResetTour,
        currentTour,
        setCurrentTour,
        runTour,
        setRunTour,
        refreshOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding deve ser usado dentro de OnboardingProvider');
  }
  return context;
}

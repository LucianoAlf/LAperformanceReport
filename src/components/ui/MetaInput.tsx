import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export type FormatoMeta = 'numero' | 'percentual' | 'moeda' | 'moeda_k';

interface MetaInputProps {
  value: number | null;
  onChange: (valor: number | null) => void;
  formato?: FormatoMeta;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  onSave?: (valor: number | null) => Promise<void>;
}

// Formata valor para exibição
function formatarValor(valor: number | null, formato: FormatoMeta): string {
  if (valor === null || valor === 0) return '';
  
  switch (formato) {
    case 'numero':
      return valor.toLocaleString('pt-BR');
    case 'percentual':
      return `${valor.toFixed(1).replace('.', ',')}%`;
    case 'moeda':
      return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case 'moeda_k':
      if (valor >= 1000) {
        return `R$ ${(valor / 1000).toFixed(0)}k`;
      }
      return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    default:
      return String(valor);
  }
}

// Extrai valor numérico de string formatada
function parseValor(texto: string, formato: FormatoMeta): number | null {
  if (!texto || texto.trim() === '' || texto === '—') return null;
  
  // Remove formatação
  let limpo = texto
    .replace(/R\$\s*/g, '')
    .replace(/k/gi, '000')
    .replace(/%/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  
  const numero = parseFloat(limpo);
  return isNaN(numero) ? null : numero;
}

export function MetaInput({
  value,
  onChange,
  formato = 'numero',
  placeholder = '—',
  disabled = false,
  className,
  autoSave = false,
  autoSaveDelay = 1500,
  onSave,
}: MetaInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [status, setStatus] = useState<'idle' | 'editing' | 'saving' | 'saved'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const originalValueRef = useRef<number | null>(value);

  // Atualiza input quando valor externo muda
  useEffect(() => {
    if (!isFocused) {
      setInputValue(formatarValor(value, formato));
      originalValueRef.current = value;
    }
  }, [value, formato, isFocused]);

  // Limpa timeout ao desmontar
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleFocus = () => {
    setIsFocused(true);
    // Limpa o placeholder ao focar - mostra campo vazio ou valor numérico puro
    if (value !== null && value !== 0) {
      setInputValue(String(value));
    } else {
      setInputValue(''); // Remove o tracinho ao focar
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const novoValor = parseValor(inputValue, formato);
    
    // Formata para exibição
    setInputValue(formatarValor(novoValor, formato));
    
    // Se voltou ao valor original (ou ambos são nulos/vazios), volta ao estado idle
    const valorOriginal = originalValueRef.current;
    const mesmoValor = novoValor === valorOriginal || 
      (novoValor === null && (valorOriginal === null || valorOriginal === 0)) ||
      (valorOriginal === null && (novoValor === null || novoValor === 0));
    
    if (mesmoValor) {
      setStatus('idle');
      return;
    }
    
    // Notifica mudança se diferente
    onChange(novoValor);
    
    if (autoSave && onSave) {
      triggerAutoSave(novoValor);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const texto = e.target.value;
    
    // Permite apenas números, vírgula e ponto
    if (!/^[\d.,]*$/.test(texto) && texto !== '') return;
    
    setInputValue(texto);
    
    // Só marca como editing se realmente tem conteúdo diferente do original
    const novoValor = parseValor(texto, formato);
    const valorOriginal = originalValueRef.current;
    const mesmoValor = novoValor === valorOriginal || 
      (novoValor === null && (valorOriginal === null || valorOriginal === 0)) ||
      (valorOriginal === null && (novoValor === null || novoValor === 0));
    
    if (!mesmoValor) {
      setStatus('editing');
    } else {
      setStatus('idle');
    }
    
    // Cancela save anterior
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  };

  const triggerAutoSave = useCallback(async (valor: number | null) => {
    if (!onSave) return;
    
    setStatus('saving');
    
    try {
      await onSave(valor);
      setStatus('saved');
      originalValueRef.current = valor;
      
      // Volta ao idle após 1.5s
      setTimeout(() => {
        setStatus('idle');
      }, 1500);
    } catch (error) {
      console.error('Erro ao salvar meta:', error);
      setStatus('idle');
    }
  }, [onSave]);

  // Estilos baseados no status - mais visíveis e premium
  const getStatusStyles = () => {
    switch (status) {
      case 'editing':
        return 'border-amber-500/70 bg-amber-500/10 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.15)]';
      case 'saving':
        return 'border-cyan-500/70 bg-cyan-500/10 text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.15)]';
      case 'saved':
        return 'border-emerald-500/70 bg-emerald-500/10 text-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.15)]';
      default:
        return 'border-cyan-900/60 bg-slate-800/40 text-slate-300 hover:border-cyan-700/60 hover:bg-slate-800/60';
    }
  };

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={inputValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={isFocused ? '' : placeholder}
        disabled={disabled}
        className={cn(
          "w-full text-center border rounded-lg px-2 py-1.5 text-sm transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/60",
          "placeholder:text-slate-600",
          disabled && "opacity-50 cursor-not-allowed",
          getStatusStyles()
        )}
      />
      
      {/* Indicador de salvo */}
      {status === 'saved' && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <Check size={12} className="text-emerald-400" />
        </div>
      )}
    </div>
  );
}

export default MetaInput;

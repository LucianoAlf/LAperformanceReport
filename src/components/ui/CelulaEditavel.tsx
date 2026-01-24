import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type TipoCelula = 'texto' | 'numero' | 'moeda' | 'select';

interface OpcaoSelect {
  value: string | number;
  label: string;
}

interface CelulaEditavelProps {
  value: string | number | null;
  onChange: (valor: string | number | null) => Promise<void>;
  tipo?: TipoCelula;
  opcoes?: OpcaoSelect[]; // Para tipo 'select'
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  formatarExibicao?: (valor: string | number | null) => string;
}

export function CelulaEditavel({
  value,
  onChange,
  tipo = 'texto',
  opcoes = [],
  placeholder = '-',
  disabled = false,
  className,
  formatarExibicao,
}: CelulaEditavelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const originalValueRef = useRef<string | number | null>(value);

  // Formatar valor para exibição
  const formatarValor = (val: string | number | null): string => {
    if (formatarExibicao) return formatarExibicao(val);
    if (val === null || val === '') return placeholder;
    
    if (tipo === 'moeda' && typeof val === 'number') {
      return `R$ ${val.toLocaleString('pt-BR')}`;
    }
    
    if (tipo === 'select' && opcoes.length > 0) {
      const opcao = opcoes.find(o => String(o.value) === String(val));
      return opcao?.label || String(val);
    }
    
    return String(val);
  };

  // Atualiza valor original quando valor externo muda
  useEffect(() => {
    originalValueRef.current = value;
  }, [value]);

  // Foca no input quando entra em modo de edição
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = () => {
    if (disabled || isEditing) return;
    setIsEditing(true);
    // Mostra valor puro ao editar
    if (value !== null) {
      setInputValue(String(value));
    } else {
      setInputValue('');
    }
  };

  const handleBlur = async () => {
    setIsEditing(false);
    
    let novoValor: string | number | null = inputValue.trim() || null;
    
    // Converter para número se necessário
    if ((tipo === 'numero' || tipo === 'moeda') && novoValor !== null) {
      const limpo = String(novoValor)
        .replace(/R\$\s*/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
      novoValor = parseFloat(limpo) || null;
    }
    
    // Se não mudou, não salva
    const valorOriginal = originalValueRef.current;
    if (String(novoValor) === String(valorOriginal) || 
        (novoValor === null && valorOriginal === null)) {
      return;
    }
    
    // Salvar
    setStatus('saving');
    try {
      await onChange(novoValor);
      setStatus('saved');
      originalValueRef.current = novoValor;
      
      setTimeout(() => setStatus('idle'), 1500);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      setStatus('idle');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLElement).blur();
    }
    if (e.key === 'Escape') {
      setInputValue(String(originalValueRef.current ?? ''));
      setIsEditing(false);
    }
  };

  // Handler para select do shadcn/ui
  const handleSelectChange = async (novoValor: string) => {
    const valorFinal = novoValor === '__empty__' ? null : novoValor;
    setIsEditing(false);
    
    // Se não mudou, não salva
    const valorOriginal = originalValueRef.current;
    if (String(valorFinal) === String(valorOriginal) || 
        (valorFinal === null && valorOriginal === null)) {
      return;
    }
    
    // Salvar
    setStatus('saving');
    try {
      await onChange(valorFinal);
      setStatus('saved');
      originalValueRef.current = valorFinal;
      
      setTimeout(() => setStatus('idle'), 1500);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      setStatus('idle');
    }
  };

  // Cor do texto baseada no status
  const getTextColor = () => {
    switch (status) {
      case 'saving':
        return 'text-cyan-400';
      case 'saved':
        return 'text-emerald-400';
      default:
        return 'text-slate-300';
    }
  };

  // Renderizar select com shadcn/ui (só quando editando)
  if (tipo === 'select') {
    if (isEditing) {
      const currentValue = value !== null && value !== '' ? String(value) : '__empty__';
      
      return (
        <div className={cn("relative", className)}>
          <Select
            value={currentValue}
            onValueChange={handleSelectChange}
            disabled={disabled}
            open={true}
            onOpenChange={(open) => !open && setIsEditing(false)}
          >
            <SelectTrigger className="h-8 text-sm rounded-lg border-purple-500 bg-slate-700 ring-2 ring-purple-500/30">
              <SelectValue placeholder={placeholder}>
                {formatarValor(value)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">{placeholder}</SelectItem>
              {opcoes.map(op => (
                <SelectItem key={op.value} value={String(op.value)}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    
    // Modo visualização - texto normal clicável
    return (
      <div 
        className={cn(
          "cursor-pointer py-1 px-1 -mx-1 rounded transition-colors hover:bg-slate-700/50",
          className
        )}
        onClick={handleClick}
      >
        <span className={cn("text-sm", getTextColor())}>
          {formatarValor(value)}
        </span>
        {status === 'saved' && (
          <Check size={12} className="inline-block ml-1 text-emerald-400" />
        )}
      </div>
    );
  }

  // Renderizar input (só quando editando)
  if (isEditing) {
    return (
      <div className={cn("relative", className)}>
        <input
          ref={inputRef}
          type="text"
          inputMode={tipo === 'numero' || tipo === 'moeda' ? 'decimal' : 'text'}
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="w-full h-8 text-sm rounded-lg px-2 py-1 border-purple-500 bg-slate-700 ring-2 ring-purple-500/30 focus:outline-none text-white"
        />
      </div>
    );
  }

  // Modo visualização - texto normal clicável
  return (
    <div 
      className={cn(
        "cursor-pointer py-1 px-1 -mx-1 rounded transition-colors hover:bg-slate-700/50",
        className
      )}
      onClick={handleClick}
    >
      <span className={cn("text-sm", getTextColor())}>
        {formatarValor(value)}
      </span>
      {status === 'saved' && (
        <Check size={12} className="inline-block ml-1 text-emerald-400" />
      )}
    </div>
  );
}

export default CelulaEditavel;

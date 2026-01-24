import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Check, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// DatePicker inline com callback onClose
function DatePickerInline({ 
  date, 
  onDateChange, 
  onClose,
  placeholder = "Selecione" 
}: { 
  date: Date | undefined; 
  onDateChange: (date: Date | undefined) => void;
  onClose: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(true);

  const handleSelect = (selectedDate: Date | undefined) => {
    onDateChange(selectedDate);
    setOpen(false);
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      onClose();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 justify-start text-left font-normal text-white text-xs",
            !date && "text-slate-400"
          )}
        >
          <CalendarIcon className="mr-1.5 h-3 w-3" />
          {date ? format(date, "dd/MM", { locale: ptBR }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export type TipoCelulaInline = 'texto' | 'numero' | 'moeda' | 'select' | 'data';

interface OpcaoSelect {
  value: string | number;
  label: string;
}

interface CelulaEditavelInlineProps {
  value: string | number | Date | null;
  onChange: (valor: string | number | null) => Promise<void>;
  tipo?: TipoCelulaInline;
  opcoes?: OpcaoSelect[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  textClassName?: string;
  formatarExibicao?: (valor: string | number | Date | null) => React.ReactNode;
  inputClassName?: string;
}

export function CelulaEditavelInline({
  value,
  onChange,
  tipo = 'texto',
  opcoes = [],
  placeholder = '-',
  disabled = false,
  className,
  textClassName,
  formatarExibicao,
  inputClassName,
}: CelulaEditavelInlineProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const originalValueRef = useRef<string | number | Date | null>(value);

  // Formatar valor para exibição
  const formatarValor = (): React.ReactNode => {
    if (formatarExibicao) return formatarExibicao(value);
    if (value === null || value === '') return <span className="text-slate-500">{placeholder}</span>;
    
    if (tipo === 'moeda' && typeof value === 'number') {
      return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    
    if (tipo === 'data' && value) {
      const date = typeof value === 'string' ? new Date(value + 'T00:00:00') : value as Date;
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
    
    if (tipo === 'select' && opcoes.length > 0) {
      const opcao = opcoes.find(o => String(o.value) === String(value));
      return opcao?.label || String(value);
    }
    
    return String(value);
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
    if (tipo === 'data') {
      // Para data, não precisa setar inputValue
    } else if (value !== null) {
      setInputValue(String(value));
    } else {
      setInputValue('');
    }
  };

  const salvar = async (novoValor: string | number | null) => {
    setIsEditing(false);
    
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

  const handleBlur = async () => {
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
    
    await salvar(novoValor);
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

  // Handler para select
  const handleSelectChange = async (novoValor: string) => {
    const valorFinal = novoValor === '__empty__' ? null : novoValor;
    await salvar(valorFinal);
  };

  // Handler para data
  const handleDateChange = async (date: Date | undefined) => {
    const valorFinal = date ? format(date, 'yyyy-MM-dd') : null;
    await salvar(valorFinal);
  };

  // Indicador de status
  const StatusIndicator = () => {
    if (status === 'saving') {
      return <Loader2 size={12} className="inline-block ml-1 text-cyan-400 animate-spin" />;
    }
    if (status === 'saved') {
      return <Check size={12} className="inline-block ml-1 text-emerald-400" />;
    }
    return null;
  };

  // Renderizar select (só quando editando)
  if (tipo === 'select') {
    if (isEditing) {
      const currentValue = value !== null && value !== '' ? String(value) : '__empty__';
      
      return (
        <Select
          value={currentValue}
          onValueChange={handleSelectChange}
          disabled={disabled}
          open={true}
          onOpenChange={(open) => !open && setIsEditing(false)}
        >
          <SelectTrigger className={cn("h-7 text-xs w-auto min-w-[60px]", inputClassName)}>
            <SelectValue placeholder={placeholder} />
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
      );
    }
    
    // Modo visualização
    return (
      <span 
        className={cn("cursor-pointer py-0.5 px-1 -mx-1 rounded transition-colors hover:bg-slate-700/50", textClassName, className)}
        onClick={handleClick}
      >
        {formatarValor()}
        <StatusIndicator />
      </span>
    );
  }

  // Renderizar DatePicker (só quando editando)
  if (tipo === 'data') {
    if (isEditing) {
      const dateValue = value ? (typeof value === 'string' ? new Date(value + 'T00:00:00') : value as Date) : undefined;
      
      return (
        <div className="inline-block">
          <DatePickerInline
            date={dateValue}
            onDateChange={(date) => {
              handleDateChange(date);
            }}
            onClose={() => setIsEditing(false)}
            placeholder={placeholder}
          />
        </div>
      );
    }
    
    // Modo visualização
    return (
      <span 
        className={cn("cursor-pointer py-0.5 px-1 -mx-1 rounded transition-colors hover:bg-slate-700/50", textClassName, className)}
        onClick={handleClick}
      >
        {formatarValor()}
        <StatusIndicator />
      </span>
    );
  }

  // Renderizar input (só quando editando)
  if (isEditing) {
    // Largura baseada no tipo
    const inputWidth = tipo === 'numero' ? 'w-16' : tipo === 'moeda' ? 'w-24' : 'w-auto min-w-[80px] max-w-[200px]';
    
    return (
      <input
        ref={inputRef}
        type={tipo === 'numero' || tipo === 'moeda' ? 'number' : 'text'}
        step={tipo === 'moeda' ? '0.01' : undefined}
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          inputWidth,
          "h-7 text-sm rounded px-2 py-1 border border-emerald-500 bg-slate-800 ring-1 ring-emerald-500/30 focus:outline-none text-white",
          inputClassName
        )}
      />
    );
  }

  // Modo visualização - texto normal clicável
  return (
    <span 
      className={cn("cursor-pointer py-0.5 px-1 -mx-1 rounded transition-colors hover:bg-slate-700/50", textClassName, className)}
      onClick={handleClick}
    >
      {formatarValor()}
      <StatusIndicator />
    </span>
  );
}

export default CelulaEditavelInline;

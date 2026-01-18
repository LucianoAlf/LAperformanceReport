import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { cn, formatBRLInput, parseBRL, formatCurrency } from '@/lib/utils';

interface CellInputProps {
  value: number;
  onSave: (val: number) => Promise<void>;
  disabled?: boolean;
  colorClass?: string;
  placeholder?: string;
}

export function CellInput({ 
  value, 
  onSave, 
  disabled = false, 
  colorClass = 'text-slate-200',
  placeholder = '0,00'
}: CellInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState<string>(() => (value ? formatBRLInput(value) : ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Sync quando valor externo muda (apenas quando não está editando)
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value ? formatBRLInput(value) : '');
    }
  }, [value, isFocused]);

  const handleBlur = async () => {
    setIsFocused(false);

    const numericVal = Math.abs(parseBRL(localValue));
    const current = Math.abs(value || 0);

    // Se não mudou, apenas formata
    if (numericVal === current) {
      setLocalValue(current === 0 ? '' : formatBRLInput(current));
      return;
    }

    setSaving(true);
    setError(false);
    try {
      await onSave(numericVal);
    } catch (err) {
      console.error('Erro ao salvar célula:', err);
      setError(true);
      setLocalValue(current === 0 ? '' : formatBRLInput(current));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      const current = Math.abs(value || 0);
      setLocalValue(current === 0 ? '' : formatBRLInput(current));
      (e.target as HTMLInputElement).blur();
    }
  };

  const displayValue = Math.abs(value || 0);

  return (
    <div
      className={cn(
        'relative w-full min-h-[38px] transition-all rounded-lg',
        saving && 'opacity-60 pointer-events-none',
        error && 'bg-rose-500/10',
        isFocused && 'ring-2 ring-violet-500/50 z-20'
      )}
    >
      {/* Display layer (visível quando não está focado) */}
      {!isFocused && (
        <div className="absolute inset-0 flex items-center justify-end px-3 py-2 font-mono text-xs text-slate-400 pointer-events-none">
          {displayValue === 0 ? '—' : formatCurrency(displayValue)}
        </div>
      )}

      <input
        type="text"
        className={cn(
          'w-full min-h-[38px] px-3 py-2 bg-transparent text-right font-bold focus:outline-none transition-all text-xs font-mono rounded-lg',
          isFocused ? colorClass : 'text-transparent select-none',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text hover:bg-slate-700/30'
        )}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={isFocused ? placeholder : ''}
        disabled={disabled}
        inputMode="decimal"
      />

      {saving && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2">
          <Loader2 size={12} className="animate-spin text-violet-400" />
        </div>
      )}
    </div>
  );
}

export default CellInput;

'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Phone } from 'lucide-react';
import { Input } from './input';
import type { SugestaoLead } from './combobox-nome';

interface ComboboxTelefoneProps {
  value: string;
  onChange: (maskedValue: string) => void;
  onSelectSugestao?: (sugestao: SugestaoLead) => void;
  onBlur?: () => void;
  sugestoes: SugestaoLead[];
  maskPhone: (value: string) => string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const extractDigits = (str: string) => str.replace(/\D/g, '');

const getTipoLabel = (tipo: string) => {
  switch (tipo) {
    case 'lead':
      return { label: 'Lead', color: 'text-blue-400', icon: '🔵' };
    case 'experimental_realizada':
      return { label: 'Exp. Realizada', color: 'text-purple-400', icon: '🟣' };
    case 'experimental_agendada':
      return { label: 'Exp. Agendada', color: 'text-amber-400', icon: '🟡' };
    case 'experimental_faltou':
      return { label: 'Exp. Faltou', color: 'text-red-400', icon: '🔴' };
    default:
      return { label: tipo, color: 'text-slate-400', icon: '⚪' };
  }
};

export function ComboboxTelefone({
  value,
  onChange,
  onSelectSugestao,
  onBlur,
  sugestoes,
  maskPhone,
  placeholder = '(21) 99999-9999',
  disabled = false,
  className,
}: ComboboxTelefoneProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sugestoesFiltradas = useMemo(() => {
    const inputDigits = extractDigits(value);
    if (inputDigits.length < 2) return [];

    return sugestoes
      .filter(s => {
        if (!s.telefone) return false;
        const storedDigits = s.telefone.replace(/^55/, '');
        return storedDigits.includes(inputDigits);
      })
      .slice(0, 8);
  }, [value, sugestoes]);

  // Calcular posição do dropdown relativo ao viewport
  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: 280,
    });
  }, []);

  // Atualizar posição quando abre
  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset highlight quando sugestões mudam
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [sugestoesFiltradas.length]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskPhone(e.target.value);
    onChange(masked);
    const digits = extractDigits(masked);
    setIsOpen(digits.length >= 2);
  };

  const handleSelect = (sugestao: SugestaoLead) => {
    const formattedPhone = sugestao.telefone
      ? maskPhone(sugestao.telefone.replace(/^55/, ''))
      : value;
    onChange(formattedPhone);

    if (onSelectSugestao) {
      onSelectSugestao(sugestao);
    }

    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || sugestoesFiltradas.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < sugestoesFiltradas.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : sugestoesFiltradas.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < sugestoesFiltradas.length) {
          handleSelect(sugestoesFiltradas[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleFocus = () => {
    const digits = extractDigits(value);
    if (digits.length >= 2 && sugestoesFiltradas.length > 0) {
      setIsOpen(true);
    }
  };

  const handleBlur = () => {
    // Delay para permitir clique na sugestão antes de fechar
    setTimeout(() => {
      const activeEl = document.activeElement;
      if (
        !containerRef.current?.contains(activeEl) &&
        !dropdownRef.current?.contains(activeEl)
      ) {
        setIsOpen(false);
        onBlur?.();
      }
    }, 150);
  };

  const dropdown = isOpen && sugestoesFiltradas.length > 0 ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed max-h-[200px] overflow-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl"
      style={{
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 999999,
      }}
    >
      {sugestoesFiltradas.map((sugestao, index) => {
        const tipoInfo = getTipoLabel(sugestao.tipo);
        return (
          <div
            key={`${sugestao.id}-${sugestao.telefone}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(sugestao)}
            className={cn(
              'px-3 py-2 cursor-pointer transition-colors',
              index === highlightedIndex
                ? 'bg-violet-600/30 text-white'
                : 'hover:bg-slate-700/50 text-slate-300'
            )}
          >
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium truncate">{sugestao.nome}</span>
                <span className="text-xs text-slate-400">
                  {maskPhone(sugestao.telefone!.replace(/^55/, ''))}
                  <span className={cn('ml-2', tipoInfo.color)}>
                    {tipoInfo.icon} {tipoInfo.label}
                  </span>
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="h-8 text-xs"
      />
      {dropdown}
    </div>
  );
}

export default ComboboxTelefone;

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../../lib/utils';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string | number;
  label: string;
}

interface DropdownCellProps {
  value: string | number | null | undefined;
  options: Option[];
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowClear?: boolean;
}

export function DropdownCell({
  value,
  options,
  onChange,
  placeholder = 'Selecione...',
  className,
  disabled = false,
  allowClear = false,
}: DropdownCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

  const handleSelect = (optionValue: string | number | null) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        className={cn(
          'w-full h-full px-2 py-1.5 cursor-pointer text-sm',
          'flex items-center justify-between gap-1',
          'hover:bg-muted/50 transition-colors rounded-sm',
          disabled && 'cursor-not-allowed opacity-50',
          isOpen && 'bg-muted/50',
          className
        )}
      >
        <span className={cn(!selectedOption && 'text-muted-foreground')}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[150px] max-h-[200px] overflow-auto bg-popover border border-border rounded-md shadow-lg">
          {allowClear && value !== null && value !== undefined && (
            <div
              onClick={() => handleSelect(null)}
              className="px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50 text-muted-foreground"
            >
              Limpar
            </div>
          )}
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                'px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50',
                'flex items-center justify-between',
                option.value === value && 'bg-muted'
              )}
            >
              <span>{option.label}</span>
              {option.value === value && <Check className="h-4 w-4 text-primary" />}
            </div>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Nenhuma opção
            </div>
          )}
        </div>
      )}
    </div>
  );
}

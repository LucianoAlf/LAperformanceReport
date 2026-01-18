import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../../lib/utils';

interface EditableCellProps {
  value: string | number | null | undefined;
  onChange: (value: string | number | null) => void;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
}

export function EditableCell({
  value,
  onChange,
  type = 'text',
  placeholder = '',
  className,
  disabled = false,
  min,
  max,
  prefix,
  suffix,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value?.toString() || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value?.toString() || '');
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = () => {
    if (!disabled) {
      setIsEditing(true);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    commitValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
      commitValue();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setLocalValue(value?.toString() || '');
    } else if (e.key === 'Tab') {
      commitValue();
    }
  };

  const commitValue = () => {
    let newValue: string | number | null = localValue;

    if (type === 'number') {
      const num = parseFloat(localValue);
      if (isNaN(num)) {
        newValue = null;
      } else {
        if (min !== undefined && num < min) newValue = min;
        else if (max !== undefined && num > max) newValue = max;
        else newValue = num;
      }
    } else if (type === 'date') {
      newValue = localValue || null;
    } else {
      newValue = localValue || null;
    }

    if (newValue !== value) {
      onChange(newValue);
    }
  };

  const formatDisplayValue = () => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-muted-foreground">{placeholder}</span>;
    }

    if (type === 'number' && prefix) {
      return `${prefix} ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }

    if (type === 'date' && value) {
      const date = new Date(value + 'T00:00:00');
      return date.toLocaleDateString('pt-BR');
    }

    return `${prefix || ''}${value}${suffix || ''}`;
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        className={cn(
          'w-full h-full px-2 py-1 bg-background border-2 border-primary rounded-sm',
          'focus:outline-none text-sm',
          className
        )}
      />
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'w-full h-full px-2 py-1.5 cursor-pointer text-sm',
        'hover:bg-muted/50 transition-colors rounded-sm',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      {formatDisplayValue()}
    </div>
  );
}

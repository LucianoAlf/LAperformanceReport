import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../../lib/utils';
import { Search, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface AutocompleteCellProps {
  value: number | null | undefined;
  displayValue?: string;
  onChange: (id: number | null, record: Record<string, unknown> | null) => void;
  tableName: string;
  searchField: string;
  displayField: string;
  filters?: Record<string, unknown>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface SearchResult {
  id: number;
  [key: string]: unknown;
}

export function AutocompleteCell({
  value,
  displayValue,
  onChange,
  tableName,
  searchField,
  displayField,
  filters = {},
  placeholder = 'Buscar...',
  className,
  disabled = false,
}: AutocompleteCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState(displayValue || '');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelectedDisplay(displayValue || '');
  }, [displayValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const search = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from(tableName)
        .select('*')
        .ilike(searchField, `%${term}%`)
        .limit(10);

      // Aplicar filtros adicionais
      Object.entries(filters).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          query = query.eq(key, val);
        }
      });

      const { data, error } = await query;

      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      console.error('Erro na busca:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [tableName, searchField, filters]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      search(term);
    }, 300);
  };

  const handleSelect = (result: SearchResult) => {
    const display = result[displayField] as string;
    setSelectedDisplay(display);
    setSearchTerm('');
    setIsOpen(false);
    onChange(result.id, result);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDisplay('');
    onChange(null, null);
  };

  const handleOpen = () => {
    if (!disabled) {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {!isOpen ? (
        <div
          onClick={handleOpen}
          className={cn(
            'w-full h-full px-2 py-1.5 cursor-pointer text-sm',
            'flex items-center justify-between gap-1',
            'hover:bg-muted/50 transition-colors rounded-sm',
            disabled && 'cursor-not-allowed opacity-50',
            className
          )}
        >
          <span className={cn('flex items-center gap-1', !selectedDisplay && 'text-muted-foreground')}>
            <Search className="h-3 w-3" />
            {selectedDisplay || placeholder}
          </span>
          {selectedDisplay && !disabled && (
            <X
              className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={handleClear}
            />
          )}
        </div>
      ) : (
        <div className="w-full h-full">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder={placeholder}
            className={cn(
              'w-full h-full px-2 py-1 bg-background border-2 border-primary rounded-sm',
              'focus:outline-none text-sm'
            )}
          />
        </div>
      )}

      {isOpen && (searchTerm.length >= 2 || results.length > 0) && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[200px] max-h-[200px] overflow-auto bg-popover border border-border rounded-md shadow-lg">
          {loading ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Buscando...
            </div>
          ) : results.length > 0 ? (
            results.map((result) => (
              <div
                key={result.id}
                onClick={() => handleSelect(result)}
                className={cn(
                  'px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50',
                  result.id === value && 'bg-muted'
                )}
              >
                {result[displayField] as string}
              </div>
            ))
          ) : searchTerm.length >= 2 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Nenhum resultado
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

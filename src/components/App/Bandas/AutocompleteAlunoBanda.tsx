import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { iniciaisDoNome } from '@/lib/agenda';
import { Input } from '@/components/ui/input';
import { fetchAlunosBanda, type AlunoBanda } from '@/hooks/useBandas';

interface AutocompleteAlunoBandaProps {
  value: string;
  onChange: (nome: string, aluno?: AlunoBanda) => void;
  /** Obrigatório — sem unidade o campo fica desabilitado */
  unidadeId: string | null;
  placeholder?: string;
  className?: string;
}

/**
 * Autocomplete de aluno escopado pela unidade do formulário de banda avulsa.
 * Usa a RPC banda_alunos_da_unidade (dedup por pessoa, só ativos, com foto).
 * Espelha a estrutura do AutocompleteAluno global (debounce, dropdown, teclado).
 */
export function AutocompleteAlunoBanda({
  value,
  onChange,
  unidadeId,
  placeholder = 'Digite o nome do aluno...',
  className,
}: AutocompleteAlunoBandaProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<AlunoBanda[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const desabilitado = !unidadeId;

  // Unidade mudou: resultados antigos não valem mais
  useEffect(() => {
    setResults([]);
    setIsOpen(false);
  }, [unidadeId]);

  // Fechar dropdown ao clicar fora
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

  const searchAlunos = useCallback(async (term: string) => {
    if (!unidadeId || term.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const data = await fetchAlunosBanda(unidadeId, term);
    setResults(data.slice(0, 10));
    setLoading(false);
  }, [unidadeId]);

  const handleInputChange = (term: string) => {
    onChange(term);
    setHighlightedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (term.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchAlunos(term);
      setIsOpen(true);
    }, 300);
  };

  const selectAluno = (aluno: AlunoBanda) => {
    onChange(aluno.nome, aluno);
    setIsOpen(false);
    setResults([]);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      selectAluno(results[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          placeholder={desabilitado ? 'Escolha a unidade primeiro' : placeholder}
          disabled={desabilitado}
          className="pl-9"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
        )}
      </div>

      {isOpen && !desabilitado && (
        <div className="absolute z-[130] w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
          {results.length === 0 && !loading ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              {value.length < 2 ? 'Digite ao menos 2 letras' : 'Nenhum aluno ativo encontrado nesta unidade'}
            </p>
          ) : (
            results.map((aluno, index) => (
              <button
                key={aluno.aluno_id}
                type="button"
                onClick={() => selectAluno(aluno)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                  index === highlightedIndex ? 'bg-violet-600/30' : 'hover:bg-slate-700/50',
                )}
                role="option"
                aria-selected={index === highlightedIndex}
              >
                {aluno.foto_url ? (
                  <img
                    src={aluno.foto_url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-xs font-bold text-white"
                    aria-hidden="true"
                  >
                    {iniciaisDoNome(aluno.nome)}
                  </div>
                )}
                <span className="text-sm text-white truncate">{aluno.nome}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

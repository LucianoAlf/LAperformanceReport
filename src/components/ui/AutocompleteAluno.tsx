import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Search, Loader2, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Input } from './input';
import { useAuth } from '@/contexts/AuthContext';

export interface Aluno {
  id: number;
  nome: string;
  nome_normalizado: string;
  unidade_id: string;
  classificacao?: string;
  status: string;
  valor_parcela?: number;
  curso_id?: number;
  professor_atual_id?: number;
  cursos?: { nome: string };
  professores?: { nome: string };
  unidades?: { codigo: string };
}

interface AutocompleteAlunoProps {
  value: string;
  onChange: (nome: string, aluno?: Aluno) => void;
  unidadeId?: string | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  apenasAtivos?: boolean;
}

export function AutocompleteAluno({
  value,
  onChange,
  unidadeId,
  placeholder = 'Nome completo',
  className,
  disabled = false,
  apenasAtivos = true,
}: AutocompleteAlunoProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [results, setResults] = useState<Aluno[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincronizar valor externo
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

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

  // Buscar alunos no Supabase
  const searchAlunos = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const termUpper = term.toUpperCase();
      
      let query = supabase
        .from('alunos')
        .select('id, nome, nome_normalizado, unidade_id, classificacao, status, valor_parcela, curso_id, professor_atual_id, unidades(codigo)')
        .ilike('nome_normalizado', `%${termUpper}%`)
        .limit(50);

      // Filtrar por unidade se especificado (não é "todos")
      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      // Filtrar apenas alunos ativos
      if (apenasAtivos) {
        query = query.eq('status', 'ativo');
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Ordenar: primeiro os que começam com o termo, depois alfabético
      const sorted = (data || []).sort((a, b) => {
        const aStartsWith = a.nome_normalizado.startsWith(termUpper);
        const bStartsWith = b.nome_normalizado.startsWith(termUpper);
        
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        
        return a.nome.localeCompare(b.nome);
      });
      
      const top10 = sorted.slice(0, 10);
      
      // Buscar nomes de cursos e professores
      const cursoIds = [...new Set(top10.map(a => a.curso_id).filter(Boolean))];
      const professorIds = [...new Set(top10.map(a => a.professor_atual_id).filter(Boolean))];
      
      const [cursosRes, professoresRes] = await Promise.all([
        cursoIds.length > 0 
          ? supabase.from('cursos').select('id, nome').in('id', cursoIds)
          : { data: [] },
        professorIds.length > 0 
          ? supabase.from('professores').select('id, nome').in('id', professorIds)
          : { data: [] },
      ]);
      
      const cursosMap = new Map((cursosRes.data || []).map(c => [c.id, c.nome]));
      const professoresMap = new Map((professoresRes.data || []).map(p => [p.id, p.nome]));
      
      // Enriquecer dados com nomes
      const enriched = top10.map(aluno => ({
        ...aluno,
        cursos: aluno.curso_id ? { nome: cursosMap.get(aluno.curso_id) || '' } : undefined,
        professores: aluno.professor_atual_id ? { nome: professoresMap.get(aluno.professor_atual_id) || '' } : undefined,
      }));
      
      setResults(enriched);
    } catch (error) {
      console.error('Erro ao buscar alunos:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [unidadeId, apenasAtivos]);

  // Handler de mudança no input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    onChange(term); // Atualiza o valor externo
    setHighlightedIndex(-1);

    // Debounce para busca
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchAlunos(term);
      if (term.length >= 2) {
        setIsOpen(true);
      }
    }, 300);
  };

  // Selecionar aluno
  const handleSelect = (aluno: Aluno) => {
    setSearchTerm(aluno.nome);
    onChange(aluno.nome, aluno);
    setIsOpen(false);
    setResults([]);
  };

  // Navegação por teclado
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  // Foco no input
  const handleFocus = () => {
    if (searchTerm.length >= 2 && results.length > 0) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 pr-8"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
        )}
      </div>

      {/* Dropdown de resultados */}
      {isOpen && searchTerm.length >= 2 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full max-h-[240px] overflow-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando alunos...
            </div>
          ) : results.length > 0 ? (
            results.map((aluno, index) => (
              <div
                key={aluno.id}
                onClick={() => handleSelect(aluno)}
                className={cn(
                  'px-3 py-2 cursor-pointer transition-colors flex items-center gap-2',
                  index === highlightedIndex 
                    ? 'bg-violet-600/30 text-white' 
                    : 'hover:bg-slate-700/50 text-slate-300'
                )}
              >
                <User className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{aluno.nome}</p>
                    {aluno.classificacao && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        aluno.classificacao === 'EMLA' 
                          ? 'bg-violet-500/20 text-violet-400' 
                          : 'bg-cyan-500/20 text-cyan-400'
                      }`}>
                        {aluno.classificacao}
                      </span>
                    )}
                    {isAdmin && aluno.unidades?.codigo && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-600/30 text-slate-300">
                        {aluno.unidades.codigo}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {aluno.valor_parcela && (
                      <p className="text-xs text-slate-500">
                        Parcela atual: R$ {aluno.valor_parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                    {aluno.cursos?.nome && (
                      <p className="text-xs text-slate-500">
                        Curso: {aluno.cursos.nome}
                      </p>
                    )}
                    {aluno.professores?.nome && (
                      <p className="text-xs text-slate-500">
                        Professor: {aluno.professores.nome}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-400">
              Nenhum aluno encontrado
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AutocompleteAluno;

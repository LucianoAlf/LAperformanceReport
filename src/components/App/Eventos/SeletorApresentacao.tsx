import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, X, Plus, Music } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { normalizarBusca } from '@/lib/agenda';
import {
  useAlunosDoEvento,
  adicionarApresentacao,
  PARTICIPACAO_SELO,
  type AlunoElegivel,
} from '@/hooks/useEventos';

/** Uma opção é um PAR (pessoa, curso) — o mesmo grão da UNIQUE e da grade. */
interface Opcao {
  chave: string;
  aluno: AlunoElegivel;
  curso_id: number;
  curso_nome: string | null;
  professor_nome: string | null;
  jaNaGrade: boolean;
}

/**
 * As opções de UMA pessoa, juntas.
 *
 * A lista continua sendo de pares `(pessoa, curso)` — é o grão da UNIQUE e da grade —, mas
 * exibir cada par como uma linha solta repete o nome e esconde o que importa na hora de
 * montar: **esta pessoa faz Violão E Canto**. Medido em 18/09: 59 pessoas nas 3 unidades têm
 * 2+ cursos, e uma de Campo Grande tem quatro.
 */
interface Pessoa {
  chave: string;
  aluno: AlunoElegivel;
  opcoes: Opcao[];
  /** Quantos cursos dela ainda não entraram em bloco nenhum. */
  fora: number;
}

export function SeletorApresentacao({
  eventoId,
  unidadeId,
  blocoId,
  onFechar,
  onAdicionado,
}: {
  eventoId: number;
  /** Vem do EVENTO, nunca do filtro do topo — que pode estar em "Consolidado". */
  unidadeId: string;
  blocoId: number;
  onFechar: () => void;
  onAdicionado: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [gravando, setGravando] = useState<string | null>(null);

  const { alunos, loading } = useAlunosDoEvento(eventoId, unidadeId);

  const opcoes = useMemo<Opcao[]>(() => {
    const termo = normalizarBusca(busca.trim());
    const lista: Opcao[] = [];

    for (const aluno of alunos) {
      // Quem disse que NÃO participa fica fora: montar a grade com ele é o caminho para
      // imprimir a programação com alguém que já avisou que não vem.
      if (aluno.status === 'nao') continue;

      for (const curso of aluno.cursos) {
        const jaNaGrade = aluno.alocacoes.some((a) => a.curso_id === curso.curso_id);
        if (termo) {
          const alvo = normalizarBusca(
            `${aluno.nome} ${curso.curso_nome ?? ''} ${curso.professor_nome ?? ''}`,
          );
          if (!alvo.includes(termo)) continue;
        }
        lista.push({
          chave: `${aluno.pessoa_chave}|${curso.curso_id}`,
          aluno,
          curso_id: curso.curso_id,
          curso_nome: curso.curso_nome,
          professor_nome: curso.professor_nome,
          jaNaGrade,
        });
      }
    }

    return lista;
  }, [alunos, busca]);

  /**
   * Agrupa por pessoa preservando a ordem de trabalho: quem tem curso fora da grade vem
   * primeiro (é neles que se trabalha), depois quem confirmou antes de quem está indefinido.
   *
   * ⚠️ A ordenação é por PESSOA, não por par: ordenar os pares e depois agrupar faria a
   * mesma pessoa aparecer em dois lugares da lista quando um curso dela já está na grade e
   * o outro não — que é exatamente o caso que o agrupamento existe para tornar visível.
   */
  const pessoas = useMemo<Pessoa[]>(() => {
    const porPessoa = new Map<string, Pessoa>();
    for (const o of opcoes) {
      const atual = porPessoa.get(o.aluno.pessoa_chave) ?? {
        chave: o.aluno.pessoa_chave,
        aluno: o.aluno,
        opcoes: [],
        fora: 0,
      };
      atual.opcoes.push(o);
      if (!o.jaNaGrade) atual.fora += 1;
      porPessoa.set(o.aluno.pessoa_chave, atual);
    }

    return [...porPessoa.values()].sort(
      (a, b) =>
        Number(a.fora === 0) - Number(b.fora === 0) ||
        Number(b.aluno.status === 'participa') - Number(a.aluno.status === 'participa') ||
        a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'),
    );
  }, [opcoes]);

  const adicionar = async (o: Opcao) => {
    setGravando(o.chave);
    const { error } = await adicionarApresentacao(blocoId, o.aluno.aluno_id_referencia, o.curso_id);
    setGravando(null);
    if (error) {
      // A RPC devolve a frase pronta ("Fulano já tem uma apresentação de Canto neste
      // evento"), com a explicação da regra no `hint`. Não reescrever aqui.
      toast.error(error.message, { description: error.hint ?? undefined });
      return;
    }
    onAdicionado();
  };

  const foraDaGrade = opcoes.filter((o) => !o.jaNaGrade);
  const confirmadosFora = foraDaGrade.filter((o) => o.aluno.status === 'participa').length;

  return (
    <div className="rounded-lg border border-violet-500/40 bg-slate-900/60 p-2.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno, curso ou professor…"
            className="h-8 pl-8 text-[12.5px]"
          />
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar seletor"
          className="text-slate-500 hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 px-1 text-[11px] text-slate-500">
        {loading ? (
          'Carregando candidatos…'
        ) : (
          <>
            <span>{foraDaGrade.length} fora da grade</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {confirmadosFora} {confirmadosFora === 1 ? 'confirmado' : 'confirmados'}
            </span>
            <span>· quem marcou “não participa” não aparece</span>
          </>
        )}
      </p>

      <div className="mt-1.5 max-h-72 space-y-0.5 overflow-y-auto">
        {pessoas.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-slate-500">
            {loading ? '' : 'Nenhum candidato com esse filtro.'}
          </p>
        ) : (
          pessoas.map((p) => (
            <div key={p.chave} className="rounded px-2 py-1.5 hover:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-white">
                  {p.aluno.nome}
                </span>
                {/* Os dois estados marcados, nunca só o negativo: sem o selo verde, quem
                    confirmou fica igual a quem ninguém perguntou ainda. */}
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-1 text-[10.5px]',
                    PARTICIPACAO_SELO[p.aluno.status].texto,
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      PARTICIPACAO_SELO[p.aluno.status].ponto,
                    )}
                  />
                  {PARTICIPACAO_SELO[p.aluno.status].rotulo}
                </span>
              </div>

              {/* Um botão por CURSO MATRICULADO. É aqui que a pessoa com dois cursos deixa
                  de ser duas linhas parecidas e passa a ser uma escolha explícita entre
                  Violão e Canto — o caso da Maria Fernanda, que o formato anterior
                  espalhava pela lista. */}
              <div className="mt-1 flex flex-wrap gap-1">
                {p.opcoes.map((o) => (
                  <button
                    key={o.chave}
                    type="button"
                    disabled={o.jaNaGrade || gravando === o.chave}
                    onClick={() => adicionar(o)}
                    title={
                      o.jaNaGrade
                        ? `${o.curso_nome} já está na grade`
                        : `Adicionar ${o.curso_nome}${o.professor_nome ? ` · Prof. ${o.professor_nome}` : ''}`
                    }
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] transition-colors',
                      o.jaNaGrade
                        ? 'cursor-not-allowed bg-slate-800/60 text-slate-500'
                        : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/30',
                    )}
                  >
                    {o.jaNaGrade ? (
                      <Music className="h-3 w-3 shrink-0" />
                    ) : (
                      <Plus className="h-3 w-3 shrink-0" />
                    )}
                    {o.curso_nome}
                    {o.jaNaGrade && <span className="text-[10px]">na grade</span>}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

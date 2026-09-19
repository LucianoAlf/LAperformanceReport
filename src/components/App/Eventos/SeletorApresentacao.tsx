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

    // Quem ainda não está na grade primeiro — é neles que se trabalha. Depois, quem
    // confirmou participação antes de quem está indefinido.
    return lista.sort(
      (a, b) =>
        Number(a.jaNaGrade) - Number(b.jaNaGrade) ||
        Number(b.aluno.status === 'participa') - Number(a.aluno.status === 'participa') ||
        a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'),
    );
  }, [alunos, busca]);

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

      <div className="mt-1.5 max-h-72 overflow-y-auto">
        {opcoes.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-slate-500">
            {loading ? '' : 'Nenhum candidato com esse filtro.'}
          </p>
        ) : (
          opcoes.map((o) => (
            <button
              key={o.chave}
              type="button"
              disabled={o.jaNaGrade || gravando === o.chave}
              onClick={() => adicionar(o)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                o.jaNaGrade
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-slate-800 focus-visible:bg-slate-800',
              )}
            >
              {o.jaNaGrade ? (
                <Music className="h-3.5 w-3.5 shrink-0 text-violet-400" />
              ) : (
                <Plus className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              )}
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-white">
                {o.aluno.nome}
              </span>
              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[10.5px] text-amber-300">
                {o.curso_nome}
              </span>
              {/* Os dois estados marcados, nunca só o negativo: sem o selo verde, quem
                  confirmou fica igual a quem ninguém perguntou ainda. */}
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1 text-[10.5px]',
                  PARTICIPACAO_SELO[o.aluno.status].texto,
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    PARTICIPACAO_SELO[o.aluno.status].ponto,
                  )}
                />
                {PARTICIPACAO_SELO[o.aluno.status].rotulo}
              </span>
              {o.jaNaGrade && <span className="shrink-0 text-[10.5px] text-slate-500">na grade</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

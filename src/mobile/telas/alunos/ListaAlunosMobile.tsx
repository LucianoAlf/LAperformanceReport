import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import { normalizarBusca } from '@/lib/agenda';
import { getStatusPagamentoOperacional } from '@/lib/alunosStatus';

import { DetalheAlunoSheet } from './DetalheAlunoSheet';
import { LinhaAluno } from './LinhaAluno';
import type { AlunoNaLinha } from './tipos';

/**
 * A aba Lista em tela de telefone — arquétipo 1 do spec ("lista densa").
 *
 * A tabela do desktop tem 16 colunas e não encolhe para 351px. A linha carrega
 * três coisas (quem · com quem/quando · o que exige ação) e o resto vai para a
 * folha de detalhe.
 *
 * Recebe os alunos JÁ carregados, e é por isso que serve aos dois donos: a
 * `AlunosPage` passa a lista dela (com os filtros do desktop aplicados) e a
 * tela mobile autônoma passa a de `useAlunosLista`. Se ela buscasse por conta
 * própria, existiriam duas leituras da mesma lista.
 */

/** O recorte de status. Um chip por vez: combinar dois viraria um formulário. */
const RECORTES = [
  {
    id: 'na_casa',
    label: 'Na casa',
    // Ativo + aviso prévio = quem ainda tem aula acontecendo. Trancado fica de
    // fora porque trancado NÃO é aluno ativo (regra da casa), e quem saiu só
    // aparece quando alguém pede.
    aplica: (a: AlunoNaLinha) => ['ativo', 'aviso_previo'].includes(String(a.status || '').toLowerCase()),
  },
  {
    id: 'inadimplentes',
    label: 'Inadimplentes',
    // Pela regra compartilhada, não pelo campo cru: quem evadiu devendo não
    // entra aqui — a cobrança dele é do financeiro, não da lista de alunos.
    aplica: (a: AlunoNaLinha) => getStatusPagamentoOperacional(a) === 'inadimplente',
  },
  {
    id: 'aviso_previo',
    label: 'Aviso prévio',
    aplica: (a: AlunoNaLinha) => String(a.status || '').toLowerCase() === 'aviso_previo',
  },
  { id: 'todos', label: 'Todos', aplica: () => true },
] as const;

type RecorteId = (typeof RECORTES)[number]['id'];

/**
 * Quantos cartões entram de uma vez. A rede passa de 1.151 alunos e montar
 * todos trava a rolagem no aparelho da secretaria; o resto entra quando a
 * pessoa chega ao fim da lista.
 */
const LOTE = 40;

interface ListaAlunosMobileProps {
  alunos: AlunoNaLinha[];
  /** Na visão consolidada a unidade importa na linha; dentro de uma, é ruído. */
  mostrarUnidade: boolean;
}

export function ListaAlunosMobile({ alunos, mostrarUnidade }: ListaAlunosMobileProps) {
  const [recorte, setRecorte] = useState<RecorteId>('na_casa');
  const [busca, setBusca] = useState('');
  const [visiveis, setVisiveis] = useState(LOTE);
  const [aberto, setAberto] = useState<AlunoNaLinha | null>(null);

  const filtrados = useMemo(() => {
    const regra = RECORTES.find((r) => r.id === recorte) ?? RECORTES[0];
    const termo = normalizarBusca(busca);

    return alunos.filter((a) => {
      if (!regra.aplica(a)) return false;
      if (!termo) return true;
      // Nome, professor e curso na mesma caixa: quem procura "gabriel" quase
      // sempre quer a turma do professor, não um aluno chamado Gabriel — e
      // separar isso exigiria dois campos, que não cabem aqui.
      const alvo = normalizarBusca([a.nome, a.professor_nome, a.curso_nome].filter(Boolean).join(' '));
      return alvo.includes(termo);
    });
  }, [alunos, recorte, busca]);

  // Voltar ao primeiro lote quando o conjunto muda, senão trocar de chip mantém
  // 400 cartões montados de um recorte que ninguém está mais vendo.
  useEffect(() => { setVisiveis(LOTE); }, [recorte, busca]);

  const sentinela = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const alvo = sentinela.current;
    if (!alvo) return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        setVisiveis((n) => (n >= filtrados.length ? n : n + LOTE));
      }
    }, { rootMargin: '400px' });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [filtrados.length]);

  return (
    <div className="space-y-3 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome, professor ou curso"
          aria-label="Buscar aluno"
          className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900/70 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca('')}
            aria-label="Limpar busca"
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 active:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {RECORTES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRecorte(r.id)}
            aria-pressed={recorte === r.id}
            className={`min-h-[36px] rounded-full border px-3 text-[13px] font-medium transition-colors ${
              recorte === r.id
                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-700 bg-slate-800/50 text-slate-400'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-500">
        {filtrados.length === 0
          ? 'Nenhum aluno neste recorte'
          : `${filtrados.length} ${filtrados.length === 1 ? 'aluno' : 'alunos'}`}
      </p>

      <div className="space-y-2">
        {filtrados.slice(0, visiveis).map((aluno) => (
          <LinhaAluno key={aluno.id} aluno={aluno} mostrarUnidade={mostrarUnidade} onAbrir={setAberto} />
        ))}
      </div>

      <div ref={sentinela} aria-hidden="true" className="h-1" />

      {visiveis < filtrados.length && (
        <p className="py-2 text-center text-[11px] text-slate-600">carregando mais…</p>
      )}

      <DetalheAlunoSheet aluno={aberto} onFechar={() => setAberto(null)} />
    </div>
  );
}

export default ListaAlunosMobile;

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Users, X } from 'lucide-react';

import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { normalizarBusca } from '@/lib/agenda';
import { getStatusPagamentoOperacional } from '@/lib/alunosStatus';
import { useAlunosLista, type AlunoLista } from '@/hooks/useAlunosLista';

import { LinhaAluno } from './alunos/LinhaAluno';
import { DetalheAlunoSheet } from './alunos/DetalheAlunoSheet';

/**
 * Alunos em tela de telefone — arquétipo 1 do spec ("lista densa").
 *
 * Público medido com o Hugo: a maioria é secretaria/ADM, e a coordenação
 * também usa. Os dois precisam achar uma pessoa e ver o que exige ação; o que
 * é exclusivo de cada um (pagamento × grade) virou FILTRO, não coluna, porque
 * só cabem três informações na linha.
 */

/** O recorte de status. Um chip por vez: combinar dois viraria um formulário. */
const RECORTES = [
  {
    id: 'na_casa',
    label: 'Na casa',
    // Ativo + aviso prévio = quem ainda tem aula acontecendo. Trancado fica de
    // fora porque trancado NÃO é aluno ativo (regra da casa), e quem saiu só
    // aparece quando alguém pede.
    aplica: (a: AlunoLista) => ['ativo', 'aviso_previo'].includes(String(a.status || '').toLowerCase()),
  },
  {
    id: 'inadimplentes',
    label: 'Inadimplentes',
    // Pela regra compartilhada, não pelo campo cru: quem evadiu devendo não
    // entra aqui — a cobrança dele é do financeiro, não da lista de alunos.
    aplica: (a: AlunoLista) => getStatusPagamentoOperacional(a) === 'inadimplente',
  },
  {
    id: 'aviso_previo',
    label: 'Aviso prévio',
    aplica: (a: AlunoLista) => String(a.status || '').toLowerCase() === 'aviso_previo',
  },
  {
    id: 'todos',
    label: 'Todos',
    aplica: () => true,
  },
] as const;

type RecorteId = (typeof RECORTES)[number]['id'];

/**
 * Quantos cartões entram de uma vez. A rede passa de 1.151 alunos e montar
 * todos de uma vez trava a rolagem no aparelho da secretaria; o resto entra
 * quando a pessoa chega ao fim da lista.
 */
const LOTE = 40;

export function AlunosMobile() {
  useSetPageTitle({
    titulo: 'Alunos',
    subtitulo: 'Lista de alunos por unidade',
    icone: Users,
    iconeCor: 'text-emerald-400',
    iconeWrapperCor: 'bg-emerald-500/20',
  });

  const { alunos, carregando, erro, consolidado } = useAlunosLista();
  const [recorte, setRecorte] = useState<RecorteId>('na_casa');
  const [busca, setBusca] = useState('');
  const [visiveis, setVisiveis] = useState(LOTE);
  const [aberto, setAberto] = useState<AlunoLista | null>(null);

  const filtrados = useMemo(() => {
    const regra = RECORTES.find((r) => r.id === recorte) ?? RECORTES[0];
    const termo = normalizarBusca(busca);

    return alunos.filter((a) => {
      if (!regra.aplica(a)) return false;
      if (!termo) return true;
      // Nome, professor e curso na mesma caixa: quem procura "gabriel" quase
      // sempre quer a turma do professor, não um aluno chamado Gabriel — e
      // descobrir isso exige dois campos separados, que não cabem aqui.
      const alvo = normalizarBusca([a.nome, a.professor_nome, a.curso_nome].filter(Boolean).join(' '));
      return alvo.includes(termo);
    });
  }, [alunos, recorte, busca]);

  // Voltar ao topo do lote quando o conjunto muda, senão trocar de chip mantém
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

  if (carregando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (erro) {
    // Falha não pode ser muda: "nenhum aluno" e "a consulta quebrou" são
    // estados diferentes e a tela tem de dizer qual dos dois aconteceu.
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        Não consegui carregar a lista de alunos.
        <span className="mt-1 block text-[12px] text-rose-300/80">{erro}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-2">
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
          <LinhaAluno
            key={aluno.id}
            aluno={aluno}
            mostrarUnidade={consolidado}
            onAbrir={setAberto}
          />
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

export default AlunosMobile;

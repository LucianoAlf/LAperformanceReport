import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  type RegistroAutomacaoLog,
  ehAcaoDeSombra,
  estiloDaAcao,
  filtrarRegistrosLog,
  formatarDetalhesLog,
  registroSemProfessor,
  rotuloDoEvento,
} from '@/lib/automacaoLog';

/**
 * A aba Automação em tela de telefone.
 *
 * A tabela do computador tem 7 colunas e mede 1.796px — a mais larga das oito
 * abas de Alunos. A 390px sobram 374px, então cinco colunas caem fora, e as
 * que somem são Detalhes, Origem e Execução: o log vira uma lista de nomes
 * sem o que aconteceu com eles.
 *
 * Aqui cada registro é uma linha que responde as três coisas na ordem em que
 * se pergunta — o que aconteceu, com quem, e quando:
 *
 *   Renovado                             14:32
 *   Maria Eduarda Silva · CG
 *   Renovação · Violão · Prof. Gabriel
 *
 * O resto (payload, workflow, execução) fica atrás do toque, como no
 * computador — lá também é uma linha que expande.
 */

interface Props {
  registros: RegistroAutomacaoLog[];
  /** Recorte por evento vindo do desktop (inclui o pseudo-evento `sem_professor`). */
  filtroEvento: string;
  carregando: boolean;
}

export function AutomacaoMobile({ registros, filtroEvento, carregando }: Props) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<number | null>(null);

  const lista = useMemo(
    () => filtrarRegistrosLog(registros, { busca, evento: filtroEvento }),
    [registros, busca, filtroEvento],
  );

  return (
    <div className="space-y-3 p-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por aluno"
          aria-label="Buscar no log"
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

      <p className="px-1 text-[11px] text-slate-500">
        {carregando
          ? 'carregando…'
          : lista.length === 0
            ? 'Nenhum registro neste recorte'
            : `${lista.length} ${lista.length === 1 ? 'registro' : 'registros'}`}
      </p>

      <div>
        {lista.map((registro) => (
          <LinhaLog
            key={registro.id}
            registro={registro}
            aberta={aberto === registro.id}
            onAlternar={() => setAberto((atual) => (atual === registro.id ? null : registro.id))}
          />
        ))}
      </div>
    </div>
  );
}

function LinhaLog({
  registro,
  aberta,
  onAlternar,
}: {
  registro: RegistroAutomacaoLog;
  aberta: boolean;
  onAlternar: () => void;
}) {
  const estilo = estiloDaAcao(registro.acao);
  const detalhes = formatarDetalhesLog(registro, { abreviarProfessor: true });
  const semProfessor = registroSemProfessor(registro);
  const sombra = ehAcaoDeSombra(registro.acao);
  const temPayload = registro.detalhes && Object.keys(registro.detalhes).length > 0;

  const quando = new Date(registro.created_at);
  const hoje = new Date();
  const mesmoDia = quando.toDateString() === hoje.toDateString();
  // Hora sozinha no dia corrente, data curta antes disso: num log lido no
  // balcão, "14:32" responde "foi agora?" sem gastar largura com a data.
  const carimbo = mesmoDia
    ? quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  const abaixo = [rotuloDoEvento(registro.evento), detalhes].filter(Boolean).join(' · ');

  return (
    <div className="border-b border-slate-800/70">
      <button
        type="button"
        onClick={onAlternar}
        disabled={!temPayload}
        aria-expanded={temPayload ? aberta : undefined}
        className={cn(
          'flex w-full items-start gap-2 py-2.5 pl-1 pr-1 text-left',
          temPayload && 'active:bg-slate-800/50',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('flex-none rounded px-1.5 py-0.5 text-[10.5px] font-medium', estilo.bg, estilo.text)}>
              {estilo.label}
            </span>
            {semProfessor && (
              // ⚠️ Fica na primeira linha, junto da ação: é o defeito de
              // cadastro que alguém precisa resolver, não um detalhe do evento.
              <span className="flex flex-none items-center gap-0.5 rounded bg-orange-500/20 px-1 py-0.5 text-[10px] text-orange-400">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                sem professor
              </span>
            )}
          </div>

          <p className="mt-1 truncate text-[13px] font-medium leading-tight text-slate-100">
            {registro.aluno_nome || 'sem aluno'}
            {registro.unidade_nome && (
              <span className="font-normal text-slate-500"> · {registro.unidade_nome}</span>
            )}
          </p>

          {/* ⚠️ Duas linhas, não `truncate`: aqui mora o que aconteceu (evento,
              curso, professor) e cortar a frase no meio deixa a linha dizendo
              "Sync Presença · 2026-09-10 · Bateria T · Prof. Caio Tenório de…",
              sem o dado que a pessoa abriu o log para ver. */}
          {abaixo && <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-slate-400">{abaixo}</p>}
        </div>

        <div className="flex flex-none items-center gap-1">
          <span className={cn('text-[11px] tabular-nums', sombra ? 'text-slate-600' : 'text-slate-500')}>
            {carimbo}
          </span>
          {temPayload && (
            <ChevronDown
              className={cn('h-3.5 w-3.5 text-slate-600 transition-transform', aberta && 'rotate-180')}
              aria-hidden="true"
            />
          )}
        </div>
      </button>

      {aberta && temPayload && (
        <Payload detalhes={registro.detalhes as Record<string, unknown>} registro={registro} />
      )}
    </div>
  );
}

function Payload({
  detalhes,
  registro,
}: {
  detalhes: Record<string, unknown>;
  registro: RegistroAutomacaoLog;
}) {
  const linhas: Array<[string, ReactNode]> = Object.entries(detalhes).map(([chave, valor]) => [
    chave,
    typeof valor === 'object' && valor !== null ? JSON.stringify(valor) : String(valor),
  ]);

  return (
    <div className="mb-2 rounded-lg bg-slate-900/70 px-2.5 py-2">
      <dl className="space-y-1">
        {linhas.map(([chave, valor]) => (
          <div key={chave} className="flex gap-2 text-[11px]">
            <dt className="w-[38%] flex-none truncate text-slate-500">{chave}</dt>
            {/* ⚠️ `break-all` e não `truncate`: aqui o valor é o conteúdo —
                um id cortado pela metade não serve para procurar nada. */}
            <dd className="min-w-0 flex-1 break-all text-slate-300">{valor}</dd>
          </div>
        ))}
      </dl>
      {(registro.execution_id || registro.workflow_id) && (
        <p className="mt-1.5 border-t border-slate-800 pt-1.5 text-[10.5px] text-slate-600">
          origem: {registro.workflow_id ?? '—'} · execução: {registro.execution_id ?? '—'}
        </p>
      )}
    </div>
  );
}

export default AutomacaoMobile;

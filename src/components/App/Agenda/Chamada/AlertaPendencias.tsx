import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, Clock, ChevronRight, PartyPopper, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AulaAgenda, AlunoAgenda, LeadExperimentalAgenda } from '@/hooks/useAgendaDia';
import { aulaJaOcorreu } from '@/lib/agenda';
import { alunoSemDestino } from './chamadaUtils';
import { cn } from '@/lib/utils';

interface Pendencia {
  aula: AulaAgenda;
  aluno?: AlunoAgenda;
  lead?: LeadExperimentalAgenda;
  /** Minutos desde que a aula terminou */
  minutosDesdeFim: number;
}

interface Props {
  data: string;
  aulas: AulaAgenda[];
  /** Se true, agrupa por unidade (consolidado). Se false, mostra flat. */
  consolidado: boolean;
  /** ID da unidade selecionada (null = consolidado). Usado para buscar a equipe. */
  unidadeId: string | null;
  onAbrirDrawer: (aula: AulaAgenda) => void;
}

/**
 * Alerta de pendências da chamada: alunos sem destino em aulas que já
 * ocorreram. Separa "hoje" de "ontem" (o digest é enviado na manhã seguinte,
 * então o que a equipe precisa ver de manhã é o que ficou em aberto ontem).
 *
 * Cores por volume:
 *   - 0 pendências: verde (tudo fechado)
 *   - 1-5: amarelo (atenção)
 *   - 6+: vermelho (urgente)
 *
 * Cada item é clicável: abre o drawer da aula para a equipe agir na hora.
 */
export function AlertaPendencias({ data, aulas, consolidado, unidadeId, onAbrirDrawer }: Props) {
  const agora = useMemo(() => new Date(), []);
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [nomesEquipe, setNomesEquipe] = useState<string[]>([]);

  // Busca os nomes da equipe da unidade (para o parabéns personalizado).
  // Filtra usuarios genéricos (Equipe X, testes, etc.) — so pega nomes reais.
  useEffect(() => {
    if (!unidadeId) { setNomesEquipe([]); return; }
    let cancelado = false;
    (async () => {
      const { data: rows } = await supabase
        .from('usuarios')
        .select('nome')
        .eq('unidade_id', unidadeId)
        .eq('ativo', true)
        .order('nome');
      if (cancelado) return;
      const nomes = (rows ?? [])
        .map((r: { nome: string }) => r.nome)
        .filter((n: string) => n && !n.toLowerCase().includes('equipe') && !n.toLowerCase().includes('teste'));
      setNomesEquipe(nomes);
    })();
    return () => { cancelado = true; };
  }, [unidadeId]);

  const pendentes = useMemo(() => {
    const lista: Pendencia[] = [];
    for (const aula of aulas) {
      if (aula.cancelada) continue;
      if (!aulaJaOcorreu(data, aula.hora_fim, agora)) continue;
      const [h, m] = aula.hora_fim.split(':').map(Number);
      const fim = new Date(`${data}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
      const minutos = Math.max(0, Math.round((agora.getTime() - fim.getTime()) / 60000));

      // Alunos sem destino
      for (const aluno of aula.alunos) {
        if (aluno.aluno_id == null) continue;
        if (alunoSemDestino(aula, aluno, data, agora)) {
          lista.push({ aula, aluno, minutosDesdeFim: minutos });
        }
      }

      // Leads experimentais sem destino (aguardando presença/falta)
      for (const lead of aula.experimental_leads ?? []) {
        if (lead.status === 'experimental_agendada') {
          lista.push({ aula, lead, minutosDesdeFim: minutos });
        }
      }
    }
    return lista;
  }, [aulas, data, agora]);

  // Separa hoje vs ontem
  const pendentesHoje = pendentes.filter((p) => data === hoje);
  const pendentesOntem = pendentes.filter((p) => data !== hoje);

  // Se não tem pendências, mostra parabéns (verde) com os nomes da equipe
  if (pendentes.length === 0) {
    const nomes = nomesEquipe.length > 0
      ? nomesEquipe.length === 1
        ? nomesEquipe[0]
        : `${nomesEquipe.slice(0, -1).join(', ')} e ${nomesEquipe.at(-1)}`
      : null;
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <PartyPopper className="h-5 w-5 shrink-0 text-emerald-400" />
        <div>
          <p className="text-sm font-semibold text-emerald-300">
            {nomes ? `Parabéns, ${nomes}!` : 'Parabéns!'} Tudo fechado na ficha de chamada.
          </p>
          <p className="mt-0.5 text-xs text-emerald-400/70">
            O lembrete de presenças do WhatsApp não vai precisar aparecer amanhã no grupo.
          </p>
        </div>
      </div>
    );
  }

  const total = pendentes.length;
  const urgente = total > 10;

  const corFundo = urgente
    ? 'border-rose-500/40 bg-rose-500/10'
    : 'border-amber-500/40 bg-amber-500/10';
  const corIcone = urgente ? 'text-rose-400' : 'text-amber-400';
  const corTitulo = urgente ? 'text-rose-200' : 'text-amber-200';
  const corTexto = urgente ? 'text-rose-300/80' : 'text-amber-300/80';
  const corItem = urgente ? 'text-rose-200/90' : 'text-amber-200/90';
  const corHover = urgente ? 'hover:bg-rose-500/10' : 'hover:bg-amber-500/10';

  function formatarTempo(minutos: number): string {
    if (minutos < 60) return `há ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (mins === 0) return `há ${horas}h`;
    return `há ${horas}h${mins}min`;
  }

  function ItemPendencia({ p }: { p: Pendencia }) {
    const ehLead = p.lead != null;
    const nome = ehLead ? p.lead!.nome : p.aluno!.nome;
    const curso = ehLead ? (p.lead!.curso ?? 'Experimental') : p.aula.curso_nome;
    return (
      <button
        type="button"
        onClick={() => onAbrirDrawer(p.aula)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
          corItem,
          corHover,
        )}
      >
        {ehLead ? (
          <User className="h-3 w-3 shrink-0 text-violet-400" />
        ) : (
          <Clock className="h-3 w-3 shrink-0 opacity-60" />
        )}
        <span className="font-mono text-[11px] opacity-70">{p.aula.hora_inicio}</span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {nome}
          {ehLead && <span className="ml-1 text-[9px] font-bold uppercase text-violet-400">lead</span>}
        </span>
        <span className="truncate text-[10px] opacity-60">{curso}</span>
        <span className="shrink-0 text-[10px] opacity-50">{formatarTempo(p.minutosDesdeFim)}</span>
        <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
      </button>
    );
  }

  function Secao({ titulo, itens }: { titulo: string; itens: Pendencia[] }) {
    if (itens.length === 0) return null;
    return (
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
          {titulo} ({itens.length})
        </p>
        <ul className="space-y-0.5">
          {itens.map((p) => (
            <li key={p.lead ? `lead-${p.lead.experimental_id}` : `${p.aula.chave}-${p.aluno!.aluno_id}`}>
              <ItemPendencia p={p} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Agrupa por unidade quando consolidado
  function SecaoComUnidade({ titulo, itens }: { titulo: string; itens: Pendencia[] }) {
    if (itens.length === 0) return null;
    const porUnidade = new Map<string, Pendencia[]>();
    for (const p of itens) {
      const unidade = p.aula.unidade_nome;
      if (!porUnidade.has(unidade)) porUnidade.set(unidade, []);
      porUnidade.get(unidade)!.push(p);
    }
    return (
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
          {titulo} ({itens.length})
        </p>
        {Array.from(porUnidade.entries()).map(([unidade, lista]) => (
          <div key={unidade} className="mb-2 last:mb-0">
            <p className="mb-0.5 text-[10px] font-semibold opacity-50">{unidade}</p>
            <ul className="space-y-0.5">
              {lista.map((p) => (
                <li key={p.lead ? `lead-${p.lead.experimental_id}` : `${p.aula.chave}-${p.aluno!.aluno_id}`}>
                  <ItemPendencia p={p} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl border p-4', corFundo)}>
      {/* Cabeçalho do alerta */}
      <div className="flex items-start gap-3">
        <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', corIcone)} />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold', corTitulo)}>
            {total} {total === 1 ? 'aluno sem destino' : 'alunos sem destino'}
            {' '}em aulas que já ocorreram
          </p>
          <p className={cn('mt-0.5 text-xs', corTexto)}>
            Ninguém registrou presença, falta ou justificativa. Esses alunos entram no lembrete
            de presenças diárias do grupo do WhatsApp.
          </p>
        </div>
      </div>

      {/* Lista de pendências — separada por hoje/ontem e por unidade */}
      <div className="mt-3 space-y-3">
        {consolidado ? (
          <>
            <SecaoComUnidade titulo="Hoje" itens={pendentesHoje} />
            <SecaoComUnidade titulo="Ontem" itens={pendentesOntem} />
          </>
        ) : (
          <>
            <Secao titulo="Hoje" itens={pendentesHoje} />
            <Secao titulo="Ontem" itens={pendentesOntem} />
          </>
        )}
      </div>
    </div>
  );
}

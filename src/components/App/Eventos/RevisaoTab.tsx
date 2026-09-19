import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  LayoutList,
  Music,
  Printer,
  Speaker,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatarDuracao,
  levantarPendencias,
  resumirEvento,
  type EntradaDaRevisao,
  type Pendencia,
} from '@/lib/eventos';
import {
  abrirParaImpressao,
  gerarFolhaDePalcoHtml,
  gerarProgramaHtml,
  type DadosDaImpressao,
} from '@/lib/eventosImpressao';
import { useGradeDoEvento, useAlunosDoEvento, type EventoComResumo } from '@/hooks/useEventos';

/**
 * Revisao + resumo — LAPE-39, fase 5.
 *
 * Responde "posso imprimir?" num lugar so. Os sinais ja existiam espalhados (o contador de
 * quem participa e esta fora da grade, o selo vermelho de conflito no bloco); aqui viram
 * uma lista ordenada por gravidade, cada item dizendo ONDE se resolve.
 *
 * ⚠️ A regra mora em `src/lib/eventos.ts`, nao aqui: a impressao (fase 6) vai fazer a mesma
 * pergunta antes de deixar imprimir, e duas implementacoes divergiriam no primeiro ajuste.
 */
export function RevisaoTab({
  evento,
  onIrPara,
}: {
  evento: EventoComResumo;
  onIrPara: (aba: 'alunos' | 'grade') => void;
}) {
  const { blocos, loading: carregandoGrade, erro: erroGrade } = useGradeDoEvento(evento.id);
  const {
    alunos,
    loading: carregandoAlunos,
    erro: erroAlunos,
  } = useAlunosDoEvento(evento.id, evento.unidade_id);

  const entrada = useMemo<EntradaDaRevisao>(
    () => ({
      evento: {
        horario_inicio: evento.horario_inicio,
        duracao_padrao_segundos: evento.duracao_padrao_segundos,
        intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
      },
      blocos: blocos.map((b) => ({
        id: b.id,
        nome: b.nome,
        ordem: b.ordem,
        horario_inicial: b.horario_inicial,
        inicio_manual: b.inicio_manual,
        apresentacoes: b.apresentacoes.map((a) => ({
          id: a.id,
          ordem: a.ordem,
          duracao_segundos: a.duracao_segundos,
          pessoa_chave: a.pessoa_chave,
          aluno_nome: a.aluno_nome,
          curso_nome: a.curso_nome,
          musica: a.musica,
        })),
      })),
      alunos: alunos.map((a) => ({
        pessoa_chave: a.pessoa_chave,
        nome: a.nome,
        status: a.status,
        cursos_no_recital: a.cursos_no_recital,
        cursos: a.cursos.map((c) => ({ curso_id: c.curso_id, curso_nome: c.curso_nome })),
        alocacoes: a.alocacoes.map((x) => ({ curso_id: x.curso_id })),
      })),
    }),
    [evento, blocos, alunos],
  );

  const pendencias = useMemo(() => levantarPendencias(entrada), [entrada]);
  const resumo = useMemo(() => resumirEvento(entrada), [entrada]);
  const impedimentos = pendencias.filter((p) => p.gravidade === 'impede');

  const dadosDaImpressao = useMemo<DadosDaImpressao>(
    () => ({
      evento: {
        titulo: evento.titulo,
        data_evento: evento.data_evento,
        local: evento.local,
        unidade_nome: evento.unidade_nome,
        horario_inicio: evento.horario_inicio,
        duracao_padrao_segundos: evento.duracao_padrao_segundos,
        intervalo_entre_blocos_segundos: evento.intervalo_entre_blocos_segundos ?? 2700,
      },
      blocos: blocos.map((b) => ({
        id: b.id,
        nome: b.nome,
        ordem: b.ordem,
        horario_inicial: b.horario_inicial,
        inicio_manual: b.inicio_manual,
        apresentacoes: b.apresentacoes.map((a) => ({
          id: a.id,
          ordem: a.ordem,
          duracao_segundos: a.duracao_segundos,
          aluno_nome: a.aluno_nome,
          curso_nome: a.curso_nome,
          professor_nome: a.professor_nome,
          musica: a.musica,
          tem_playback: a.tem_playback,
          observacao_mapa: a.observacao_mapa,
          itens: a.itens.map((i) => ({
            tipo: i.tipo,
            nome: i.nome,
            quantidade: i.quantidade,
          })),
        })),
      })),
    }),
    [evento, blocos],
  );

  const imprimir = (qual: 'programa' | 'palco') => {
    const html =
      qual === 'programa'
        ? gerarProgramaHtml(dadosDaImpressao)
        : gerarFolhaDePalcoHtml(dadosDaImpressao);
    if (!abrirParaImpressao(html)) {
      toast.error('O navegador bloqueou a janela. Permita pop-ups para este site e tente de novo.');
    }
  };

  const erro = erroGrade ?? erroAlunos;
  if (erro) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar a revisão: {erro}
      </p>
    );
  }

  const carregando = (carregandoGrade || carregandoAlunos) && blocos.length === 0;
  if (carregando) {
    return <p className="p-8 text-center text-sm text-slate-400">Carregando revisão…</p>;
  }


  return (
    <div className="space-y-4">
      {/* ── resumo ── */}
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao icone={<Users className="h-4 w-4" />} rotulo="Participantes" valor={resumo.participantes} />
        <Cartao icone={<Music className="h-4 w-4" />} rotulo="Apresentações" valor={resumo.apresentacoes} />
        <Cartao icone={<LayoutList className="h-4 w-4" />} rotulo="Blocos" valor={resumo.blocos} />
        <Cartao
          icone={<Clock className="h-4 w-4" />}
          rotulo="Duração prevista"
          valor={resumo.duracaoTotalSegundos > 0 ? formatarDuracao(resumo.duracaoTotalSegundos) : '—'}
          rodape={
            resumo.inicio && resumo.terminoPrevisto
              ? `${resumo.inicio} às ${resumo.terminoPrevisto}`
              : 'sem blocos na grade'
          }
        />
      </section>

      {/* ⚠️ A ressalva anda junto do número, nunca num tooltip: hora de término anunciada
          sem dizer de que ela depende vira promessa para os pais na porta do teatro. */}
      {resumo.semDuracaoPropria > 0 && resumo.apresentacoes > 0 && (
        <p className="text-[11.5px] text-slate-500">
          O término é estimativa:{' '}
          <strong className="text-slate-400">
            {resumo.semDuracaoPropria} de {resumo.apresentacoes}
          </strong>{' '}
          {resumo.semDuracaoPropria === 1 ? 'apresentação ainda usa' : 'apresentações ainda usam'} a
          duração padrão de {formatarDuracao(evento.duracao_padrao_segundos)}, em vez de uma
          duração medida.
        </p>
      )}

      {/* ── impressão ── */}
      <section className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </h3>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Dois documentos, dois públicos: a programação vai para a plateia, a folha de
              palco fica com a produção.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => imprimir('programa')}
              disabled={resumo.apresentacoes === 0}
            >
              <Printer className="h-3.5 w-3.5" />
              Programação
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => imprimir('palco')}
              disabled={resumo.apresentacoes === 0}
            >
              <Speaker className="h-3.5 w-3.5" />
              Folha de palco
            </Button>
          </div>
        </div>

        {/* ⚠️ Avisa, nunca BLOQUEIA. Imprimir uma prévia com pendência conhecida é uso
            legítimo — quem monta o recital precisa do papel na mão para conferir com os
            professores. Travar o botão obrigaria a resolver tudo antes de poder olhar. */}
        {impedimentos.length > 0 && resumo.apresentacoes > 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-[11.5px] text-rose-200/90">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-rose-400" />
            <span>
              {impedimentos.length === 1
                ? 'Há 1 pendência que sai errada no papel'
                : `Há ${impedimentos.length} pendências que saem erradas no papel`}{' '}
              — dá para imprimir assim mesmo, é prévia.
            </span>
          </p>
        )}
      </section>

      {/* ── pendências ── */}
      {pendencias.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-2 text-[13px] text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            Nada a apontar na grade.
          </p>
          {/* "Nada a apontar" ≠ "está tudo certo": a revisão só enxerga o que o sistema
              sabe. Dizer o contrário daria uma garantia que ninguém aqui pode dar. */}
          <p className="mt-1 pl-6 text-[11.5px] text-emerald-200/70">
            A revisão confere participação, alocação, música, horário e blocos vazios — não
            substitui conferir o ensaio e o repertório com os professores.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {pendencias.length} {pendencias.length === 1 ? 'pendência' : 'pendências'}
            </h3>
            {impedimentos.length > 0 && (
              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] text-rose-300">
                {impedimentos.length} {impedimentos.length === 1 ? 'impede' : 'impedem'} a impressão
              </span>
            )}
          </div>

          <div className="space-y-2">
            {pendencias.map((p) => (
              <CartaoPendencia key={p.tipo} pendencia={p} onIrPara={onIrPara} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Cartao({
  icone,
  rotulo,
  valor,
  rodape,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: number | string;
  rodape?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
        {icone}
        {rotulo}
      </p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums text-white">{valor}</p>
      {rodape && <p className="text-[11px] text-slate-500">{rodape}</p>}
    </div>
  );
}

function CartaoPendencia({
  pendencia,
  onIrPara,
}: {
  pendencia: Pendencia;
  onIrPara: (aba: 'alunos' | 'grade') => void;
}) {
  const impede = pendencia.gravidade === 'impede';
  // ⚠️ Estado é UM valor derivado da gravidade, não condições soltas: `cn()` usa twMerge e
  // a última classe conflitante vence — já pintou cartão contradizendo o próprio rótulo.
  const LIMITE_VISIVEL = 8;
  const visiveis = pendencia.itens.slice(0, LIMITE_VISIVEL);
  const ocultos = pendencia.itens.length - visiveis.length;

  return (
    <section
      className={cn(
        'rounded-xl border p-3',
        impede ? 'border-rose-500/40 bg-rose-500/5' : 'border-slate-700 bg-slate-800/40',
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle
          className={cn('mt-0.5 h-4 w-4 shrink-0', impede ? 'text-rose-400' : 'text-amber-400')}
        />
        <div className="min-w-0 flex-1">
          <p className={cn('text-[13px] font-medium', impede ? 'text-rose-200' : 'text-white')}>
            {pendencia.titulo}
          </p>
          <p className="mt-0.5 text-[12px] text-slate-400">{pendencia.detalhe}</p>
        </div>
        <button
          type="button"
          onClick={() => onIrPara(pendencia.onde)}
          className="flex shrink-0 items-center gap-1 rounded bg-slate-700/60 px-2 py-1 text-[11.5px] text-slate-200 transition-colors hover:bg-slate-700"
        >
          Resolver em {pendencia.onde === 'alunos' ? 'Alunos' : 'Grade'}
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <ul className="mt-2 space-y-0.5 pl-6">
        {visiveis.map((item) => (
          <li key={item} className="text-[12px] text-slate-300">
            {item}
          </li>
        ))}
        {ocultos > 0 && (
          // Corta a lista, mas nunca esconde o TAMANHO dela — o número já está no título.
          <li className="text-[11.5px] italic text-slate-500">
            e mais {ocultos} {ocultos === 1 ? 'caso' : 'casos'}
          </li>
        )}
      </ul>
    </section>
  );
}

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AulaAgenda, AlunoAgenda, PresencaEnvelopeAgenda } from '@/hooks/useAgendaDia';
import { montarFilaDaChamada, type PendenciaAula, type PendenciaProfessor } from '@/lib/chamadaFila';
import { alunoSemDestino } from '@/components/App/Agenda/Chamada/chamadaUtils';
import { useChamadaAcoes } from '@/components/App/Agenda/Chamada/useChamadaAcoes';
import { useProfessorPresenca } from '@/hooks/useProfessorPresenca';
import { LinhaPendencia } from './LinhaPendencia';
import { abreviarNome } from '@/lib/nomeExibicao.mjs';
import { cn } from '@/lib/utils';

/**
 * A Chamada no celular e uma FILA DO QUE FALTA, nao a tela do desktop menor.
 *
 * 🔴 Medido a 390px em 21/09, na tela do desktop: **65.558px de rolagem** (78
 * telas), **3.245px** ate a primeira aula de aluno (quatro telas so de cards
 * de professor), **584 botoes abaixo de 44px** e **59 nomes truncados**. Nada
 * disso e defeito do desktop — a 1440px aquilo e uma leitura confortavel do
 * dia. O que nao atravessa e a PERGUNTA: la ela e "como esta o dia inteiro",
 * e no balcao ela e "o que falta fechar".
 *
 * Por isso a filtragem aqui e de CONTEUDO, nao de layout: `montarFilaDaChamada`
 * devolve de 0 a algumas dezenas de linhas em vez de 158 aulas e 41
 * professores, e a lista ENCURTA enquanto se trabalha, ate esvaziar.
 *
 * ⚠️ Esta tela nao decide nada sobre presenca. "Esta fechada?" vem de
 * `chamadaCompleta`, "o professor foi marcado?" de
 * `adaptarPresencaProfessorCanonica`, e a escrita de `useChamadaAcoes` e
 * `useProfessorPresenca` — os mesmos do desktop.
 */

interface Props {
  aulas: AulaAgenda[];
  data: string;
  unidadeId: string | null;
  presenca: PresencaEnvelopeAgenda;
  /** Recarrega o dia: e o que faz a linha fechada SAIR da fila. */
  recarregar: () => void;
  /** Abre o detalhe completo da aula (o AgendaDrawer, casca de folha). */
  onAbrirAula: (aula: AulaAgenda) => void;
  /** Slot do cabecalho montado pela AgendaPage (seletor de visao). */
  seletorVisao?: ReactNode;
}

export function ChamadaMobile({
  aulas,
  data,
  unidadeId,
  presenca,
  recarregar,
  onAbrirAula,
  seletorVisao,
}: Props) {
  // `agora` entra no `useMemo` de proposito: a fila muda quando uma aula
  // termina, e reavaliar a cada render faria a lista pular sozinha no meio de
  // um toque.
  const fila = useMemo(
    () => montarFilaDaChamada(aulas, data, new Date(), presenca),
    [aulas, data, presenca],
  );

  return (
    <div className="flex flex-col">
      {/* O cabecalho e FIXO. Sem ele, numa fila que rola, some a unica coisa
          que diz de que dia se esta falando e quanto falta.
          ⚠️ `top-0` gruda no topo do CONTEUDO do <main>, nao do padding dele:
          sobravam 12px por onde as linhas passavam por cima. Margem negativa
          nao resolve (quando grudado, quem manda e o `top`) — quem cobre e o
          pseudo-elemento `before`. */}
      <div className="sticky top-0 z-20 -mx-3 flex flex-col gap-2 border-b border-slate-800 bg-slate-950 px-3 pb-2.5 pt-1 before:absolute before:inset-x-0 before:bottom-full before:h-3 before:bg-slate-950">
        {seletorVisao}
        <p className="text-[12px] leading-tight text-slate-400">
          {fila.total === 0 ? (
            <span className="font-medium text-emerald-300">Nada pendente</span>
          ) : (
            <>
              <span className="font-semibold text-slate-100">{fila.total}</span>
              {fila.total === 1 ? ' pendência' : ' pendências'}
              {fila.professores.length > 0 && fila.aulas.length > 0 ? (
                <span className="text-slate-500">
                  {` · ${fila.professores.length} professor${fila.professores.length > 1 ? 'es' : ''}, ${fila.aulas.length} aula${fila.aulas.length > 1 ? 's' : ''}`}
                </span>
              ) : null}
            </>
          )}
        </p>
      </div>

      {fila.total === 0 ? (
        <VazioConquista />
      ) : (
        <>
          {fila.professores.length > 0 && (
            <Bloco
              titulo="Professores sem marcar"
              qtd={fila.professores.length}
              aviso={
                unidadeId === null
                  ? 'No Consolidado dá para ver quem falta, mas não para marcar: a presença é registrada por unidade.'
                  : undefined
              }
            >
              {fila.professores.map((p) => (
                <LinhaProfessor
                  key={p.professorId}
                  pendencia={p}
                  data={data}
                  unidadeId={unidadeId}
                  recarregar={recarregar}
                />
              ))}
            </Bloco>
          )}

          {fila.aulas.length > 0 && (
            <Bloco titulo="Aulas sem chamada" qtd={fila.aulas.length}>
              {fila.aulas.map((p) => (
                <LinhaAulaPendente
                  key={p.aula.chave}
                  pendencia={p}
                  data={data}
                  recarregar={recarregar}
                  onAbrirAula={onAbrirAula}
                />
              ))}
            </Bloco>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A fila vazia e o OBJETIVO do recorte, nao uma tela que nao carregou — por
 * isso e verde e afirmativa. Um "nenhum resultado" cinza aqui faria a pessoa
 * achar que quebrou justamente no momento em que ela terminou o trabalho.
 */
function VazioConquista() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <CheckCircle2 className="h-9 w-9 text-emerald-400" />
      <p className="text-[15px] font-semibold text-emerald-300">Tudo fechado neste dia</p>
      <p className="max-w-[260px] text-[12px] leading-snug text-slate-400">
        Nenhum professor sem marcação e nenhuma aula terminada esperando chamada.
      </p>
    </div>
  );
}

function Bloco({
  titulo,
  qtd,
  aviso,
  children,
}: {
  titulo: string;
  qtd: number;
  /** Condicao que vale para o BLOCO inteiro — dita uma vez, no cabecalho. */
  aviso?: string;
  children: ReactNode;
}) {
  return (
    <section className="pt-3">
      <h2 className="px-0.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {titulo} <span className="text-slate-400">({qtd})</span>
      </h2>
      {/* 🔴 O aviso mora AQUI, nao na linha. Medido a 390px: repetido nas 5
          linhas de professor do Consolidado, ele ocupava a primeira tela
          inteira e empurrava as 29 aulas para fora — cinco copias da mesma
          frase. E a mesma licao do `opacity-50` na Agenda: sinal que acende em
          todas as linhas deixa de ser sinal e vira fundo. */}
      {aviso ? (
        <p className="mb-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-200/90">
          {aviso}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/**
 * ⚠️ Um componente por professor porque o hook de escrita e por professor —
 * chamar `useProfessorPresenca` num laco quebraria a regra dos hooks.
 */
function LinhaProfessor({
  pendencia,
  data,
  unidadeId,
  recarregar,
}: {
  pendencia: PendenciaProfessor;
  data: string;
  unidadeId: string | null;
  recarregar: () => void;
}) {
  const { salvando, marcarDia } = useProfessorPresenca({
    professorId: pendencia.professorId,
    professorNome: pendencia.nome,
    data,
    // ⚠️ No Consolidado nao existe unidade, e a lib recusa o pedido com
    // "Usuario, unidade e data obrigatorios" — o mesmo que o desktop faz hoje.
    // Aqui o botao e escondido antes disso: prometer um comando que sempre
    // falha e pior do que nao oferece-lo.
    unidadeId: unidadeId ?? '',
    onMudou: recarregar,
  });

  const horas = `${pendencia.primeiraHora.slice(0, 5)}–${pendencia.ultimaHora.slice(0, 5)}`;
  const detalhe = `${horas} · ${pendencia.qtdAulas} aula${pendencia.qtdAulas > 1 ? 's' : ''}`;

  // Sem unidade, a linha vira LEITURA: diz quem esta sem marcacao e nao
  // oferece um comando que a lib recusaria. O porque e dito uma vez, no
  // cabecalho do bloco — nao em cada linha.
  if (unidadeId === null) {
    return (
      <LinhaPendencia
        titulo={pendencia.nome}
        detalhe={detalhe}
        tom="professor"
        salvando={false}
        onPresente={() => {}}
        onAusente={() => {}}
        acaoComposta={<></>}
      />
    );
  }

  return (
    <LinhaPendencia
      titulo={pendencia.nome}
      detalhe={detalhe}
      tom="professor"
      salvando={salvando}
      onPresente={() => marcarDia(true)}
      onAusente={() => marcarDia(false)}
    />
  );
}

function LinhaAulaPendente({
  pendencia,
  data,
  recarregar,
  onAbrirAula,
}: {
  pendencia: PendenciaAula;
  data: string;
  recarregar: () => void;
  onAbrirAula: (aula: AulaAgenda) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const { salvando, registrar } = useChamadaAcoes(recarregar);
  const aula = pendencia.aula;

  // Quem ainda nao tem destino NESTA aula. A regra e `alunoSemDestino`, a
  // mesma que o desktop usa — nao uma releitura de `status_presenca`.
  const agora = new Date();
  const pendentes = aula.alunos.filter(
    (a) => a.aluno_id != null && alunoSemDestino(aula, a, data, agora),
  );

  const marcar = (alunos: AlunoAgenda[], status: 'presente' | 'falta') => {
    void registrar(
      alunos
        .filter((a) => a.aluno_id != null)
        .map((a) => ({
          aula_emusys_id: a.aula_emusys_id,
          aluno_id: a.aluno_id as number,
          status,
        })),
    );
  };

  const titulo = `${aula.hora_inicio.slice(0, 5)} · ${aula.curso_nome ?? 'sem curso'}`;
  // ⚠️ O professor entra ABREVIADO e a sala inteira. Medido a 390px: a linha
  // tem 339px de texto util e "Pedro Sérgio Figueiredo da Glória · Sala 7
  // Cordas" pede 453 — 7 das 20 linhas cortavam, e o que sumia era sempre a
  // SALA, que e justamente o que diz para onde ir. Quem precisa do nome
  // inteiro abre a aula. `abreviarNome` ja existe e pula conectivos, senao
  // "Ana de Souza" viraria "Ana de".
  const detalhe = [
    aula.professor_nome ? abreviarNome(aula.professor_nome, 2) : null,
    aula.sala_nome,
  ].filter(Boolean).join(' · ') || 'sem professor';

  // Aula sem nenhum aluno vinculado nao tem chamada a fazer — o que ela pede e
  // que alguem olhe. Oferecer Presente/Falta aqui seria um comando sem alvo.
  if (pendentes.length === 0) {
    return (
      <LinhaPendencia
        titulo={titulo}
        detalhe={`${detalhe} — sem aluno vinculado`}
        tom="aula"
        salvando={false}
        onPresente={() => {}}
        onAusente={() => {}}
        acaoComposta={
          <button
            type="button"
            onClick={() => onAbrirAula(aula)}
            className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-slate-700 bg-slate-800/50 text-[13px] font-medium text-slate-300 active:bg-slate-700/60"
          >
            Abrir a aula
          </button>
        }
      />
    );
  }

  // Um aluno so: o par de botoes resolve na propria linha, sem abrir nada.
  //
  // ⚠️ Aqui o ALUNO sobe para o titulo e o curso desce para o detalhe. Com a
  // ordem natural (`curso` em cima, `professor · sala · aluno` embaixo) o nome
  // do aluno ficava no fim da linha mais longa e era o primeiro a ser cortado
  // — medido: 3 linhas truncando por 5 a 14px, todas no nome dele. E ele e o
  // ALVO da marcacao: cortar o curso custa contexto, cortar o aluno custa
  // saber em quem se esta clicando.
  if (pendentes.length === 1) {
    return (
      <LinhaPendencia
        titulo={`${aula.hora_inicio.slice(0, 5)} · ${pendentes[0].nome}`}
        detalhe={[aula.curso_nome, detalhe].filter(Boolean).join(' · ')}
        tom="aula"
        salvando={salvando}
        onPresente={() => marcar(pendentes, 'presente')}
        onAusente={() => marcar(pendentes, 'falta')}
        rotuloAusente="Falta"
      />
    );
  }

  // Turma: cada aluno tem um destino proprio, entao um par de botoes na linha
  // mentiria. A linha expande em vez de abrir outra tela — trocar de tela no
  // meio de uma fila faz perder o lugar.
  return (
    <LinhaPendencia
      titulo={titulo}
      detalhe={`${detalhe} · ${pendentes.length} alunos`}
      tom="aula"
      salvando={salvando}
      onPresente={() => {}}
      onAusente={() => {}}
      acaoComposta={
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setAberta((v) => !v)}
            aria-expanded={aberta}
            className="flex min-h-[44px] w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-3 text-[13px] font-medium text-slate-200 active:bg-slate-700/60"
          >
            <span>{aberta ? 'Fechar a turma' : `Abrir a turma · ${pendentes.length} alunos`}</span>
            {aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {aberta && (
            <>
              {pendentes.map((aluno) => (
                <div key={aluno.aluno_id} className="flex items-center gap-2 border-t border-slate-800/60 pt-1.5">
                  <p className="min-w-0 flex-1 truncate text-[12px] text-slate-300">{aluno.nome}</p>
                  <button
                    type="button"
                    onClick={() => marcar([aluno], 'presente')}
                    disabled={salvando}
                    className="min-h-[44px] rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-300 active:bg-emerald-500/25 disabled:opacity-50"
                  >
                    Presente
                  </button>
                  <button
                    type="button"
                    onClick={() => marcar([aluno], 'falta')}
                    disabled={salvando}
                    className="min-h-[44px] rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 text-[12px] font-semibold text-rose-300 active:bg-rose-500/25 disabled:opacity-50"
                  >
                    Falta
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => marcar(pendentes, 'presente')}
                disabled={salvando}
                className={cn(
                  'min-h-[44px] rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-[12px] font-semibold text-emerald-300/90',
                  'active:bg-emerald-500/20 disabled:opacity-50',
                )}
              >
                Todos presentes ({pendentes.length})
              </button>
            </>
          )}
        </div>
      }
    />
  );
}

export default ChamadaMobile;

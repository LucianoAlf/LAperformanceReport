import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Users, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { abreviarNome } from '@/lib/nomeExibicao.mjs';
import { diaDeHojeNaGrade, textoOcupacaoTurma } from '@/lib/turmas';
import {
  DIAS_DA_GRADE,
  gradeDoDia,
  horaDaTurma,
  pesoDaHora,
  professoresNaGrade,
  resumoPorDia,
  turmasForaDaGrade,
  type TurmaNaGrade,
} from '@/lib/gradeHoraria';
import { FolhaMobile } from '@/mobile/FolhaMobile';

/**
 * A Grade Horária em tela de telefone.
 *
 * 🔴 A matriz não atravessa, e não é questão de encolher. Medido a 390px na
 * tela do computador: a tabela tem **1171px** (`min-w-[800px]` mais as seis
 * colunas de dia a 187px), ou seja **30% dela cabe na tela** — as outras
 * quatro colunas ficam atrás de uma rolagem lateral que ninguém descobre
 * sozinho. São **34,4 telas** de rolagem vertical e 10 alvos abaixo de 44px,
 * o menor com 20px.
 *
 * Lá o eixo horizontal é POSIÇÃO: os seis dias lado a lado é o que permite
 * comparar terça com quinta de relance. Num aparelho de 390px sobram ~203px
 * para a semana inteira, então essa comparação simplesmente não existe — o
 * que se ganharia empilhando seria uma matriz ilegível em vez de uma matriz
 * cortada.
 *
 * Aqui o dia vira ESCOLHA (um chip) e a hora vira ORDEM (um bloco). O dia
 * inteiro cabe em ~1,5 tela porque a hora é um sumário: ela diz quantas
 * turmas e quantos alunos tem, e abre no toque. Medido no banco em 22/09: são
 * 130 a 172 turmas por dia — listar todas de uma vez daria 11 telas, e ler
 * 150 linhas em sequência não é a pergunta de quem abre a grade.
 *
 * ⚠️ Não há arrastar-e-soltar. O gesto não atravessa para o dedo — e, medido
 * no banco, ele também não funciona no computador: a confirmação escreve em
 * `turmas`, que tem ZERO linhas (a tabela real é `turmas_explicitas`), então
 * a turma volta para o lugar sem nenhum erro. Prometer o gesto aqui seria
 * copiar a promessa falsa.
 */

interface Props {
  turmas: TurmaNaGrade[];
  onAbrirTurma: (turma: TurmaNaGrade) => void;
  /** A chave estável de cada turma — quem chama já a possui. */
  chaveDe: (turma: TurmaNaGrade) => string;
}

export function GradeMobile({ turmas, onAbrirTurma, chaveDe }: Props) {
  // Domingo devolve '' e a escola não abre; cai na segunda, que é o começo da
  // grade, em vez de numa tela vazia sem explicação.
  const [dia, setDia] = useState(() => diaDeHojeNaGrade() || DIAS_DA_GRADE[0].valor);
  const [professorId, setProfessorId] = useState<number | null>(null);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [horasAbertas, setHorasAbertas] = useState<ReadonlySet<string>>(() => {
    // A hora corrente já vem aberta quando o dia mostrado é hoje: é a
    // pergunta de quem abre a grade no balcão.
    if (!diaDeHojeNaGrade()) return new Set();
    const agora = new Date();
    return new Set([`${String(agora.getHours()).padStart(2, '0')}:00`]);
  });

  const recortadas = useMemo(
    () => (professorId == null ? turmas : turmas.filter((t) => t.professor_id === professorId)),
    [turmas, professorId],
  );

  const resumos = useMemo(() => resumoPorDia(recortadas), [recortadas]);
  const grade = useMemo(() => gradeDoDia(recortadas, dia), [recortadas, dia]);
  const professores = useMemo(() => professoresNaGrade(turmas), [turmas]);
  const fora = useMemo(() => turmasForaDaGrade(turmas), [turmas]);

  const pico = useMemo(
    () => grade.blocos.reduce((maior, b) => Math.max(maior, b.turmas.length), 0),
    [grade],
  );

  const professorEscolhido = professores.find((p) => p.id === professorId);

  function alternarHora(hora: string) {
    setHorasAbertas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(hora)) proxima.delete(hora);
      else proxima.add(hora);
      return proxima;
    });
  }

  return (
    <div>
      {/* ⚠️ O cabeçalho NÃO gruda, e a tentativa foi medida antes de sair.
          A `<section>` que envolve as abas em `AlunosPage` tem
          `overflow-hidden` (ela existe para o `rounded-xl` cortar os cantos);
          um ancestral com overflow escondido vira o container de rolagem do
          `sticky`, e como ele não rola, o elemento grudado sai de vista junto
          com o conteúdo — `position: sticky` ali é uma declaração que não faz
          nada. Trocar aquele overflow consertaria, e também faria o cabeçalho
          de dia da aba Turmas (que tem `-mx-3`) vazar para fora da borda do
          cartão. Com 2,7 telas de rolagem, o cabeçalho rolando junto custa
          pouco; mexer no container compartilhado custaria a aba do lado.
          ⚠️ Pelo mesmo motivo nada aqui usa margem negativa: o que sangra
          além da `<section>` é cortado em silêncio. */}
      <div className="border-b border-slate-800 px-3 pt-3">
        <div className="flex items-baseline justify-between gap-2 pb-2">
          <h2 className="text-[15px] font-semibold text-slate-100">Grade horária</h2>
          <span className="text-[11px] tabular-nums text-slate-500">
            {grade.totalTurmas} turmas · {grade.totalAlunos} alunos
          </span>
        </div>

        {/* Trilho de dias. A contagem vai no chip porque escolher o dia sem
            saber se ele tem aula é escolher às cegas. */}
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-2" style={{ scrollbarWidth: 'none' }}>
          {resumos.map((r) => (
            <button
              key={r.dia}
              type="button"
              onClick={() => setDia(r.dia)}
              aria-pressed={r.dia === dia}
              className={cn(
                'flex min-h-[44px] flex-none items-center gap-1.5 rounded-full border px-3 text-[12.5px]',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
                r.dia === dia
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-700 bg-slate-900 text-slate-300',
              )}
            >
              <span className="font-medium">{r.curto}</span>
              <span className="tabular-nums text-slate-500">{r.totalTurmas}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            onClick={() => setFiltroAberto(true)}
            className={cn(
              'flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-[12.5px]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
              professorId != null
                ? 'border-violet-500/60 bg-violet-500/15 text-violet-200'
                : 'border-slate-700 bg-slate-900 text-slate-300',
            )}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="max-w-[170px] truncate">
              {professorEscolhido ? abreviarNome(professorEscolhido.nome) : 'Professor'}
            </span>
          </button>

          {professorId != null && (
            <button
              type="button"
              onClick={() => setProfessorId(null)}
              className="flex min-h-[44px] items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-3 text-[12.5px] text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Ver todos
            </button>
          )}
        </div>
      </div>

      {/* ⚠️ Dado de retorno, nunca `console.log`: foi um aviso perdido no
          console que escondeu por anos as 135 turmas de dia por extenso. */}
      {fora.length > 0 && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <span>
            {fora.length} {fora.length === 1 ? 'turma está' : 'turmas estão'} fora da grade de 08h
            às 20h e não {fora.length === 1 ? 'aparece' : 'aparecem'} aqui.
          </span>
        </div>
      )}

      <div className="px-3 pt-1">
        {grade.totalTurmas === 0 ? (
          <p className="py-10 text-center text-[13px] text-slate-500">
            {professorEscolhido
              ? `${abreviarNome(professorEscolhido.nome)} não tem turma na ${dia.toLowerCase()}.`
              : `Nenhuma turma na ${dia.toLowerCase()}.`}
          </p>
        ) : (
          grade.blocos.map((bloco) => {
            const vazio = bloco.turmas.length === 0;
            const aberta = horasAbertas.has(bloco.hora);

            if (vazio) {
              // Hora livre continua na lista — é o buraco que a coordenação
              // procura. Sem alvo de toque: não há o que abrir.
              return (
                <div
                  key={bloco.hora}
                  className="flex items-center gap-3 border-b border-slate-800/60 py-2 text-[12px] text-slate-600"
                >
                  <span className="w-[42px] flex-none tabular-nums">{bloco.hora}</span>
                  <span>livre</span>
                </div>
              );
            }

            return (
              <div key={bloco.hora}>
                <button
                  type="button"
                  onClick={() => alternarHora(bloco.hora)}
                  aria-expanded={aberta}
                  className="flex min-h-[44px] w-full items-center gap-2.5 border-b border-slate-800/60 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <span className="w-[42px] flex-none text-[13px] font-semibold tabular-nums text-slate-200">
                    {bloco.hora}
                  </span>

                  {/* A barra mede contra o PICO DO DIA: sábado tem metade das
                      horas de uma terça, e uma régua fixa o pintaria de frio
                      mesmo lotado para o que é. */}
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <span
                      className="block h-full rounded-full bg-cyan-500/70"
                      style={{ width: `${Math.round(pesoDaHora(bloco.turmas.length, pico) * 100)}%` }}
                    />
                  </span>

                  <span className="flex-none text-[12px] tabular-nums text-slate-400">
                    {bloco.turmas.length} · {bloco.totalAlunos}
                  </span>

                  {aberta ? (
                    <ChevronDown className="h-4 w-4 flex-none text-slate-500" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-none text-slate-500" aria-hidden="true" />
                  )}
                </button>

                {aberta && (
                  <ul className="border-b border-slate-800/60 bg-slate-900/40">
                    {bloco.turmas.map((turma) => (
                      <li key={chaveDe(turma)}>
                        <LinhaDaGrade turma={turma} onAbrir={onAbrirTurma} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      <FolhaMobile
        aberto={filtroAberto}
        onFechar={() => setFiltroAberto(false)}
        titulo="Professor"
        subtitulo="Quem está na grade"
      >
        <ul className="pb-2">
          <li>
            <button
              type="button"
              onClick={() => {
                setProfessorId(null);
                setFiltroAberto(false);
              }}
              className="flex min-h-[48px] w-full items-center justify-between border-b border-slate-800 px-1 text-left text-[14px] text-slate-200"
            >
              Todos os professores
              <span className="text-[12px] tabular-nums text-slate-500">{turmas.length}</span>
            </button>
          </li>
          {professores.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setProfessorId(p.id);
                  setFiltroAberto(false);
                }}
                className={cn(
                  'flex min-h-[48px] w-full items-center justify-between gap-3 border-b border-slate-800 px-1 text-left text-[14px]',
                  p.id === professorId ? 'text-cyan-300' : 'text-slate-200',
                )}
              >
                <span className="truncate">{p.nome}</span>
                <span className="flex-none text-[12px] tabular-nums text-slate-500">{p.turmas}</span>
              </button>
            </li>
          ))}
        </ul>
      </FolhaMobile>
    </div>
  );
}

/**
 * Uma turma dentro do bloco da hora.
 *
 * ⚠️ A hora NÃO se repete na linha: ela já é o cabeçalho do bloco. Repeti-la
 * custaria os 42px que fazem o nome do curso caber — foi o que truncava 106
 * das linhas na aba Turmas.
 */
function LinhaDaGrade({
  turma,
  onAbrir,
}: {
  turma: TurmaNaGrade;
  onAbrir: (turma: TurmaNaGrade) => void;
}) {
  const semAluno = (turma.num_alunos ?? 0) === 0;
  const onde = [abreviarNome(turma.professor_nome), turma.sala_nome || 'sem sala']
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={() => onAbrir(turma)}
      className={cn(
        'flex min-h-[44px] w-full items-center gap-2.5 border-l-[3px] py-2 pl-2.5 pr-1 text-left',
        'active:bg-slate-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400',
        // Cor só para a turma SEM nenhum aluno — vínculo faltando. "Um aluno"
        // é a norma da casa (83,2% das 895 turmas) e pintá-lo faria o alerta
        // virar fundo de tela.
        semAluno ? 'border-l-amber-500/70' : 'border-l-transparent',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight text-slate-100">
          {turma.curso_nome || 'sem curso'}
        </p>
        <p className="truncate text-[11px] leading-tight text-slate-500">{onde}</p>
      </div>

      <span
        className={cn(
          'flex-none text-[12px] font-semibold tabular-nums',
          semAluno ? 'text-amber-400' : 'text-slate-300',
        )}
        title={textoOcupacaoTurma(turma.num_alunos, turma.capacidade_maxima)}
      >
        {textoOcupacaoTurma(turma.num_alunos, turma.capacidade_maxima).split(' ')[0]}
      </span>

      <ChevronRight className="h-4 w-4 flex-none text-slate-600" aria-hidden="true" />
    </button>
  );
}

export { horaDaTurma };
export default GradeMobile;

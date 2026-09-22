import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Lightbulb } from 'lucide-react';

import { cn } from '@/lib/utils';
import { abreviarNome } from '@/lib/nomeExibicao.mjs';
import {
  DIAS_DISTRIBUICAO,
  avisosDoMapaDeCalor,
  estatisticasPorCurso,
  estatisticasPorDia,
  estatisticasPorHorario,
  estatisticasPorProfessor,
  horariosDoDia,
  montarMapaDeCalor,
  nivelDoCalor,
  type NivelCalor,
  type TurmaParaDistribuicao,
} from '@/lib/distribuicaoTurmas';

/**
 * A aba Distribuição em tela de telefone.
 *
 * No computador são cinco painéis lado a lado, com grades de até seis colunas
 * e um mapa de calor de 14 linhas × 6 dias. A 390px, 18 caixas passavam a
 * rolar de lado — e barra lateral dentro de painel é o gesto que ninguém
 * descobre.
 *
 * Aqui cada leitura vira **barra horizontal**, que é a forma que cabe numa
 * tela estreita sem perder a comparação: o comprimento responde "quem tem
 * mais" com o olho, e o rótulo fica na mesma linha.
 *
 * O mapa de calor continua sendo uma matriz — ele É a resposta sobre encaixe
 * de horário —, mas com 6 colunas de ~52px, que cabem, e a hora à esquerda.
 *
 * ⚠️ Nenhuma conta nasce aqui: as cinco agregações e os avisos moram em
 * `@/lib/distribuicaoTurmas`, os mesmos que o computador lê.
 */

const RECORTES = [
  { id: 'dias', label: 'Dias' },
  { id: 'horarios', label: 'Horários' },
  { id: 'cursos', label: 'Cursos' },
  { id: 'professores', label: 'Professores' },
  { id: 'mapa', label: 'Mapa' },
] as const;

type RecorteId = (typeof RECORTES)[number]['id'];

const CORES_CALOR: Record<NivelCalor, string> = {
  vazio: 'bg-slate-800/50 text-slate-700',
  baixo: 'bg-blue-900/60 text-blue-300',
  medio: 'bg-cyan-800/60 text-cyan-300',
  alto: 'bg-amber-700/60 text-amber-300',
  pico: 'bg-orange-600/70 text-orange-100',
};

interface Props {
  turmas: TurmaParaDistribuicao[];
  professores: Array<{ id: number; nome: string }>;
}

export function DistribuicaoMobile({ turmas, professores }: Props) {
  const [recorte, setRecorte] = useState<RecorteId>('dias');

  const porDia = useMemo(() => estatisticasPorDia(turmas), [turmas]);
  const porHorario = useMemo(() => estatisticasPorHorario(turmas), [turmas]);
  const porCurso = useMemo(() => estatisticasPorCurso(turmas), [turmas]);
  const porProfessor = useMemo(() => estatisticasPorProfessor(turmas, professores), [turmas, professores]);
  const calor = useMemo(() => montarMapaDeCalor(turmas), [turmas]);
  const avisos = useMemo(() => avisosDoMapaDeCalor(calor), [calor]);

  return (
    <div className="space-y-3 p-3">
      <div
        role="group"
        aria-label="O que comparar"
        className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]"
      >
        {RECORTES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRecorte(r.id)}
            aria-pressed={recorte === r.id}
            className={cn(
              'min-h-[36px] flex-none whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium',
              recorte === r.id
                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-700 bg-slate-800/50 text-slate-400',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {avisos.length > 0 && recorte === 'mapa' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            <Lightbulb className="h-3 w-3" aria-hidden="true" />
            O que o mapa mostra
          </p>
          <ul className="space-y-0.5">
            {avisos.map((aviso) => (
              <li key={aviso} className="text-[12px] leading-relaxed text-amber-100/90">
                {aviso}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recorte === 'dias' && (
        <Barras
          titulo="Alunos por dia da semana"
          itens={porDia.map((d) => ({
            chave: d.dia,
            rotulo: d.dia,
            valor: d.totalAlunos,
            nota: `${d.totalTurmas} ${d.totalTurmas === 1 ? 'turma' : 'turmas'}`,
          }))}
        />
      )}

      {recorte === 'horarios' && (
        <Barras
          titulo="Alunos por horário"
          itens={porHorario.map((h) => ({
            chave: h.horario,
            rotulo: h.horario,
            valor: h.totalAlunos,
            nota: `${h.totalTurmas} ${h.totalTurmas === 1 ? 'turma' : 'turmas'}`,
          }))}
        />
      )}

      {recorte === 'cursos' && (
        <Barras
          titulo="Alunos por curso"
          itens={porCurso.map((c) => ({
            chave: c.nome,
            rotulo: c.nome,
            valor: c.totalAlunos,
            nota: `${c.totalTurmas} ${c.totalTurmas === 1 ? 'turma' : 'turmas'}`,
          }))}
        />
      )}

      {recorte === 'professores' && (
        <Barras
          titulo="Alunos por professor"
          // ⚠️ Nome abreviado: por extenso ele ocupa a linha inteira e empurra
          // a barra — que é o que se compara — para fora da tela.
          itens={porProfessor.map((p) => ({
            chave: String(p.id),
            rotulo: abreviarNome(p.nome),
            valor: p.totalAlunos,
            nota: p.totalTurmas > 0
              ? `${p.totalTurmas} ${p.totalTurmas === 1 ? 'turma' : 'turmas'}`
              : 'sem turma',
          }))}
        />
      )}

      {recorte === 'mapa' && <MapaCalor calor={calor} />}
    </div>
  );
}

interface ItemBarra {
  chave: string;
  rotulo: string;
  valor: number;
  nota?: string;
}

/**
 * Barras horizontais.
 *
 * A grade de cartões do computador compara pela POSIÇÃO; aqui a comparação é
 * pelo comprimento, que sobrevive à tela estreita. A escala é o maior valor
 * do conjunto — e ele é dito no cabeçalho, senão a barra cheia poderia ser
 * lida como "100%".
 */
function Barras({ titulo, itens }: { titulo: string; itens: ItemBarra[] }) {
  const maior = Math.max(...itens.map((i) => i.valor), 1);
  const total = itens.reduce((soma, i) => soma + i.valor, 0);

  if (itens.length === 0) {
    return <p className="px-1 text-[12px] text-slate-500">Nada para comparar neste recorte.</p>;
  }

  return (
    <section>
      <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
        <span className="ml-1.5 font-normal normal-case text-slate-600">
          {total} no total · maior barra = {maior}
        </span>
      </h3>

      {/* 🔴 O rotulo fica ACIMA da barra, nao ao lado dela.
          Medido a 390px com rotulo lateral de 92px: 9 nomes truncavam em
          Professores e 4 em Cursos — e "Musicalizacao Infantil" e
          "Musicalizacao Preparatoria" viravam o MESMO texto cortado, que e
          pior que nao mostrar: duas barras diferentes com o mesmo nome. */}
      <div className="mt-2 space-y-2">
        {itens.map((item) => (
          <div key={item.chave}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-200" title={item.rotulo}>
                {item.rotulo}
              </span>
              <span className="flex-none text-[12px] font-semibold tabular-nums text-slate-300">
                {item.valor}
                {item.nota && <span className="ml-1.5 font-normal text-[10px] text-slate-600">{item.nota}</span>}
              </span>
            </div>
            <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-800/60">
              <div
                className="h-full rounded-full bg-cyan-500/60"
                style={{ width: `${Math.max((item.valor / maior) * 100, item.valor > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

    </section>
  );
}

function MapaCalor({ calor }: { calor: ReturnType<typeof montarMapaDeCalor> }) {
  // Todas as horas que aparecem em algum dia, para a matriz ter linhas fixas.
  const horas = [...new Set(DIAS_DISTRIBUICAO.flatMap((d) => [...horariosDoDia(d)]))].sort();

  return (
    <section>
      <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Dia × horário
        <span className="ml-1.5 font-normal normal-case text-slate-600">pico de {calor.maxAlunos} alunos</span>
      </h3>

      {calor.foraDaGrade.length > 0 && (
        // ⚠️ Antes isto era um `console.log` dentro do componente: turma em
        // horário fora da grade sumia do mapa sem ninguém saber.
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-100">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" aria-hidden="true" />
          <span>
            {calor.foraDaGrade.length}{' '}
            {calor.foraDaGrade.length === 1 ? 'turma está fora' : 'turmas estão fora'} da grade de horários
            (
            {[...new Set(calor.foraDaGrade.map((t) => `${t.dia} ${t.horario}`))].slice(0, 3).join(', ')}
            ) e não entram neste mapa.
          </span>
        </p>
      )}

      <div className="mt-2">
        <div className="grid grid-cols-[30px_repeat(6,1fr)] gap-0.5">
          <span aria-hidden="true" />
          {DIAS_DISTRIBUICAO.map((dia) => (
            <span key={dia} className="text-center text-[9.5px] font-medium text-slate-500">
              {dia.slice(0, 3)}
            </span>
          ))}

          {horas.map((hora) => (
            <Linha key={hora} hora={hora} calor={calor} />
          ))}
        </div>

        <div className="mt-2 flex items-center gap-1.5 px-1">
          <span className="text-[10px] text-slate-600">vazio</span>
          {(['vazio', 'baixo', 'medio', 'alto', 'pico'] as NivelCalor[]).map((n) => (
            <span key={n} className={cn('h-3 w-5 rounded-sm', CORES_CALOR[n])} aria-hidden="true" />
          ))}
          <span className="text-[10px] text-slate-600">pico</span>
        </div>
      </div>
    </section>
  );
}

function Linha({ hora, calor }: { hora: string; calor: ReturnType<typeof montarMapaDeCalor> }): ReactNode {
  return (
    <>
      <span className="flex items-center text-[9.5px] tabular-nums text-slate-500">{hora}</span>
      {DIAS_DISTRIBUICAO.map((dia) => {
        const celula = calor.mapa[dia]?.[hora];
        if (!celula) {
          // Sábado não tem 17h–21h: a célula não existe, e um zero ali diria
          // "está vazio" sobre um horário em que a escola nem abre.
          return (
            <span
              key={dia}
              className="flex h-6 items-center justify-center rounded-sm bg-slate-900/40 text-[9px] text-slate-700"
              title={`${dia} não tem ${hora}`}
            >
              —
            </span>
          );
        }
        const nivel = nivelDoCalor(celula.alunos, calor.maxAlunos);
        return (
          <span
            key={dia}
            title={`${dia} ${hora}: ${celula.alunos} alunos em ${celula.turmas} turma(s)`}
            className={cn(
              'flex h-6 items-center justify-center rounded-sm text-[10px] tabular-nums',
              CORES_CALOR[nivel],
            )}
          >
            {celula.alunos || ''}
          </span>
        );
      })}
    </>
  );
}

export default DistribuicaoMobile;

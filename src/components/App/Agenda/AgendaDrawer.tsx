import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlunoAgenda, AulaAgenda } from '@/hooks/useAgendaDia';
import { aulaJaOcorreu, formatarDataCalculo, riscoDesatualizado } from '@/lib/agenda';

function corRisco(v: number): string {
  if (v >= 60) return 'text-rose-400';
  if (v >= 30) return 'text-amber-400';
  return 'text-emerald-400';
}

// Nota vem de `pesquisas_whatsapp` (escala 1-5), mas o dado pode chegar fora
// da faixa (registro manual/legado) — clampar antes de repetir string evita
// RangeError em `String.prototype.repeat` com valor negativo.
function notaClampada(nota: number): number {
  return Math.min(5, Math.max(0, Math.round(nota)));
}

/**
 * Painel de detalhe da aula selecionada.
 *
 * ⚠️ So e montado quando HA aula selecionada — quem decide e a AgendaPage.
 * Antes ele ocupava 296px permanentes para dizer "selecione uma aula"; numa
 * grade que rola na horizontal, largura e o recurso escasso, e devolver esses
 * 296px e o que mais empurra o ponto de rolagem para longe.
 */
export function AgendaDrawer({
  aula,
  data,
  onFechar,
  mostrarUnidade = false,
}: {
  aula: AulaAgenda;
  // Dia exibido ('yyyy-MM-dd'), para saber se a aula ja aconteceu — o que
  // decide se `professor_presenca` pode ser mostrado (ver aulaJaOcorreu).
  data: string;
  onFechar: () => void;
  // Na agenda consolidada o painel tambem precisa dizer de qual escola e a
  // aula: o rotulo do trilho pode ter ficado fora da viewport apos rolagem
  // horizontal. Com unidade selecionada, repetir seria ruido.
  mostrarUnidade?: boolean;
}) {
  // A ordem de `alunos` vem de jsonb_agg(distinct ...), que e arbitraria —
  // com 2+ alunos, alunos[0] e um aluno QUALQUER da turma. Tratar esse como
  // "o" aluno poria o nome dele no titulo e so os dados dele no bloco
  // individual, contradizendo a lista da turma logo abaixo. Por isso o
  // enriquecimento individual so aparece quando a aula tem exatamente 1 aluno.
  const aluno: AlunoAgenda | null = aula.alunos.length === 1 ? aula.alunos[0] : null;
  const riscoVelho = aluno ? riscoDesatualizado(aluno.risco_calculado_em, new Date()) : false;
  const jaOcorreu = aulaJaOcorreu(data, aula.hora_fim, new Date());

  // Frescor do risco na lista de turma. Usa o calculo mais recente entre os
  // alunos (todos sao pontuados no mesmo lote, entao normalmente coincidem).
  const dataCalculoTurma = aula.alunos.reduce<string | null>(
    (maior, a) =>
      a.risco_calculado_em && (!maior || a.risco_calculado_em > maior) ? a.risco_calculado_em : maior,
    null,
  );
  const riscoDaTurmaVelho =
    aula.alunos.some((a) => a.risco_pct !== null) &&
    riscoDesatualizado(dataCalculoTurma, new Date());
  const progresso =
    aula.nr_da_aula && aula.qtd_aulas_contrato
      ? Math.min(100, Math.round((aula.nr_da_aula / aula.qtd_aulas_contrato) * 100))
      : null;

  return (
    // Sem `overflow-y-auto`: o painel e irmao da timeline num flex com
    // align-items:stretch, entao a altura dele ja e a da grade e o conteudo
    // nunca precisa rolar por dentro. Com `auto`, o arredondamento fracionario
    // da altura fazia scrollHeight passar clientHeight por 1px e o navegador
    // desenhava uma barra de rolagem fantasma assim que o painel abria.
    <aside className="flex w-[296px] shrink-0 flex-col gap-3.5 border-l border-slate-700 bg-slate-800/50 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            {aula.hora_inicio}–{aula.hora_fim} · {aula.duracao_minutos} min
          </p>
          <h2 className="text-[17px] font-semibold leading-tight">
            {aluno ? aluno.nome : aula.turma_nome || aula.curso_nome || 'Aula'}
          </h2>
          <p className="text-xs text-slate-400">
            {[aula.curso_nome, aula.sala_nome, aula.professor_nome].filter(Boolean).join(' · ')}
          </p>
          {mostrarUnidade && aula.unidade_nome && (
            <p className="text-xs font-semibold text-cyan-400">{aula.unidade_nome}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar detalhe da aula"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-700 text-slate-400 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {aula.categoria === 'experimental' && <Etiqueta tom="violeta">Experimental</Etiqueta>}
        {aula.cancelada && <Etiqueta tom="rosa">Cancelada</Etiqueta>}
        {aula.reagendada && <Etiqueta tom="ambar">Reagendada</Etiqueta>}
        {aula.justificada && <Etiqueta tom="neutro">Justificada</Etiqueta>}
        {aula.turma_nome && <Etiqueta tom="neutro">{aula.turma_nome}</Etiqueta>}
        {aula.tipo && <Etiqueta tom="neutro">{aula.tipo === 'turma' ? 'Turma' : 'Individual'}</Etiqueta>}
        {aluno?.aluno_novo && <Etiqueta tom="ambar">★ Aluno novo</Etiqueta>}
        {aula.alunos.length === 0 && !aula.cancelada && (
          <Etiqueta tom="neutro">Sem aluno vinculado</Etiqueta>
        )}
      </div>

      {aula.reagendada && aula.hora_original && (
        <p className="text-xs text-slate-400">Agendamento original: {aula.hora_original}</p>
      )}

      {aula.nr_da_aula && (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className="text-slate-300">Progresso no contrato</span>
            <span className="font-semibold tabular-nums">
              {aula.qtd_aulas_contrato
                ? `aula ${aula.nr_da_aula} de ${aula.qtd_aulas_contrato}`
                : `aula ${aula.nr_da_aula}`}
            </span>
          </div>
          {progresso !== null && (
            <div className="h-1 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-cyan-500" style={{ width: `${progresso}%` }} />
            </div>
          )}
        </div>
      )}

      {/* So depois da aula: antes disso o Emusys manda 'ausente' por default. */}
      {jaOcorreu && aula.professor_presenca && (
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-slate-300">Professor</span>
          <span
            className={
              aula.professor_presenca === 'presente' ? 'text-emerald-400' : 'text-rose-400'
            }
          >
            {aula.professor_presenca === 'presente' ? 'Presente' : 'Ausente'}
          </span>
        </div>
      )}

      {aluno && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
            {aluno.idade !== null && <Linha rotulo="Idade" valor={`${aluno.idade} anos`} />}
            {aluno.responsavel_nome && <Linha rotulo="Responsável" valor={aluno.responsavel_nome} />}
            {aluno.responsavel_telefone && <Linha rotulo="Contato" valor={aluno.responsavel_telefone} />}
            {aluno.status_presenca && <Linha rotulo="Presença" valor={aluno.status_presenca} />}
          </dl>

          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Só no LA Report
          </p>
          <div className="flex flex-col gap-1.5 text-[12.5px]">
            {aluno.risco_pct !== null && (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Risco de evasão</span>
                  <span className={cn('font-semibold tabular-nums', corRisco(aluno.risco_pct))}>
                    {aluno.risco_pct}%
                    {riscoVelho && (
                      <span className="ml-1 font-normal text-slate-400">
                        · {formatarDataCalculo(aluno.risco_calculado_em)}
                      </span>
                    )}
                  </span>
                </div>
                {riscoVelho && (
                  <p className="text-right text-[10.5px] text-slate-400">
                    Modelo pausado desde {formatarDataCalculo(aluno.risco_calculado_em)}
                    {' '}— número pode não refletir a situação atual
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Financeiro</span>
              <span className={aluno.inadimplente ? 'text-rose-400' : 'text-emerald-400'}>
                {aluno.inadimplente ? 'Inadimplente' : 'Em dia'}
              </span>
            </div>
            {aluno.nota_pesquisa !== null && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Pesquisa 1ª aula</span>
                <span className={aluno.nota_pesquisa <= 2 ? 'text-rose-400' : 'text-emerald-400'}>
                  {'★'.repeat(notaClampada(aluno.nota_pesquisa))}
                  {'☆'.repeat(5 - notaClampada(aluno.nota_pesquisa))}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {aula.alunos.length > 1 && (
        <>
          <div className="flex items-baseline justify-between">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              Turma · {aula.alunos.length} alunos
            </p>
            {/* Sem este rotulo o numero a direita nao diz o que e — a coluna de
                porcentagem foi lida como "presenca" na primeira vez que alguem
                de fora olhou a tela. */}
            <p className="text-[10.5px] uppercase tracking-wider text-slate-500">
              risco de evasão
            </p>
          </div>
          {riscoDaTurmaVelho && (
            <p className="-mt-2 text-[10.5px] text-slate-500">
              Modelo pausado desde {formatarDataCalculo(dataCalculoTurma)} — os percentuais podem
              não refletir a situação atual.
            </p>
          )}
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {aula.alunos.map((a, indice) => (
              <li
                key={a.aluno_id ?? `${a.nome}-${indice}`}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 flex-1 truncate text-slate-300">
                  {a.aluno_novo && (
                    <span className="mr-1 text-amber-300" title="Aluno novo">★</span>
                  )}
                  {a.nome}
                  {a.inadimplente && <span className="ml-1 text-rose-400" title="Inadimplente">$</span>}
                </span>
                {/* Progresso no contrato DESTE aluno. O bloco "Progresso no
                    contrato" la em cima usa aula.nr_da_aula, que a RPC devolve
                    nulo em turma com 2+ contratos (nao existe "o" numero da
                    aula quando cada aluno esta num ponto diferente do proprio
                    contrato). Aqui o numero e por aluno, entao existe sempre —
                    mesmo formato que a Chamada ja usa. */}
                {a.nr_da_aula != null && (
                  <span
                    className="shrink-0 text-[10.5px] tabular-nums text-slate-500"
                    title={
                      a.qtd_aulas_contrato
                        ? `Aula ${a.nr_da_aula} de ${a.qtd_aulas_contrato}`
                        : `Aula ${a.nr_da_aula}`
                    }
                  >
                    {a.qtd_aulas_contrato ? `${a.nr_da_aula}/${a.qtd_aulas_contrato}` : a.nr_da_aula}
                  </span>
                )}
                {a.status_presenca && (
                  <span className="shrink-0 text-[10.5px] uppercase text-slate-500">
                    {a.status_presenca}
                  </span>
                )}
                {a.risco_pct !== null && (
                  <span className={cn('shrink-0 font-semibold tabular-nums', corRisco(a.risco_pct))}>
                    {a.risco_pct}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Experimental: quem vem e o que o consultor anotou no agendamento.
          Nao ha vinculo em aula_alunos_emusys para experimental, entao esta e a
          UNICA forma de a agenda saber o nome de quem esta marcado. */}
      {(aula.experimental_leads ?? []).length > 0 && (
        <>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Aula experimental
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {(aula.experimental_leads ?? []).map((l) => (
              <li key={l.experimental_id} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-slate-100">{l.nome}</span>
                  {l.curso && <span className="text-[11px] text-violet-300">{l.curso}</span>}
                </div>
                {l.observacoes ? (
                  <p className="whitespace-pre-wrap text-[12.5px] text-slate-300">{l.observacoes}</p>
                ) : (
                  <p className="text-[12px] italic text-slate-500">Sem observações do atendimento</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {aula.anotacoes && (
        <>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Anotações do professor
          </p>
          <p className="whitespace-pre-wrap text-[12.5px] text-slate-300">{aula.anotacoes}</p>
        </>
      )}

      {aula.anotacoes_fabio && (
        <>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Registro no LA Teacher
          </p>
          <p className="whitespace-pre-wrap text-[12.5px] text-slate-300">{aula.anotacoes_fabio}</p>
        </>
      )}
    </aside>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <dt className="text-slate-400">{rotulo}</dt>
      <dd className="m-0 truncate text-right">{valor}</dd>
    </>
  );
}

function Etiqueta({ tom, children }: { tom: 'violeta' | 'rosa' | 'ambar' | 'neutro'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-0.5 text-[10.5px] font-semibold',
        tom === 'violeta' && 'border-violet-400 bg-violet-500/15 text-violet-300',
        tom === 'rosa' && 'border-rose-400 bg-rose-500/15 text-rose-300',
        tom === 'ambar' && 'border-amber-400 bg-amber-500/15 text-amber-300',
        tom === 'neutro' && 'border-slate-600 bg-slate-900 text-slate-300',
      )}
    >
      {children}
    </span>
  );
}

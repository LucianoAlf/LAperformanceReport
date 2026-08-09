-- `aula_alunos_emusys` acumula UMA LINHA DUPLICADA por aluno toda vez que um aluno que
-- ainda nao existia no nosso banco passa a existir.
--
-- CAUSA: o UNIQUE e `(aula_emusys_id, aluno_chave)`, e a `aluno_chave` MUDA DE FORMA
-- quando o aluno ganha cadastro local:
--   antes -> 'nome:roberta alanna dos santos lima de oliveira:1993-02-20'  (aluno_id NULL)
--   depois -> 'local:1830'                                                 (aluno_id 1830)
-- Como a chave muda, o UNIQUE nao reconhece a linha antiga e o sync INSERE uma segunda em
-- vez de atualizar a primeira.
--
-- E o mesmo padrao ja registrado no projeto: identidade ancorada num DERIVADO (nome + data
-- de nascimento) em vez do id da fonte. Terceira ocorrencia — as duas anteriores foram a
-- chave natural do periodo do professor e a modalidade da Agenda.
--
-- MEDIDO: 64 linhas em 32 pares, e em TODOS os 32 a composicao e identica —
--   1 linha 'nome:%' com aluno_id NULL   (obsoleta)
--   1 linha 'local:%' com aluno_id preenchido (boa)
-- Zero excecoes: nenhuma 'nome:%' com aluno_id, nenhuma 'local:%' sem. A regra de limpeza
-- e inequivoca. Ocorrencia continua: quase todo dia desde 10/07/2026.
--
-- VALIDACAO DO TRIGGER (transacao revertida, 3 cenarios): chega derivada -> 1 linha;
-- chega a local -> 1 linha (a derivada foi removida); derivada tardia -> 1 linha
-- (descartada em silencio). 1/1/1.
do $mig$
declare v_n int; v_antes int;
begin
  select count(*) into v_antes from aula_alunos_emusys;

  ---------------------------------------------------------------------------
  -- 1. Limpeza: apaga a linha obsoleta so quando existe a irma boa
  ---------------------------------------------------------------------------
  with pares as (
    select aa.id
      from aula_alunos_emusys aa
     where aa.aluno_chave like 'nome:%'
       and aa.aluno_id is null
       and exists (
         select 1 from aula_alunos_emusys boa
          where boa.aula_emusys_id = aa.aula_emusys_id
            and boa.aluno_nome_normalizado = aa.aluno_nome_normalizado
            and boa.aluno_chave like 'local:%'
            and boa.aluno_id is not null
            and boa.id <> aa.id
       )
  )
  delete from aula_alunos_emusys where id in (select id from pares);
  get diagnostics v_n = row_count;

  if v_n <> 32 then
    raise exception 'ABORTADO: esperava apagar 32 linhas obsoletas, apaguei %', v_n;
  end if;
  if (select count(*) from aula_alunos_emusys) <> v_antes - 32 then
    raise exception 'ABORTADO: a contagem total nao fechou';
  end if;

  -- Nao pode sobrar nenhum par
  if exists (select 1 from aula_alunos_emusys
              group by aula_emusys_id, aluno_nome_normalizado having count(*) > 1) then
    raise exception 'ABORTADO: ainda ha duplicata depois da limpeza';
  end if;

  ---------------------------------------------------------------------------
  -- 2. Prevencao: reconciliar a chave em vez de criar linha nova
  --    No banco (e nao so no sync) porque a tabela e canonica e tem 18 RPCs lendo:
  --    qualquer caminho de escrita passa a ficar coberto.
  ---------------------------------------------------------------------------
  create or replace function public.fn_aula_alunos_emusys_reconcilia_chave()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
  as $fn$
  begin
    -- Chegou a linha ancorada no id do aluno: a versao derivada do nome vira lixo.
    if new.aluno_chave like 'local:%' and new.aluno_id is not null then
      delete from public.aula_alunos_emusys velha
       where velha.aula_emusys_id = new.aula_emusys_id
         and velha.aluno_nome_normalizado = new.aluno_nome_normalizado
         and velha.aluno_chave like 'nome:%'
         and velha.aluno_id is null;
      return new;
    end if;

    -- Caso inverso: a derivada chegando depois da boa nao deve entrar.
    if new.aluno_chave like 'nome:%' and new.aluno_id is null then
      if exists (
        select 1 from public.aula_alunos_emusys boa
         where boa.aula_emusys_id = new.aula_emusys_id
           and boa.aluno_nome_normalizado = new.aluno_nome_normalizado
           and boa.aluno_chave like 'local:%'
           and boa.aluno_id is not null
      ) then
        return null;   -- descarta o insert, sem erro: o sync nao precisa saber
      end if;
    end if;

    return new;
  end;
  $fn$;

  comment on function public.fn_aula_alunos_emusys_reconcilia_chave() is
    'Impede a duplicata que nasce quando aluno_chave muda de nome:<derivado> para local:<id>. O UNIQUE (aula_emusys_id, aluno_chave) nao pega porque a propria chave muda de forma.';

  drop trigger if exists trg_aula_alunos_emusys_reconcilia_chave on public.aula_alunos_emusys;
  create trigger trg_aula_alunos_emusys_reconcilia_chave
    before insert on public.aula_alunos_emusys
    for each row execute function public.fn_aula_alunos_emusys_reconcilia_chave();

  raise notice '32 linhas obsoletas removidas; trigger de reconciliacao instalado';
end
$mig$;

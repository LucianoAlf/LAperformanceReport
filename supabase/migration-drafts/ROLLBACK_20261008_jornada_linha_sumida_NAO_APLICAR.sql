-- ROLLBACK de 20261008220000 + 20261008223000 + 20261008224500 (08/10/2026).
-- NÃO APLICAR sem decisão. Volta a lógica ao estado anterior:
--   1. remove o gatilho trg_jornada_encerra_linha_sumida e a função;
--   2. devolve vw_renovacao_ciclos à definição anterior (lia vw_jornada_aluno_atual só 'ativa');
--   3. reabre as 167 linhas encerradas pelo retroativo.
--
-- Estado ANTES (medido 08/10/2026, antes de aplicar):
--   * as 167 linhas estavam status_matricula = 'ativa' (nenhuma trancada);
--   * fonte_ultima_atualizacao: das 161 com sucedida_por, 149 'sync-matriculas-emusys'
--     e 12 'webhook:matricula_alterada'; as outras 6 (sem sucedida_por ou de aluna
--     que saiu) não tinham a fonte registrada -- restauradas como 'sync-matriculas-emusys';
--   * vw_jornada_aluno_atual: Barra 323, CG 516, Recreio 507 linhas;
--   * Cobertura de Renovação out/26: Barra 7/11, CG 19/22, Recreio 8/15.
-- Linhas encerradas DEPOIS pelo gatilho estão em automacao_log
-- (acao='linha_sumiu_do_emusys', detalhes->>'origem'='gatilho') e não entram aqui:
-- reabrir com a mesma consulta trocando o filtro de origem.

begin;

drop trigger if exists trg_jornada_encerra_linha_sumida on public.aluno_jornada_matricula_disciplina;
drop function if exists public.fn_jornada_encerra_linha_sumida();

create or replace view public.vw_renovacao_ciclos as
 SELECT j.unidade_id,
    j.unidade_nome,
    j.aluno_id,
    j.aluno_nome,
    j.emusys_matricula_id,
    j.emusys_matricula_disciplina_id,
    j.curso_id,
    j.curso_nome,
    j.professor_nome,
    a.data_matricula,
    j.data_ultima_aula,
    j.nr_aulas_futuras,
    a.valor_parcela,
    jc.inadimplente_emusys AS inadimplente,
    a.telefone,
    a.whatsapp,
    j.ultima_sincronizacao_emusys,
    jc.sucedida_por,
    (jc.sucedida_por IS NOT NULL) AS renovou,
    is_atividade_extra_curso(j.curso_id) AS atividade_extra,
    (date_trunc('month'::text, (j.data_ultima_aula AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS competencia_aula,
        CASE
            WHEN ((jc.nr_faturas IS NULL) OR (jc.nr_faturas <= 0)) THEN NULL::date
            WHEN (jc.data_primeira_fatura IS NULL) THEN NULL::date
            ELSE ((date_trunc('month'::text, (jc.data_primeira_fatura + make_interval(months => (jc.nr_faturas - 1)))))::date + (LEAST(COALESCE(jc.dia_vencimento_emusys, (EXTRACT(day FROM jc.data_primeira_fatura))::integer), (EXTRACT(day FROM (date_trunc('month'::text, (jc.data_primeira_fatura + make_interval(months => (jc.nr_faturas - 1)))) + '1 mon -1 days'::interval)))::integer) - 1))
        END AS venc_ultima_fatura,
        CASE
            WHEN ((jc.nr_faturas IS NULL) OR (jc.nr_faturas <= 0)) THEN NULL::date
            WHEN (jc.data_primeira_fatura IS NULL) THEN NULL::date
            ELSE (date_trunc('month'::text, date_trunc('month'::text, (jc.data_primeira_fatura + make_interval(months => (jc.nr_faturas - 1))))))::date
        END AS competencia_fatura,
    (COALESCE(fv.qtd, (0)::bigint))::integer AS faturas_vencidas_abertas
   FROM (((vw_jornada_aluno_atual j
     JOIN aluno_jornada_matricula_disciplina jc ON (((jc.unidade_id = j.unidade_id) AND (jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id))))
     LEFT JOIN alunos a ON ((a.id = j.aluno_id)))
     LEFT JOIN ( SELECT emusys_faturas.unidade_id,
            emusys_faturas.emusys_matricula_id,
            count(*) AS qtd
           FROM emusys_faturas
          WHERE ((emusys_faturas.status = 'aberta'::text) AND (emusys_faturas.data_vencimento < ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date))
          GROUP BY emusys_faturas.unidade_id, emusys_faturas.emusys_matricula_id) fv ON (((fv.unidade_id = j.unidade_id) AND (fv.emusys_matricula_id = j.emusys_matricula_id))))
  WHERE ((j.status_matricula = 'ativa'::text) AND ((( SELECT CURRENT_USER AS "current_user") = ANY (ARRAY['service_role'::name, 'postgres'::name])) OR ( SELECT is_admin() AS is_admin) OR (j.unidade_id IN ( SELECT get_user_unidade_ids() AS get_user_unidade_ids))));

update public.aluno_jornada_matricula_disciplina
   set status_matricula = 'ativa',
       fonte_ultima_atualizacao = 'sync-matriculas-emusys'
 where status_matricula = 'finalizada'
   and fonte_ultima_atualizacao = 'regra:sumiu_do_emusys'
   and id::text in ('0070fc44-22ed-4301-aec8-0540dd8a327e', '0093d381-9ca7-4fa8-89dd-fb3b5deb8918', '030e1915-994c-4ff9-9726-26465feb9ad3', '056ec115-a9c1-4dc6-ba74-13ea8a8afe90', '068ebc22-9868-4531-b89d-310ac45e2bf0', '069a8680-7005-4fc0-8f73-65c56e038692', '0b10c0e7-22a7-48c8-aa47-01f9087a81f4', '0d9127f3-416c-4398-990b-6a3aff56696e', '0e3d4679-36b7-4d25-b9b1-f16df021b737', '0e8cb2ac-9768-4f34-a5b9-7b48e47ed061', '1283adba-b6c7-403f-bcab-d971fc4f0358', '14398457-af76-4f70-80a0-5577ed05729d', '14c10727-0737-4b13-88d4-5762d4a47007', '17a14e80-8e5a-4f82-951f-2809c014f72e', '1bbda010-12b9-4fa9-9a24-17901a1cf1fc', '1f66ad81-9a22-4978-b47f-1caf5cb2f60e', '1f9f7b8c-fba0-49a7-a6ab-0ba48477c349', '211d9d75-7a4c-41a4-ba7d-fd67e6e67993', '26524564-a81d-45b9-9b3c-06127edb1dc7', '2706ffdc-bee9-4bba-9473-48c600dd5b78', '270c6fc8-700d-4355-ac8a-1741c05e4e76', '27629182-c162-41f7-bdf6-4d0dc85e68b8', '2a0b508a-8821-4f49-97f9-f50090a75748', '2a36a921-9e67-435d-84ea-a30f07afa4f7', '2a5f53f7-336b-4099-a488-112275668980', '2d0c9821-818c-484f-8e7f-5e6066862cd5', '2f57ee6f-7bb0-4997-a4ed-b5ff8f9aae89', '30449819-d19a-4515-88d5-0b0d0e011add', '32fcf44a-ffc1-473b-a883-976db0f25d25', '337b160d-cd9b-45c4-bb29-d19b4d7a8d78', '338242a1-2f46-4d61-8221-07d7ad035777', '33ebc245-ab94-42f5-a9f1-99ffd4a5d464', '34cfcede-05ec-4fe3-ad76-fe46d1dd3a94', '35e1a9cd-c26c-4ffe-bf27-0beb973579d8', '372e4c88-7da7-4a9e-9574-65bf8adcab99', '3a105f29-8afe-4ee1-9742-74020f5231a2', '3a433de2-0dd6-4201-bf12-bdb82bb90217', '3abe9c29-30d2-4cc4-8888-f50c92af6e1d', '3ad06556-1e72-4c89-8c77-4eeb36308257', '3cf4742f-a83d-4092-a933-3719536f8842', '3d542e74-a436-4ad5-89c7-ea2e8a7804d0', '3f836f92-9bdd-4547-85e8-85208482d870', '3ff9135a-e43c-4edc-961a-b8caaf3a4f49', '412d77b0-a69a-4901-9741-ced8bcde932f', '41383a3d-b964-4a73-b948-ab51079d2aba', '43516776-1ccd-43f6-8d00-9bd47c2f0e7f', '45da23e2-ef0d-4028-85df-a97e05d1fc44', '4622d792-70d6-4882-b0ca-697a2faaebac', '47714be6-34a6-4a3a-9ecc-3992235e4c08', '47f4b551-6ed8-44a8-9701-0dc6c2fed78e', '4a4ebd75-c01b-4f07-927b-b093f9cff76e', '4a6e0eba-f8c9-449e-a6fc-dd0cf52b769b', '4b3a3eca-0d9a-430a-914a-b327d59816f4', '4caa1c5f-ac13-4975-8369-ab537e016227', '4d20c0b2-1ec0-4ab6-b23f-4c61cdfc438f', '4d30a221-02c3-4e6d-a486-3633887ac5f4', '4eba8ec5-3c3c-4930-b85a-952a62430550', '50481da3-1f1b-48e0-91a4-6d3079cd280b', '51bfb463-2981-4c65-b94f-54f423e96588', '5354ac33-d4ae-494b-8707-83bd8f6f29c6', '540224b8-ecc1-4003-91e2-d3a3980129fb', '544d5003-b465-49a6-bed1-6f24daa81eb9', '5474e6d5-3a8e-4c5a-8577-0fc0dc1b7bc2', '54a59e69-eb67-42e7-998a-9fff7b217579', '5597b533-1f39-4970-8164-c9860a205c05', '5787f9f5-841f-4756-84fa-f1512fcfeacc', '59486601-7a2c-4a70-b9c9-cbae8c4485a5', '5d05ea78-ed39-41c6-b817-cb82bad05f5b', '5da20a3d-96c9-4d37-ba4b-4ebe306a3a57', '5e3b7605-73b0-40f6-8b66-c5137cc308a3', '5ff85d79-1bf7-4818-9ee5-2fef9784c652', '60d8d5e6-2322-4bcf-bf3e-6543074c0df3', '63683587-4740-421f-b931-ed2fecb10c86', '640fcf93-aa60-438c-9766-f0523a86617e', '65fe5a12-322f-4678-a741-f3de9a50fc84', '6751e861-88a3-4078-82ee-a7dda7a7a4d4', '67c32610-db31-4b9c-8072-5bcb4865c9f2', '6b85d294-e518-4829-8dc4-73a79ecc83d5', '6c116c1e-3e40-49a3-8532-6b7ce84c042e', '6e7e75f7-5714-4b10-a036-1ef2a3c5db56', '70f46f57-4083-4d8d-8e29-b982b28702e1', '73207289-38b3-452b-9db2-3005162873b3', '7359b146-c58b-475d-b08a-59b5406d5ba3', '75160b41-520a-439d-a7a6-8b428f542c9f', '79794b39-4c64-4079-85ae-7a0c59486023', '7b409090-34f0-4467-a121-214b44e4e1b9', '7cfa100a-9d03-4fab-9327-07ea7d15fa14', '7f1295cc-ee47-4733-b0fc-543fc4db71f3', '80f878ce-792b-457c-b69c-713d5f4395eb', '841351cd-f054-4f19-8be0-a470ac1da73c', '879146be-8552-4d1b-9719-e9e3972efd68', '87e5cb4c-23ad-4f21-b814-63807921dbc5', '88f3da23-bea8-4473-a89b-017ba22cb0ef', '8b23cc16-5ac1-41fa-9d65-e9f3015cc1e9', '8cbda19f-827b-463b-ac1c-fdd7ee8d108a', '91024940-0029-49ed-b9ac-4116746c1dea', '91a255c1-744a-47a2-b497-a24d6518630a', '91be4842-ec10-4a00-b531-52c77f34b4f0', '91c7e7c9-f7bd-44fb-9ed1-1ff824e2e8fb', '9483c7c3-316f-4a4f-b508-06aa145a4512', '96465ae4-433a-459b-b673-3fe94cb1cbe8', '97ec217e-e4f0-4326-93c1-a7694c4f8f3b', '97fc03c7-147d-4d8b-9569-2a510c5546c8', '984997f1-25b6-4116-a31f-81292022f665', '9b0c3a0d-cff1-48c0-b19f-867061a8455b', '9ba0bef8-1efd-4cd6-bca7-5da0198674b0', '9e2d4828-85d0-490f-ae68-416e581128e8', '9e5eec96-7291-4fc4-86c5-eccb9c45287d', 'a10681db-1580-4b2d-9291-6dfa08528e25', 'a15dad0e-30db-4960-9b0f-940cfacb006b', 'a1a0ef5c-4eaf-4715-8db5-e8235394793a', 'a31e736c-7574-4569-83cb-8ffdaffa832d', 'a612bd9f-b863-4dd5-a81c-55065589b665', 'a63c4bc9-f19f-491f-bcbf-1e25a9b18975', 'a9c1e064-e8a8-4d38-8e6f-269ecae34211', 'aaa55837-0772-4d8d-8f4e-8ae3593bbc50', 'ad451a71-70c7-412a-8793-5d26ffb7a3c1', 'ad66a63b-df70-446a-91d6-827e34c227c3', 'b1a2d0c9-e95c-44fa-b56e-8b62f29e0256', 'b2392a0b-8f90-4f84-8fcf-141d21e3424d', 'b2565ce1-06bd-4836-a33d-aa1a189b9abe', 'b2a9f253-5292-496d-a508-76f8bed5cde0', 'b41d9555-04e3-4693-975e-21b19b3fb141', 'b7f7ed72-a784-4f11-ab22-39849db17eda', 'b9fd0a2e-fb57-400f-99f4-1f57786f5a03', 'c1b917db-8f2b-4488-bb97-fab992aee16c', 'c6312f21-16a5-4c96-8294-5185d7b8980b', 'c9403ec1-647e-4819-b118-157b86cb2e5a', 'cbcd59aa-a20d-4c9f-ac19-efbd319c6028', 'ccd142f2-d041-4e91-9c82-a19883c290c2', 'ce14511a-3140-4525-81d5-a01cc320af95', 'ce1d39e6-16f5-4cf0-9235-ffa91f8795b3', 'ceae5ef7-df8f-44af-b08c-b9a9d74f7e89', 'cf47fb12-aea2-4647-9ba7-f0885578c3e4', 'd0e9fdcc-2576-4f20-8faa-f56e5184f3cc', 'd140d8cb-1fba-43ca-a531-211e6d0f4955', 'd2cce950-3180-4267-b0b7-ccd2c82872c7', 'd3329310-6292-4587-8488-871b47fe6781', 'd98d0037-2031-4ab3-b08b-364b9ec9464c', 'db6ec8ed-74dd-4e91-aa22-a9be5f513109', 'dbc00331-2693-429f-b527-4ba58a892de1', 'dbc718ce-e979-495c-b368-8369dc57fbca', 'dbefda51-e9b0-4bf2-8130-b91a27464ab0', 'df3064aa-c695-4aee-8665-9451618a25d3', 'df5ca01a-1b31-4f6b-8769-b00584d18ddc', 'df98d2f2-47ed-4f49-8c0e-866898d3052c', 'e1b38e70-d410-44ae-aa4b-92dcb7512900', 'e211f7eb-8817-4c93-a689-745b7d9fd54a', 'e33bce41-6483-4aca-adf9-c6c3a5f593d2', 'e60839bf-83de-4b98-9a04-1728487866b3', 'e73ba606-4a0d-4d10-a3c9-263b99ed00c0', 'e8c5c105-a4b5-41e8-83f1-5b6d3921b942', 'e9a3cece-6b6f-4cb3-b916-fc3152aebc0c', 'eae3994b-45fc-489b-ba10-d62dc2c20d14', 'eb897beb-d655-4c49-b054-843e5d740270', 'edb5bff9-b854-4fec-acc1-f897a627e9f0', 'f04c13ce-8018-41d3-9cae-76f54458335a', 'f0e79d7d-e845-4aeb-9dc3-4f1196866f08', 'f12fd6df-81ee-4b67-ab80-fbcca1fa3e19', 'f1b4cd1a-ac7e-4ad4-8f7d-1518f4702966', 'f6777ec4-9bd8-4e16-9caa-5c01b8c94a28', 'f8a54675-f4e0-42d1-9461-18dad16d8cca', 'fa31df59-ff12-4f42-8569-2f5102ae421f', 'fac1c448-5511-41da-a1c8-7c41ac6a5a49', 'fbbd4f39-7cbb-4d71-b863-3a91b8c12e1a', 'feec9f9b-63a2-4f1f-a85e-d06f8b3abd57', 'ff66ccf2-c12d-4cae-9c14-abe336aedf6e');

commit;

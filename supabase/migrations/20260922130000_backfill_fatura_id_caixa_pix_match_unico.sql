-- 22/09/2026 — backfill de fatura_id + aluno_id em caixa_movimentacoes para as
-- entradas pix/parcela sem vinculo, aprovado pelo Alf apos o relatorio de
-- reconciliacao (vw_caixa_reconciliacao_entradas, migration 20260922120000).
--
-- Escopo: somente os 146 pares com match UNICO e rigoroso — fatura paga na
-- mesma unidade, data_pagamento a +-7 dias do data_movimento, valor_pago exato
-- e nome do aluno/responsavel confirmado por sol_nome_mesma_pessoa_v1 ou
-- boundary de nome completo. Excluidos por construcao: ambiguos, compostos
-- (soma de 2 faturas) e os 4 proxys ~R$300 que podem ja ter sido consumidos
-- pelo Super Folha (validacao pendente do lado de la).
--
-- A lista e literal (deterministica): o casamento nao e recalculado aqui.

do $$
declare
  v_expected constant integer := 146;
  v_count integer;
  v_linked_count integer;
  v_changed integer;
  v_core_before jsonb;
  v_core_after jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('backfill-fatura-id-caixa-pix-20260922-v1', 0));

  create temporary table expected(
    movimentacao_id uuid,
    aluno_id integer,
    fatura_id uuid
  ) on commit drop;

  insert into expected values
    ('00746171-d74c-4e6f-9f67-6eb6350b3094',1759,'df76cd2a-f13e-45cb-8d5a-739522090bb7'),
    ('01abf127-4ec2-4b2c-a82a-e3b81d1fca1d',1763,'3e2ec601-011b-44de-bf08-e8dce9d0394d'),
    ('0366e5b3-e077-42d3-91ed-3c6b6fc32f9b',1463,'7ac27061-c652-492e-8f0b-ab0187ff8401'),
    ('051c4a84-2d5a-43ed-8abd-8d2554be7314',1022,'dbb05756-0dff-4541-b630-e24f1a6b6840'),
    ('069fc679-6067-465a-8027-c2f16b806790',1720,'e797454d-7aad-4f32-9a66-2fecd1740f92'),
    ('07ec56a2-593d-42ea-9ab4-a4cde5e5917e',1466,'c6b44ab3-9743-4c2c-b19d-62cdbf6aa672'),
    ('09d8be0f-0d2d-4abd-a717-3c5db6a08af1',1614,'46f2170d-4a7d-4098-9bf8-0c9b9ae80788'),
    ('0a191723-b5f0-4fea-a1eb-8cfb9bb248d1',1346,'9dd2c278-fe92-4308-b97c-e81d8dbd8ca3'),
    ('0a888ccf-4949-4507-8940-b477a579bf37',1479,'cc7be8dc-0587-4912-9b4f-ea8761829632'),
    ('0fafb5ca-0a5b-40be-a596-d1d373ada1fc',759,'8216f9d9-9cb6-4cd4-a429-93104cd33fd9'),
    ('11edb9c3-0702-4a8a-b5ab-df1efe367922',1661,'12e94fd5-1f48-4bae-9367-fd93148879ad'),
    ('13df9558-238b-4f1d-8f2a-303d92c01e10',588,'d1fbf08d-fa0c-4f16-81a4-34984ce171aa'),
    ('16d7e65e-b0dd-4794-9370-4828dfe65d53',404,'decb70ee-4972-4290-9731-ff1d6d49da49'),
    ('18388eea-aee0-47d6-9777-c51d36e2efb5',1647,'8ea90f9f-11df-472b-b079-e8ef88225fc5'),
    ('1aa3b822-4c31-45fb-ba72-c2addc955d8a',876,'2e3eb350-e03c-47d6-ba63-84490a4270a0'),
    ('1abf4d11-04a1-4c3b-b8a2-e9a6a1a91f46',247,'37f486a7-dd14-400c-a007-a350a6f67650'),
    ('1ac7c16f-873b-4776-ac85-fc3cee5749ba',1005,'e743ef2f-7b79-43ae-9bbd-b443d35532d0'),
    ('1c3d9b48-3104-46e5-a07c-78be6cd4a058',667,'7cb06149-8674-4ce0-94a3-212fdb945c47'),
    ('1cbfab57-e5ac-422c-b180-7ce5587ed596',64,'0408dfa3-94aa-46c1-960a-c6000f36ea4f'),
    ('1ecb4120-5543-4864-9f35-a73337c13890',1060,'5ed0d6a7-8a30-4e96-ac56-691c101c45d5'),
    ('1f91e56e-f92f-4f2a-b286-843ed7933ff5',178,'54842c00-e144-4b9e-9b97-b1c0b9506ea1'),
    ('23649424-3265-4387-ae3e-5d75fd3ef3e2',1891,'299ed25a-f12c-4a8f-9940-cc7899c1d62c'),
    ('25632c88-7ffa-438d-a64e-30dd9fbba326',1484,'67c96fe5-375e-411f-a400-f3e45dbf913a'),
    ('2abeed12-26d7-473d-8c20-b026009a0a80',1021,'46e498e1-5d31-4249-b8e6-dd78efa5a665'),
    ('2c85bf6f-bf40-49eb-b78f-69abf719c72e',542,'a6c7996c-e99e-4d89-a053-9a32bde754f6'),
    ('2e85170a-141f-4450-84d6-643cd3a165d3',1618,'028b88b0-1e0c-44a4-a8c5-66222e0800e9'),
    ('319d7945-b258-4fa6-a1c8-8030d3c17901',631,'4a3caf64-aeac-4c86-8a7d-8b1b9061d964'),
    ('35b74bec-6ed7-43d4-af51-f4aed0f53b11',1577,'3e8df7b4-fd9d-4078-b0c4-e06e0a1b4bfb'),
    ('36d78e1c-38f5-4c44-bf41-7a78a0e36cbf',1655,'211dec62-671a-47c7-894c-2f1df66a89a3'),
    ('3808a052-6f27-4ff4-b3d1-cba488b65379',155,'77c7de3b-e67f-4d66-b225-84bbf80eaa95'),
    ('38fc8157-3e88-45f5-bfea-5faba31fc220',1474,'7c1e3a65-d728-4cbf-90f9-6f0cd707f5ae'),
    ('3b2be60f-4bb0-4e17-b3ed-bcd5cfdefd2b',1022,'792b6d1f-b6df-49a4-b280-12d992c3731d'),
    ('3ba887f5-3ada-487c-a90e-9098799b1b94',666,'16142c16-622e-4454-bfbc-1270f4a553a6'),
    ('3bacf88a-8f1a-4cd8-b041-f2e45aef9971',1468,'b50ceda0-4121-4f30-abbf-c564a3b7b444'),
    ('3c5b1ca1-9177-4c1a-ad3e-4101cd54d67b',36,'86c243e7-e614-4ce7-ab96-11552b183252'),
    ('3e662cd2-50ae-42ca-b9e3-cda2fe9efc87',1520,'97b68ffb-4790-4aed-9854-e8cd7079ad91'),
    ('42bb00ee-8116-45a3-badc-706ad767ecc0',1461,'2de33137-22af-4d24-8925-21b96e96b2cc'),
    ('4348f57f-b03a-43bf-b064-eb68903b0af4',40,'dbad9f91-1eb7-4903-8e9b-b3d90051fd81'),
    ('470a2b43-4ddc-4c06-ad49-58cc8b950dd3',1588,'357f24c4-d435-4748-bd57-aad0284019ca'),
    ('4774415b-5426-4219-9bae-0d6085002243',1460,'6c567373-33f9-4e69-98c1-4ea93b1fdd52'),
    ('47a5ddfb-e213-43df-809a-64e2f5da6f00',1568,'d97ad1c9-2f68-4186-88eb-cf49bc9dd553'),
    ('47f346e9-cbec-4a48-8d14-90386cd38a41',541,'5e0269a7-ae1d-409f-aeb9-b35935b39d59'),
    ('48b7cc81-9d0b-49b1-9b1f-5d5a53944fd4',1471,'98117bb3-18b8-489b-aaaf-2caa348b1b4e'),
    ('4987fc4e-628a-4604-a1cf-a37e17d381ea',645,'a15c3216-8e27-4f87-83a4-5488e5a5bdd2'),
    ('4db0cf41-389d-419c-a039-bc95209a0408',940,'e74024c3-5fad-4685-9d29-7c50dbb010ad'),
    ('4eabb040-cb07-4696-8d7b-51cd6d237728',66,'de5e0ef4-fd11-42e6-a5b0-aa88c0a3193c'),
    ('4f04d208-0870-42ca-9484-90e9cd1f4e81',1827,'fcc85533-818a-4af4-a78a-a75b669fc02f'),
    ('50b36789-1200-464d-a469-ea6587bae2be',1701,'daf67521-271e-453d-b332-32ef0c929c17'),
    ('533496b7-e486-4fd6-896e-44e3efaa4083',1633,'c60d0160-d350-4620-b440-3e6f911c8f2c'),
    ('537f8b0e-0aab-4d72-936f-744f23106cf4',1635,'82999bfe-8332-40c8-b239-72704fff9817'),
    ('55a987ad-11d9-459d-87fe-a2c0f4ff6f5a',1022,'10eb2325-930a-4cd5-9e13-8616af407b5e'),
    ('562ab1a0-d964-4b6d-8bb7-a528ffc2054a',940,'3370aac0-7a08-4225-b153-a1dcaf4e5b03'),
    ('57d14176-b840-41ad-bd44-71899528c325',1636,'5f73b9b6-4b5b-4b6f-9a30-e818fbc41a08'),
    ('588ead3a-a073-4e2a-8148-0e456c024ebe',667,'09bc7a39-0f89-4562-9f0d-19183bdba131'),
    ('59f24116-6a14-417f-9940-86ed68fe3de0',1883,'6fd8ae35-d036-4bc7-a221-fff390e0ba93'),
    ('5afeb9a9-bae1-4013-a9e3-03c11cfed47a',1560,'02466bc3-0536-4170-a3c8-462f5a9a7051'),
    ('5b0299d0-bfa4-459a-bf41-39c803a15330',1814,'3cefa79e-fe5e-43b3-bd1c-09fb8b08c5a3'),
    ('5d8152d5-fcaa-46c6-8d8a-c7e508ac411e',1061,'ecee1374-93d0-4937-a9a7-a5eb7f499654'),
    ('6111e2e3-e21a-4186-aea1-3f84cd21f5b5',199,'661834bd-ff27-431a-a475-8afbafd08781'),
    ('63a233c2-782c-47ca-b0d9-c2df4b3313d4',1613,'d19cad95-9b33-4438-a6d5-7d89e894d535'),
    ('63a3940e-6e6f-49e5-9462-a10f5fd756a0',1386,'175d06c3-3240-4e64-9e5c-f8db736d7925'),
    ('675090bb-79d8-4a6c-887d-a97be407bee3',1631,'997ca11d-3a78-4941-8813-87cf64226576'),
    ('690f2d46-51a3-4f67-b875-b5a937212d20',628,'90142e72-28ce-4b25-8275-5e91192e4763'),
    ('6d2a9fd5-9e75-4489-926e-a8337997de58',1005,'1dab807e-61c1-4caa-8419-14905aa98ac9'),
    ('701bfeab-e0d4-4e97-9a35-efff58f05ef8',1724,'8a4dacc6-0716-40bc-9a1a-c218ff2b94b5'),
    ('71802612-e6e4-4341-9feb-139808fbaf4a',1030,'e8f79640-d049-4e12-a0ee-fdf0520ba989'),
    ('7247273f-8807-43ff-88c3-fcd343a79168',1033,'198c2991-883c-4f7e-8317-e33dc85cf44d'),
    ('74f27c3d-9f3c-43c0-83d0-a93711f98c25',588,'e521721e-628c-4382-b59d-7ce3290b5b52'),
    ('7a9e329c-4e7e-42aa-a000-ed726dba53ab',2370,'c096e275-ef45-4429-8ece-979ecbeb5706'),
    ('7d1f4b34-a33b-46ac-adc1-d9e489589062',1030,'981b49d4-94c1-496d-99f2-677eb2ff10f1'),
    ('7f086c1b-0aae-4511-9f2c-1cf35d6f3b20',1748,'705169d4-fcc8-473d-861d-c211c27f963a'),
    ('802fd1f8-3633-4049-bd8c-1a9497a266d4',1457,'c7f95d92-d5ec-4dd0-9d57-cdcdbd8690ce'),
    ('8394088b-e89f-4149-b6a3-9d77a81eef38',1619,'8b0bc11f-2d9a-4850-a43f-a3ef5fb8eba8'),
    ('83d0cc97-3b91-4aab-8304-fe3679984ffa',2273,'675d1b78-8bec-4e0a-8f03-2923cc15ccfd'),
    ('83e7e7c8-35d7-46e6-be8d-9ff63b15c7ba',422,'3b5b5f5a-cb65-4ffc-9e78-744ede03b58a'),
    ('858b4d96-43e6-48ed-812a-4a69f2a69424',247,'ea3c8bec-5163-401e-baad-45c3ba156455'),
    ('8a3d6173-0a65-4aa8-9d46-98f7a78b74b8',331,'079da7a1-dea9-4cef-af4b-ec96c3a98a0f'),
    ('8c0eab80-879f-4855-ad95-c7928031961e',297,'b2443133-50f9-4640-94d7-34a4cafb8e93'),
    ('8edab174-0f5c-4ae2-acdb-8dcce5ae2169',1028,'066193b0-5f39-416d-a4c3-f5fc7e29a0f5'),
    ('8f4780fc-f8da-447d-95f7-4184905d5b59',1925,'19ee1764-425e-439c-af6b-3e194d61162c'),
    ('911f7c42-7cf0-4a14-a694-c691ceee7277',1746,'22f4cb20-3b34-4959-9517-b0a28a61be91'),
    ('954fbc73-bee6-44b1-9f28-9101c6ea2141',1852,'17fa6d6f-207f-485d-8574-9c5fb6d174c4'),
    ('9a4c059e-eb60-47e2-9807-1f22811b0875',1796,'df6e295e-5064-48dd-928a-7addfaab65aa'),
    ('9b7c2cc1-d383-42fb-bed7-f09e2e413018',929,'4247b7fa-2ab7-4ecc-8989-302fef604ced'),
    ('9c5b98ed-8ac7-4718-bf69-1ec0652761d5',1820,'fd5f6767-a229-45ee-9ed1-26838a0e23f2'),
    ('9ce30c93-52b4-4d1a-b0b7-8b27eb3cfb7f',1720,'a792ca92-45e7-4f5e-8329-64b7fc11fb03'),
    ('9d9d090a-ca91-40bc-a982-eb953c9a512d',1602,'6104323d-0b37-4db1-9526-e96a37a23ab2'),
    ('9f6b20ea-164b-48ac-aab8-c3a84a07b094',397,'a43365e0-f89b-42ff-b1bb-449557f34dfb'),
    ('a3aae5d7-9e7b-4039-b616-d27a606e564b',1747,'6569372f-0299-4c8a-9d1c-a79c08e2ef09'),
    ('a5419a5d-d672-4d2d-a790-6584910b3720',243,'6cf5f9aa-070d-43cc-8c51-71952591902b'),
    ('a824de4c-a0a5-4cca-8dcd-8766c1df8966',208,'77a4238d-b8a8-4495-a4c8-086c3d49c469'),
    ('a88cc72a-7fd8-4225-ac6d-dbe6d78f8f8e',1031,'153647d8-aae4-40aa-bb27-1b881983aa2d'),
    ('abdbb9f6-6fe8-4a23-9b7b-d428595bc32b',1683,'03b22155-c01d-41fa-b72d-8f5ec4672679'),
    ('ac524f98-e66b-4080-82c9-9180ad6fe577',236,'610760c2-d366-44e8-8f8b-414c9601d152'),
    ('b1728a01-f549-4ef5-8e90-83a98a4b47a6',1055,'7fb0c774-6630-4c45-a10c-ec37b172076e'),
    ('b1db27e2-257f-4fac-9000-9c92200fadf0',203,'ee36222e-a5db-4c41-86c4-8e8df930e7ac'),
    ('b5b1b89e-a735-46b0-9a9f-77ff9b28ce2b',208,'4ea54e78-21a1-4fb9-b155-d5dfc4c72667'),
    ('b748d8ce-4bd6-4dc2-931c-4ae7fbc04e82',1717,'e6bf726b-ab76-4442-a948-151b611c4bd9'),
    ('b7bf484b-2657-4110-820d-170986e023ee',1607,'20333c2e-c594-4543-bfce-b4aafbbc8e55'),
    ('b82bdc73-73c1-43d8-806a-89c47a4f8db2',555,'3bfaafef-a527-4708-9e59-421baed70585'),
    ('b87209b4-d2aa-4866-8811-50961e1921ef',1728,'9852d7d3-81f3-48f4-916b-eb0ea2739536'),
    ('bbd73f84-b6c4-4f5d-8fc0-b7bb3c970fa4',1607,'d12d0994-d588-4e2a-9480-88063fb74687'),
    ('bbeed680-24b5-4c9b-929e-213b401bf90c',1054,'4eb62027-8846-49d2-bb1c-566ebfe6ab89'),
    ('bcb58d22-254a-4556-b6d7-aeae508540f9',1634,'274142a9-af04-4066-bbaa-84cd19780386'),
    ('bd4c45c6-4900-42af-a3a8-7595da658e87',1474,'b5507fbf-f593-4911-8ae4-7719d98e2ded'),
    ('bd4ebb72-8511-4956-8c67-f8b50328b9fe',1613,'e4a72d46-9c20-4942-a781-81bdab30d72c'),
    ('c2094dc3-1266-4bdf-acac-294c293cb5cc',1923,'3ae18cb6-e8bf-4c27-9dcc-2c7f87b8d929'),
    ('c26b65f3-98ee-4c90-a14b-5bd769fdc896',1884,'463de05a-630f-4b72-be21-fbe94a0de49a'),
    ('c4c6d0a1-ad51-48fc-ba78-b83b325a71ca',925,'d36a5220-6aba-4563-8ac1-932e0f6e008e'),
    ('c621a208-3812-4e61-ab5a-cb31026fc00c',1908,'e7f2d72b-ad8e-4479-b11c-585ca93e836b'),
    ('cac427f9-02d0-4559-8ea1-30ae3739b5ef',54,'ca726c0f-0e2d-416c-8355-c96a37432383'),
    ('cc60b76e-92bd-4659-87fc-26c83febe4bd',1708,'b371568d-9567-4ab6-9f0f-f6cbfd4887e2'),
    ('cf1c6b97-a8ed-4322-a0e0-14f45458cf6c',1620,'4ba91354-bbcc-44d1-a907-e968086dac63'),
    ('cf899c77-690c-4eef-9d50-f21331505d47',1804,'29d28af9-ae2b-4f17-89d1-e7dce569a5c5'),
    ('cffcface-07f4-426c-842c-4dd5a1ae1705',1660,'49478166-b080-41d7-b1f7-b0e0746d634e'),
    ('d04d1dc9-a2a6-4143-9f85-39011c55ba71',1635,'b12efffc-6bba-4c80-b5d8-a4f8c860bc22'),
    ('d2fb9c73-6ace-4288-b102-bfa367783687',1602,'9a3cd79e-016e-441c-9515-6a2ada474a1a'),
    ('d3f1b507-f37c-425f-915a-cb6794ad7719',84,'8608fb3e-517b-4321-9c9b-c61dea6e7a93'),
    ('d5451e74-7bde-4089-a62f-dadcc3b45561',1632,'dd362323-01f1-4091-aef6-272fd026edc0'),
    ('d5d17bbf-0ddd-4cca-bbda-57e332cb37d9',355,'aae87aa6-2e3f-4fd6-8ded-0bace4429a95'),
    ('d65cd072-6054-48a5-9a34-5ee6c6a02d30',1553,'865275f7-38f3-4962-906d-3133a1698b1b'),
    ('d6db0593-1b79-4e39-b78a-2c43f77cbe51',1527,'308c8144-0eb6-43ea-8525-c11522853f75'),
    ('d7db49eb-77fe-4db0-b35d-a9c7ce77a2dc',1577,'e8329e92-46f2-41ed-bc3d-5ccae0b9582d'),
    ('d8c0bafb-5c6e-4da5-8fc6-6a781deddc18',658,'a2618419-8e90-427e-bdd8-78457429b9d0'),
    ('d96a29f9-8159-4a78-9f62-982419463310',666,'98872200-38e5-446d-a105-aea85367cc6d'),
    ('da32aea7-eb01-4897-a8d6-ba387a8ad6bd',1033,'0ed4137b-3167-4146-9c77-cb8f1abaedb9'),
    ('db62b52d-dd67-4de2-9521-363d9a47155f',1632,'3e515c66-6c06-4599-a18a-2e4e9dd3ea67'),
    ('dbba106a-a9d9-4556-874d-5013192e3fc0',682,'9876e74e-7bc9-418f-908a-202f01260b21'),
    ('e0c41287-76ca-4b58-bdd7-0ee1f419199f',1851,'4f3caa77-6f0d-4e01-9c46-a2a250966504'),
    ('e15f63b8-7fab-47ff-9442-c952bd9f8715',2334,'b776161d-93ca-468d-ae54-b97d79d01ff6'),
    ('e16ac3be-855e-4394-8064-cd3b5f9c82c1',1386,'13c6c204-110a-48c7-b70e-37299907c537'),
    ('e4c14064-bc38-49dc-ac67-7e8f1c45125b',1468,'64de78b5-6f81-4e4d-b85e-65bde6c89301'),
    ('e4d49072-af30-4677-b34d-60c3c7797e74',1647,'49df060a-849d-466c-ab47-91342ea7f3ef'),
    ('eb81eb43-14c3-4f09-9e53-31128f44c53e',1655,'ca49cd4c-c0a7-46c8-8acf-88edace5ab19'),
    ('ebbeffaa-0040-4092-907d-009e2c19a749',1602,'3a993fd3-904f-4eb4-8b84-d64531b1fa38'),
    ('ebee62d7-f253-42f6-9f85-15efcfa6a865',422,'64ca73e6-5d2f-4bb4-9046-66c73085136a'),
    ('ed2eacbd-554e-4dcf-a9e0-799946aef950',368,'ad11e573-9e0e-4ed6-9336-ca7d98ed192e'),
    ('efe76ce4-ca5f-484d-bb3c-d10f7bba53cc',1728,'0552bfe9-92f4-4bd8-8233-08a234cf5675'),
    ('f119f1b6-9005-4dbb-9db2-0879218523ba',1461,'92669fc7-6cbf-4f2b-aa50-09c5cef2d94e'),
    ('f36bcd4f-659a-4f30-80eb-baff3f537d4e',1894,'702bdcf6-b3d2-45f0-bdef-e8f7742a5264'),
    ('f5c17b58-beff-4443-82ab-7ac91623559f',1021,'7577d087-2af8-4886-b10c-9503ab4e7c13'),
    ('f7703511-06a2-412d-88c1-523aa6e56089',658,'6f00a3dc-86eb-4120-8cea-6d302ac52ff9'),
    ('f976b46a-1ed1-4f39-b8a0-29d774775285',207,'12c90c51-23c6-444b-8fd6-68e8e0f90fb7'),
    ('fa539bc3-034e-43db-bfaf-8ee5219ed8d7',54,'570e6514-252e-4cda-af6e-0015551d5ef1'),
    ('fa7d3c01-0440-47e0-9f85-7f0edb96f59c',665,'48d7f6d3-f32b-4a91-9922-a25bb17c5d42'),
    ('fdf2103f-ad7e-49e8-983b-3da391f5c2ba',1689,'a8e245ee-0570-4436-ac7c-2128b36f89ea');

  select count(*) into v_count from expected;
  if v_count <> v_expected then
    raise exception 'backfill_fatura: lista congelada divergente (% de %)', v_count, v_expected;
  end if;

  -- Precondicao par a par: a movimentacao e a fatura existem e se sustentam
  -- pela regra do match (unidade, valor exato, janela de data, aluno da fatura).
  select count(*) into v_count
    from expected e
    join public.caixa_movimentacoes m on m.id = e.movimentacao_id
    join public.emusys_faturas f on f.id = e.fatura_id
    join public.alunos a on a.id = e.aluno_id
   where m.tipo = 'entrada'
     and m.forma_pagamento = 'pix'
     and m.categoria = 'parcela'
     and m.unidade_id = f.unidade_id
     and f.status = 'paga'
     and f.emusys_student_id::text = a.emusys_student_id
     and a.unidade_id = m.unidade_id
     and abs(coalesce(f.valor_pago, 0) - m.valor) < 0.011
     and f.data_pagamento between m.data_movimento - 7 and m.data_movimento + 7
     and (m.fatura_id is null or m.fatura_id = e.fatura_id)
     and (m.aluno_id is null or m.aluno_id = e.aluno_id);
  if v_count <> v_expected then
    raise exception 'backfill_fatura: precondicao par a par divergente (% de %)', v_count, v_expected;
  end if;

  -- Fatura alvo nao pode estar vinculada a outra movimentacao.
  select count(*) into v_count
    from expected e
   where exists (
     select 1 from public.caixa_movimentacoes o
      where o.fatura_id = e.fatura_id and o.id <> e.movimentacao_id
   );
  if v_count <> 0 then
    raise exception 'backfill_fatura: % faturas ja vinculadas a outra movimentacao', v_count;
  end if;

  -- Idempotencia: tudo vinculado => nada a fazer; parcial => aborta.
  select count(*) into v_linked_count
    from expected e
    join public.caixa_movimentacoes m
      on m.id = e.movimentacao_id
     and m.fatura_id = e.fatura_id
     and m.aluno_id = e.aluno_id;
  if v_linked_count not in (0, v_expected) then
    raise exception 'backfill_fatura: estado parcial detectado (% de % vinculos)', v_linked_count, v_expected;
  end if;
  if v_linked_count = v_expected then
    raise notice 'backfill_fatura: % vinculos ja aplicados — nada a fazer', v_expected;
    return;
  end if;

  select jsonb_agg(to_jsonb(m) - 'fatura_id' - 'aluno_id' - 'updated_at' order by m.id)
    into v_core_before
    from public.caixa_movimentacoes m
   where m.id in (select movimentacao_id from expected);

  update public.caixa_movimentacoes m
     set fatura_id = e.fatura_id,
         aluno_id = e.aluno_id
    from expected e
   where m.id = e.movimentacao_id
     and m.fatura_id is null;
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected then
    raise exception 'backfill_fatura: esperava atualizar % movimentacoes, atualizou %', v_expected, v_changed;
  end if;

  select jsonb_agg(to_jsonb(m) - 'fatura_id' - 'aluno_id' - 'updated_at' order by m.id)
    into v_core_after
    from public.caixa_movimentacoes m
   where m.id in (select movimentacao_id from expected);
  if v_core_before is distinct from v_core_after then
    raise exception 'backfill_fatura: campo alheio ao vinculo foi alterado';
  end if;

  select count(*) into v_count
    from expected e
    join public.caixa_movimentacoes m
      on m.id = e.movimentacao_id
     and m.fatura_id = e.fatura_id
     and m.aluno_id = e.aluno_id;
  if v_count <> v_expected then
    raise exception 'backfill_fatura: readback nao confirmou os % vinculos', v_expected;
  end if;

  raise notice 'backfill_fatura: % vinculos aplicados (fatura_id + aluno_id); demais campos preservados', v_expected;
end
$$;

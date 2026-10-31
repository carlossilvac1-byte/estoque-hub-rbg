-- =====================================================================
-- 04-dados-iniciais.sql - Etapa 1: contexto inicial do projeto
-- EDP Transmissão Norte Nordeste 2 S.A. / LT 500 kV Colinas-Ribeiro Gonçalves C3
-- Lotes TN02, TN05, TN07, TN13 / Local HUB RBG (TN13)
-- Idempotente (ids fixos, on conflict do nothing). Sem e-mails da equipe.
-- =====================================================================

insert into public.empresas (id, razao_social, fantasia, tipo)
values ('00000000-0000-4000-a000-000000000001',
        'EDP Transmissão Norte Nordeste 2 S.A.', 'EDP Transmissão', 'concessionaria')
on conflict (id) do nothing;

insert into public.projetos (id, nome, leilao_contrato, empresa_id, tensao_kv, ufs)
values ('00000000-0000-4000-b000-000000000001',
        'LT 500 kV Colinas–Ribeiro Gonçalves C3', 'Leilão ANEEL 01/2024',
        '00000000-0000-4000-a000-000000000001', 500, 'TO / MA / PI')
on conflict (id) do nothing;

insert into public.locais (id, nome, projeto_id)
values ('00000000-0000-4000-c000-000000000001', 'HUB RBG',
        '00000000-0000-4000-b000-000000000001')
on conflict (id) do nothing;

insert into public.lotes (id, codigo, projeto_id, local_id, uf) values
  ('00000000-0000-4000-d000-000000000002', 'TN02', '00000000-0000-4000-b000-000000000001', null, null),
  ('00000000-0000-4000-d000-000000000005', 'TN05', '00000000-0000-4000-b000-000000000001', null, null),
  ('00000000-0000-4000-d000-000000000007', 'TN07', '00000000-0000-4000-b000-000000000001', null, null),
  ('00000000-0000-4000-d000-000000000013', 'TN13', '00000000-0000-4000-b000-000000000001',
   '00000000-0000-4000-c000-000000000001', 'PI')
on conflict (id) do nothing;

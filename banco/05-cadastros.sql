-- =====================================================================
-- 05-cadastros.sql - Etapa 2: materiais, preços de referência,
-- fornecedores e frentes de serviço
-- Idempotente. Rodar depois do 04-dados-iniciais.sql.
-- =====================================================================

-- ---------- Normalização de descrição (maiúsculas, sem acentos, espaços/hífens unificados) ----------
create or replace function public.normalizar_texto(p text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
           upper(translate(coalesce(p, ''),
             'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
             'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
           '[[:space:]\-–—_]+', ' ', 'g'));
$$;

-- ---------- materiais (catálogo) ----------
create table if not exists public.materiais (
  id                    uuid primary key default gen_random_uuid(),
  familia               text not null,
  codigo                text,
  descricao             text not null,
  tipo_categoria_torre  text,
  unidade               text not null default 'un',
  peso_unit             numeric,
  preco_unit            numeric,
  fornecedor_padrao_id  uuid,
  estoque_minimo        numeric,
  ativo                 boolean not null default true,
  criado_por            uuid,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  recebido_em           timestamptz not null default clock_timestamp(),
  excluido_em           timestamptz
);
alter table public.materiais drop constraint if exists materiais_familia_chk;
alter table public.materiais add constraint materiais_familia_chk
  check (familia in ('cabos','isoladores','fixadores','ferragem'));
alter table public.materiais drop constraint if exists materiais_valores_chk;
alter table public.materiais add constraint materiais_valores_chk
  check ((peso_unit is null or peso_unit >= 0) and (preco_unit is null or preco_unit >= 0)
         and (estoque_minimo is null or estoque_minimo >= 0));
create unique index if not exists materiais_descricao_uk
  on public.materiais (familia, public.normalizar_texto(descricao)) where excluido_em is null;
create index if not exists materiais_recebido_idx on public.materiais (recebido_em, id);

-- ---------- precos_referencia (por projeto, família e vigência) ----------
create table if not exists public.precos_referencia (
  id              uuid primary key default gen_random_uuid(),
  projeto_id      uuid not null references public.projetos(id),
  familia         text not null,
  preco           numeric not null,
  base            text not null default 'kg',
  vigencia_inicio date not null,
  observacao      text,
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  recebido_em     timestamptz not null default clock_timestamp(),
  excluido_em     timestamptz
);
alter table public.precos_referencia drop constraint if exists precos_chk;
alter table public.precos_referencia add constraint precos_chk
  check (familia in ('cabos','isoladores','fixadores','ferragem') and base in ('kg','un') and preco >= 0);
create unique index if not exists precos_vigencia_uk
  on public.precos_referencia (projeto_id, familia, vigencia_inicio) where excluido_em is null;
create index if not exists precos_recebido_idx on public.precos_referencia (recebido_em, id);

-- Preço vigente numa data (o mais recente com vigência <= data)
create or replace function public.preco_vigente(p_projeto uuid, p_familia text, p_data date)
returns numeric language sql stable as $$
  select preco from public.precos_referencia
   where projeto_id = p_projeto and familia = p_familia and excluido_em is null
     and vigencia_inicio <= coalesce(p_data, current_date)
   order by vigencia_inicio desc, criado_em desc
   limit 1;
$$;

-- ---------- fornecedores (vínculo com empresas do tipo fornecedor) ----------
create table if not exists public.fornecedores (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id),
  familias      text[] not null default '{}',
  ativo         boolean not null default true,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  recebido_em   timestamptz not null default clock_timestamp(),
  excluido_em   timestamptz
);
create unique index if not exists fornecedores_empresa_uk
  on public.fornecedores (empresa_id) where excluido_em is null;
create index if not exists fornecedores_recebido_idx on public.fornecedores (recebido_em, id);

alter table public.materiais drop constraint if exists materiais_fornecedor_fk;
alter table public.materiais add constraint materiais_fornecedor_fk
  foreign key (fornecedor_padrao_id) references public.fornecedores(id);

-- ---------- frentes_servico (destinos do Portal de Saída) ----------
create table if not exists public.frentes_servico (
  id                   uuid primary key default gen_random_uuid(),
  projeto_id           uuid not null references public.projetos(id),
  lote                 text not null,
  nome                 text not null,
  empresa_executora_id uuid references public.empresas(id),
  trecho               text,
  local_entrega        text,
  uf                   text,
  responsavel          text,
  materiais_previstos  text[] not null default '{}',
  status               text not null default 'ativa',
  criado_por           uuid,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  recebido_em          timestamptz not null default clock_timestamp(),
  excluido_em          timestamptz
);
alter table public.frentes_servico drop constraint if exists frentes_status_chk;
alter table public.frentes_servico add constraint frentes_status_chk
  check (status in ('ativa','planejada','encerrada'));
create index if not exists frentes_recebido_idx on public.frentes_servico (recebido_em, id);

-- ---------- Gatilhos padrão ----------
do $$
declare t text;
begin
  foreach t in array array['materiais','precos_referencia','fornecedores','frentes_servico'] loop
    execute format('drop trigger if exists a_padrao on public.%I', t);
    execute format('create trigger a_padrao before insert or update on public.%I
                    for each row execute function public.tg_padrao()', t);
    execute format('drop trigger if exists z_sem_delete on public.%I', t);
    execute format('create trigger z_sem_delete before delete on public.%I
                    for each row execute function public.tg_sem_delete()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Políticas ----------
-- Empresas: almoxarife também cadastra empresas do tipo fornecedor (pelo cadastro de fornecedores)
drop policy if exists empresas_inserir on public.empresas;
create policy empresas_inserir on public.empresas for insert to authenticated
  with check (public.eh_admin() or (public.pode_gravar() and tipo = 'fornecedor'));
drop policy if exists empresas_alterar on public.empresas;
create policy empresas_alterar on public.empresas for update to authenticated
  using (public.eh_admin() or (public.pode_gravar() and tipo = 'fornecedor'))
  with check (public.eh_admin() or (public.pode_gravar() and tipo = 'fornecedor'));

-- materiais: catálogo comum; usuário ativo lê, admin/almoxarife gravam
drop policy if exists materiais_ler on public.materiais;
create policy materiais_ler on public.materiais for select to authenticated
  using (public.usuario_ativo());
drop policy if exists materiais_inserir on public.materiais;
create policy materiais_inserir on public.materiais for insert to authenticated
  with check (public.pode_gravar());
drop policy if exists materiais_alterar on public.materiais;
create policy materiais_alterar on public.materiais for update to authenticated
  using (public.pode_gravar()) with check (public.pode_gravar());

-- fornecedores
drop policy if exists fornecedores_ler on public.fornecedores;
create policy fornecedores_ler on public.fornecedores for select to authenticated
  using (public.usuario_ativo());
drop policy if exists fornecedores_inserir on public.fornecedores;
create policy fornecedores_inserir on public.fornecedores for insert to authenticated
  with check (public.pode_gravar());
drop policy if exists fornecedores_alterar on public.fornecedores;
create policy fornecedores_alterar on public.fornecedores for update to authenticated
  using (public.pode_gravar()) with check (public.pode_gravar());

-- preços de referência: leem os usuários do projeto; só o admin grava
drop policy if exists precos_ler on public.precos_referencia;
create policy precos_ler on public.precos_referencia for select to authenticated
  using (public.pode_no_projeto(projeto_id));
drop policy if exists precos_inserir on public.precos_referencia;
create policy precos_inserir on public.precos_referencia for insert to authenticated
  with check (public.eh_admin());
drop policy if exists precos_alterar on public.precos_referencia;
create policy precos_alterar on public.precos_referencia for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- frentes de serviço: por projeto e lote
drop policy if exists frentes_ler on public.frentes_servico;
create policy frentes_ler on public.frentes_servico for select to authenticated
  using (public.pode_no_projeto(projeto_id) and public.pode_no_lote(lote));
drop policy if exists frentes_inserir on public.frentes_servico;
create policy frentes_inserir on public.frentes_servico for insert to authenticated
  with check (public.pode_gravar() and public.pode_no_projeto(projeto_id) and public.pode_no_lote(lote));
drop policy if exists frentes_alterar on public.frentes_servico;
create policy frentes_alterar on public.frentes_servico for update to authenticated
  using (public.pode_gravar() and public.pode_no_projeto(projeto_id) and public.pode_no_lote(lote))
  with check (public.pode_gravar() and public.pode_no_projeto(projeto_id) and public.pode_no_lote(lote));

-- ---------- Preços de referência iniciais (projeto C3) ----------
insert into public.precos_referencia (id, projeto_id, familia, preco, base, vigencia_inicio, observacao) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-b000-000000000001', 'cabos',     20.98640209, 'kg', '2024-01-01', 'Referência das planilhas de lançamento'),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-b000-000000000001', 'fixadores', 9.35,        'kg', '2024-01-01', 'Referência das planilhas de lançamento'),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-b000-000000000001', 'ferragem',  9.352,       'kg', '2024-01-01', 'Referência das planilhas de lançamento')
on conflict (id) do nothing;

-- =====================================================================
-- Sistema de Estoque de Materiais de LT - EDP Transmissão (HUB RBG)
-- 01-estrutura.sql - Etapa 1: tabelas de contexto, usuários e histórico
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- Executar no Supabase: SQL Editor > New query > colar > Run
-- =====================================================================

-- ---------- Função genérica dos gatilhos (autor, recebido_em, versão) ----------
create or replace function public.tg_padrao()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    new.criado_em  := coalesce(new.criado_em, now());
  else
    -- Rejeita versão mais antiga: mantém o registro do servidor sem erro
    if new.atualizado_em is not null and old.atualizado_em is not null
       and new.atualizado_em < old.atualizado_em then
      return null;
    end if;
    new.criado_por := old.criado_por;
    new.criado_em  := old.criado_em;
  end if;
  new.atualizado_em := coalesce(new.atualizado_em, now());
  new.recebido_em   := clock_timestamp();
  return new;
end;
$$;

-- ---------- Bloqueio de exclusão física ----------
create or replace function public.tg_sem_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Exclusão física não permitida. Use a exclusão lógica (excluido_em).'
    using errcode = '42501';
end;
$$;

-- ---------- empresas ----------
create table if not exists public.empresas (
  id            uuid primary key default gen_random_uuid(),
  razao_social  text not null,
  fantasia      text,
  cnpj          text,
  tipo          text not null default 'executora',
  contato       text,
  ativo         boolean not null default true,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  recebido_em   timestamptz not null default clock_timestamp(),
  excluido_em   timestamptz
);
alter table public.empresas drop constraint if exists empresas_tipo_chk;
alter table public.empresas add constraint empresas_tipo_chk
  check (tipo in ('concessionaria','executora','transportadora','fornecedor'));
create unique index if not exists empresas_cnpj_uk
  on public.empresas (cnpj) where cnpj is not null and excluido_em is null;
create index if not exists empresas_recebido_idx on public.empresas (recebido_em, id);

-- ---------- projetos ----------
create table if not exists public.projetos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  leilao_contrato  text,
  empresa_id       uuid references public.empresas(id),
  tensao_kv        numeric,
  ufs              text,
  inicio           date,
  termino_previsto date,
  ativo            boolean not null default true,
  criado_por       uuid,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  recebido_em      timestamptz not null default clock_timestamp(),
  excluido_em      timestamptz
);
create index if not exists projetos_recebido_idx on public.projetos (recebido_em, id);

-- ---------- locais de estoque ----------
create table if not exists public.locais (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  projeto_id    uuid not null references public.projetos(id),
  ativo         boolean not null default true,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  recebido_em   timestamptz not null default clock_timestamp(),
  excluido_em   timestamptz
);
create unique index if not exists locais_nome_uk
  on public.locais (projeto_id, upper(nome)) where excluido_em is null;
create index if not exists locais_recebido_idx on public.locais (recebido_em, id);

-- ---------- lotes ----------
create table if not exists public.lotes (
  id                   uuid primary key default gen_random_uuid(),
  codigo               text not null,
  projeto_id           uuid not null references public.projetos(id),
  empresa_executora_id uuid references public.empresas(id),
  trecho               text,
  local_id             uuid references public.locais(id),
  uf                   text,
  ativo                boolean not null default true,
  criado_por           uuid,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  recebido_em          timestamptz not null default clock_timestamp(),
  excluido_em          timestamptz
);
create unique index if not exists lotes_codigo_uk
  on public.lotes (projeto_id, upper(codigo)) where excluido_em is null;
create index if not exists lotes_recebido_idx on public.lotes (recebido_em, id);

-- ---------- usuarios (perfil e escopo de acesso) ----------
create table if not exists public.usuarios (
  id            uuid primary key,
  email         text,
  nome          text,
  perfil        text not null default 'consulta',
  status        text not null default 'pendente',
  empresa_id    uuid references public.empresas(id),
  projetos      uuid[] not null default '{}',
  lotes         text[] not null default '{}',
  locais        uuid[] not null default '{}',
  liberado_por  uuid,
  liberado_em   timestamptz,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  recebido_em   timestamptz not null default clock_timestamp(),
  excluido_em   timestamptz
);
alter table public.usuarios drop constraint if exists usuarios_perfil_chk;
alter table public.usuarios add constraint usuarios_perfil_chk
  check (perfil in ('admin','almoxarife','consulta'));
alter table public.usuarios drop constraint if exists usuarios_status_chk;
alter table public.usuarios add constraint usuarios_status_chk
  check (status in ('pendente','ativo','bloqueado'));
create index if not exists usuarios_recebido_idx on public.usuarios (recebido_em, id);

-- ---------- historico (ações destrutivas e administrativas) ----------
create table if not exists public.historico (
  id            uuid primary key default gen_random_uuid(),
  tabela        text not null,
  registro_id   uuid,
  acao          text not null,
  detalhe       jsonb,
  usuario_id    uuid,
  projeto_id    uuid,
  lote          text,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  recebido_em   timestamptz not null default clock_timestamp(),
  excluido_em   timestamptz
);
create index if not exists historico_recebido_idx on public.historico (recebido_em, id);
create index if not exists historico_registro_idx on public.historico (tabela, registro_id);

-- ---------- Gatilhos padrão em todas as tabelas ----------
do $$
declare t text;
begin
  foreach t in array array['empresas','projetos','locais','lotes','usuarios','historico'] loop
    execute format('drop trigger if exists a_padrao on public.%I', t);
    execute format('create trigger a_padrao before insert or update on public.%I
                    for each row execute function public.tg_padrao()', t);
    execute format('drop trigger if exists z_sem_delete on public.%I', t);
    execute format('create trigger z_sem_delete before delete on public.%I
                    for each row execute function public.tg_sem_delete()', t);
  end loop;
end $$;

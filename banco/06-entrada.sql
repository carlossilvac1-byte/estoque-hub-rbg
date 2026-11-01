-- =====================================================================
-- 06-entrada.sql - Etapa 3: Portal de Entrada (entradas, itens,
-- conferência física e anexos PDF), com cálculo no servidor
-- Idempotente. Rodar depois do 05-cadastros.sql.
-- =====================================================================

-- ---------- entradas (documento: NF / romaneio) ----------
create table if not exists public.entradas (
  id               uuid primary key default gen_random_uuid(),
  projeto_id       uuid not null references public.projetos(id),
  lote             text not null,
  local_id         uuid not null references public.locais(id),
  familia          text not null,
  data_recebimento date not null,
  nf               text not null,
  serie            text,
  data_emissao     date,
  chave_nfe        text,
  romaneio         text,
  fornecedor_id    uuid not null references public.fornecedores(id),
  transportadora   text,
  placa            text,
  status           text not null default 'rascunho',
  observacoes      text,
  confirmado_em    timestamptz,
  confirmado_por   uuid,
  criado_por       uuid,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  recebido_em      timestamptz not null default clock_timestamp(),
  excluido_em      timestamptz
);
alter table public.entradas drop constraint if exists entradas_chk;
alter table public.entradas add constraint entradas_chk check (
  familia in ('cabos','isoladores','fixadores','ferragem')
  and status in ('rascunho','confirmado')
  and (chave_nfe is null or chave_nfe ~ '^[0-9]{44}$')
  and (placa is null or placa ~ '^[A-Z]{3}[0-9]{4}$' or placa ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$'));
-- NF duplicada: mesma NF + série + fornecedor não entra duas vezes
create unique index if not exists entradas_nf_uk
  on public.entradas (fornecedor_id, upper(btrim(nf)), upper(coalesce(btrim(serie), '')))
  where excluido_em is null;
create index if not exists entradas_recebido_idx on public.entradas (recebido_em, id);
create index if not exists entradas_ctx_idx on public.entradas (projeto_id, lote, local_id);

-- ---------- entrada_itens ----------
create table if not exists public.entrada_itens (
  id               uuid primary key default gen_random_uuid(),
  entrada_id       uuid not null references public.entradas(id),
  projeto_id       uuid not null references public.projetos(id),
  lote             text not null,
  ordem            integer,
  material_id      uuid not null references public.materiais(id),
  descricao        text,
  carretel         text,
  tipo_carretel    text,
  lance_m          numeric,
  quantidade       numeric,
  peso_unit        numeric,
  peso_liquido     numeric,
  preco_unit       numeric,
  valor            numeric,
  status_item      text not null default 'conferido',
  motivo_pendencia text,
  criado_por       uuid,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  recebido_em      timestamptz not null default clock_timestamp(),
  excluido_em      timestamptz
);
alter table public.entrada_itens drop constraint if exists entrada_itens_chk;
alter table public.entrada_itens add constraint entrada_itens_chk check (
  status_item in ('conferido','pendente','aguardando')
  and (lance_m is null or lance_m >= 0) and (quantidade is null or quantidade >= 0)
  and (peso_liquido is null or peso_liquido >= 0) and (valor is null or valor >= 0));
-- Carretel é único no projeto (cada carretel entra uma vez e sai inteiro)
create unique index if not exists entrada_itens_carretel_uk
  on public.entrada_itens (projeto_id, upper(btrim(carretel)))
  where carretel is not null and btrim(carretel) <> '' and excluido_em is null;
create index if not exists entrada_itens_recebido_idx on public.entrada_itens (recebido_em, id);
create index if not exists entrada_itens_entrada_idx on public.entrada_itens (entrada_id);

-- ---------- entrada_conferencia (checklist físico, 1:1 com a entrada) ----------
create table if not exists public.entrada_conferencia (
  id                     uuid primary key,
  entrada_id             uuid not null references public.entradas(id),
  projeto_id             uuid not null references public.projetos(id),
  lote                   text not null,
  quantidades_conferidas boolean not null default false,
  volumes_conferidos     boolean not null default false,
  avarias_registradas    boolean not null default false,
  pendencias_comunicadas boolean not null default false,
  criado_por             uuid,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  recebido_em            timestamptz not null default clock_timestamp(),
  excluido_em            timestamptz
);
create unique index if not exists entrada_conferencia_uk
  on public.entrada_conferencia (entrada_id) where excluido_em is null;
create index if not exists entrada_conferencia_recebido_idx on public.entrada_conferencia (recebido_em, id);

-- ---------- anexos (PDF no Storage) ----------
create table if not exists public.anexos (
  id              uuid primary key default gen_random_uuid(),
  documento_tipo  text not null,
  documento_id    uuid not null,
  projeto_id      uuid not null references public.projetos(id),
  lote            text not null,
  tipo            text not null,
  caminho_storage text not null,
  nome_arquivo    text not null,
  bytes           bigint,
  paginas         integer,
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  recebido_em     timestamptz not null default clock_timestamp(),
  excluido_em     timestamptz
);
alter table public.anexos drop constraint if exists anexos_chk;
alter table public.anexos add constraint anexos_chk check (
  documento_tipo in ('entrada','saida')
  and tipo in ('nf','relatorio_fotografico','romaneio','nf_remessa','solicitacao_cox')
  and (bytes is null or bytes <= 20971520));
create index if not exists anexos_recebido_idx on public.anexos (recebido_em, id);
create index if not exists anexos_documento_idx on public.anexos (documento_tipo, documento_id);

-- ---------- Cálculo do item no servidor ----------
-- Cabos:       valor = peso líquido (informado) x R$/kg da família
-- Isoladores:  valor = quantidade x preço unitário do item (material)
-- Fixadores e Ferragem: peso = peso unit. x quantidade; valor = peso x R$/kg da família
-- Sem peso unitário (ou sem preço): status Pendente e valor 0. R$ com 2 casas, kg com 3.
create or replace function public.tg_entrada_item_calcula()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  e public.entradas%rowtype;
  m public.materiais%rowtype;
  v_preco numeric;
begin
  select * into e from public.entradas where id = new.entrada_id;
  if not found then
    raise exception 'Entrada % não encontrada para o item.', new.entrada_id using errcode = '23503';
  end if;
  select * into m from public.materiais where id = new.material_id;
  if not found then
    raise exception 'Material % não encontrado.', new.material_id using errcode = '23503';
  end if;
  if m.familia <> e.familia then
    raise exception 'O material "%" é da família %, mas a entrada é de %.', m.descricao, m.familia, e.familia
      using errcode = '23514';
  end if;
  new.projeto_id := e.projeto_id;
  new.lote := e.lote;
  new.descricao := coalesce(nullif(btrim(new.descricao), ''), m.descricao);
  new.motivo_pendencia := null;
  new.status_item := case when new.status_item = 'aguardando' then 'aguardando' else 'conferido' end;

  if e.familia in ('cabos','fixadores','ferragem') then
    v_preco := public.preco_vigente(e.projeto_id, e.familia, e.data_recebimento);
  end if;

  if e.familia = 'cabos' then
    new.quantidade := coalesce(new.quantidade, 1);
    new.peso_unit := null;
    new.peso_liquido := round(coalesce(new.peso_liquido, 0), 3);
    new.preco_unit := v_preco;
    if v_preco is null then
      new.status_item := 'pendente'; new.motivo_pendencia := 'Sem preço de referência vigente para Cabos';
      new.valor := 0;
    else
      new.valor := round(new.peso_liquido * v_preco, 2);
    end if;
  elsif e.familia = 'isoladores' then
    new.peso_unit := null;
    new.peso_liquido := round(coalesce(new.peso_liquido, 0), 3);
    new.preco_unit := m.preco_unit;
    if m.preco_unit is null then
      new.status_item := 'pendente'; new.motivo_pendencia := 'Material sem preço unitário';
      new.valor := 0;
    else
      new.valor := round(coalesce(new.quantidade, 0) * m.preco_unit, 2);
    end if;
  else
    new.peso_unit := m.peso_unit;
    new.preco_unit := v_preco;
    if m.peso_unit is null then
      new.status_item := 'pendente'; new.motivo_pendencia := 'Material sem peso unitário';
      new.peso_liquido := 0; new.valor := 0;
    elsif v_preco is null then
      new.peso_liquido := round(m.peso_unit * coalesce(new.quantidade, 0), 3);
      new.status_item := 'pendente'; new.motivo_pendencia := 'Sem preço de referência vigente';
      new.valor := 0;
    else
      new.peso_liquido := round(m.peso_unit * coalesce(new.quantidade, 0), 3);
      new.valor := round(new.peso_liquido * v_preco, 2);
    end if;
  end if;
  return new;
end;
$$;

-- ---------- Regras de confirmação e de edição ----------
-- Confirmar exige NF e relatório fotográfico anexados (anexos sobem antes da entrada).
-- Entrada confirmada só pode ser alterada/excluída pelo admin.
-- Sem security definer: current_user precisa ser o papel de quem chamou.
create or replace function public.tg_entrada_regras()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'confirmado' and new.excluido_em is null
     and (tg_op = 'INSERT' or old.status <> 'confirmado') then
    if not exists (select 1 from public.anexos a where a.documento_tipo = 'entrada' and a.documento_id = new.id
                   and a.tipo = 'nf' and a.excluido_em is null) then
      raise exception 'Recebimento sem a nota fiscal anexada (PDF).' using errcode = '23514';
    end if;
    if not exists (select 1 from public.anexos a where a.documento_tipo = 'entrada' and a.documento_id = new.id
                   and a.tipo = 'relatorio_fotografico' and a.excluido_em is null) then
      raise exception 'Recebimento sem o relatório fotográfico anexado (PDF).' using errcode = '23514';
    end if;
    new.confirmado_em := coalesce(new.confirmado_em, now());
    new.confirmado_por := coalesce(auth.uid(), new.confirmado_por);
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmado' and current_user in ('authenticated','anon')
     and not public.eh_admin() then
    raise exception 'Recebimento já confirmado: somente o administrador pode alterar.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Sem security definer: current_user precisa ser o papel de quem chamou.
create or replace function public.tg_entrada_filho_regras()
returns trigger language plpgsql set search_path = public as $$
declare v_status text; v_conf timestamptz;
begin
  select status, confirmado_em into v_status, v_conf from public.entradas where id = new.entrada_id;
  -- Edições feitas antes da confirmação (atualizado_em <= confirmado_em) ainda podem chegar depois dela.
  if v_status = 'confirmado' and current_user in ('authenticated','anon') and not public.eh_admin()
     and tg_op = 'UPDATE' and new.atualizado_em > coalesce(v_conf, now()) then
    raise exception 'Recebimento já confirmado: somente o administrador pode alterar os itens.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------- Gatilhos ----------
do $$
declare t text;
begin
  foreach t in array array['entradas','entrada_itens','entrada_conferencia','anexos'] loop
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
drop trigger if exists b_regras on public.entradas;
create trigger b_regras before insert or update on public.entradas
  for each row execute function public.tg_entrada_regras();
drop trigger if exists b_regras on public.entrada_itens;
create trigger b_regras before insert or update on public.entrada_itens
  for each row execute function public.tg_entrada_filho_regras();
drop trigger if exists c_calcula on public.entrada_itens;
create trigger c_calcula before insert or update on public.entrada_itens
  for each row execute function public.tg_entrada_item_calcula();
drop trigger if exists b_regras on public.entrada_conferencia;
create trigger b_regras before insert or update on public.entrada_conferencia
  for each row execute function public.tg_entrada_filho_regras();

-- ---------- Políticas (projeto + lote; entrada também pelo local) ----------
drop policy if exists entradas_ler on public.entradas;
create policy entradas_ler on public.entradas for select to authenticated
  using (public.pode_no_lote(lote) and public.pode_no_local(projeto_id, local_id));
drop policy if exists entradas_inserir on public.entradas;
create policy entradas_inserir on public.entradas for insert to authenticated
  with check (public.pode_gravar() and public.pode_no_lote(lote) and public.pode_no_local(projeto_id, local_id));
drop policy if exists entradas_alterar on public.entradas;
create policy entradas_alterar on public.entradas for update to authenticated
  using (public.pode_gravar() and public.pode_no_lote(lote) and public.pode_no_local(projeto_id, local_id))
  with check (public.pode_gravar() and public.pode_no_lote(lote) and public.pode_no_local(projeto_id, local_id));

do $$
declare t text;
begin
  foreach t in array array['entrada_itens','entrada_conferencia','anexos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ler', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (public.pode_no_projeto(projeto_id) and public.pode_no_lote(lote))', t || '_ler', t);
    execute format('drop policy if exists %I on public.%I', t || '_inserir', t);
    execute format('create policy %I on public.%I for insert to authenticated
                    with check (public.pode_gravar() and public.pode_no_projeto(projeto_id) and public.pode_no_lote(lote))', t || '_inserir', t);
    execute format('drop policy if exists %I on public.%I', t || '_alterar', t);
    execute format('create policy %I on public.%I for update to authenticated
                    using (public.pode_gravar() and public.pode_no_projeto(projeto_id) and public.pode_no_lote(lote))
                    with check (public.pode_gravar() and public.pode_no_projeto(projeto_id) and public.pode_no_lote(lote))', t || '_alterar', t);
  end loop;
end $$;

-- ---------- Tempo real ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entradas') then
    alter publication supabase_realtime add table public.entradas;
  end if;
end $$;

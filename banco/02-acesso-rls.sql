-- =====================================================================
-- 02-acesso-rls.sql - Etapa 1: funções de acesso, RLS e cadastro de usuário
-- Idempotente. Rodar depois do 01-estrutura.sql.
-- =====================================================================

-- ---------- Funções de acesso (security definer) ----------
create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.status = 'ativo' and u.excluido_em is null);
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.status = 'ativo'
                   and u.perfil = 'admin' and u.excluido_em is null);
$$;

-- admin ou almoxarife ativo (perfis que gravam movimentos)
create or replace function public.pode_gravar()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.status = 'ativo'
                   and u.perfil in ('admin','almoxarife') and u.excluido_em is null);
$$;

create or replace function public.pode_no_projeto(p_projeto uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin() or exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.status = 'ativo' and u.excluido_em is null
      and p_projeto = any (u.projetos));
$$;

create or replace function public.pode_no_lote(p_lote text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin() or exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.status = 'ativo' and u.excluido_em is null
      and upper(p_lote) = any (select upper(x) from unnest(u.lotes) x));
$$;

-- Lista de locais vazia = todos os locais dos projetos liberados
create or replace function public.pode_no_local(p_projeto uuid, p_local uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin() or exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.status = 'ativo' and u.excluido_em is null
      and p_projeto = any (u.projetos)
      and (cardinality(u.locais) = 0 or p_local is null or p_local = any (u.locais)));
$$;

-- ---------- Proteção do cadastro de usuários ----------
-- Quem não é admin não altera perfil, status nem escopo (nem o próprio).
-- Sem security definer: current_user precisa ser o papel de quem chamou.
create or replace function public.tg_usuarios_protege()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') or public.eh_admin() then
    if tg_op = 'UPDATE' and old.status <> 'ativo' and new.status = 'ativo' then
      new.liberado_por := coalesce(auth.uid(), new.liberado_por);
      new.liberado_em  := now();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.perfil := 'consulta'; new.status := 'pendente'; new.empresa_id := null;
    new.projetos := '{}'; new.lotes := '{}'; new.locais := '{}';
    new.liberado_por := null; new.liberado_em := null; new.excluido_em := null;
  else
    new.perfil := old.perfil; new.status := old.status; new.empresa_id := old.empresa_id;
    new.projetos := old.projetos; new.lotes := old.lotes; new.locais := old.locais;
    new.liberado_por := old.liberado_por; new.liberado_em := old.liberado_em;
    new.email := old.email; new.excluido_em := old.excluido_em;
  end if;
  return new;
end;
$$;
drop trigger if exists b_protege on public.usuarios;
create trigger b_protege before insert or update on public.usuarios
  for each row execute function public.tg_usuarios_protege();

-- ---------- Cadastro novo no Auth entra como pendente ----------
create or replace function public.tg_novo_usuario_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, email, nome, perfil, status)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
          'consulta', 'pendente')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists estoque_novo_usuario on auth.users;
create trigger estoque_novo_usuario after insert on auth.users
  for each row execute function public.tg_novo_usuario_auth();

-- ---------- Permissões de tabela ----------
grant usage on schema public to anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['empresas','projetos','locais','lotes','usuarios','historico'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Políticas ----------
-- empresas: todo usuário ativo lê; só admin grava
drop policy if exists empresas_ler on public.empresas;
create policy empresas_ler on public.empresas for select to authenticated
  using (public.usuario_ativo());
drop policy if exists empresas_inserir on public.empresas;
create policy empresas_inserir on public.empresas for insert to authenticated
  with check (public.eh_admin());
drop policy if exists empresas_alterar on public.empresas;
create policy empresas_alterar on public.empresas for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- projetos
drop policy if exists projetos_ler on public.projetos;
create policy projetos_ler on public.projetos for select to authenticated
  using (public.pode_no_projeto(id));
drop policy if exists projetos_inserir on public.projetos;
create policy projetos_inserir on public.projetos for insert to authenticated
  with check (public.eh_admin());
drop policy if exists projetos_alterar on public.projetos;
create policy projetos_alterar on public.projetos for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- locais
drop policy if exists locais_ler on public.locais;
create policy locais_ler on public.locais for select to authenticated
  using (public.pode_no_local(projeto_id, id));
drop policy if exists locais_inserir on public.locais;
create policy locais_inserir on public.locais for insert to authenticated
  with check (public.eh_admin());
drop policy if exists locais_alterar on public.locais;
create policy locais_alterar on public.locais for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- lotes
drop policy if exists lotes_ler on public.lotes;
create policy lotes_ler on public.lotes for select to authenticated
  using (public.pode_no_projeto(projeto_id) and public.pode_no_lote(codigo));
drop policy if exists lotes_inserir on public.lotes;
create policy lotes_inserir on public.lotes for insert to authenticated
  with check (public.eh_admin());
drop policy if exists lotes_alterar on public.lotes;
create policy lotes_alterar on public.lotes for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- usuarios: cada um vê o próprio registro; admin vê e altera todos
drop policy if exists usuarios_ler on public.usuarios;
create policy usuarios_ler on public.usuarios for select to authenticated
  using (id = auth.uid() or public.eh_admin());
drop policy if exists usuarios_inserir on public.usuarios;
create policy usuarios_inserir on public.usuarios for insert to authenticated
  with check (id = auth.uid() or public.eh_admin());
drop policy if exists usuarios_alterar on public.usuarios;
create policy usuarios_alterar on public.usuarios for update to authenticated
  using (id = auth.uid() or public.eh_admin())
  with check (id = auth.uid() or public.eh_admin());

-- historico: usuário ativo registra; admin lê tudo, demais leem o que registraram
drop policy if exists historico_ler on public.historico;
create policy historico_ler on public.historico for select to authenticated
  using (public.eh_admin() or criado_por = auth.uid());
drop policy if exists historico_inserir on public.historico;
create policy historico_inserir on public.historico for insert to authenticated
  with check (public.usuario_ativo());

-- ---------- Tempo real ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['empresas','projetos','locais','lotes','usuarios'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

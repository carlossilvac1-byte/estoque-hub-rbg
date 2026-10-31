-- =====================================================================
-- 03-storage.sql - Etapa 1: bucket privado "estoque" e políticas
-- Idempotente. Rodar depois do 02-acesso-rls.sql.
-- Caminhos:
--   anexos/<projeto_id>/<lote>/<tipo_doc>/<id_documento>/<arquivo>.pdf
--   lc/<projeto_id>/<revisao_id>/<arquivo>.xlsx
-- Ids comparados como TEXTO (sem ::uuid), conforme o padrão.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estoque', 'estoque', false, 20971520,
        array['application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel.sheet.macroEnabled.12',
              'application/octet-stream'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.pode_no_caminho(p_nome text, p_gravar boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_raiz text := split_part(p_nome, '/', 1);
  v_proj text := split_part(p_nome, '/', 2);
  v_lote text := split_part(p_nome, '/', 3);
  u public.usuarios%rowtype;
begin
  if public.eh_admin() then return true; end if;
  select * into u from public.usuarios
   where id = auth.uid() and status = 'ativo' and excluido_em is null;
  if not found then return false; end if;
  if p_gravar and u.perfil not in ('admin','almoxarife') then return false; end if;
  if not exists (select 1 from unnest(u.projetos) x where x::text = v_proj) then
    return false;
  end if;
  if v_raiz = 'anexos' then
    return exists (select 1 from unnest(u.lotes) l where upper(l) = upper(v_lote));
  elsif v_raiz = 'lc' then
    return true;
  end if;
  return false;
end;
$$;

drop policy if exists estoque_ler on storage.objects;
create policy estoque_ler on storage.objects for select to authenticated
  using (bucket_id = 'estoque' and public.pode_no_caminho(name, false));

drop policy if exists estoque_gravar on storage.objects;
create policy estoque_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'estoque' and public.pode_no_caminho(name, true));

drop policy if exists estoque_atualizar on storage.objects;
create policy estoque_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'estoque' and public.pode_no_caminho(name, true))
  with check (bucket_id = 'estoque' and public.pode_no_caminho(name, true));
-- Sem política de DELETE: arquivos não são apagados pelo app.

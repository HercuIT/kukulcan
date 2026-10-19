-- WFPR-003: User Created Node Definitions anidadas (árbol sin límite de profundidad) y
-- conexiones del lienzo guardadas con el workflow (necesarias para "expandir al soltar").

-- =========================================================
-- Conexiones del lienzo
-- =========================================================

-- null = workflow guardado antes de WFPR-003 (el editor le regenera las aristas por defecto);
-- un arreglo, aunque esté vacío, es lo que el usuario guardó.
alter table public.workflows add column connections jsonb
  check (connections is null or jsonb_typeof(connections) = 'array');

grant insert (connections) on public.workflows to authenticated;
grant update (connections) on public.workflows to authenticated;

-- La versión también sube cuando cambian las conexiones.
create or replace function public.workflows_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    if new.name is distinct from old.name
       or new.nodes is distinct from old.nodes
       or new.connections is distinct from old.connections then
      new.version := old.version + 1;
    end if;
    new.last_modified_at := now();
    new.last_modified_by := auth.uid();
  end if;
  return new;
end $$;

-- =========================================================
-- Definiciones creadas por usuarios
-- =========================================================

create type public.definition_kind as enum ('user', 'predefined');

create table public.user_definitions (
  id             uuid primary key default gen_random_uuid(),
  parent_id      uuid references public.user_definitions on delete cascade,
  kind           public.definition_kind not null default 'user',
  name           text not null check (btrim(name) <> ''),
  version        text not null default '1.0',
  description    text,
  abstract       text,
  implementation jsonb not null default '{}' check (jsonb_typeof(implementation) = 'object'),
  parameters     jsonb not null default '[]' check (jsonb_typeof(parameters) = 'array'),
  predefined     jsonb,          -- kind = 'predefined': el elemento predefinido referenciado
  position       integer not null default 0,
  created_by     uuid default auth.uid() references public.profiles,
  created_at     timestamptz not null default now(),
  updated_by     uuid default auth.uid() references public.profiles,
  updated_at     timestamptz not null default now(),
  check ((kind = 'predefined') = (predefined is not null)),
  check (kind = 'user' or parent_id is not null)
);

-- Nombre + versión únicos entre hermanos (también en la raíz: nulls not distinct).
create unique index user_definitions_sibling_name
  on public.user_definitions (parent_id, lower(btrim(name)), version) nulls not distinct
  where kind = 'user';
create unique index user_definitions_sibling_predefined
  on public.user_definitions (parent_id, (predefined ->> 'key'))
  where kind = 'predefined';
create index on public.user_definitions (parent_id, position);

create function public.user_definitions_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

create trigger user_definitions_before_update
  before update on public.user_definitions
  for each row execute function public.user_definitions_before_update();

alter table public.user_definitions enable row level security;
revoke all on public.user_definitions from anon, authenticated;
grant select on public.user_definitions to authenticated;

-- Biblioteca compartida: cualquier usuario con sesión la lee; los cambios van por RPC.
create policy user_definitions_select on public.user_definitions
  for select to authenticated using (true);

alter publication supabase_realtime add table public.user_definitions;

-- =========================================================
-- RPC. Errores: 28000 sin sesión, 42501 sin permiso, P0002 no existe, P0001 regla rota.
-- El HINT identifica la regla (cycle, duplicate_sibling, invalid_parent, predefined_needs_parent,
-- name_required) para que el cliente muestre su texto de UI_STRINGS.
-- =========================================================

-- Sesión + rol designer + un solo cambio al árbol a la vez (evita ciclos con movimientos simultáneos).
create function private.begin_definition_change() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Debes estar autenticado.' using errcode = '28000';
  end if;
  if not public.has_role('designer') then
    raise exception 'Se requiere el rol de Designer.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.user_definitions'));
end $$;

create function private.get_definition(def uuid) returns public.user_definitions
language plpgsql security definer set search_path = '' as $$
declare d public.user_definitions;
begin
  select * into d from public.user_definitions where id = def;
  if not found then
    raise exception 'La definición no existe.' using errcode = 'P0002';
  end if;
  return d;
end $$;

-- Un padre válido existe y es de tipo 'user' (las referencias predefinidas no tienen hijos).
create function private.require_user_parent(parent uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if parent is null then return; end if;
  if (private.get_definition(parent)).kind <> 'user' then
    raise exception 'Una definición predefinida no puede contener otras.'
      using errcode = 'P0001', hint = 'invalid_parent';
  end if;
end $$;

create function private.next_position(parent uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(max(position) + 1, 0) from public.user_definitions
   where parent_id is not distinct from parent;
$$;

create function private.raise_duplicate_sibling() returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'Ya existe una definición con ese nombre y versión en este nivel.'
    using errcode = 'P0001', hint = 'duplicate_sibling';
end $$;

-- Renumera 0..n-1 a los hijos de un padre, en su orden actual (sin contar `skip`).
create function private.normalize_positions(parent uuid, skip uuid default null) returns void
language sql security definer set search_path = '' as $$
  update public.user_definitions d set position = o.rn - 1
    from (select id, row_number() over (order by position, lower(name), id) as rn
            from public.user_definitions
           where parent_id is not distinct from parent and id is distinct from skip) o
   where d.id = o.id and d.position <> o.rn - 1;
$$;

-- parameters debe ser un arreglo e implementation un objeto: el panel los recorre así, y un valor
-- malformado rompería el árbol compartido para todos los lectores.
create function private.require_valid_fields(fields jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if fields ? 'parameters' and jsonb_typeof(fields -> 'parameters') <> 'array' then
    raise exception 'parameters debe ser una lista.' using errcode = 'P0001', hint = 'invalid_fields';
  end if;
  if fields ? 'implementation' and jsonb_typeof(fields -> 'implementation') <> 'object' then
    raise exception 'implementation debe ser un objeto.' using errcode = 'P0001', hint = 'invalid_fields';
  end if;
end $$;

revoke all on schema private from public, anon, authenticated;

create function public.create_definition(parent uuid, fields jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform private.begin_definition_change();
  perform private.require_user_parent(parent);
  perform private.require_valid_fields(fields);
  if nullif(btrim(fields ->> 'name'), '') is null then
    raise exception 'El nombre es obligatorio.' using errcode = 'P0001', hint = 'name_required';
  end if;
  begin
    insert into public.user_definitions
      (parent_id, kind, name, version, description, abstract, implementation, parameters, position)
    values (
      parent, 'user', btrim(fields ->> 'name'),
      coalesce(nullif(btrim(fields ->> 'version'), ''), '1.0'),
      fields ->> 'description', fields ->> 'abstract',
      coalesce(fields -> 'implementation', '{}'), coalesce(fields -> 'parameters', '[]'),
      private.next_position(parent))
    returning id into new_id;
  exception when unique_violation then
    perform private.raise_duplicate_sibling();
  end;
  return new_id;
end $$;

create function public.add_predefined_child(parent uuid, predefined jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform private.begin_definition_change();
  if parent is null then
    raise exception 'Una referencia predefinida necesita un padre.'
      using errcode = 'P0001', hint = 'predefined_needs_parent';
  end if;
  perform private.require_user_parent(parent);
  if nullif(btrim(predefined ->> 'key'), '') is null
     or nullif(btrim(predefined ->> 'label'), '') is null then
    raise exception 'La referencia predefinida necesita key y label.'
      using errcode = 'P0001', hint = 'name_required';
  end if;
  begin
    insert into public.user_definitions (parent_id, kind, name, predefined, position)
    values (parent, 'predefined', btrim(predefined ->> 'label'), predefined,
            private.next_position(parent))
    returning id into new_id;
  exception when unique_violation then
    perform private.raise_duplicate_sibling();
  end;
  return new_id;
end $$;

create function public.update_definition(def uuid, fields jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.user_definitions;
begin
  perform private.begin_definition_change();
  d := private.get_definition(def);
  if d.kind <> 'user' then
    raise exception 'Las referencias predefinidas no se editan aquí.'
      using errcode = 'P0001', hint = 'invalid_parent';
  end if;
  perform private.require_valid_fields(fields);
  if fields ? 'name' and nullif(btrim(fields ->> 'name'), '') is null then
    raise exception 'El nombre es obligatorio.' using errcode = 'P0001', hint = 'name_required';
  end if;
  begin
    update public.user_definitions set
      name = coalesce(btrim(fields ->> 'name'), name),
      version = coalesce(nullif(btrim(fields ->> 'version'), ''), version),
      description = case when fields ? 'description' then fields ->> 'description' else description end,
      abstract = case when fields ? 'abstract' then fields ->> 'abstract' else abstract end,
      implementation = coalesce(fields -> 'implementation', implementation),
      parameters = coalesce(fields -> 'parameters', parameters)
    where id = def;
  exception when unique_violation then
    perform private.raise_duplicate_sibling();
  end;
end $$;

-- Mueve (o reordena) una definición con todo su subárbol. new_parent null = nivel superior;
-- new_index null = al final de los hermanos.
create function public.move_definition(def uuid, new_parent uuid, new_index integer default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.user_definitions;
  target integer;
begin
  perform private.begin_definition_change();
  d := private.get_definition(def);
  perform private.require_user_parent(new_parent);
  if new_parent is null and d.kind = 'predefined' then
    raise exception 'Una referencia predefinida necesita un padre.'
      using errcode = 'P0001', hint = 'predefined_needs_parent';
  end if;
  -- Sin ciclos: el nuevo padre no puede ser la definición ni ninguno de sus descendientes.
  if new_parent is not null and exists (
    with recursive ancestors(id, parent_id) as (
      select id, parent_id from public.user_definitions where id = new_parent
      union all
      select p.id, p.parent_id from public.user_definitions p
        join ancestors a on p.id = a.parent_id
    )
    select 1 from ancestors where id = def
  ) then
    raise exception 'No se puede mover una definición dentro de sí misma.'
      using errcode = 'P0001', hint = 'cycle';
  end if;

  -- Se cierra el hueco que deja entre sus hermanos actuales.
  perform private.normalize_positions(d.parent_id, def);

  select count(*) into target from public.user_definitions
   where parent_id is not distinct from new_parent and id <> def;
  if new_index is not null and new_index between 0 and target then
    target := new_index;
  end if;
  update public.user_definitions set position = position + 1
   where parent_id is not distinct from new_parent and id <> def and position >= target;

  begin
    update public.user_definitions set parent_id = new_parent, position = target where id = def;
  exception when unique_violation then
    perform private.raise_duplicate_sibling();
  end;
  perform private.normalize_positions(new_parent);
end $$;

-- Borra una definición. keep_children = false borra todo su subárbol (cascade); true sube a sus
-- hijos al padre de la definición, al final, en su orden.
create function public.delete_definition(def uuid, keep_children boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.user_definitions;
  base integer;
begin
  perform private.begin_definition_change();
  d := private.get_definition(def);
  if keep_children then
    if d.parent_id is null and exists (
      select 1 from public.user_definitions where parent_id = def and kind = 'predefined'
    ) then
      raise exception 'Las referencias predefinidas no pueden quedar en el nivel superior.'
        using errcode = 'P0001', hint = 'predefined_needs_parent';
    end if;
    base := private.next_position(d.parent_id);
    begin
      update public.user_definitions set parent_id = d.parent_id, position = base + position
       where parent_id = def;
    exception when unique_violation then
      perform private.raise_duplicate_sibling();
    end;
  end if;
  delete from public.user_definitions where id = def;
  perform private.normalize_positions(d.parent_id);
end $$;

revoke execute on function
  public.create_definition(uuid, jsonb), public.add_predefined_child(uuid, jsonb),
  public.update_definition(uuid, jsonb), public.move_definition(uuid, uuid, integer),
  public.delete_definition(uuid, boolean), public.user_definitions_before_update()
from public, anon;
grant execute on function
  public.create_definition(uuid, jsonb), public.add_predefined_child(uuid, jsonb),
  public.update_definition(uuid, jsonb), public.move_definition(uuid, uuid, integer),
  public.delete_definition(uuid, boolean)
to authenticated;

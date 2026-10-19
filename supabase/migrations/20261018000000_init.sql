-- Kukulcan: Firebase → Supabase.
-- Esquema inicial, RLS, triggers y funciones RPC que reemplazan a las Cloud Functions.

-- =========================================================
-- Tipos y tablas
-- =========================================================

create type public.workflow_status as enum ('draft', 'pending_review', 'changes_requested', 'approved');
create type public.history_kind as enum ('checkout', 'changes_requested');

create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text not null unique,
  designer   boolean not null default false,
  reviewer   boolean not null default false,
  deployer   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.workflows (
  id                   uuid primary key default gen_random_uuid(),
  legacy_id            text unique,                 -- Firestore document id, kept for the cutover
  name                 text not null,
  nodes                jsonb not null default '[]',
  status               public.workflow_status not null default 'draft',
  version              integer not null default 1,
  checkout_description text,
  assigned_reviewer_id uuid references public.profiles,
  approved_by          uuid references public.profiles,
  deployed_by          uuid references public.profiles,
  created_by           uuid not null default auth.uid() references public.profiles,
  created_at           timestamptz not null default now(),
  last_modified_by     uuid default auth.uid() references public.profiles,
  last_modified_at     timestamptz not null default now()
);

create table public.workflow_designers (
  workflow_id uuid references public.workflows on delete cascade,
  user_id     uuid references public.profiles on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (workflow_id, user_id)
);

create table public.workflow_history (
  id          bigint generated always as identity primary key,
  workflow_id uuid not null references public.workflows on delete cascade,
  kind        public.history_kind not null,
  description text,
  user_id     uuid references public.profiles,
  created_at  timestamptz not null default now()
);

create table public.server_logs (
  id          bigint generated always as identity primary key,
  request_id  uuid,
  level       text not null check (level in ('info', 'warn', 'error')),
  event       text,
  workflow_id text,
  user_id     text,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index on public.workflows (status);
create index on public.workflows (assigned_reviewer_id);
create index on public.workflow_designers (user_id);
create index on public.workflow_history (workflow_id, created_at desc);
create index on public.server_logs (request_id);

-- =========================================================
-- Helpers usados por las políticas (security definer para no recursar por RLS)
-- =========================================================

create function public.is_workflow_designer(wf uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workflow_designers
                 where workflow_id = wf and user_id = (select auth.uid()));
$$;

create function public.has_role(role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case role when 'designer' then designer
                                    when 'reviewer' then reviewer
                                    when 'deployer' then deployer end
                   from public.profiles where id = (select auth.uid())), false);
$$;

create function public.can_read_workflow(wf uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workflows w
    where w.id = wf
      and (public.is_workflow_designer(w.id)
           or w.assigned_reviewer_id = (select auth.uid())
           or (w.status = 'approved' and public.has_role('deployer')))
  );
$$;

-- =========================================================
-- Triggers
-- =========================================================

-- Cada alta en auth.users crea su perfil sin roles (reemplaza el setDoc(roles/…) de Login.js).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sella los cambios hechos por usuarios. Las escrituras del service role (migración de datos)
-- no tienen auth.uid() y conservan sus propios valores.
-- La versión solo sube cuando cambia el contenido (nombre o nodos), como hoy al guardar.
create function public.workflows_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    if new.name is distinct from old.name or new.nodes is distinct from old.nodes then
      new.version := old.version + 1;
    end if;
    new.last_modified_at := now();
    new.last_modified_by := auth.uid();
  end if;
  return new;
end $$;

create trigger workflows_before_update
  before update on public.workflows
  for each row execute function public.workflows_before_update();

-- El creador queda como primer diseñador del workflow.
create function public.workflows_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workflow_designers (workflow_id, user_id)
  values (new.id, new.created_by)
  on conflict do nothing;
  return new;
end $$;

create trigger workflows_after_insert
  after insert on public.workflows
  for each row execute function public.workflows_after_insert();

-- =========================================================
-- Privilegios y RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_designers enable row level security;
alter table public.workflow_history enable row level security;
alter table public.server_logs enable row level security;

revoke all on public.profiles, public.workflows, public.workflow_designers,
              public.workflow_history, public.server_logs from anon, authenticated;

grant select on public.profiles, public.workflows, public.workflow_designers,
                public.workflow_history to authenticated;

-- El cliente solo escribe el contenido; estado, revisor y aprobación pasan por RPC.
grant insert (id, name, nodes, checkout_description, created_by) on public.workflows to authenticated;
grant update (name, nodes, checkout_description) on public.workflows to authenticated;

create policy profiles_select on public.profiles for select to authenticated using (true);

create policy workflows_select on public.workflows for select to authenticated using (
  public.is_workflow_designer(id)
  or assigned_reviewer_id = (select auth.uid())
  or (status = 'approved' and public.has_role('deployer'))
);

create policy workflows_insert on public.workflows for insert to authenticated with check (
  created_by = (select auth.uid()) and public.has_role('designer')
);

create policy workflows_update on public.workflows for update to authenticated
  using (public.is_workflow_designer(id) and status in ('draft', 'changes_requested'))
  with check (public.is_workflow_designer(id) and status in ('draft', 'changes_requested'));

create policy workflow_designers_select on public.workflow_designers for select to authenticated
  using (public.can_read_workflow(workflow_id));

create policy workflow_history_select on public.workflow_history for select to authenticated
  using (public.can_read_workflow(workflow_id));

-- server_logs: sin políticas; solo el service role (que ignora RLS) escribe y lee.

-- =========================================================
-- Funciones RPC (reemplazan a las Cloud Functions)
-- Códigos de error: 28000 sin sesión, 42501 sin permiso, P0002 no existe, P0001 precondición.
-- =========================================================

create schema if not exists private;

-- Bloquea el workflow para la transacción y valida sesión y existencia.
create function private.lock_workflow(wf uuid) returns public.workflows
language plpgsql security definer set search_path = '' as $$
declare w public.workflows;
begin
  if auth.uid() is null then
    raise exception 'Debes estar autenticado.' using errcode = '28000';
  end if;
  select * into w from public.workflows where id = wf for update;
  if not found then
    raise exception 'El workflow no existe.' using errcode = 'P0002';
  end if;
  return w;
end $$;

create function private.require_designer(wf uuid, message text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.workflow_designers
                 where workflow_id = wf and user_id = auth.uid()) then
    raise exception '%', message using errcode = '42501';
  end if;
end $$;

create function private.require_reviewer_role(reviewer_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if reviewer_id is null then
    raise exception 'Selecciona un revisor.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = reviewer_id and p.reviewer) then
    raise exception 'El usuario seleccionado no tiene el rol de revisor.' using errcode = 'P0002';
  end if;
end $$;

revoke all on schema private from public, anon, authenticated;

create function public.submit_for_review(wf uuid, reviewer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.workflows;
begin
  w := private.lock_workflow(wf);
  perform private.require_designer(wf, 'No eres diseñador de este workflow.');
  if w.status <> 'draft' then
    raise exception 'El workflow solo se puede enviar a revisión desde el estado ''draft''.'
      using errcode = 'P0001';
  end if;
  perform private.require_reviewer_role(reviewer);
  update public.workflows
     set status = 'pending_review', assigned_reviewer_id = reviewer
   where id = wf;
end $$;

create function public.assign_reviewer(wf uuid, reviewer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.workflows;
begin
  w := private.lock_workflow(wf);
  perform private.require_designer(wf, 'You don''t have permissions to assign a reviewer.');
  if w.status not in ('draft', 'changes_requested') then
    raise exception 'You can only assign a reviewer to a workflow in ''draft'' or ''changes_requested'' status. Current status: %', w.status
      using errcode = 'P0001';
  end if;
  perform private.require_reviewer_role(reviewer);
  update public.workflows
     set status = 'pending_review', assigned_reviewer_id = reviewer
   where id = wf;
end $$;

create function public.approve_workflow(wf uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.workflows;
begin
  w := private.lock_workflow(wf);
  if w.assigned_reviewer_id is distinct from auth.uid() then
    raise exception 'No eres el revisor asignado.' using errcode = '42501';
  end if;
  if w.status <> 'pending_review' then
    raise exception 'El workflow no está pendiente de revisión.' using errcode = 'P0001';
  end if;
  update public.workflows
     set status = 'approved', approved_by = auth.uid()
   where id = wf;
end $$;

create function public.request_changes(wf uuid, comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.workflows;
begin
  w := private.lock_workflow(wf);
  if w.assigned_reviewer_id is distinct from auth.uid() then
    raise exception 'You are not the assigned reviewer.' using errcode = '42501';
  end if;
  if w.status <> 'pending_review' then
    raise exception 'Workflow is not pending review.' using errcode = 'P0001';
  end if;
  update public.workflows
     set status = 'changes_requested', assigned_reviewer_id = null
   where id = wf;
  if nullif(btrim(comment), '') is not null then
    insert into public.workflow_history (workflow_id, kind, description, user_id)
    values (wf, 'changes_requested', comment, auth.uid());
  end if;
end $$;

create function public.add_designer(wf uuid, email text) returns void
language plpgsql security definer set search_path = '' as $$
declare new_user uuid;
begin
  perform private.lock_workflow(wf);
  perform private.require_designer(wf, 'No tienes permisos para añadir colaboradores.');
  select id into new_user from public.profiles p
   where lower(p.email) = lower(btrim(add_designer.email));
  if new_user is null then
    raise exception 'No se encontró un usuario con el email %.', btrim(email) using errcode = 'P0002';
  end if;
  insert into public.workflow_designers (workflow_id, user_id)
  values (wf, new_user)
  on conflict do nothing;
  -- Toca el workflow para que los suscriptores de Realtime recarguen el equipo.
  update public.workflows set last_modified_at = now() where id = wf;
end $$;

create function public.remove_designer(wf uuid, member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_workflow(wf);
  perform private.require_designer(wf, 'No tienes permisos para eliminar colaboradores.');
  if (select count(*) from public.workflow_designers where workflow_id = wf) <= 1 then
    raise exception 'No se puede eliminar al último diseñador del workflow.' using errcode = 'P0001';
  end if;
  delete from public.workflow_designers where workflow_id = wf and user_id = member;
  update public.workflows set last_modified_at = now() where id = wf;
end $$;

create function public.checkout_workflow(wf uuid, description text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_workflow(wf);
  perform private.require_designer(wf, 'No eres diseñador de este workflow.');
  if nullif(btrim(description), '') is null then
    raise exception 'Description cannot be empty.' using errcode = 'P0001';
  end if;
  insert into public.workflow_history (workflow_id, kind, description, user_id)
  values (wf, 'checkout', description, auth.uid());
  update public.workflows set checkout_description = description where id = wf;
end $$;

-- Workflows donde el usuario es diseñador o revisor asignado (PostgREST no expresa ese "or" en un filtro).
create function public.my_workflows() returns setof public.workflows
language sql stable set search_path = '' as $$
  select w.* from public.workflows w
   where exists (select 1 from public.workflow_designers d
                  where d.workflow_id = w.id and d.user_id = (select auth.uid()))
      or w.assigned_reviewer_id = (select auth.uid());
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_workflow_designer(uuid), public.has_role(text), public.can_read_workflow(uuid),
  public.submit_for_review(uuid, uuid), public.assign_reviewer(uuid, uuid),
  public.approve_workflow(uuid), public.request_changes(uuid, text),
  public.add_designer(uuid, text), public.remove_designer(uuid, uuid),
  public.checkout_workflow(uuid, text), public.my_workflows()
to authenticated;
revoke execute on function public.handle_new_user(), public.workflows_before_update(),
  public.workflows_after_insert() from authenticated;

-- Realtime respeta RLS para workflows.
alter publication supabase_realtime add table public.workflows;

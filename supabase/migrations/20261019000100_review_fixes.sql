-- Correcciones de la revisión del PR #1.

-- checkout_description solo se escribe con checkout_workflow, que además deja la fila de historial.
revoke insert, update on public.workflows from authenticated;
grant insert (id, name, nodes, created_by) on public.workflows to authenticated;
grant update (name, nodes) on public.workflows to authenticated;

-- "-- Unassigned --" (reviewer = null) quita al revisor sin cambiar el estado; con un revisor,
-- el workflow pasa a pending_review como antes.
create or replace function public.assign_reviewer(wf uuid, reviewer uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.workflows;
begin
  w := private.lock_workflow(wf);
  perform private.require_designer(wf, 'You don''t have permissions to assign a reviewer.');
  if w.status not in ('draft', 'changes_requested') then
    raise exception 'You can only assign a reviewer to a workflow in ''draft'' or ''changes_requested'' status. Current status: %', w.status
      using errcode = 'P0001';
  end if;
  if reviewer is null then
    update public.workflows set assigned_reviewer_id = null where id = wf;
    return;
  end if;
  perform private.require_reviewer_role(reviewer);
  update public.workflows
     set status = 'pending_review', assigned_reviewer_id = reviewer
   where id = wf;
end $$;

-- Quitarle a alguien el rol de reviewer también le quita la revisión de lo que tenía asignado.
create or replace function public.approve_workflow(wf uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.workflows;
begin
  w := private.lock_workflow(wf);
  if w.assigned_reviewer_id is distinct from auth.uid() then
    raise exception 'No eres el revisor asignado.' using errcode = '42501';
  end if;
  if not public.has_role('reviewer') then
    raise exception 'Ya no tienes el rol de revisor.' using errcode = '42501';
  end if;
  if w.status <> 'pending_review' then
    raise exception 'El workflow no está pendiente de revisión.' using errcode = 'P0001';
  end if;
  update public.workflows
     set status = 'approved', approved_by = auth.uid()
   where id = wf;
end $$;

create or replace function public.request_changes(wf uuid, comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.workflows;
begin
  w := private.lock_workflow(wf);
  if w.assigned_reviewer_id is distinct from auth.uid() then
    raise exception 'You are not the assigned reviewer.' using errcode = '42501';
  end if;
  if not public.has_role('reviewer') then
    raise exception 'You no longer have the reviewer role.' using errcode = '42501';
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

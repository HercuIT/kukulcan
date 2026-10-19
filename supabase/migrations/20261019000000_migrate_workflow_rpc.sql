-- Escritura atómica de un workflow migrado desde Firestore (scripts/migration/migrate-data.js).
-- Upsert por legacy_id y reemplazo de su equipo e historial en una sola transacción: si algo falla,
-- el workflow queda como estaba. Solo el service role puede llamarla; se puede borrar tras el cutover.

create function public.migrate_workflow(
  workflow jsonb,
  designers jsonb default '[]',
  history jsonb default '[]'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  w public.workflows := jsonb_populate_record(null::public.workflows, workflow);
  wf_id uuid;
begin
  if w.legacy_id is null then
    raise exception 'workflow.legacy_id is required' using errcode = 'P0001';
  end if;

  -- Sin auth.uid() el trigger before update conserva fechas, autor y versión de Firestore.
  insert into public.workflows (
    legacy_id, name, nodes, status, version, checkout_description, assigned_reviewer_id,
    approved_by, deployed_by, created_by, created_at, last_modified_by, last_modified_at
  ) values (
    w.legacy_id, w.name, coalesce(w.nodes, '[]'), coalesce(w.status, 'draft'), coalesce(w.version, 1),
    w.checkout_description, w.assigned_reviewer_id, w.approved_by, w.deployed_by, w.created_by,
    coalesce(w.created_at, now()), w.last_modified_by, coalesce(w.last_modified_at, now())
  )
  on conflict (legacy_id) do update set
    name = excluded.name,
    nodes = excluded.nodes,
    status = excluded.status,
    version = excluded.version,
    checkout_description = excluded.checkout_description,
    assigned_reviewer_id = excluded.assigned_reviewer_id,
    approved_by = excluded.approved_by,
    deployed_by = excluded.deployed_by,
    created_by = excluded.created_by,
    created_at = excluded.created_at,
    last_modified_by = excluded.last_modified_by,
    last_modified_at = excluded.last_modified_at
  returning id into wf_id;

  -- El trigger after insert agrega al creador; el equipo real es el de Firestore.
  delete from public.workflow_designers where workflow_id = wf_id;
  insert into public.workflow_designers (workflow_id, user_id)
  select wf_id, (d ->> 'user_id')::uuid from jsonb_array_elements(designers) d;

  delete from public.workflow_history where workflow_id = wf_id;
  insert into public.workflow_history (workflow_id, kind, description, user_id, created_at)
  select wf_id,
         (h ->> 'kind')::public.history_kind,
         h ->> 'description',
         (h ->> 'user_id')::uuid,
         coalesce((h ->> 'created_at')::timestamptz, now())
    from jsonb_array_elements(history) h;

  return wf_id;
end $$;

revoke execute on function public.migrate_workflow(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.migrate_workflow(jsonb, jsonb, jsonb) to service_role;

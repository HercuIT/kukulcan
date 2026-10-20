-- HTE-107: con la confirmación de correo activada, el perfil se crea cuando la cuenta se confirma,
-- no cuando se inserta. Así una cuenta sin confirmar no aparece en profiles: no sale en el diálogo
-- de compartir (listUsers) ni se puede agregar como diseñador (add_designer da P0002).
-- Las cuentas que ya llegan confirmadas (service role, importación) siguen recibiendo su perfil al
-- insertarse.

-- Hasta ahora la confirmación estaba apagada y Supabase sellaba email_confirmed_at al registrar,
-- así que todo usuario existente está confirmado o ya tiene perfil. Si no fuera así, ese usuario
-- se quedaría sin perfil para siempre: mejor fallar aquí que en silencio.
do $$
begin
  if exists (
    select 1 from auth.users u
     where u.email_confirmed_at is null
       and not exists (select 1 from public.profiles p where p.id = u.id)
  ) then
    raise exception 'HTE-107: hay usuarios sin confirmar y sin perfil; confírmalos o créales el perfil antes de esta migración.';
  end if;
end $$;

-- Alta en auth.users: perfil solo si la cuenta ya viene confirmada.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

-- Confirmación: cuando email_confirmed_at pasa de null a un valor, se crea el perfil (sin roles).
create function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- Solo corren como triggers.
revoke execute on function public.handle_new_user(), public.handle_user_confirmed()
  from public, anon, authenticated;

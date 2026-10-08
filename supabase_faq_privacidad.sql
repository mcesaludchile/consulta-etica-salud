-- supabase_faq_privacidad.sql
-- Ejecutar UNA VEZ en Supabase → SQL Editor → New query → pegar todo → Run.
-- Qué hace:
--   1. Agrega a la tabla "consultas" las columnas "publicable" y "motivo_no_publica".
--      Ninguna consulta se borra: las que no se deben mostrar quedan guardadas
--      con publicable = false y el motivo.
--   2. Quita el acceso público directo a la tabla: desde ahora solo la función
--      del chat (en Netlify, con la clave secreta) guarda consultas.
--   3. Crea "faq_publica": la única vista que el sitio puede leer, con solo las
--      consultas publicables (pertinentes y sin datos personales).
--   4. Crea "contar_consultas()" para el contador del inicio.

alter table consultas add column if not exists publicable boolean not null default false;
alter table consultas add column if not exists motivo_no_publica text;

-- Las consultas guardadas antes de este cambio quedan ocultas hasta que alguien
-- las revise en Table Editor y marque "publicable" = true.
update consultas
set motivo_no_publica = 'consulta anterior al filtro, sin revisar'
where publicable = false and motivo_no_publica is null;

drop policy if exists "Cualquiera puede insertar consultas" on consultas;
drop policy if exists "Cualquiera puede leer consultas" on consultas;

create or replace view faq_publica as
  select question, answer_preview, created_at
  from consultas
  where publicable;

revoke all on faq_publica from anon, authenticated;
grant select on faq_publica to anon, authenticated;

create or replace function contar_consultas()
returns bigint
language sql
stable
security definer
set search_path = public
as $$ select count(*) from consultas $$;

revoke all on function contar_consultas() from public;
grant execute on function contar_consultas() to anon, authenticated;

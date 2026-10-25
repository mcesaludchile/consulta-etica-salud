-- supabase_faq_apoyos.sql
-- Ejecutar UNA VEZ en Supabase → SQL Editor → "+" → New SQL snippet → pegar todo → Run.
-- (Requiere haber ejecutado antes supabase_faq_privacidad.sql.)
-- Qué hace:
--   1. Agrega a "consultas" la respuesta completa ("respuesta") y el contador
--      de "De acuerdo" ("apoyos"). Las consultas antiguas solo tienen el resumen.
--   2. Amplía la vista "faq_publica" con id, respuesta completa, apoyos y fuentes.
--   3. Crea "apoyar_consulta()", la única forma en que el sitio puede sumar (o
--      quitar) un "De acuerdo", y solo en consultas publicables.

alter table consultas add column if not exists respuesta text;
alter table consultas add column if not exists apoyos integer not null default 0;

-- Las columnas nuevas van al final: una vista existente no permite cambiar el orden.
create or replace view faq_publica as
  select question, answer_preview, created_at,
         id, coalesce(respuesta, answer_preview) as respuesta, apoyos, sources
  from consultas
  where publicable;

revoke all on faq_publica from anon, authenticated;
grant select on faq_publica to anon, authenticated;

create or replace function apoyar_consulta(consulta_id bigint, sumar boolean default true)
returns integer
language sql
security definer
set search_path = public
as $$
  update consultas
  set apoyos = greatest(apoyos + case when sumar then 1 else -1 end, 0)
  where id = consulta_id and publicable
  returning apoyos
$$;

revoke all on function apoyar_consulta(bigint, boolean) from public;
grant execute on function apoyar_consulta(bigint, boolean) to anon, authenticated;

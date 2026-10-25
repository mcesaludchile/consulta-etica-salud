-- supabase_faq_desacuerdos.sql
-- Ejecutar UNA VEZ en Supabase → SQL Editor → New query → pegar todo → Run.
-- (Requiere haber ejecutado antes supabase_faq_apoyos.sql.)
-- Qué hace:
--   1. Agrega a "consultas" el contador de "En desacuerdo" ("desacuerdos").
--   2. Agrega a la vista "faq_publica" los desacuerdos y el "puntaje"
--      (apoyos menos desacuerdos), que ordena las preguntas frecuentes.
--   3. Crea "desacuerdo_consulta()", la única forma en que el sitio puede sumar
--      (o quitar) un "En desacuerdo", y solo en consultas publicables.

alter table consultas add column if not exists desacuerdos integer not null default 0;

-- Las columnas nuevas van al final: una vista existente no permite cambiar el orden.
create or replace view faq_publica as
  select question, answer_preview, created_at,
         id, coalesce(respuesta, answer_preview) as respuesta, apoyos, sources,
         desacuerdos, apoyos - desacuerdos as puntaje
  from consultas
  where publicable;

revoke all on faq_publica from anon, authenticated;
grant select on faq_publica to anon, authenticated;

create or replace function desacuerdo_consulta(consulta_id bigint, sumar boolean default true)
returns integer
language sql
security definer
set search_path = public
as $$
  update consultas
  set desacuerdos = greatest(desacuerdos + case when sumar then 1 else -1 end, 0)
  where id = consulta_id and publicable
  returning desacuerdos
$$;

revoke all on function desacuerdo_consulta(bigint, boolean) from public;
grant execute on function desacuerdo_consulta(bigint, boolean) to anon, authenticated;

-- supabase_retencion.sql
-- Ejecutar UNA VEZ en Supabase → SQL Editor → "+" → New SQL snippet → pegar todo → Run.
-- Qué hace (lo que promete la política de privacidad del sitio):
--   1. Crea "limpiar_consultas_antiguas()": borra el TEXTO (pregunta y respuesta)
--      de las consultas NO publicadas que tengan más de 2 años. La fila se
--      mantiene, con su fecha y los códigos citados, para que el contador del
--      inicio y las estadísticas sigan sumándolas. Las preguntas frecuentes
--      publicadas (que no tienen datos personales) no se tocan.
--   2. Programa esa limpieza todos los días a las 04:17 (hora del servidor),
--      con la extensión pg_cron de Supabase.
-- Se puede ejecutar de nuevo sin problema: reemplaza la función y la programación.

create or replace function limpiar_consultas_antiguas()
returns integer
language sql
security definer
set search_path = public
as $$
  with limpiadas as (
    update consultas
       set question = '',
           answer_preview = null,
           respuesta = null
     where not publicable
       and created_at < now() - interval '2 years'
       and (question <> '' or answer_preview is not null or respuesta is not null)
    returning 1
  )
  select count(*)::integer from limpiadas
$$;

-- Solo la base de datos (la tarea programada) puede ejecutarla, nunca un visitante.
revoke all on function limpiar_consultas_antiguas() from public, anon, authenticated;

-- Tarea programada diaria (pg_cron).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule(
  'limpiar-consultas-antiguas',
  '17 4 * * *',
  'select public.limpiar_consultas_antiguas()'
);

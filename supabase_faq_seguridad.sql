-- supabase_faq_seguridad.sql
-- Ejecutar UNA VEZ en Supabase → SQL Editor → New query → pegar todo → Run.
-- Corrige la alerta "Security Definer View" (public.faq_publica) del Security Advisor.
-- Qué hace:
--   1. La vista faq_publica pasa a usar los permisos de quien la consulta
--      (security_invoker), como recomienda Supabase.
--   2. Agrega una regla (política RLS) a la tabla "consultas": los visitantes
--      solo pueden LEER las consultas publicables. Las no publicables (con
--      datos personales o fuera de tema) siguen siendo invisibles, y nadie
--      con la clave pública puede escribir, cambiar ni borrar consultas.

alter view faq_publica set (security_invoker = true);

drop policy if exists "Leer solo consultas publicables" on consultas;
create policy "Leer solo consultas publicables"
on consultas for select
to anon, authenticated
using (publicable);

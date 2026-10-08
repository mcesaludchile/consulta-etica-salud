# Ética en Salud Chile — Sitio de consulta ciudadana

## Estructura del proyecto
```
index.html                        → el sitio web (frontend)
netlify.toml                      → configuración de despliegue en Netlify
netlify/functions/chat.js         → función segura que llama a la IA (guarda la API key)
codigos-de-etica-salud-chile.md   → texto de los 14 códigos: la fuente que usa el chat
preparar_fragmentos.js            → arma fragmentos.json y knowledge_base.json (Netlify lo ejecuta solo)
netlify/functions/fragmentos.json → fragmentos del .md que usa el chat
instituciones_config.json         → lista editable de instituciones (nombre, descripción, sitio, PDF)
knowledge_base.json               → lista de la sección "Instituciones" (se genera sola, no editar)
documentos/                       → PDF que se pueden descargar desde el sitio
supabase_setup.sql                → crea la tabla del registro histórico anónimo (proyecto nuevo)
supabase_faq_privacidad.sql       → filtro de preguntas frecuentes (para una tabla ya existente)
```

## Antes de publicar
1. Revisa `instituciones_config.json` y que cada PDF esté en `documentos/`.
   No hay que ejecutar nada: Netlify prepara el chat y la lista de Instituciones al publicar.
2. Crea tu proyecto en Supabase y corre `supabase_setup.sql`.
3. Pega tu URL y "anon key" de Supabase en `index.html` (busca `SUPABASE_URL`).
4. Sube todo a GitHub y conéctalo a Netlify.
5. En Netlify, agrega las variables de entorno `ANTHROPIC_API_KEY` y `SUPABASE_SECRET_KEY`.

Sigue la guía paso a paso completa que te dio Claude en el chat para el detalle de cada punto.

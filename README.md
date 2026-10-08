# Ética en Salud Chile — Sitio de consulta ciudadana

## Estructura del proyecto
```
index.html                        → el sitio web (frontend)
netlify.toml                      → configuración de despliegue en Netlify
netlify/functions/chat.js         → función segura que llama a la IA (guarda la API key)
codigos-de-etica-salud-chile.md   → texto de los 14 códigos: la fuente que usa el chat
preparar_fragmentos.js            → divide el .md en fragmentos (Netlify lo ejecuta solo)
netlify/functions/fragmentos.json → fragmentos generados a partir del .md
knowledge_base.json               → lista usada por la sección "Instituciones"
instituciones_config.json         → lista editable de instituciones (para build_kb.py)
build_kb.py                       → arma knowledge_base.json y copia los PDF descargables
supabase_setup.sql                → crea la tabla del registro histórico anónimo
```

## Antes de publicar
1. Ejecuta `build_kb.py` para la sección Instituciones y los PDF descargables (ver instrucciones dentro del archivo).
   El chat no necesita este paso: usa `codigos-de-etica-salud-chile.md`.
2. Crea tu proyecto en Supabase y corre `supabase_setup.sql`.
3. Pega tu URL y "anon key" de Supabase en `index.html` (busca `SUPABASE_URL`).
4. Sube todo a GitHub y conéctalo a Netlify.
5. En Netlify, agrega la variable de entorno `ANTHROPIC_API_KEY`.

Sigue la guía paso a paso completa que te dio Claude en el chat para el detalle de cada punto.

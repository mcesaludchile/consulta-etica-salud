# Ética en Salud Chile — Contexto del proyecto

## Qué es
Sitio web ciudadano, en español, que reúne los códigos de ética de instituciones del
ecosistema de salud chileno y permite consultarlos con IA. Público: ciudadanía general.
Todo texto del sitio debe usar lenguaje simple, sin jerga legal ni técnica.

## Sobre quien trabaja aquí
Vicente no es programador. Explica cada paso en español, en lenguaje simple, con
listas numeradas e indicando exactamente qué botón o pantalla usar. Antes de cambios
grandes, explica qué vas a hacer y pide confirmación. Usa Windows (Python con `py -m pip`).

## Arquitectura
- `index.html`: app de una sola página, mobile-first. Secciones: Inicio, Consultar,
  Instituciones, Contexto, Contacto.
- `netlify/functions/chat.js`: función serverless que llama a la API de Anthropic.
  La clave va SOLO en variables de entorno de Netlify (`ANTHROPIC_API_KEY`). Nunca en el código.
- Supabase: registro anónimo de consultas y contadores (tabla `consultas`, con RLS).
  El cliente se llama `supabaseClient` (no `supabase`, choca con la librería del CDN).
- `build_kb.py`: extrae texto de los PDF en `documentos/` y genera `knowledge_base.json`.
- `netlify.toml`: configuración de despliegue. Hosting en Netlify, código en GitHub;
  cada push a GitHub publica automáticamente.

## Reglas de la IA de consulta
- Responder solo con base en los documentos validados de `knowledge_base.json`.
- Citar institución y documento de origen. Si no está en los documentos, decirlo.
- No dar diagnósticos ni consejo médico o legal individual; orientar a la institución pertinente.

## Errores ya resueltos (no reintroducir)
- No usar `window.storage` (solo existe en artifacts de Claude).
- Netlify puede enviar el body en base64: decodificar si `event.isBase64Encoded`.
- Errores 500 por saldo de créditos de la API: revisar consola de Anthropic.

## Pendientes
1. Completar URLs oficiales que siguen en `null`: FENPOF, Cámara Nacional de
   Laboratorios, CIF, ACHAGO y documentos internacionales.
2. Subir la carpeta `documentos/` con los PDF.
3. Ejecutar `build_kb.py` para regenerar `knowledge_base.json`.
4. Botones de descarga de PDF por institución en la sección Instituciones.

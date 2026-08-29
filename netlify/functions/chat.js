// netlify/functions/chat.js
// Esta función corre en el servidor de Netlify, NUNCA en el navegador.
// Por eso aquí sí es seguro usar la API key secreta (variable de entorno ANTHROPIC_API_KEY).

const knowledgeBase = require("./knowledge_base.json");

// Construye el system prompt uniendo todos los documentos (o resúmenes) cargados.
function buildSystemPrompt() {
  const docs = knowledgeBase
    .map((d) => `### ${d.nombre} (${d.year})\nEstado del documento: ${d.status}\n${d.full_text}`)
    .join("\n\n---\n\n");

  return `Eres un asistente ciudadano especializado en códigos de ética de instituciones de salud en Chile. SOLO puedes responder usando la base de conocimiento incluida abajo, extraída de códigos de ética oficiales.

Reglas:
- Responde en español, en lenguaje simple y cercano para la ciudadanía (no jerga legal).
- SIEMPRE indica al final entre corchetes de qué institución(es) proviene la información, así: [Fuente: Colegio Médico de Chile].
- Si el documento de una institución está marcado como "resumen" o "pendiente", puedes usarlo igual pero acláralo brevemente si la pregunta requiere precisión de artículo exacto.
- No inventes artículos, números o citas textuales que no estén en la base de conocimiento.
- Si la pregunta no puede responderse con esta información, dilo explícitamente y sugiere el formulario de contacto del sitio.
- Si la duda es una urgencia médica o legal, recomienda ayuda profesional o de emergencia inmediata.
- Sé breve: máximo 4-5 oraciones, salvo que se pida más detalle.

BASE DE CONOCIMIENTO:
${docs}`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let messages;
  try {
    const body = JSON.parse(event.body || "{}");
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("messages vacío");
    }
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Solicitud inválida" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Falta configurar ANTHROPIC_API_KEY en Netlify." }),
    };
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: buildSystemPrompt(),
        messages: messages,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: data }) };
    }

    const textBlocks = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text);
    const answer = textBlocks.join("\n") || "No pude generar una respuesta.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};

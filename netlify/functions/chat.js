// netlify/functions/chat.js
// Esta función corre en el servidor de Netlify, NUNCA en el navegador.
// Por eso aquí sí es seguro usar la API key secreta (variable de entorno ANTHROPIC_API_KEY).

// Base de conocimiento: codigos-de-etica-salud-chile.md dividido en fragmentos
// por preparar_fragmentos.js. En cada pregunta se envían a la IA solo los
// fragmentos más relacionados, no el texto completo (más rápido y barato).
const { resumen, fragmentos } = require("./fragmentos.json");

const MAX_FRAGMENTOS = 8;
const MAX_POR_INSTITUCION = 3;  // para que aparezcan varias instituciones (6 si la pregunta nombra una)
const MAX_CARACTERES = 12000;   // tope de texto de referencia por pregunta
const MAX_MENSAJES_HISTORIAL = 7; // últimos mensajes de la conversación que se envían

// Modelo de IA. Con esfuerzo "low" casi no "piensa" antes de responder preguntas
// simples (más rápido y barato). max_tokens incluye ese pensamiento, por eso
// tiene margen; solo se cobra lo que realmente se usa.
const MODELO = "claude-sonnet-5-5";
const ESFUERZO = "low";
const MAX_TOKENS = 2000;

// Palabras muy comunes que no ayudan a buscar.
const PALABRAS_VACIAS = new Set((
  "a al algo algun alguna ante antes como con contra cual cuando de del desde donde " +
  "durante e el ella ellas ellos en entre era es esa ese eso esta este esto estos " +
  "hay hace hacer la las le les lo los mas me mi mis muy no nos o otra otro para " +
  "pero poco por porque puede pueden puedo que quien se segun ser si sin sobre son " +
  "su sus tambien tengo tiene tienen todo todos tu un una uno unos y ya yo " +
  "the of and to in for is are be or by on with that this as"
).split(" "));

// Palabras cotidianas -> cómo lo dicen los códigos de ética.
const SINONIMOS = {
  confidencial: "secreto profesional confidencialidad",
  privacidad: "secreto profesional confidencialidad",
  contar: "secreto profesional revelar",
  diagnostico: "secreto informacion",
  ficha: "ficha clinica registro",
  praxis: "negligencia denuncia reclamo sancion tribunal",
  negligencia: "denuncia reclamo sancion tribunal",
  reclamo: "denuncia tribunal sancion",
  denunciar: "denuncia reclamo tribunal",
  opinion: "interconsulta colega cambiar medico",
  negarse: "rechazar atender abstenerse conciencia",
  atenderme: "atender atencion paciente",
  regalo: "obsequio regalos beneficio",
  regalar: "obsequio regalos beneficio",
  viaje: "hospitalidad congreso evento",
  dinero: "pago financiamiento donacion aporte",
  publicidad: "publicidad anuncio promocion",
  consentimiento: "consentimiento informado autorizacion",
};

// Pasa un texto a "raíces" simples: sin tildes, en minúsculas y recortadas,
// para que "confidencial" y "confidencialidad" coincidan.
function raices(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 2 && !PALABRAS_VACIAS.has(p))
    .map((p) => p.replace(/s$/, "").slice(0, 7));
}

// Índice de búsqueda (BM25), se arma una sola vez al iniciar la función.
const indice = fragmentos.map((f) => {
  // El título de la sección cuenta doble.
  const palabras = raices(`${f.doc} ${f.seccion} ${f.seccion} ${f.texto}`);
  const frecuencia = new Map();
  for (const p of palabras) frecuencia.set(p, (frecuencia.get(p) || 0) + 1);
  return { frecuencia, largo: palabras.length };
});
const largoPromedio = indice.reduce((s, i) => s + i.largo, 0) / indice.length;
const enCuantos = new Map();
for (const { frecuencia } of indice) {
  for (const p of frecuencia.keys()) enCuantos.set(p, (enCuantos.get(p) || 0) + 1);
}

// Palabras que identifican a una sola institución (ej. "kinesio", "fenpof", "isp").
const documentos = [...new Set(fragmentos.map((f) => f.doc))];
const docsPorPalabra = new Map();
for (const doc of documentos) {
  for (const p of new Set(raices(doc))) docsPorPalabra.set(p, [...(docsPorPalabra.get(p) || []), doc]);
}

const SINONIMOS_RAICES = new Map(
  Object.entries(SINONIMOS).map(([palabra, extra]) => [raices(palabra)[0], raices(extra)])
);

function buscarFragmentos(pregunta) {
  const propias = raices(pregunta);
  const palabras = [...new Set([...propias, ...propias.flatMap((p) => SINONIMOS_RAICES.get(p) || [])])];
  const docsMencionados = new Set(
    palabras.flatMap((p) => (docsPorPalabra.get(p)?.length === 1 ? docsPorPalabra.get(p) : []))
  );

  const N = indice.length;
  const puntajes = indice.map(({ frecuencia, largo }, i) => {
    let puntaje = 0;
    for (const p of palabras) {
      const tf = frecuencia.get(p);
      if (!tf) continue;
      const df = enCuantos.get(p);
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      puntaje += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * largo / largoPromedio));
    }
    if (docsMencionados.has(fragmentos[i].doc)) puntaje *= 1.6;
    if (fragmentos[i].apendice) puntaje *= 0.4; // material de apoyo: solo si no hay algo mejor
    return { i, puntaje };
  });

  const elegidos = [];
  const porInstitucion = new Map();
  let total = 0;
  for (const { i, puntaje } of puntajes.sort((a, b) => b.puntaje - a.puntaje)) {
    if (puntaje <= 0 || elegidos.length >= MAX_FRAGMENTOS) break;
    const { doc, texto } = fragmentos[i];
    const tope = docsMencionados.has(doc) ? MAX_POR_INSTITUCION * 2 : MAX_POR_INSTITUCION;
    if ((porInstitucion.get(doc) || 0) >= tope) continue;
    if (total + texto.length > MAX_CARACTERES) continue;
    elegidos.push(fragmentos[i]);
    porInstitucion.set(doc, (porInstitucion.get(doc) || 0) + 1);
    total += texto.length;
  }
  return elegidos;
}

// Construye las instrucciones para la IA con solo los fragmentos encontrados.
function buildSystemPrompt(pregunta) {
  const encontrados = buscarFragmentos(pregunta);
  const textos = encontrados.length
    ? encontrados.map((f) => `### ${f.doc} — ${f.seccion}\n${f.texto}`).join("\n\n---\n\n")
    : "(No se encontraron fragmentos relacionados con esta pregunta.)";

  return `Eres un asistente ciudadano especializado en códigos de ética de instituciones de salud en Chile. SOLO puedes responder usando los fragmentos de códigos de ética oficiales incluidos abajo. Son los fragmentos que una búsqueda encontró para esta pregunta, no los documentos completos.

Reglas:
- Responde en español, en lenguaje simple y cercano para la ciudadanía (no jerga legal).
- SIEMPRE indica al final entre corchetes de qué institución(es) proviene la información, así: [Fuente: Colegio Médico de Chile A.G.].
- Si citas un artículo, indica su número tal como aparece en el fragmento.
- No inventes artículos, números o citas textuales que no estén en los fragmentos.
- Si los fragmentos no responden la pregunta, dilo explícitamente, sugiere reformularla con otras palabras o usar el formulario de contacto del sitio.
- Los Principios APEC están en inglés: si los usas, explícalos en español.
- No des diagnósticos ni consejo médico o legal individual; orienta a la institución que corresponda. Si la duda es una urgencia médica o legal, recomienda ayuda profesional o de emergencia inmediata.
- Sé breve: máximo 4-5 oraciones, salvo que se pida más detalle.

DOCUMENTOS DISPONIBLES:
${resumen}

FRAGMENTOS ENCONTRADOS:
${textos}`;
}

// La búsqueda usa la última pregunta y la anterior (por si es una continuación,
// como "¿y si es una enfermera?"). La última cuenta doble.
function textoParaBuscar(messages) {
  const preguntas = messages.filter((m) => m.role === "user").map((m) => String(m.content));
  const ultima = preguntas[preguntas.length - 1] || "";
  return `${ultima} ${ultima} ${preguntas[preguntas.length - 2] || ""}`;
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Responde con un error: lo anota en el registro de Netlify (Cloud compute →
// Functions → chat) y envía a la página un "detalle" corto en español,
// que el chat muestra debajo del mensaje de error. Nunca incluye la clave.
function respuestaError(statusCode, detalle, extra) {
  console.error(`Error ${statusCode}: ${detalle}`, extra ?? "");
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error: detalle, detalle }) };
}

// Traduce los errores más comunes de la API de Anthropic.
function explicarErrorAnthropic(status, data) {
  const tipo = data?.error?.type || "";
  const mensaje = data?.error?.message || "";
  if (/credit balance/i.test(mensaje)) return "saldo insuficiente en la cuenta de Anthropic (cargar créditos en console.anthropic.com → Billing)";
  if (tipo === "authentication_error") return "la clave ANTHROPIC_API_KEY no es válida (revisarla en Netlify y en console.anthropic.com → API Keys)";
  if (tipo === "permission_error") return "la clave ANTHROPIC_API_KEY no tiene permiso para usar este modelo";
  if (tipo === "not_found_error") return "el modelo de IA configurado no existe o no está disponible";
  if (tipo === "rate_limit_error") return "se superó el límite de consultas por minuto de Anthropic; intentar en un momento";
  if (tipo === "overloaded_error") return "la IA está saturada en este momento; intentar en unos minutos";
  return `error ${status} de Anthropic${tipo ? ` (${tipo})` : ""}: ${mensaje.slice(0, 200)}`;
}

exports.handler = async function (event) {
  // Preflight CORS (algunos navegadores lo envían antes del POST real)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: JSON_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let messages;
  try {
    // Netlify a veces entrega el body codificado en base64: hay que decodificarlo primero.
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "{}");
    const parsed = JSON.parse(rawBody);
    messages = parsed.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("El campo 'messages' está vacío o no es una lista.");
    }
    // Solo los últimos mensajes: la conversación completa encarece cada consulta.
    messages = messages.slice(-MAX_MENSAJES_HISTORIAL);
    while (messages.length && messages[0].role !== "user") messages.shift();
  } catch (e) {
    return respuestaError(400, `solicitud inválida (${String(e).slice(0, 150)})`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return respuestaError(500, "falta la variable ANTHROPIC_API_KEY en Netlify (o falta volver a publicar el sitio después de crearla)");
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        // Si el modelo rechaza la consulta por seguridad, Anthropic la reintenta con otro modelo.
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        output_config: { effort: ESFUERZO },
        fallbacks: "default",
        system: buildSystemPrompt(textoParaBuscar(messages)),
        messages: messages,
      }),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      return respuestaError(resp.status, explicarErrorAnthropic(resp.status, data), JSON.stringify(data));
    }

    // El modelo puede negarse a responder por sus filtros de seguridad.
    if (data.stop_reason === "refusal") {
      console.log("Consulta rechazada por la IA:", JSON.stringify(data.stop_details));
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          answer: "No puedo responder esa consulta. Intenta reformularla, o usa el formulario de Contacto del sitio.",
        }),
      };
    }

    // Queda en el registro de Netlify: sirve para ver cuánto texto se envía por consulta.
    console.log(`Consulta respondida: ${data.usage?.input_tokens} tokens de entrada, ${data.usage?.output_tokens} de salida`);

    const textBlocks = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text);
    const answer = textBlocks.join("\n") || "No pude generar una respuesta.";

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ answer }),
    };
  } catch (err) {
    return respuestaError(500, `no se pudo contactar a la IA (${String(err).slice(0, 150)})`);
  }
};

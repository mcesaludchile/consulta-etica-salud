// netlify/functions/chat.js
// Esta función corre en el servidor de Netlify, NUNCA en el navegador.
// Por eso aquí sí es seguro usar la API key secreta (variable de entorno ANTHROPIC_API_KEY).

// Base de conocimiento: codigos-de-etica-salud-chile.md dividido en fragmentos
// por preparar_fragmentos.js. En cada pregunta se envían a la IA solo los
// fragmentos más relacionados, no el texto completo (más rápido y barato).
const { resumen, fragmentos } = require("./fragmentos.json");

const MAX_FRAGMENTOS = 10;
const MAX_POR_INSTITUCION = 2;  // para sumar varios códigos distintos (4 si la pregunta nombra una institución)
const MAX_APEC = 2;             // espacios reservados para referentes APEC (máx. 1 por documento APEC)
const MINIMO_APEC = 0.35;       // APEC entra solo si su puntaje es al menos 35 % del mejor código chileno
const PESO_SINONIMO = 0.5;      // las palabras agregadas por SINONIMOS pesan la mitad que las de la pregunta
const MAX_CARACTERES = 14000;   // tope de texto de referencia por pregunta
const MAX_MENSAJES_HISTORIAL = 7; // últimos mensajes de la conversación que se envían

// Modelo de IA. Con esfuerzo "low" casi no "piensa" antes de responder preguntas
// simples (más rápido y barato). max_tokens incluye ese pensamiento, por eso
// tiene margen; solo se cobra lo que realmente se usa.
const MODELO = "claude-sonnet-5-5";
const ESFUERZO = "low";
const MAX_TOKENS = 2000;

// Preguntas fuera de la ética en salud: no se responden. La IA contesta solo
// con esta marca y la función la cambia por un mensaje amable.
const MARCA_FUERA_DE_TEMA = "FUERA_DE_TEMA";
const MENSAJE_FUERA_DE_TEMA =
  "No realicé la búsqueda porque tu pregunta está fuera del ámbito de este sitio: la ética en salud en Chile. " +
  "Te invito a repensarla. Por ejemplo, puedes preguntar por tus derechos como paciente, el trato o los deberes " +
  "de un profesional de la salud, la confidencialidad de tu información o la relación de la industria de la salud " +
  "con médicos y pacientes.";
const MENSAJE_SALUDO =
  "¡Hola! 😊 Puedo ayudarte con dudas sobre ética en salud en Chile: tus derechos como paciente, " +
  "los deberes de médicos, enfermeras y otros profesionales, o la relación de la industria de la salud con ellos. ¿Qué te gustaría saber?";
// Saludos y agradecimientos cortos: se responden sin llamar a la IA.
const ES_SALUDO = /^\s*(hola|holi|buen[oa]s( d[ií]as| tardes| noches)?|saludos|gracias|muchas gracias|ok|okay|vale|chao|adi[oó]s|hey)\b[\s!¡.,😊🙂👋]*$/i;

// Palabras muy comunes que no ayudan a buscar.
const PALABRAS_VACIAS = new Set((
  "a al algo algun alguna ante antes como con contra cual cuando de del desde donde " +
  "durante e el ella ellas ellos en entre era es esa ese eso esta este esto estos " +
  "hay hace hacer la las le les lo los mas me mi mis muy no nos o otra otro para " +
  "pero poco por porque puede pueden puedo que quien se segun ser si sin sobre son " +
  "su sus tambien tengo tiene tienen todo todos tu un una uno unos y ya yo " +
  "the of and to in for is are be or by on with that this as"
).split(" "));

// Palabras cotidianas -> cómo lo dicen los códigos de ética. Las palabras en
// inglés sirven para encontrar los Principios APEC, que están en ese idioma.
const SINONIMOS = {
  confidencial: "secreto profesional confidencialidad privacy confidential",
  privacidad: "secreto profesional confidencialidad privacy",
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
  regalo: "obsequio regalos beneficio gift gifts",
  regalar: "obsequio regalos beneficio gift gifts",
  obsequio: "regalo gift gifts",
  viaje: "hospitalidad congreso evento travel hospitality",
  hospitalidad: "hospitality travel meals",
  comida: "hospitalidad meal meals",
  almuerzo: "hospitalidad meal meals",
  cena: "hospitalidad meal meals entertainment",
  dinero: "pago financiamiento donacion aporte payment",
  pago: "honorario payment remuneration",
  donacion: "aporte donation donations grant",
  beca: "becas grant grants educational",
  congreso: "evento educacion event events educational",
  muestra: "muestras sample samples",
  publicidad: "publicidad anuncio promocion promotion promotional advertising",
  promocion: "publicidad promotion promotional",
  consentimiento: "consentimiento informado autorizacion",
  conflicto: "interes conflict interest",
  transparencia: "transparency transparent disclosure",
  investigacion: "estudio clinico research clinical trial",
  consultor: "asesor consultant consultants consulting",
  asesoria: "asesor consultant consulting",
  industria: "empresa laboratorio industry company companies",
  laboratorio: "industria empresa company pharmaceutical biopharmaceutical",
  dispositivo: "tecnologia medical technology device",
  agrupacion: "asociacion organizacion patient organization organizations",
  organizacion: "asociacion agrupacion patient organization organizations",
  soborno: "corrupcion bribery bribe integrity",
  integridad: "integrity accountability",
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
  const propias = [...new Set(raices(pregunta))];
  // Peso de cada palabra a buscar: 1 si está en la pregunta, PESO_SINONIMO si es un sinónimo.
  const pesos = new Map(propias.map((p) => [p, 1]));
  for (const p of propias) {
    for (const s of SINONIMOS_RAICES.get(p) || []) if (!pesos.has(s)) pesos.set(s, PESO_SINONIMO);
  }
  const docsMencionados = new Set(
    propias.flatMap((p) => (docsPorPalabra.get(p)?.length === 1 ? docsPorPalabra.get(p) : []))
  );

  const N = indice.length;
  const puntajes = indice.map(({ frecuencia, largo }, i) => {
    let puntaje = 0;
    for (const [p, peso] of pesos) {
      const tf = frecuencia.get(p);
      if (!tf) continue;
      const df = enCuantos.get(p);
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      puntaje += peso * idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * largo / largoPromedio));
    }
    if (docsMencionados.has(fragmentos[i].doc)) puntaje *= 1.6;
    if (fragmentos[i].apendice) puntaje *= 0.4; // material de apoyo: solo si no hay algo mejor
    return { i, puntaje };
  });

  const ordenados = puntajes.filter((p) => p.puntaje > 0).sort((a, b) => b.puntaje - a.puntaje);
  const porInstitucion = new Map();
  let total = 0;
  const tomar = (lista, cupo, tope) => {
    const elegidos = [];
    for (const { i } of lista) {
      if (elegidos.length >= cupo) break;
      const { doc, texto } = fragmentos[i];
      const maximo = docsMencionados.has(doc) ? tope * 2 : tope;
      if ((porInstitucion.get(doc) || 0) >= maximo) continue;
      if (total + texto.length > MAX_CARACTERES) continue;
      elegidos.push(fragmentos[i]);
      porInstitucion.set(doc, (porInstitucion.get(doc) || 0) + 1);
      total += texto.length;
    }
    return elegidos;
  };

  // 1) Si la pregunta nombra una institución, sus fragmentos van primero.
  const mencionados = tomar(ordenados.filter(({ i }) => docsMencionados.has(fragmentos[i].doc)), 4, 2);
  // 2) Espacios para referentes APEC, solo si están realmente relacionados con la pregunta.
  const mejorChileno = ordenados.find(({ i }) => !esApec(fragmentos[i].doc))?.puntaje || 0;
  const apec = tomar(
    ordenados.filter(({ i, puntaje }) => esApec(fragmentos[i].doc) && puntaje >= mejorChileno * MINIMO_APEC),
    MAX_APEC,
    1
  );
  // 3) El resto, con los demás códigos chilenos, variando la institución.
  const chilenos = tomar(
    ordenados.filter(({ i }) => !esApec(fragmentos[i].doc)),
    MAX_FRAGMENTOS - mencionados.length - apec.length,
    MAX_POR_INSTITUCION
  );
  const apecFinal = apec.filter((f) => !mencionados.includes(f));
  return [...mencionados.filter((f) => !esApec(f.doc)), ...chilenos, ...mencionados.filter((f) => esApec(f.doc)), ...apecFinal];
}

// Marco de Consenso Ético APEC — Chile y Principios APEC (Kuala Lumpur, Ciudad de México).
function esApec(doc) {
  return /APEC/.test(doc);
}

// Construye las instrucciones para la IA con solo los fragmentos encontrados.
function buildSystemPrompt(encontrados) {
  const textos = encontrados.length
    ? encontrados.map((f) => `### ${f.doc} — ${f.seccion}\n${f.texto}`).join("\n\n---\n\n")
    : "(No se encontraron fragmentos relacionados con esta pregunta.)";

  return `Eres un asistente ciudadano especializado en códigos de ética de instituciones de salud en Chile. SOLO puedes responder usando los fragmentos de códigos de ética oficiales incluidos abajo. Son los fragmentos que una búsqueda encontró para esta pregunta, no los documentos completos.

Primero revisa si la pregunta trata sobre ética en salud: conducta y deberes de profesionales o instituciones de salud, derechos y trato de pacientes, confidencialidad, consentimiento, relación entre la industria de la salud, profesionales y pacientes, o el contenido de los códigos de ética. Si la pregunta NO es de ese ámbito (por ejemplo: deportes, recetas, tareas escolares, tecnología, finanzas, política, chistes, o pedir textos que no tengan relación con la ética en salud), responde ÚNICAMENTE con la palabra ${MARCA_FUERA_DE_TEMA}, sin nada más. Un saludo o un agradecimiento no es fuera de tema: responde breve y amablemente e invita a hacer una pregunta sobre ética en salud. Una pregunta de seguimiento sobre la conversación anterior sí es del ámbito.

Reglas:
- Responde en español, en lenguaje simple y cercano para la ciudadanía (no jerga legal).
- Suma referencias de distintos códigos: si fragmentos de varias instituciones tratan el tema, menciona qué dice cada una (por ejemplo, "El Colegio Médico señala… y el Colegio de Enfermeras también…"), y destaca en qué coinciden o se diferencian. Usa solo fragmentos que de verdad respondan la pregunta.
- Si hay fragmentos de APEC (Marco de Consenso Ético APEC — Chile, Principios de Kuala Lumpur o de Ciudad de México) relacionados con la pregunta, agrega al final un párrafo breve que empiece con "Referente internacional (APEC):" y explique en español qué recomiendan. Los Principios de Kuala Lumpur y de Ciudad de México están en inglés: tradúcelos y explícalos en palabras simples.
- SIEMPRE indica al final, entre corchetes, todas las instituciones y documentos que usaste, separados por comas, así: [Fuente: Colegio Médico de Chile A.G., Colegio de Enfermeras de Chile A.G., APEC — Principios de Kuala Lumpur].
- Si citas un artículo, indica su número tal como aparece en el fragmento.
- No inventes artículos, números o citas textuales que no estén en los fragmentos.
- Si los fragmentos no responden la pregunta, dilo explícitamente, sugiere reformularla con otras palabras o usar el formulario de contacto del sitio.
- No des diagnósticos ni consejo médico o legal individual; orienta a la institución que corresponda. Si la duda es una urgencia médica o legal, recomienda ayuda profesional o de emergencia inmediata.
- Sé claro y ordenado: hasta 2 párrafos cortos más el párrafo de APEC si corresponde, salvo que se pida más detalle.

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

  const ultima = String(messages[messages.length - 1]?.content || "");
  if (ES_SALUDO.test(ultima)) {
    const answer = /gracias/i.test(ultima)
      ? "¡De nada! 😊 Si tienes otra duda sobre ética en salud, aquí estoy."
      : MENSAJE_SALUDO;
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ answer, fuera_de_tema: true }) };
  }

  // Si la búsqueda no encuentra nada relacionado, la pregunta no es del ámbito:
  // se responde sin llamar a la IA (no tiene costo).
  const encontrados = buscarFragmentos(textoParaBuscar(messages));
  if (!encontrados.length) {
    console.log("Pregunta fuera de tema (sin fragmentos relacionados)");
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ answer: MENSAJE_FUERA_DE_TEMA, fuera_de_tema: true }),
    };
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
        system: buildSystemPrompt(encontrados),
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
    const texto = textBlocks.join("\n") || "No pude generar una respuesta.";
    const fueraDeTema = texto.includes(MARCA_FUERA_DE_TEMA);
    if (fueraDeTema) console.log("Pregunta fuera de tema (según la IA)");
    const answer = fueraDeTema ? MENSAJE_FUERA_DE_TEMA : texto;

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ answer, ...(fueraDeTema ? { fuera_de_tema: true } : {}) }),
    };
  } catch (err) {
    return respuestaError(500, `no se pudo contactar a la IA (${String(err).slice(0, 150)})`);
  }
};

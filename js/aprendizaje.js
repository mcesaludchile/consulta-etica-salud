/* =========================================================================
   SECCIÓN "APRENDE" (Centro de Aprendizaje)
   Todo el contenido está en data/aprendizaje.json: este archivo solo lo lee y
   lo muestra. El JSON se descarga recién cuando la persona abre la sección.
   Usa goTo(), supabaseClient y el campo #chatInput definidos en index.html.
   ========================================================================= */
(function(){
  const AP = {
    datos: null,          // contenido de aprendizaje.json
    cargando: null,       // promesa de carga (para no descargarlo dos veces)
    error: false,
    tab: 'cursos',        // cursos · videos · casos · glosario
    tema: 'todos',        // filtro por tema (chips)
    busqueda: '',         // texto del buscador del glosario
    vista: null,          // curso o caso abierto (null = lista)
    participaciones: {},  // curso_id → número de personas (desde Supabase)
  };
  const TABS = ['cursos','videos','casos','glosario'];
  const RAPIDO = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  /* ---------- Progreso en el navegador (si falla, el sitio sigue igual) ---------- */
  const CLAVE = 'aprendizaje';
  let progreso = { cursos:{}, casos:{}, participo:{} };
  try{
    const p = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    progreso = { cursos:p.cursos || {}, casos:p.casos || {}, participo:p.participo || {} };
  }catch(e){}
  function guardarProgreso(){
    try{ localStorage.setItem(CLAVE, JSON.stringify(progreso)); }catch(e){}
  }

  /* ---------- Utilidades ---------- */
  const $ = (id) => document.getElementById(id);
  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  // Ignora tildes y mayúsculas: "etica" encuentra "Ética".
  function normalizar(s){
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  }
  function tema(id){ return (AP.datos.temas || []).find(t => t.id === id) || { id, nombre:id, icono:'' }; }
  function termino(id){ return (AP.datos.glosario || []).find(g => g.id === id); }
  function pasaFiltro(item){
    if(AP.tema === 'todos') return true;
    return item.tema === AP.tema || (item.temas || []).includes(AP.tema);
  }
  // Texto del JSON → párrafos. {{id-termino|texto}} marca un término del glosario.
  function marcarTerminos(html){
    return html.replace(/\{\{([a-z0-9-]+)\|([^{}]+?)\}\}/g, (m, id, txt) =>
      termino(id) ? `<button type="button" class="ap-term" data-accion="termino" data-id="${id}">${txt}</button>` : txt);
  }
  function parrafos(texto){
    return String(texto || '').split(/\n\s*\n/).filter(p => p.trim())
      .map(p => `<p>${marcarTerminos(esc(p.trim()))}</p>`).join('');
  }
  function enLinea(texto){ return marcarTerminos(esc(texto)); }
  function textoFuente(f){
    if(!f) return 'Principio general (no atribuido a un código en particular)';
    return [f.institucion, f.documento, f.referencia].filter(Boolean).map(esc).join(' · ');
  }
  function notaLegal(item){
    const ids = item.referencias_legales || [];
    if(!ids.length) return '';
    const leyes = ids.map(id => ((AP.datos.referencias_legales || []).find(r => r.id === id) || {}).nombre || id);
    return `<p class="ap-nota-legal">📌 Menciona: ${leyes.map(esc).join(', ')}. Las leyes pueden cambiar: revisa la versión vigente en <a href="https://www.bcn.cl/leychile" target="_blank" rel="noopener">leychile.cl</a>.</p>`;
  }

  /* ---------- Carga diferida del contenido ---------- */
  function cargarDatos(){
    if(AP.datos) return Promise.resolve(AP.datos);
    if(AP.cargando) return AP.cargando;
    AP.error = false;
    AP.cargando = fetch('data/aprendizaje.json')
      .then(r => { if(!r.ok) throw new Error('código ' + r.status); return r.json(); })
      .then(d => { AP.datos = d; cargarParticipaciones(); return d; })
      .catch(e => { console.error('No se pudo cargar aprendizaje.json', e); AP.error = true; return null; })
      .finally(() => { AP.cargando = null; });
    return AP.cargando;
  }

  /* ---------- Registro anónimo: cuántas personas participan en cada curso ---------- */
  async function cargarParticipaciones(){
    if(typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try{
      const { data, error } = await supabaseClient.rpc('contar_participaciones');
      if(error) throw error;
      (data || []).forEach(f => { AP.participaciones[f.curso_id] = f.participantes; });
      if(!AP.vista && AP.tab === 'cursos') renderPanel();
    }catch(e){ console.warn('Sin contador de participación', e); }
  }
  async function registrarParticipacion(id){
    if(progreso.participo[id]) return;
    progreso.participo[id] = true;
    guardarProgreso();
    if(typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try{
      const { data, error } = await supabaseClient.rpc('registrar_participacion', { curso: id });
      if(error) throw error;
      if(typeof data === 'number') AP.participaciones[id] = data;
    }catch(e){ console.warn('No se registró la participación', e); }
  }

  /* ---------- Entrada a la sección ---------- */
  async function abrirAprende(){
    if(!AP.datos){
      $('apPanel').innerHTML = '<p class="empty-note">Cargando contenido…</p>';
      await cargarDatos();
    }
    renderTodo();
  }
  window.abrirAprende = abrirAprende;

  function renderTodo(){
    if(!AP.datos){
      $('apPanel').innerHTML = `<p class="empty-note">No pudimos cargar el contenido. Revisa tu conexión e inténtalo de nuevo.</p>
        <button type="button" class="ap-btn" data-accion="reintentar">Reintentar</button>`;
      return;
    }
    renderProgreso();
    renderChips();
    renderTabs();
    renderPanel();
  }

  /* ---------- Progreso por tema ---------- */
  function avanceTema(idTema){
    const cursos = AP.datos.cursos.filter(c => c.tema === idTema);
    const casos = AP.datos.casos.filter(c => c.tema === idTema);
    const total = cursos.length + casos.length;
    const hechos = cursos.filter(c => progreso.cursos[c.id]).length + casos.filter(c => progreso.casos[c.id]).length;
    return { hechos, total };
  }
  function renderProgreso(){
    const temas = AP.datos.temas;
    const completos = temas.filter(t => { const a = avanceTema(t.id); return a.total && a.hechos === a.total; }).length;
    const algo = Object.keys(progreso.cursos).length + Object.keys(progreso.casos).length;
    $('apProgreso').innerHTML = `
      <div class="ap-progreso-top">
        <span class="section-label" style="margin:0;">Tu progreso</span>
        <span class="ap-progreso-total">${completos ? `🏅 ${completos} de ${temas.length} temas completos` : 'Cursos y casos por tema'}</span>
      </div>
      <div class="ap-temas">
        ${temas.map(t => {
          const a = avanceTema(t.id);
          const listo = a.total && a.hechos === a.total;
          return `<button type="button" class="ap-tema${listo ? ' listo' : ''}${AP.tema === t.id ? ' activo' : ''}" data-accion="tema" data-id="${t.id}" aria-pressed="${AP.tema === t.id}">
            <span class="ap-tema-ic" aria-hidden="true">${listo ? '🏅' : esc(t.icono)}</span>
            <span class="ap-tema-nombre">${esc(t.nombre_corto || t.nombre)}</span>
            <span class="ap-tema-avance" aria-label="${a.hechos} de ${a.total} completados">${a.hechos} de ${a.total}</span>
          </button>`;
        }).join('')}
      </div>
      ${algo ? '<button type="button" class="ap-reiniciar" data-accion="reiniciar">Reiniciar mi progreso</button>' : ''}`;
  }

  /* ---------- Pestañas y chips ---------- */
  function renderTabs(){
    document.querySelectorAll('#apTabs [role="tab"]').forEach(b => {
      const activa = b.dataset.tab === AP.tab;
      b.setAttribute('aria-selected', activa);
      b.tabIndex = activa ? 0 : -1;
    });
    const enVista = !!AP.vista;
    $('apTabs').hidden = enVista;
    $('apChips').hidden = enVista;
    $('apProgreso').hidden = enVista;
    $('apPanel').setAttribute('aria-labelledby', 'apTab-' + AP.tab);
  }
  function renderChips(){
    const opciones = [{ id:'todos', nombre:'Todos' }].concat(AP.datos.temas.map(t => ({ id:t.id, nombre:t.nombre_corto || t.nombre })));
    $('apChips').innerHTML = opciones.map(o =>
      `<button type="button" class="ap-chip" data-accion="tema" data-id="${o.id}" aria-pressed="${AP.tema === o.id}">${esc(o.nombre)}</button>`).join('');
  }
  function cambiarTab(tab, enfocar){
    if(!TABS.includes(tab)) return;
    AP.tab = tab;
    AP.vista = null;
    renderTabs();
    renderPanel();
    if(enfocar) $('apTab-' + tab).focus();
  }

  /* ---------- Panel principal ---------- */
  function renderPanel(){
    const panel = $('apPanel');
    if(AP.vista && AP.vista.tipo === 'curso') return renderCurso();
    if(AP.vista && AP.vista.tipo === 'caso') return renderCaso();
    if(AP.tab === 'cursos') panel.innerHTML = listaCursos();
    if(AP.tab === 'videos') panel.innerHTML = listaVideos();
    if(AP.tab === 'casos') panel.innerHTML = listaCasos();
    if(AP.tab === 'glosario'){ panel.innerHTML = encabezadoGlosario(); renderGlosario(); }
  }
  function vacio(){ return '<p class="empty-note">No hay contenido para este tema todavía.</p>'; }
  function etiquetaTema(id){ const t = tema(id); return `<span class="ap-etiqueta">${esc(t.icono)} ${esc(t.nombre)}</span>`; }

  function listaCursos(){
    const cursos = AP.datos.cursos.filter(pasaFiltro);
    if(!cursos.length) return vacio();
    return cursos.map(c => {
      const n = AP.participaciones[c.id];
      return `<button type="button" class="ap-card" data-accion="curso" data-id="${c.id}">
        ${etiquetaTema(c.tema)}
        <span class="ap-card-titulo">${esc(c.titulo)}</span>
        <span class="ap-card-texto">${esc(c.objetivo)}</span>
        <span class="ap-meta">
          <span>⏱ ${c.duracion_min} min</span>
          ${videoDelCurso(c) ? `<span>🎬 Incluye video de ${minutosVideo(videoDelCurso(c))} min</span>` : ''}
          ${progreso.cursos[c.id] ? '<span class="ap-ok">✓ Completado</span>' : ''}
          ${n ? `<span>👥 ${n} ${n === 1 ? 'persona ha' : 'personas han'} participado</span>` : ''}
        </span>
      </button>`;
    }).join('');
  }

  function listaCasos(){
    const casos = AP.datos.casos.filter(pasaFiltro);
    if(!casos.length) return vacio();
    return casos.map(c => `<button type="button" class="ap-card" data-accion="caso" data-id="${c.id}">
        ${etiquetaTema(c.tema)}
        <span class="ap-card-titulo">${esc(c.titulo)}</span>
        <span class="ap-card-texto">${esc(c.resumen || '')}</span>
        <span class="ap-meta">
          <span>Nivel ${esc(c.nivel)}</span>
          ${progreso.casos[c.id] ? '<span class="ap-ok">✓ Resuelto</span>' : ''}
        </span>
      </button>`).join('');
  }

  /* ---------- Videos ---------- */
  // Solo direcciones https. YouTube se muestra con youtube-nocookie.com.
  function fuenteVideo(url){
    try{
      const u = new URL(url, location.href);
      if(u.protocol !== 'https:' && u.origin !== location.origin) return null;
      if(/(^|\.)youtube\.com$|(^|\.)youtu\.be$|youtube-nocookie\.com$/.test(u.hostname)){
        const id = u.hostname.endsWith('youtu.be') ? u.pathname.slice(1) : (u.searchParams.get('v') || u.pathname.split('/').pop());
        return { tipo:'youtube', yt:id, src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&hl=es&cc_load_policy=0` };
      }
      if(/\.(mp4|webm)$/i.test(u.pathname)) return { tipo:'archivo', src:u.href };
      return { tipo:'iframe', src:u.href };
    }catch(e){ return null; }
  }
  // El video no se descarga hasta que la persona aprieta ▶.
  function portadaVideo(v){
    const fuente = v.url_embed ? fuenteVideo(v.url_embed) : null;
    const portada = fuente
      ? `<button type="button" class="ap-video-portada" data-accion="reproducir" data-id="${v.id}" aria-label="Reproducir video: ${esc(v.titulo)}"
           ${v.miniatura ? `style="background-image:url('${esc(v.miniatura)}')"` : ''}>
           <span class="ap-play" aria-hidden="true">▶</span></button>`
      : `<div class="ap-video-portada ap-video-pronto" role="img" aria-label="Video próximamente">
           <span class="ap-pronto-ic" aria-hidden="true">🎬</span><span>Video próximamente</span></div>`;
    return `<div class="ap-video-marco" id="marco-${v.id}">${portada}</div>`;
  }
  function minutosVideo(v){ return Math.max(1, Math.round((v.duracion_seg || 120) / 60)); }
  function listaVideos(){
    const videos = AP.datos.videos.filter(pasaFiltro);
    if(!videos.length) return vacio();
    return videos.map(v => {
      const fuente = v.url_embed ? fuenteVideo(v.url_embed) : null;
      const mins = minutosVideo(v);
      return `<article class="ap-video" id="video-${v.id}">
        ${portadaVideo(v)}
        <div class="ap-video-info">
          ${etiquetaTema(v.tema)}
          <h3>${esc(v.titulo)}</h3>
          <span class="ap-meta"><span>⏱ ${mins} min</span>${fuente ? '' : '<span>Mientras tanto, puedes leerlo aquí abajo</span>'}</span>
          <details class="ap-transcripcion"${fuente ? '' : ' open'}>
            <summary>📄 Transcripción</summary>
            ${parrafos(v.transcripcion)}
          </details>
        </div>
      </article>`;
    }).join('');
  }
  function reproducir(id){
    const v = AP.datos.videos.find(x => x.id === id);
    const fuente = v && fuenteVideo(v.url_embed);
    if(!fuente) return;
    const marco = $('marco-' + id);
    if(fuente.tipo === 'archivo'){
      marco.innerHTML = `<video controls autoplay playsinline preload="metadata" src="${esc(fuente.src)}"${v.miniatura ? ` poster="${esc(v.miniatura)}"` : ''}>
        ${v.subtitulos_vtt ? `<track kind="subtitles" srclang="es" label="Español" src="${esc(v.subtitulos_vtt)}" default>` : ''}
      </video>`;
    }else if(fuente.tipo === 'youtube'){
      reproducirYouTube(marco, v, fuente);
    }else{
      marco.innerHTML = `<iframe src="${esc(fuente.src)}" title="${esc(v.titulo)}" loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    }
  }

  /* YouTube: nuestros videos traen los subtítulos en la imagen, así que se
     apagan los subtítulos automáticos de YouTube (que se encienden solos, por
     ejemplo cuando el video parte en silencio en el celular). Se usa la API
     del reproductor; si no carga, se muestra el reproductor simple. */
  let apiYouTube = null;
  function cargarApiYouTube(){
    if(window.YT && window.YT.Player) return Promise.resolve();
    if(apiYouTube) return apiYouTube;
    apiYouTube = new Promise((ok, falla) => {
      const anterior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if(anterior) anterior(); ok(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = falla;
      document.head.appendChild(s);
      setTimeout(() => falla(new Error('tiempo agotado')), 8000);
    });
    apiYouTube.catch(() => { apiYouTube = null; });
    return apiYouTube;
  }
  function quitarSubtitulos(reproductor){
    try{ reproductor.unloadModule('captions'); }catch(e){}
    try{ reproductor.unloadModule('cc'); }catch(e){}
  }
  function reproducirYouTube(marco, v, fuente){
    const simple = () => {
      marco.innerHTML = `<iframe src="${esc(fuente.src)}" title="${esc(v.titulo)}"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    };
    marco.innerHTML = `<div id="yt-${v.id}"></div>`;
    cargarApiYouTube().then(() => {
      if(!document.getElementById('yt-' + v.id)) return; // la persona ya cambió de pantalla
      new YT.Player('yt-' + v.id, {
        host: 'https://www.youtube-nocookie.com',
        videoId: fuente.yt,
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, rel: 0, playsinline: 1, hl: 'es', cc_load_policy: 0, iv_load_policy: 3 },
        events: {
          onReady: (e) => {
            const f = e.target.getIframe();
            f.title = v.titulo;
            f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
            quitarSubtitulos(e.target);
            e.target.playVideo();
          },
          onApiChange: (e) => quitarSubtitulos(e.target),
          onStateChange: (e) => { if(e.data === YT.PlayerState.PLAYING) quitarSubtitulos(e.target); },
        },
      });
    }).catch(simple);
  }

  /* ---------- Curso: pantallas + situaciones ficticias ---------- */
  function abrirCurso(id){
    const curso = AP.datos.cursos.find(c => c.id === id);
    if(!curso) return;
    AP.vista = { tipo:'curso', id, paso:0, respuestas:{} };
    registrarParticipacion(id);
    renderTabs();
    renderCurso();
    window.scrollTo(0, 0);
  }
  function renderCurso(){
    const v = AP.vista;
    const c = AP.datos.cursos.find(x => x.id === v.id);
    const nP = c.pantallas.length, nS = c.situaciones.length, total = nP + nS + 1;
    const paso = v.paso;
    let cuerpo = '', puedeSeguir = true;

    if(paso < nP && c.pantallas[paso].tipo === 'video'){
      const p = c.pantallas[paso];
      const vid = AP.datos.videos.find(x => x.id === p.video);
      cuerpo = `
        <span class="ap-tipo">Video${vid ? ' · ' + minutosVideo(vid) + ' min' : ''}</span>
        <h3 class="ap-paso-titulo" tabindex="-1">${esc(p.titulo || (vid && vid.titulo) || 'Video')}</h3>
        ${parrafos(p.texto)}
        ${vid ? `<div class="ap-video ap-video-curso">${portadaVideo(vid)}</div>
          <details class="ap-transcripcion"><summary>📄 Transcripción</summary>${parrafos(vid.transcripcion)}</details>` : ''}`;
    }else if(paso < nP){
      const p = c.pantallas[paso];
      cuerpo = `
        ${p.tipo === 'ejemplo' ? '<span class="ap-tipo">Ejemplo</span>' : ''}
        ${p.titulo ? `<h3 class="ap-paso-titulo" tabindex="-1">${esc(p.titulo)}</h3>` : `<h3 class="ap-paso-titulo" tabindex="-1">${p.tipo === 'ejemplo' ? 'En la práctica' : esc(c.titulo)}</h3>`}
        ${parrafos(p.texto)}
        ${p.en_simple ? `<div class="ap-simple"><b>En simple</b>${enLinea(p.en_simple)}</div>` : ''}
        ${notaLegal(p)}`;
    }else if(paso < nP + nS){
      const i = paso - nP;
      const s = c.situaciones[i];
      const elegida = v.respuestas[i];
      puedeSeguir = elegida != null;
      cuerpo = `
        <span class="ap-ficticia">Situación ficticia ${i + 1} de ${nS}</span>
        <h3 class="ap-paso-titulo" tabindex="-1">¿Qué harías?</h3>
        ${parrafos(s.enunciado)}
        <div class="ap-opciones" role="group" aria-label="Opciones">
          ${s.opciones.map((o, k) => {
            let clase = '';
            if(elegida != null){ clase = o.correcta ? ' correcta' : (k === elegida ? ' incorrecta' : ''); }
            return `<button type="button" class="ap-opcion${clase}" data-accion="responder" data-i="${i}" data-k="${k}"
              ${elegida != null ? 'disabled' : ''} aria-pressed="${k === elegida}">${esc(o.texto)}</button>`;
          }).join('')}
        </div>
        <div class="ap-retro" aria-live="polite">${elegida != null ? retroalimentacion(s, elegida) : ''}</div>`;
    }else{
      const buenas = c.situaciones.filter((s, i) => s.opciones[v.respuestas[i]] && s.opciones[v.respuestas[i]].correcta).length;
      const caso = AP.datos.casos.find(x => x.tema === c.tema);
      const relacionados = (c.terminos_relacionados || []).map(termino).filter(Boolean);
      cuerpo = `
        <div class="ap-fin">
          <span class="ap-fin-ic" aria-hidden="true">🎉</span>
          <h3 class="ap-paso-titulo" tabindex="-1">¡Curso completado!</h3>
          <p>Elegiste la opción más adecuada en ${buenas} de ${nS} situaciones. Lo importante no es acertar a la primera, sino entender por qué.</p>
        </div>
        ${relacionados.length ? `<p class="ap-sub">Palabras clave de este curso (tócalas para ver qué significan):</p>
          <div class="ap-relacionados">${relacionados.map(t => `<button type="button" class="ap-term ap-term-chip" data-accion="termino" data-id="${t.id}">${esc(t.termino)}</button>`).join('')}</div>` : ''}
        <div class="ap-acciones-fin">
          ${caso ? `<button type="button" class="ap-btn" data-accion="caso" data-id="${caso.id}">Practicar con un caso de este tema</button>` : ''}
          <button type="button" class="ap-btn secundario" data-accion="volver">Volver a los cursos</button>
        </div>`;
      if(!progreso.cursos[c.id]){ progreso.cursos[c.id] = true; guardarProgreso(); }
    }

    const pct = Math.round(((paso + 1) / total) * 100);
    $('apPanel').innerHTML = `
      <div class="ap-visor" id="apVisor">
        <button type="button" class="ap-volver" data-accion="volver">← Volver a cursos</button>
        ${etiquetaTema(c.tema)}
        <h2 class="ap-visor-titulo">${esc(c.titulo)}</h2>
        <div class="ap-barra" role="progressbar" aria-label="Avance del curso" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${paso + 1}" aria-valuetext="Paso ${paso + 1} de ${total}">
          <span style="width:${pct}%"></span>
        </div>
        <p class="ap-paso-num">Paso ${paso + 1} de ${total} · ⏱ ${c.duracion_min} min${videoDelCurso(c) ? ` + video de ${minutosVideo(videoDelCurso(c))} min` : ''}</p>
        <div class="ap-tarjeta">${cuerpo}</div>
        ${paso < total - 1 ? `<div class="ap-nav">
          <button type="button" class="ap-btn secundario" data-accion="anterior" ${paso === 0 ? 'disabled' : ''}>Anterior</button>
          <button type="button" class="ap-btn" data-accion="siguiente" ${puedeSeguir ? '' : 'disabled'}>${paso === nP + nS - 1 ? 'Terminar' : 'Siguiente'}</button>
        </div>` : ''}
        ${paso < nP ? '<p class="ap-ayuda">También puedes deslizar la tarjeta con el dedo.</p>' : ''}
      </div>`;
    if(paso === total - 1) renderProgreso();
  }
  function videoDelCurso(c){
    const p = c.pantallas.find(x => x.tipo === 'video');
    const v = p && AP.datos.videos.find(x => x.id === p.video);
    return v && v.url_embed ? v : null;
  }
  function retroalimentacion(s, k){
    const o = s.opciones[k];
    return `<div class="ap-retro-caja ${o.correcta ? 'bien' : 'mal'}">
      <b>${o.correcta ? '✓ Es lo más adecuado' : '✗ No es lo más adecuado'}</b>
      ${parrafos(o.explicacion)}
      ${o.correcta ? '' : (() => { const b = s.opciones.find(x => x.correcta); return b ? `<p><b>Lo más adecuado:</b> ${esc(b.texto)}</p>` : ''; })()}
      <p class="ap-fuente">Respaldo: ${textoFuente(s.fuente)}</p>
    </div>`;
  }
  function moverCurso(delta){
    const v = AP.vista;
    if(!v || v.tipo !== 'curso') return;
    const c = AP.datos.cursos.find(x => x.id === v.id);
    const nP = c.pantallas.length, nS = c.situaciones.length, total = nP + nS + 1;
    const nuevo = v.paso + delta;
    if(nuevo < 0 || nuevo >= total) return;
    // No se avanza desde una situación sin responder.
    if(delta > 0 && v.paso >= nP && v.paso < nP + nS && v.respuestas[v.paso - nP] == null) return;
    v.paso = nuevo;
    renderCurso();
    enfocarTitulo();
  }
  function enfocarTitulo(){
    const t = document.querySelector('#apPanel .ap-paso-titulo');
    if(t) t.focus({ preventScroll:true });
    const visor = $('apVisor');
    if(visor && visor.getBoundingClientRect().top < 0) visor.scrollIntoView({ behavior:RAPIDO, block:'start' });
  }

  /* ---------- Caso práctico con decisiones ---------- */
  function abrirCaso(id){
    const caso = AP.datos.casos.find(c => c.id === id);
    if(!caso) return;
    AP.tab = 'casos';
    AP.vista = { tipo:'caso', id, actual:caso.pasos[0].id, camino:[] };
    renderTabs();
    renderCaso();
    window.scrollTo(0, 0);
  }
  function renderCaso(){
    const v = AP.vista;
    const c = AP.datos.casos.find(x => x.id === v.id);
    const paso = c.pasos.find(p => p.id === v.actual);
    const fin = c.desenlaces.find(d => d.id === v.actual);
    const historia = v.camino.map(h => {
      const p = c.pasos.find(x => x.id === h.paso);
      const o = p.opciones[h.opcion];
      return `<div class="ap-historia">
        <p class="ap-historia-p">${esc(p.pregunta)}</p>
        <p class="ap-historia-r">Elegiste: <b>${esc(o.texto)}</b></p>
        ${o.comentario ? `<div class="ap-comentario">${parrafos(o.comentario)}</div>` : ''}
      </div>`;
    }).join('');

    let actual = '';
    if(paso){
      actual = `<div class="ap-tarjeta">
        <h3 class="ap-paso-titulo" tabindex="-1">${esc(paso.pregunta)}</h3>
        ${paso.contexto ? parrafos(paso.contexto) : ''}
        <div class="ap-opciones" role="group" aria-label="Opciones">
          ${paso.opciones.map((o, k) => `<button type="button" class="ap-opcion" data-accion="decidir" data-k="${k}">${esc(o.texto)}</button>`).join('')}
        </div></div>`;
    }else if(fin){
      const tipos = { adecuado:'Desenlace adecuado', mejorable:'Desenlace mejorable', riesgoso:'Desenlace riesgoso' };
      const cons = fin.consecuencias || {};
      actual = `<div class="ap-tarjeta ap-desenlace ${esc(fin.tipo)}">
        <span class="ap-tipo">${esc(tipos[fin.tipo] || 'Desenlace')}</span>
        <h3 class="ap-paso-titulo" tabindex="-1">${esc(fin.titulo || 'Cómo termina')}</h3>
        ${parrafos(fin.texto)}
        <ul class="ap-consecuencias">
          ${cons.paciente ? `<li><b>Para el paciente:</b> ${enLinea(cons.paciente)}</li>` : ''}
          ${cons.profesional ? `<li><b>Para quien decide:</b> ${enLinea(cons.profesional)}</li>` : ''}
          ${cons.institucion ? `<li><b>Para la institución:</b> ${enLinea(cons.institucion)}</li>` : ''}
        </ul>
      </div>
      <div class="ap-codigos">
        <h3>¿Qué dicen los códigos?</h3>
        ${c.que_dicen_los_codigos.map(r => `<div class="ap-codigo">
          <b>${esc(r.institucion)}</b>
          <span class="ap-codigo-doc">${esc(r.documento)}${r.referencia ? ' · ' + esc(r.referencia) : ''}</span>
          <p>${enLinea(r.resumen)}</p></div>`).join('')}
      </div>
      <div class="ap-acciones-fin">
        <button type="button" class="ap-btn" data-accion="preguntar-ia">💬 Pregúntale a la IA sobre este caso</button>
        <button type="button" class="ap-btn secundario" data-accion="reintentar-caso">Probar otro camino</button>
        <button type="button" class="ap-btn secundario" data-accion="volver">Volver a los casos</button>
      </div>`;
      if(!progreso.casos[c.id]){ progreso.casos[c.id] = true; guardarProgreso(); }
    }

    $('apPanel').innerHTML = `
      <div class="ap-visor" id="apVisor">
        <button type="button" class="ap-volver" data-accion="volver">← Volver a casos</button>
        ${etiquetaTema(c.tema)}
        <h2 class="ap-visor-titulo">${esc(c.titulo)}</h2>
        <span class="ap-ficticia">Situación ficticia · nivel ${esc(c.nivel)}</span>
        <div class="ap-escenario">${parrafos(c.escenario)}</div>
        ${historia}
        ${actual}
      </div>`;
  }
  function decidir(k){
    const v = AP.vista;
    const c = AP.datos.casos.find(x => x.id === v.id);
    const paso = c.pasos.find(p => p.id === v.actual);
    const o = paso && paso.opciones[k];
    if(!o) return;
    v.camino.push({ paso:paso.id, opcion:k });
    v.actual = o.siguiente;
    renderCaso();
    const tarjetas = document.querySelectorAll('#apPanel .ap-historia');
    const ultima = tarjetas[tarjetas.length - 1];
    if(ultima) ultima.scrollIntoView({ behavior:RAPIDO, block:'start' });
    const t = document.querySelector('#apPanel .ap-paso-titulo');
    if(t) t.focus({ preventScroll:true });
  }
  function preguntarIA(){
    const c = AP.datos.casos.find(x => x.id === AP.vista.id);
    goTo('consultar');
    const input = $('chatInput');
    input.value = c.pregunta_para_ia;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  /* ---------- Glosario ---------- */
  function encabezadoGlosario(){
    return `
      <label for="apBuscar" class="ap-label">Buscar un término</label>
      <input type="search" id="apBuscar" class="ap-buscar" placeholder="Ej.: etica, consentimiento, sesgo…" value="${esc(AP.busqueda)}" autocomplete="off">
      <nav class="ap-az" id="apAZ" aria-label="Ir a la letra"></nav>
      <p class="ap-sub" id="apGlosCuenta" aria-live="polite"></p>
      <div id="apGlosLista"></div>`;
  }
  function renderGlosario(){
    const q = normalizar(AP.busqueda.trim());
    const lista = AP.datos.glosario
      .filter(pasaFiltro)
      .filter(g => !q || normalizar(g.termino).includes(q) || normalizar(g.definicion).includes(q))
      .sort((a, b) => normalizar(a.termino).localeCompare(normalizar(b.termino), 'es'));
    const letra = g => normalizar(g.termino).charAt(0).toUpperCase();
    const presentes = new Set(lista.map(letra));
    $('apAZ').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l =>
      `<button type="button" class="ap-letra" data-accion="letra" data-id="${l}" ${presentes.has(l) ? '' : 'disabled'} aria-label="Letra ${l}">${l}</button>`).join('');
    $('apGlosCuenta').textContent = lista.length === 1 ? '1 término' : `${lista.length} términos`;
    let ultimaLetra = '';
    $('apGlosLista').innerHTML = lista.length ? lista.map(g => {
      const l = letra(g);
      const marca = l !== ultimaLetra ? `<h3 class="ap-glos-letra" id="glos-letra-${l}">${l}</h3>` : '';
      ultimaLetra = l;
      const ver = (g.ver_tambien || []).map(termino).filter(Boolean);
      return `${marca}<article class="ap-glos" id="glos-${g.id}" tabindex="-1">
        <h4>${esc(g.termino)}</h4>
        <div class="ap-glos-temas">${(g.temas || []).map(t => `<span>${esc(tema(t).nombre)}</span>`).join('')}</div>
        <p>${esc(g.definicion)}</p>
        <p class="ap-ejemplo"><b>Ejemplo:</b> ${esc(g.ejemplo)}</p>
        <p class="ap-fuente">Fuente: ${textoFuente(g.fuente)}</p>
        ${ver.length ? `<p class="ap-ver">Ver también: ${ver.map(t => `<a href="#glosario/${t.id}">${esc(t.termino)}</a>`).join(', ')}</p>` : ''}
        <button type="button" class="ap-copiar" data-accion="copiar" data-id="${g.id}">🔗 Copiar enlace</button>
      </article>`;
    }).join('') : '<p class="empty-note">No encontramos ese término. Prueba con otra palabra o pregúntalo en Consultar.</p>';
  }
  async function irAGlosario(id){
    AP.tab = 'glosario'; AP.vista = null; AP.tema = 'todos'; AP.busqueda = '';
    if(!$('screen-aprende').classList.contains('active')) goTo('aprende');
    await cargarDatos();
    renderTodo();
    const el = id && $('glos-' + id);
    if(el){
      el.classList.add('resaltado');
      el.scrollIntoView({ behavior:RAPIDO, block:'center' });
      el.focus({ preventScroll:true });
      setTimeout(() => el.classList.remove('resaltado'), 2500);
    }
  }
  async function copiarEnlace(id, boton){
    const url = location.origin + location.pathname + '#glosario/' + id;
    let ok = false;
    try{ await navigator.clipboard.writeText(url); ok = true; }catch(e){}
    if(!ok){ history.replaceState(null, '', '#glosario/' + id); }
    boton.textContent = ok ? '✓ Enlace copiado' : 'Copia la dirección desde la barra del navegador';
    setTimeout(() => { boton.textContent = '🔗 Copiar enlace'; }, 2500);
  }

  /* ---------- Ventana pequeña con la definición de un término ---------- */
  let focoPrevio = null;
  function abrirTermino(id, origen){
    const g = termino(id);
    if(!g) return;
    focoPrevio = origen || document.activeElement;
    $('apDialogoTitulo').textContent = g.termino;
    $('apDialogoCuerpo').innerHTML = `<p>${esc(g.definicion)}</p><p class="ap-ejemplo"><b>Ejemplo:</b> ${esc(g.ejemplo)}</p>
      <a class="ap-btn secundario" href="#glosario/${g.id}" data-accion="cerrar-dialogo">Ver en el glosario</a>`;
    $('apDialogo').hidden = false;
    document.body.classList.add('ap-sin-scroll');
    $('apDialogoCerrar').focus();
  }
  function cerrarTermino(){
    if($('apDialogo').hidden) return;
    $('apDialogo').hidden = true;
    document.body.classList.remove('ap-sin-scroll');
    if(focoPrevio && document.body.contains(focoPrevio)) focoPrevio.focus({ preventScroll:true });
  }

  /* ---------- Eventos (un solo escuchador para toda la sección) ---------- */
  document.addEventListener('click', (e) => {
    // Un enlace al glosario igual a la dirección actual no dispara "hashchange": se abre aquí.
    const enlace = e.target.closest('a[href^="#glosario/"]');
    if(enlace && enlace.getAttribute('href') === location.hash){
      e.preventDefault();
      cerrarTermino();
      irAGlosario(location.hash.split('/')[1]);
      return;
    }
    const b = e.target.closest('[data-accion]');
    if(!b || !b.closest('#screen-aprende, #apDialogo')) return;
    const id = b.dataset.id;
    switch(b.dataset.accion){
      case 'reintentar': abrirAprende(); break;
      case 'tab': cambiarTab(b.dataset.tab); break;
      case 'tema':
        AP.tema = AP.tema === id && id !== 'todos' ? 'todos' : id;
        AP.vista = null;
        renderTodo();
        break;
      case 'reiniciar':
        if(confirm('¿Borrar tu progreso de cursos y casos en este navegador?')){
          progreso.cursos = {}; progreso.casos = {};
          guardarProgreso();
          renderTodo();
        }
        break;
      case 'curso': abrirCurso(id); break;
      case 'caso': abrirCaso(id); break;
      case 'volver': AP.vista = null; renderTodo(); window.scrollTo(0, 0); break;
      case 'anterior': moverCurso(-1); break;
      case 'siguiente': moverCurso(1); break;
      case 'responder':
        AP.vista.respuestas[b.dataset.i] = Number(b.dataset.k);
        renderCurso();
        { const r = document.querySelector('#apPanel .ap-retro'); if(r) r.scrollIntoView({ behavior:RAPIDO, block:'nearest' }); }
        { const s = document.querySelector('#apPanel [data-accion="siguiente"]'); if(s) s.focus({ preventScroll:true }); }
        break;
      case 'decidir': decidir(Number(b.dataset.k)); break;
      case 'reintentar-caso': abrirCaso(AP.vista.id); break;
      case 'preguntar-ia': preguntarIA(); break;
      case 'reproducir': reproducir(id); break;
      case 'letra': { const el = $('glos-letra-' + id); if(el) el.scrollIntoView({ behavior:RAPIDO, block:'start' }); break; }
      case 'copiar': copiarEnlace(id, b); break;
      case 'termino': abrirTermino(id, b); break;
      case 'cerrar-dialogo': cerrarTermino(); break;
    }
  });
  document.addEventListener('input', (e) => {
    if(e.target.id !== 'apBuscar') return;
    AP.busqueda = e.target.value;
    renderGlosario();
  });
  // Pestañas: flechas izquierda/derecha, Inicio y Fin (patrón de accesibilidad para pestañas)
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && !$('apDialogo').hidden){ cerrarTermino(); return; }
    if(e.key === 'Tab' && !$('apDialogo').hidden){
      // Mantiene el foco dentro de la ventana mientras está abierta
      const f = $('apDialogo').querySelectorAll('button, a[href]');
      const primero = f[0], ultimo = f[f.length - 1];
      if(e.shiftKey && document.activeElement === primero){ e.preventDefault(); ultimo.focus(); }
      else if(!e.shiftKey && document.activeElement === ultimo){ e.preventDefault(); primero.focus(); }
      return;
    }
    const tab = e.target.closest && e.target.closest('#apTabs [role="tab"]');
    if(!tab) return;
    let i = TABS.indexOf(tab.dataset.tab);
    if(e.key === 'ArrowRight') i = (i + 1) % TABS.length;
    else if(e.key === 'ArrowLeft') i = (i - 1 + TABS.length) % TABS.length;
    else if(e.key === 'Home') i = 0;
    else if(e.key === 'End') i = TABS.length - 1;
    else return;
    e.preventDefault();
    cambiarTab(TABS[i], true);
  });
  $('apDialogo').addEventListener('click', (e) => { if(e.target.id === 'apDialogo') cerrarTermino(); });
  $('apDialogoCerrar').addEventListener('click', cerrarTermino);

  // Deslizar con el dedo para avanzar o retroceder en un curso
  let toque = null;
  $('apPanel').addEventListener('touchstart', (e) => {
    if(!e.target.closest('.ap-visor') || e.target.closest('.ap-video-marco') || !AP.vista || AP.vista.tipo !== 'curso') return;
    toque = { x:e.touches[0].clientX, y:e.touches[0].clientY };
  }, { passive:true });
  $('apPanel').addEventListener('touchend', (e) => {
    if(!toque) return;
    const dx = e.changedTouches[0].clientX - toque.x, dy = e.changedTouches[0].clientY - toque.y;
    toque = null;
    if(Math.abs(dx) > 60 && Math.abs(dy) < 50) moverCurso(dx < 0 ? 1 : -1);
  }, { passive:true });

  /* ---------- Leyes de referencia (sección Contexto) ----------
     Usa la misma lista de leyes de aprendizaje.json, para no tenerla en dos lugares.
     Muestra el "resumen" (para el público); la "descripcion" es la nota de revisión. */
  async function renderLegales(contenedor){
    if(!contenedor) return;
    await cargarDatos();
    if(!AP.datos){ contenedor.innerHTML = '<p class="empty-note">No pudimos cargar la lista de leyes. Inténtalo más tarde.</p>'; return; }
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fecha = (f) => { const m = /^(\d{4})-(\d{2})/.exec(f || ''); return m ? `${meses[Number(m[2]) - 1]} de ${m[1]}` : ''; };
    contenedor.innerHTML = (AP.datos.referencias_legales || []).map(r => `<div class="ley">
        <b>${esc(r.nombre)}</b>
        <p>${esc(r.resumen || r.descripcion)}</p>
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Ver el texto oficial ↗</a>` : ''}
        ${r.revisado ? `<span class="ley-revisado">${r.url ? ' · ' : ''}Revisado en ${fecha(r.revisado)}</span>` : ''}
      </div>`).join('');
  }
  window.renderLegales = renderLegales;

  /* ---------- Enlaces directos: #glosario/termino y #aprende ---------- */
  function leerDireccion(){
    const m = location.hash.match(/^#glosario\/([a-z0-9-]+)$/);
    if(m){ irAGlosario(m[1]); return; }
    if(location.hash === '#glosario') irAGlosario(null);
    else if(location.hash === '#aprende') goTo('aprende');
  }
  window.addEventListener('hashchange', () => { cerrarTermino(); leerDireccion(); });
  if(location.hash) leerDireccion();
})();

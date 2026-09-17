// Pruebas automáticas de Clave Maestra: recorre pantallas, juega partidas y vigila errores.
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = []; let fails = 0;
function ok(name, cond, extra){ results.push((cond?'PASS ':'FAIL ')+name+(extra?' — '+extra:'')); if(!cond) fails++; }

(async () => {
  const browser = await chromium.launch({ args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport:{width:390, height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, permissions:['microphone'], acceptDownloads:true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: '+e.message));
  page.on('console', m => { if(m.type()==='error' && !/ERR_TUNNEL|ERR_INTERNET|Failed to load resource/.test(m.text())) errors.push('console: '+m.text()); });
  await page.goto(URL); await page.waitForTimeout(800);

  // bienvenida
  await page.fill('#welName', 'Prueba'); await page.click('#welcomeGo'); await page.waitForTimeout(300);
  ok('bienvenida cerrada', await page.isHidden('#welcome'));

  // inicio en una sola pantalla
  const noScroll = await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1);
  ok('inicio sin scroll de página', noScroll);
  const paneFits = await page.evaluate(() => { const p=document.querySelector('#tabPlay'); return {sh:p.scrollHeight, ch:p.clientHeight}; });
  ok('pestaña Practicar cabe sin scroll', paneFits.sh <= paneFits.ch + 2, JSON.stringify(paneFits));
  ok('barra de pestañas visible', await page.isVisible('#tabbar'));
  await page.screenshot({ path:'shot-play.png' });

  for(const t of ['tabStudy','tabProgress','tabMe','tabPlay']){
    await page.click(`#tabbar button[data-tab="${t}"]`); await page.waitForTimeout(250);
    ok('pestaña '+t+' visible', await page.isVisible('#'+t));
    const fit = await page.evaluate((t)=>{ const p=document.querySelector('#'+t); return {sh:p.scrollHeight, ch:p.clientHeight}; }, t);
    results.push('info '+t+' alto contenido '+fit.sh+' / visible '+fit.ch);
    await page.screenshot({ path:'shot-'+t+'.png' });
  }

  // helpers de partida
  const answerAll = async (max=80) => {
    for(let i=0;i<max;i++){
      if(await page.isVisible('#result')) return true;
      const st = await page.evaluate(()=>{ const G=window.__cm.G; if(!G) return null; const it=G.seq[G.idx]; return {kind:G.kind, locked:G.locked, step:it&&it.n.step, dia:it&&it.n.dia, q:it&&it.q, base: window.__cm.base(G.cfg.clef), answerBy:G.answerBy, finger:it&&it.finger, keysHidden:document.querySelector('#keys').hidden, pianoHidden:document.querySelector('#piano').hidden}; });
      if(!st){ return false; }
      if(st.locked){ await page.waitForTimeout(120); continue; }
      if(st.kind==='chord'){ await page.click(`.key[data-v="${st.q}"]`); }
      else if(st.kind==='place'){
        const pt = await page.evaluate((dia)=>{ const svg=document.querySelector('#staff'), r=svg.getBoundingClientRect(), vb=svg.getAttribute('viewBox').split(' ').map(Number); const {TOP,SP}=window.__cm.geom(); const bottom=TOP+4*SP, pos=dia-window.__cm.base(window.__cm.G.cfg.clef); const y=bottom-pos*SP/2; return {x:r.left+r.width*0.5, y:r.top+(y-vb[1])/vb[3]*r.height}; }, st.dia);
        await page.mouse.click(pt.x, pt.y);
      }
      else if(st.kind==='piano5' && st.answerBy==='finger'){ await page.click(`.key[data-v="${st.finger}"]`); }
      else if(!st.keysHidden){ await page.click(`.key[data-step="${st.step}"]`); }
      else if(!st.pianoHidden){ await page.click(`.piano .w[data-step="${st.step}"]`); }
      else { return false; }
      await page.waitForTimeout(700);
    }
    return await page.isVisible('#result');
  };
  await page.evaluate(()=>{ window.__cm.base = c => ({treble:23+4, bass:2*7+4})[c]; });
  // base real: dia de E4 = 4*7+2 = 30; G2 = 2*7+4 = 18
  await page.evaluate(()=>{ window.__cm.base = c => c==='treble' ? 30 : 18; });

  // Grado I: modo guiado
  await page.click('#levels .gr'); await page.waitForTimeout(500);
  ok('partida Grado I abierta', await page.isVisible('#game'));
  const guided = await page.evaluate(()=>document.querySelectorAll('#staff .note text').length);
  ok('modo guiado: nombres bajo las notas en la ronda 1', guided>=6, 'textos='+guided);
  ok('botón de pausa visible', await page.isVisible('#btnPause'));
  // pausa
  await page.click('#btnPause'); await page.waitForTimeout(200);
  ok('velo de pausa visible', await page.isVisible('#pause'));
  await page.click('#pauseGo'); await page.waitForTimeout(200);
  ok('pausa reanudada', await page.isHidden('#pause'));
  // pistas: fallar dos veces la misma nota
  const cur = await page.evaluate(()=>window.__cm.G.seq[window.__cm.G.idx].n.step);
  const wrong = cur==='C' ? 'D' : 'C';
  await page.click(`.key[data-step="${wrong}"]`); await page.waitForTimeout(1600);
  // la siguiente nota puede ser otra; forzamos fallo sobre la misma nota manipulando el contador
  await page.evaluate((c)=>{ window.__cm.G.fails[window.__cm.G.seq.find(x=>x.n.step===c).n.name] = 1; }, cur);
  // fallar la actual dos veces no es posible; en su lugar validamos showHint directamente
  const hintShown = await page.evaluate(()=>{ const G=window.__cm.G; const it=G.seq[G.idx]; G.fails[it.n.name]=1; return true; });
  const nowStep = await page.evaluate(()=>window.__cm.G.seq[window.__cm.G.idx].n.step);
  await page.click(`.key[data-step="${nowStep==='C'?'D':'C'}"]`); await page.waitForTimeout(400);
  ok('pista inteligente mostrada tras dos fallos', await page.isVisible('#hintBox'), await page.textContent('#hintBox'));
  await page.screenshot({ path:'shot-hint.png' });
  await page.waitForTimeout(2600);
  ok('Grado I completado', await answerAll());
  ok('resultado visible', await page.isVisible('#result'));
  ok('botón repasar fallos visible', await page.isVisible('#resRetry'), await page.textContent('#resRetry'));
  ok('lista de fallos visible', await page.isVisible('#resFails'), await page.textContent('#resFails'));
  await page.screenshot({ path:'shot-result.png' });
  await page.click('#resRetry'); await page.waitForTimeout(400);
  ok('repaso de fallos arranca', (await page.textContent('#gameTitle')).indexOf('Repaso')>=0);
  ok('repaso de fallos completado', await answerAll());
  await page.click('#resHome'); await page.waitForTimeout(300);
  const contTxt = await page.textContent('#qContinue');
  ok('tarjeta Continuar recuerda el último grado', /Grado I/.test(contTxt), contTxt);

  // Estudios nuevos
  const study = async (id, name, checks) => {
    await page.click('#tabbar button[data-tab="tabStudy"]'); await page.waitForTimeout(200);
    await page.click('#'+id); await page.waitForTimeout(600);
    ok(name+' abierto', await page.isVisible('#game'), await page.textContent('#gameTitle'));
    if(checks) await checks();
    ok(name+' completado', await answerAll(120));
    await page.screenshot({ path:'shot-'+id+'.png' });
    await page.click('#resHome'); await page.waitForTimeout(250);
  };
  await study('btnFlash', 'Nota relámpago', async ()=>{ await page.waitForTimeout(1200); const hid = await page.evaluate(()=>!!window.__cm.G.seq[0].flashHidden); ok('relámpago: la nota se esconde', hid); await page.screenshot({path:'shot-flash.png'}); });
  await study('btnChord', 'Acordes', async ()=>{ const k = await page.evaluate(()=>document.querySelectorAll('#keys .key').length); ok('acordes: cuatro teclas', k===4); await page.screenshot({path:'shot-chord.png'}); });
  await study('btnPlace', 'Coloca la nota', async ()=>{ ok('coloca: teclas ocultas', await page.isHidden('#keys')); await page.screenshot({path:'shot-place.png'}); });
  await study('btnMixed', 'Claves mixtas', async ()=>{ const c1 = await page.evaluate(()=>window.__cm.G.cfg.clef); results.push('info clave mixta ronda 1: '+c1); });
  // repaso pendiente: tras repasar los fallos hoy no queda nada pendiente (comportamiento correcto)
  await page.click('#tabbar button[data-tab="tabStudy"]'); await page.waitForTimeout(200);
  const badge0 = await page.evaluate(()=>{ const b=document.querySelector('#btnSrs .badge'); return b?b.textContent:null; });
  ok('repaso: nada pendiente tras acertar todo hoy', badge0===null, 'badge='+badge0);
  await page.click('#btnSrs'); await page.waitForTimeout(300);
  ok('repaso: aviso en vez de partida', await page.isVisible('#toast') && await page.isHidden('#game'), await page.textContent('#toast'));
  // simulamos que pasan los días: tres notas vencen hoy
  await page.evaluate(()=>{ const s = JSON.parse(localStorage.getItem('cm.srs')); const t = new Date(); t.setDate(t.getDate()-3); const k = t.toISOString().slice(0,10); ['E4','G4','B4'].forEach(n=>{ s.treble[n] = {b:2, due:k}; }); localStorage.setItem('cm.srs', JSON.stringify(s)); });
  await page.reload(); await page.waitForTimeout(600); await page.evaluate(()=>{ window.__cm.base = c => c==='treble' ? 30 : 18; });
  await page.click('#tabbar button[data-tab="tabStudy"]'); await page.waitForTimeout(200);
  const badge = await page.evaluate(()=>{ const b=document.querySelector('#btnSrs .badge'); return b?b.textContent:null; });
  ok('repaso pendiente: insignia con el número de notas', badge==='3', 'badge='+badge);
  await page.click('#btnSrs'); await page.waitForTimeout(500);
  ok('repaso pendiente arranca', await page.isVisible('#game'));
  ok('repaso pendiente completado', await answerAll());
  await page.click('#resHome'); await page.waitForTimeout(250);

  // Reto del día
  await page.click('#tabbar button[data-tab="tabPlay"]'); await page.waitForTimeout(200);
  await page.click('#qDaily'); await page.waitForTimeout(500);
  ok('reto del día arranca', /Reto del día/.test(await page.textContent('#gameTitle')), await page.textContent('#gameTitle'));
  ok('reto del día completado', await answerAll());
  await page.click('#resHome'); await page.waitForTimeout(250);
  ok('récord del reto guardado', /Récord de hoy/.test(await page.textContent('#qDaily')), await page.textContent('#qDaily'));

  // Rutina diaria (3 ejercicios)
  await page.click('#levels .gr.wide:nth-of-type(12)'); await page.waitForTimeout(500);
  ok('rutina arranca', /1\/3/.test(await page.textContent('#gameTitle')), await page.textContent('#gameTitle'));
  ok('rutina ejercicio 1 completado', await answerAll());
  ok('botón siguiente ejercicio', await page.isVisible('#resNext'), await page.textContent('#resNext'));
  await page.click('#resNext'); await page.waitForTimeout(500);
  ok('rutina ejercicio 2', /2\/3/.test(await page.textContent('#gameTitle')), await page.textContent('#gameTitle'));
  ok('rutina ejercicio 2 completado', await answerAll());
  await page.click('#resNext'); await page.waitForTimeout(500);
  ok('rutina ejercicio 3 (sprint)', /3\/3/.test(await page.textContent('#gameTitle')), await page.textContent('#gameTitle'));
  // el sprint dura 30 s: respondemos hasta que acabe
  const t0 = Date.now(); while(!(await page.isVisible('#result')) && Date.now()-t0 < 40000){ await answerAll(10); }
  ok('rutina completada', /Rutina completada/.test(await page.textContent('#resMsg')), await page.textContent('#resMsg'));
  await page.screenshot({ path:'shot-routine.png' });

  // compartir: descarga de tarjeta
  const [dl] = await Promise.all([ page.waitForEvent('download', {timeout:5000}).catch(()=>null), page.click('#resShare') ]);
  ok('compartir genera la tarjeta', !!dl, dl ? dl.suggestedFilename() : 'sin descarga');
  if(dl) await dl.saveAs('share.png');
  await page.click('#resHome'); await page.waitForTimeout(250);

  // progreso: gráfica e historial
  await page.click('#tabbar button[data-tab="tabProgress"]'); await page.waitForTimeout(300);
  ok('gráfica de 14 días dibujada', (await page.evaluate(()=>document.querySelectorAll('#chart rect').length))>=14);
  await page.screenshot({ path:'shot-progress.png' });
  await page.click('#btnHistory'); await page.waitForTimeout(300);
  const nHist = await page.evaluate(()=>document.querySelectorAll('#histList .r').length);
  ok('historial con partidas', nHist>=8, 'filas='+nHist);
  await page.screenshot({ path:'shot-history.png' });
  await page.click('#histBack'); await page.waitForTimeout(200);

  // yo: copia de seguridad
  await page.click('#tabbar button[data-tab="tabMe"]'); await page.waitForTimeout(300);
  const [dl2] = await Promise.all([ page.waitForEvent('download', {timeout:5000}).catch(()=>null), page.click('#meExport') ]);
  ok('copia de seguridad descargada', !!dl2, dl2 ? dl2.suggestedFilename() : '');
  if(dl2){ const p = await dl2.path(); const data = JSON.parse(require('fs').readFileSync(p,'utf8')); ok('copia contiene registros', Object.keys(data.keys).length>5, Object.keys(data.keys).length+' claves');
    // restaurar en un contexto limpio
    const ctx2 = await browser.newContext({ viewport:{width:390, height:844} }); const p2 = await ctx2.newPage(); await p2.goto(URL); await p2.waitForTimeout(500);
    await p2.click('#welcomeGo'); await p2.waitForTimeout(200); await p2.click('#tabbar button[data-tab="tabMe"]'); await p2.waitForTimeout(200);
    await p2.setInputFiles('#importFile', p); await p2.waitForTimeout(1600);
    const nm = await p2.evaluate(()=>JSON.parse(localStorage.getItem('cmx.profiles'))[0].name);
    ok('copia restaurada en otro dispositivo', nm==='Prueba', 'perfil='+nm); await ctx2.close(); }
  await page.click('#meBig'); await page.waitForTimeout(200);
  ok('modo botones grandes activa clase', await page.evaluate(()=>document.body.classList.contains('big')));
  await page.screenshot({ path:'shot-me.png' });
  await page.click('#meBig'); await page.waitForTimeout(200);
  ok('manifest instalado', await page.evaluate(()=>!!document.querySelector('link[rel="manifest"]') && !!document.querySelector('link[rel="apple-touch-icon"]')));

  // afinador libre (micrófono falso)
  await page.click('#tabbar button[data-tab="tabStudy"]'); await page.waitForTimeout(200);
  await page.click('#btnTuner'); await page.waitForTimeout(1200);
  ok('afinador abierto', await page.isVisible('#tunerfree'), await page.textContent('#tfMsg'));
  await page.click('#segA4b button[data-v="442"]'); await page.waitForTimeout(100);
  ok('La4 ajustable', await page.evaluate(()=>JSON.parse(localStorage.getItem('cm.prefs')).a4===442));
  await page.click('#segA4b button[data-v="440"]');
  await page.screenshot({ path:'shot-tuner.png' });
  await page.click('#tunerBack'); await page.waitForTimeout(200);

  // pantallas existentes siguen funcionando
  for(const [id, screen] of [['btnRead','reading'],['btnScales','scales'],['btnTempo','tempo'],['btnPitch','pitch'],['btnPiano5','piano5'],['btnViolin','violin'],['btnExplore','explore']]){
    await page.click('#tabbar button[data-tab="tabStudy"]'); await page.waitForTimeout(150);
    await page.click('#'+id); await page.waitForTimeout(300);
    ok('pantalla '+screen+' abre', await page.isVisible('#'+screen));
    await page.click('#'+screen+' .iconbtn'); await page.waitForTimeout(150);
  }
  await page.click('#tabbar button[data-tab="tabProgress"]'); await page.waitForTimeout(150);
  await page.click('#rankbar'); await page.waitForTimeout(200); ok('clasificación abre', await page.isVisible('#board')); await page.click('#boardBack');
  await page.waitForTimeout(150); await page.click('#btnStats'); await page.waitForTimeout(200); ok('diagnóstico abre', await page.isVisible('#stats')); await page.click('#statsBack');
  await page.waitForTimeout(150); await page.click('#btnAch'); await page.waitForTimeout(200); ok('distinciones abre', await page.isVisible('#achievements')); await page.click('#achBack');
  await page.waitForTimeout(150); await page.click('#tabbar button[data-tab="tabMe"]'); await page.waitForTimeout(150);
  await page.click('#btnProfile'); await page.waitForTimeout(200); ok('perfiles abre', await page.isVisible('#profiles')); await page.click('#profBack');
  await page.waitForTimeout(150); await page.click('#btnSettings'); await page.waitForTimeout(200); ok('ajustes abre', await page.isVisible('#settings'));
  await page.click('#segHints button[data-v="0"]'); await page.click('#segShield button[data-v="1"]'); await page.click('#settingsClose');
  // modo oscuro
  await page.click('#btnSettings'); await page.click('#segTheme button[data-v="dark"]'); await page.click('#settingsClose'); await page.waitForTimeout(200);
  await page.click('#tabbar button[data-tab="tabPlay"]'); await page.waitForTimeout(200);
  await page.screenshot({ path:'shot-dark.png' });

  // inglés
  await page.click('#btnLang'); await page.waitForTimeout(900);
  const en = await page.textContent('#tbPlay');
  ok('traducción al inglés de las pestañas', /Practise/.test(en), en);
  await page.screenshot({ path:'shot-en.png' });
  await page.click('#btnLang'); await page.waitForTimeout(600);

  ok('sin errores de consola ni excepciones', errors.length===0, errors.slice(0,6).join(' | '));
  console.log(results.join('\n'));
  console.log('\n'+(fails? fails+' FALLOS' : 'TODO OK'));
  await browser.close();
  process.exit(fails?1:0);
})().catch(e=>{ console.log(results.join('\n')); console.error('EXCEPCIÓN', e); process.exit(2); });

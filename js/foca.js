/* ══════════════════════════════════════════════════════════════════════════════
   FOCA NEWS — palco 3D da foca + "cochichos"
   A foca fofoca (mas só com fonte): na capa, ela "ouve" as manchetes do giro
   rápido e cochicha uma por vez. O emblema é empilhado em camadas de papel com
   profundidade real e inclina conforme o ponteiro. Camada de aprimoramento:
   não altera dados nem rotas; se algo faltar, a capa funciona igual.
   ══════════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const REDUZIDO = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const CAMADAS = 7;
  const INTERVALO = 7000;
  let relogio = 0;
  let indice = 0;

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* as manchetes que a foca "ouviu" saem do que a capa já desenhou */
  function coletarCochichos(raiz) {
    const lista = [];
    const hero = raiz.querySelector('.manchete-principal h1 a');
    if (hero) {
      const cab = raiz.querySelector('.manchete-principal .recorte-veiculo b');
      const tempo = raiz.querySelector('.manchete-principal .recorte-tempo');
      lista.push({ href: hero.getAttribute('href'), titulo: hero.textContent.trim(), fonte: cab ? cab.textContent.trim() : '', tempo: tempo ? tempo.textContent.split('·')[0].trim() : '' });
    }
    raiz.querySelectorAll('.urgente-lista li').forEach((li) => {
      const a = li.querySelector('a[href^="#/noticia/"]');
      if (!a) return;
      const veic = li.querySelector('.veic');
      const partes = veic ? veic.textContent.split('·').map((x) => x.trim()) : [];
      lista.push({ href: a.getAttribute('href'), titulo: a.textContent.trim(), fonte: (partes[0] || '').replace(/^\S+\s/, '') || partes[0] || '', tempo: partes[1] || '' });
    });
    return lista.filter((c) => c.titulo);
  }

  function montarPalco(pagina) {
    const cochichos = coletarCochichos(pagina);
    /* corpo em camadas de papel (extrusão) + frente nítida + jornal solto à frente */
    const camadas = Array.from({ length: CAMADAS }, (_, k) => CAMADAS - k).map((i) =>
      `<img class="fl ext" style="--i:${i}" src="/img/foca-extrusao.png" alt="" draggable="false">`).join('') +
      `<img class="fl frente" style="--i:0" src="/img/foca-frente.png" alt="" draggable="false">`;

    const palco = document.createElement('section');
    palco.className = 'foca-palco';
    palco.setAttribute('aria-label', 'Foca News — foca no que tá rolando');
    palco.innerHTML = `
      <div class="foca-cena" role="img" aria-label="A foca do Foca News com um jornal na boca">
        <div class="foca-flutua">
          <div class="foca-3d">
            <span class="foca-sombra"></span>
            ${camadas}
            <span class="onda o1"></span><span class="onda o2"></span><span class="onda o3"></span>
            <div class="jornal-camada"><img src="/img/foca-jornal.png" alt="" draggable="false"></div>
            <span class="psiu">psiu!</span>
          </div>
        </div>
      </div>
      <div class="foca-texto">
        <span class="foca-etiqueta">fofoca, mas com fonte</span>
        <h2>Foca no que <em>tá rolando.</em></h2>
        <p class="foca-sub">Se virou assunto, a Foca tá de olho.</p>
        ${cochichos.length ? `
        <div class="cochicho" aria-live="polite">
          <span class="cochicho-rotulo"><i></i>a foca ouviu…</span>
          <a class="cochicho-texto" href="#/"></a>
          <div class="cochicho-pe"><span class="cochicho-fonte"></span><button type="button" class="cochicho-outro">outro cochicho ↻</button></div>
        </div>` : ''}
      </div>`;
    pagina.insertBefore(palco, pagina.firstChild);

    ligarInclinacao(palco.querySelector('.foca-cena'), palco);
    if (cochichos.length) ligarCochichos(palco, cochichos);
  }

  /* inclinação 3D que acompanha o ponteiro (só ponteiro fino e sem redução de movimento) */
  function ligarInclinacao(cena, palco) {
    const alvo = cena.querySelector('.foca-3d');
    const modoLeve = () => (window.XP && window.XP.estado && window.XP.estado.leve) || REDUZIDO;
    let quadro = 0;
    palco.addEventListener('pointermove', (ev) => {
      if (modoLeve() || ev.pointerType === 'touch') return;
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const r = cena.getBoundingClientRect();
        const nx = Math.max(-1, Math.min(1, (ev.clientX - (r.left + r.width / 2)) / (r.width * 1.1)));
        const ny = Math.max(-1, Math.min(1, (ev.clientY - (r.top + r.height / 2)) / (r.height * 1.1)));
        alvo.style.setProperty('--ry', (nx * 24).toFixed(1) + 'deg');
        alvo.style.setProperty('--rx', (-ny * 16).toFixed(1) + 'deg');
      });
    }, { passive: true });
    palco.addEventListener('pointerleave', () => {
      alvo.style.removeProperty('--ry');
      alvo.style.removeProperty('--rx');
    }, { passive: true });
  }

  function ligarCochichos(palco, lista) {
    const caixa = palco.querySelector('.cochicho');
    const texto = caixa.querySelector('.cochicho-texto');
    const fonte = caixa.querySelector('.cochicho-fonte');
    const cena = palco.querySelector('.foca-cena');
    indice = Math.floor(Math.random() * lista.length);

    const mostrar = () => {
      const c = lista[indice % lista.length];
      texto.textContent = c.titulo;
      texto.setAttribute('href', c.href || '#/');
      fonte.textContent = [c.fonte, c.tempo].filter(Boolean).join(' · ');
    };
    const trocar = () => {
      indice = (indice + 1) % lista.length;
      if (REDUZIDO) return mostrar();
      caixa.classList.add('troca');
      setTimeout(() => { mostrar(); caixa.classList.remove('troca'); }, 320);
    };
    const reiniciarRelogio = () => {
      clearInterval(relogio);
      if (lista.length > 1 && !REDUZIDO) {
        relogio = setInterval(() => {
          if (document.hidden || !document.body.contains(palco)) { if (!document.body.contains(palco)) clearInterval(relogio); return; }
          if (caixa.matches(':hover') || caixa.contains(document.activeElement)) return;
          trocar();
        }, INTERVALO);
      }
    };

    mostrar();
    reiniciarRelogio();
    caixa.querySelector('.cochicho-outro').addEventListener('click', () => { trocar(); reiniciarRelogio(); });
    /* um toque na foca: ela dá um pulinho e cochicha outra manchete */
    cena.addEventListener('click', () => {
      cena.classList.remove('deu-psiu'); void cena.offsetWidth; cena.classList.add('deu-psiu');
      trocar(); reiniciarRelogio();
    });
    cena.addEventListener('animationend', (e) => { if (e.animationName === 'foca-pulo') cena.classList.remove('deu-psiu'); });
  }

  function verificar() {
    const app = document.getElementById('app');
    if (!app) return;
    const pagina = app.querySelector('.pagina');
    const ehCapa = pagina && pagina.querySelector('.capa');
    if (ehCapa && !pagina.querySelector('.foca-palco')) montarPalco(pagina);
    if (!ehCapa) clearInterval(relogio);
  }

  function iniciar() {
    const app = document.getElementById('app');
    if (!app || typeof MutationObserver !== 'function') return;
    let espera = 0;
    new MutationObserver(() => { clearTimeout(espera); espera = setTimeout(verificar, 30); })
      .observe(app, { childList: true, subtree: true });
    verificar();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();

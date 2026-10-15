/* ══════════════════════════════════════════════════════════════════════════════
   GRID NOTÍCIAS — MOTOR DA EXPERIÊNCIA 3D
   Camada de aprimoramento: não muda nenhum dado nem rota. Ela observa o DOM
   que o app.js desenha e acrescenta profundidade, paralaxe, revelações,
   transições e micro-interações — sempre com válvula de escape de desempenho.

   Orçamento de performance:
   • um único listener de ponteiro, um de rolagem, um de clique (todos delegados);
   • leituras de layout em lote e escritas em rAF (sem layout thrashing);
   • patrulha de FPS: se o quadro cair, liga o "modo leve" automaticamente;
   • em toque, aparelho fraco ou prefers-reduced-motion, nada de efeitos caros.
   ══════════════════════════════════════════════════════════════════════════════ */
const XP = (() => {
  const consultar = (q) => {
    try { return window.matchMedia ? window.matchMedia(q).matches : false; } catch (e) { return false; }
  };
  const REDUZIDO = consultar('(prefers-reduced-motion: reduce)');
  const TOQUE = consultar('(pointer: coarse)');
  const PONTEIRO_FINO = consultar('(hover: hover) and (pointer: fine)') || !window.matchMedia;
  const TEMAS = REDUZIDO || TOQUE || !PONTEIRO_FINO;
  const memoria = navigator.deviceMemory || 4;
  const nucleos = navigator.hardwareConcurrency || 4;

  /* ?efeitos=completo | leve  (ou #/rota?efeitos=leve) força o modo — útil para
     testar em aparelhos emprestados e para quem quiser economizar bateria */
  const forcado = (() => {
    const m = /[?&]efeitos=(completo|leve)/.exec(location.search + location.hash);
    return m ? m[1] : '';
  })();

  const estado = {
    leve: forcado ? forcado === 'leve' : (TEMAS || memoria <= 2 || nucleos <= 2),
    cartoes: new Set(),
    paralaxe: new Set(),
    observador: null,
    cenaMontada: false,
    ultimoFps: 60,
  };

  /* elementos que ganham inclinação 3D e luz de cursor */
  const SEL_CARTAO = [
    '.recorte', '.manchete-principal', '.coluna-urgente', '.placa-veiculo',
    '.caixa', '.cartao-categoria', '.cartao-tema', '.cartao-exibicao', '.cartao-origem',
    '.cartao-veiculo', '.cartao-plano', '.opcao-fonte', '.bloco-pref', '.resumo-leitor .item',
  ].join(',');
  const SEL_REVELA = [
    '.recorte', '.titulo-secao', '.manchete-principal', '.coluna-urgente', '.bloco-pref',
    '.cartao-categoria', '.cartao-tema', '.cartao-exibicao', '.cartao-origem', '.caixa',
    '.grade-origens', '.resumo-leitor', '.pergunta-bloco', '.faixa-veiculos', '.pagina-jornal',
    '.cartao-veiculo', '.cartao-plano', '.opcao-fonte', '.cola-rodape', '.caixa-obrigado',
  ].join(',');

  /* ───────── 1 · CENA DE FUNDO ───────── */
  function montarCena() {
    if (estado.cenaMontada) return;
    if (document.body.classList.contains('acabamento-papel')) return;
    const cena = document.createElement('div');
    cena.className = 'cena';
    cena.setAttribute('aria-hidden', 'true');
    cena.innerHTML = `
      <div class="cena-aurora a1"></div>
      <div class="cena-aurora a2"></div>
      <div class="cena-aurora a3"></div>
      <div class="cena-grade"></div>
      <div class="cena-veu"></div>`;
    document.body.prepend(cena);

    const brilho = document.createElement('div');
    brilho.className = 'cena-brilho';
    brilho.setAttribute('aria-hidden', 'true');
    document.body.appendChild(brilho);

    const progresso = document.createElement('div');
    progresso.className = 'progresso-leitura';
    progresso.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progresso);

    if (PONTEIRO_FINO && !REDUZIDO) document.body.classList.add('tem-ponteiro');
    estado.cenaMontada = true;
  }

  function esquecerCartoes() {
    estado.cartoes.forEach(el => el.classList.remove('cartao-3d', 'em-3d'));
    estado.cartoes.clear();
  }

  function desmontarCena() {
    document.querySelectorAll('.cena, .cena-brilho, .progresso-leitura').forEach(n => n.remove());
    document.body.classList.remove('tem-ponteiro');
    estado.cenaMontada = false;
  }

  /* ───────── 2 · CARTÕES 3D (inclinação + luz) ───────── */
  function registrarCartoes(raiz = document) {
    if (estado.leve) return;
    raiz.querySelectorAll(SEL_CARTAO).forEach(el => {
      if (estado.cartoes.has(el)) return;
      estado.cartoes.add(el);
      el.classList.add('cartao-3d');
    });
  }

  let quadroPonteiro = 0;
  let alvoAtual = null;
  let areaAlvo = null;

  function aoMoverPonteiro(ev) {
    if (estado.leve) return;
    const alvo = ev.target.closest(SEL_CARTAO);
    const brilho = document.querySelector('.cena-brilho');
    const x = ev.clientX, y = ev.clientY;

    if (alvo !== alvoAtual) {
      if (alvoAtual) {
        alvoAtual.classList.remove('em-3d');
        alvoAtual.style.removeProperty('--rx'); alvoAtual.style.removeProperty('--ry');
        alvoAtual.style.removeProperty('--mx'); alvoAtual.style.removeProperty('--my');
      }
      alvoAtual = alvo;
      areaAlvo = alvo ? alvo.getBoundingClientRect() : null;
      if (alvo) alvo.classList.add('em-3d');
    }
    // botões magnéticos
    const btn = ev.target.closest('.btn');
    if (btn && btn !== alvoBotao) {
      if (alvoBotao) { alvoBotao.style.removeProperty('--bx'); alvoBotao.style.removeProperty('--by'); }
      alvoBotao = btn;
    }

    if (quadroPonteiro) return;
    quadroPonteiro = requestAnimationFrame(() => {
      quadroPonteiro = 0;
      if (brilho) brilho.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (alvo && areaAlvo && areaAlvo.width > 0 && areaAlvo.height > 0) {
        const px = (x - areaAlvo.left) / areaAlvo.width;
        const py = (y - areaAlvo.top) / areaAlvo.height;
        if (areaAlvo.width <= 0) areaAlvo = alvo.getBoundingClientRect();
        alvo.style.setProperty('--ry', ((px - .5) * 9).toFixed(2) + 'deg');
        alvo.style.setProperty('--rx', ((.5 - py) * 7).toFixed(2) + 'deg');
        alvo.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        alvo.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      }
      if (alvoBotao) {
        const r = alvoBotao.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          alvoBotao.style.setProperty('--bx', (((x - r.left) / r.width - .5) * 5).toFixed(2) + 'px');
          alvoBotao.style.setProperty('--by', (((y - r.top) / r.height - .5) * 4).toFixed(2) + 'px');
        }
      }
    });
  }
  let alvoBotao = null;

  function aoSairPonteiro() {
    if (alvoAtual) {
      alvoAtual.classList.remove('em-3d');
      alvoAtual.style.removeProperty('--rx'); alvoAtual.style.removeProperty('--ry');
      alvoAtual.style.removeProperty('--mx'); alvoAtual.style.removeProperty('--my');
      alvoAtual = null;
    }
    if (alvoBotao) {
      alvoBotao.style.removeProperty('--bx'); alvoBotao.style.removeProperty('--by');
      alvoBotao = null;
    }
  }

  /* ───────── 3 · PARALAXE NA ROLAGEM ───────── */
  function marcarParalaxe(raiz = document) {
    const mapa = [
      ['.manchete-principal .chapa', .18],
      ['.faixa-veiculos', .05],
      ['.barra-edicao', .04],
      ['.pagina-jornal', .04],
      ['.bloco-comentarios', .03],
      ['.cena-aurora.a1', -.10],
      ['.cena-aurora.a2', -.06],
      ['.cena-grade', .08],
    ];
    for (const [sel, velocidade] of mapa) {
      raiz.querySelectorAll(sel).forEach(el => {
        if (el.dataset.paralaxe) return;
        el.dataset.paralaxe = String(velocidade);
        estado.paralaxe.add(el);
      });
    }
  }

  let quadroRolagem = 0;
  function aoRolar() {
    if (quadroRolagem) return;
    quadroRolagem = requestAnimationFrame(() => {
      quadroRolagem = 0;
      const y = window.scrollY || 0;
      const vh = window.innerHeight;
      const altura = document.documentElement.scrollHeight - vh;
      document.body.classList.toggle('rolou', y > 24);

      const barra = document.querySelector('.progresso-leitura');
      if (barra) barra.style.transform = `scaleX(${altura > 0 ? Math.min(1, y / altura).toFixed(4) : 0})`;

      if (estado.leve) return;
      // lê tudo primeiro, escreve depois (sem layout thrashing)
      const medidas = [];
      for (const el of estado.paralaxe) {
        if (!el.isConnected) { estado.paralaxe.delete(el); continue; }
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        medidas.push([el, Number(el.dataset.paralaxe) || 0, r.top + r.height / 2 - vh / 2]);
      }
      for (const [el, vel, centro] of medidas) {
        /* limita o arrasto dos elementos de conteúdo: com o palco da foca no topo, a capa
           começa mais abaixo e a paralaxe sem teto jogaria a foto por cima da barra anterior */
        const teto = el.classList.contains('cena-aurora') || el.classList.contains('cena-grade') ? Infinity : 32;
        const deslocamento = Math.max(-teto, Math.min(teto, -centro * vel));
        el.style.setProperty('--ty', deslocamento.toFixed(1) + 'px');
        if (Math.abs(deslocamento) > 0.6) el.classList.add('paralaxe-ativa');
        else el.classList.remove('paralaxe-ativa');
      }
    });
  }

  /* ───────── 4 · REVELAÇÃO ESCALONADA ───────── */
  function ligarRevelacao(raiz = document) {
    // navegadores sem IntersectionObserver: revela tudo de uma vez
    if (typeof IntersectionObserver !== 'function') {
      raiz.querySelectorAll(SEL_REVELA).forEach(el => { el.dataset.revelado = '1'; el.classList.add('entrou'); });
      return;
    }
    if (!estado.observador) {
      estado.observador = new IntersectionObserver((entradas) => {
        for (const en of entradas) {
          if (!en.isIntersecting) continue;
          en.target.classList.remove('vai-entrar');
          en.target.classList.add('entrou');
          estado.observador.unobserve(en.target);
        }
      }, { threshold: .06, rootMargin: '0px 0px -6% 0px' });
    }
    raiz.querySelectorAll(SEL_REVELA).forEach(el => {
      if (el.dataset.revelado || el.closest('.painel-modal')) return;
      el.dataset.revelado = '1';
      if (REDUZIDO || estado.leve) return;
      const irmaos = el.parentElement ? [...el.parentElement.children] : [el];
      const i = Math.min(8, Math.max(0, irmaos.indexOf(el) % 6));
      el.style.setProperty('--i', String(i));
      el.classList.add('vai-entrar');
      estado.observador.observe(el);
    });
  }

  /* ───────── 5 · NÚMEROS QUE CONTAM ───────── */
  function animarNumeros(raiz = document) {
    if (REDUZIDO || estado.leve) return;
    raiz.querySelectorAll('.estatisticas b, .cc-total, .contagem b, .resumo-leitor .item b, .kpi b, .cartao-kpi b')
      .forEach(el => {
        const texto = el.textContent.trim();
        const valor = Number(texto.replace(/[^\d]/g, ''));
        if (!valor || valor < 10 || valor > 20000 || el.dataset.contado) return;
        el.dataset.contado = '1';
        const inicio = performance.now();
        const passo = (agora) => {
          const p = Math.min(1, (agora - inicio) / 700);
          const suave = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(valor * suave).toLocaleString('pt-BR');
          if (p < 1) requestAnimationFrame(passo); else el.textContent = texto;
        };
        el.textContent = '0';
        requestAnimationFrame(passo);
      });
  }

  /* ───────── 6 · TRANSIÇÕES DE ROTA ─────────
     Três caminhos, do mais rico ao mais seguro:
     1. View Transitions nativas (Chrome/Edge) — só em navegação, nunca na 1ª pintura;
     2. animação CSS de entrada/saída (qualquer navegador);
     3. renderização direta, se algo acima falhar.
     A página nunca fica em branco: há um vigia que renderiza se a API não responder. */
  function rotaSaindo() {
    const app = document.getElementById('app');
    if (app && !REDUZIDO) app.classList.add('troca-saindo');
  }

  const vtHabilitado = (() => {
    const m = /[?&]vt=(0|1)/.exec(location.search + location.hash);
    return m ? m[1] === '1' : true;
  })();

  async function caminhoSimples(conteudo) {
    rotaSaindo();
    try { return await conteudo(); } finally { rotaEntrou(); }
  }

  async function rotear(conteudo) {
    const podeVT = typeof document.startViewTransition === 'function'
      && vtHabilitado && !REDUZIDO && !estado.leve && estado.jaRenderizou;

    if (!podeVT) {
      try { return await caminhoSimples(conteudo); }
      catch (e) { estado.jaRenderizou = true; throw e; }
    }

    let iniciou = false, terminou = false;
    // vigia: se o navegador não chamar o callback (aba em segundo plano, API
    // indisponível, transição engasgada), renderiza direto e segue a vida
    const guardiao = setTimeout(async () => {
      if (iniciou) return;
      try { await conteudo(); } catch (e) { /* a rota já trata */ } finally { terminou = true; rotaEntrou(); }
    }, 700);

    try {
      const t = document.startViewTransition(async () => {
        iniciou = true;
        clearTimeout(guardiao);
        try { await conteudo(); } finally { terminou = true; }
      });
      if (t.finished && t.finished.catch) t.finished.catch(() => {});
      if (t.updateCallbackDone && t.updateCallbackDone.catch) await t.updateCallbackDone.catch(() => {});
    } catch (e) {
      clearTimeout(guardiao);
      if (!terminou) { try { await conteudo(); } finally { terminou = true; } }
    } finally {
      clearTimeout(guardiao);
      const app = document.getElementById('app');
      if (app) app.classList.remove('troca-saindo');
      organizar();
    }
  }

  function rotaEntrou() {
    estado.jaRenderizou = true;
    const app = document.getElementById('app');
    if (!app) return;
    app.classList.remove('troca-saindo');
    if (!REDUZIDO) {
      app.classList.remove('troca-entrando');
      void app.offsetWidth;              // reinicia a animação
      app.classList.add('troca-entrando');
      // a classe sai quando a animação termina: se ficasse, o fill-mode seguraria
      // a opacidade e a próxima transição de saída não apareceria
      const limpar = () => app.classList.remove('troca-entrando');
      app.addEventListener('animationend', limpar, { once: true });
      setTimeout(limpar, 800);
    }
    organizar();
  }

  /* ───────── 7 · MICRO-INTERAÇÃO: ONDA NO CLIQUE ───────── */
  function aoClicar(ev) {
    if (REDUZIDO || estado.leve) return;
    // só em botões de verdade: links navegam e a página seria trocada antes da onda
    const btn = ev.target.closest('button.btn, button.chip, .abas button, .controle-exibicao button, .abas-admin button');
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const onda = document.createElement('span');
    onda.className = 'onda';
    onda.style.left = (ev.clientX - r.left) + 'px';
    onda.style.top = (ev.clientY - r.top) + 'px';
    btn.appendChild(onda);
    setTimeout(() => onda.remove(), 560);
  }

  /* ───────── 8 · PATRULHA DE DESEMPENHO ───────── */
  function patrulhar() {
    if (estado.leve || typeof requestAnimationFrame !== 'function') return;
    let quadros = 0, inicio = performance.now(), amostras = 0;
    const tique = () => {
      quadros++;
      const agora = performance.now();
      if (agora - inicio >= 1000) {
        const fps = (quadros * 1000) / (agora - inicio);
        estado.ultimoFps = Math.round(fps);
        amostras++;
        // queda clara de quadro em duas amostras seguidas? alivia a cena
        if (fps < 38 && amostras >= 2) {
          ligarModoLeve('fps');
          return;
        }
        quadros = 0; inicio = agora;
      }
      requestAnimationFrame(tique);
    };
    requestAnimationFrame(tique);
  }

  function ligarModoLeve(motivo) {
    if (estado.leve) return;
    estado.leve = true;
    document.body.classList.add('efeitos-leves');
    document.body.dataset.motivoLeve = motivo || '';
    aoSairPonteiro();
    document.querySelectorAll('.vai-entrar').forEach(el => el.classList.add('entrou'));
  }

  function desligarModoLeve() {
    estado.leve = false;
    document.body.classList.remove('efeitos-leves');
    organizar();
  }

  /* ───────── 9 · ORQUESTRAÇÃO ───────── */
  function organizar(raiz = document) {
    registrarCartoes(raiz);
    marcarParalaxe(raiz);
    ligarRevelacao(raiz);
    animarNumeros(raiz);
    aoRolar();
  }

  function acompanharApp() {
    const app = document.getElementById('app');
    if (!app) return;
    if (typeof MutationObserver !== 'function') return;
    let espera = 0;
    new MutationObserver(() => {
      clearTimeout(espera);
      espera = setTimeout(() => organizar(app), 50);
    }).observe(app, { childList: true, subtree: true });
  }

  /* quando o acabamento muda (aba Modo de exibição), a cena entra ou sai */
  function observarAcabamento() {
    if (typeof MutationObserver !== 'function') return;
    const olho = new MutationObserver(() => {
      const imersivo = document.body.classList.contains('acabamento-imersivo');
      if (imersivo && !estado.cenaMontada) montarCena();
      if (!imersivo && estado.cenaMontada) desmontarCena();
      organizar();
    });
    olho.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function iniciar() {
    if (estado.leve) document.body.classList.add('efeitos-leves');
    if (forcado) document.body.dataset.efeitosForcados = forcado;
    montarCena();
    organizar();
    acompanharApp();
    observarAcabamento();
    patrulhar();

    if (!estado.leve) {
      window.addEventListener('pointermove', aoMoverPonteiro, { passive: true });
      window.addEventListener('pointerleave', aoSairPonteiro, { passive: true });
      window.addEventListener('scroll', () => { aoSairPonteiro(); aoRolar(); }, { passive: true });
      document.addEventListener('click', aoClicar, { passive: true });
    } else {
      window.addEventListener('scroll', aoRolar, { passive: true });
    }
    window.addEventListener('resize', () => { aoRolar(); areaAlvo = null; }, { passive: true });
    // imagens que chegam depois mudam alturas: remede a paralaxe
    window.addEventListener('load', () => organizar(), { once: true });
  }

  return {
    iniciar, organizar, rotaSaindo, rotaEntrar: rotaEntrou, rotear,
    montarCena, desmontarCena, ligarModoLeve, desligarModoLeve, esquecerCartoes,
    estado, SEL_CARTAO,
  };
})();

window.XP = XP;

/* sobe o motor quando o app já desenhou a primeira página */
/* eslint-disable no-undef */
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => XP.iniciar(), { once: true });
} else {
  XP.iniciar();
}

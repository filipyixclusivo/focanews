/* ══════════════════════════════════════════════════════════════
   Foca News — aplicação do leitor
   Rotas: #/ · #/categorias · #/categoria/:id · #/minhas-fontes
          #/preferencias · #/secao/:id · #/fonte/:id · #/noticia/:id
          #/busca/:termo · #/veiculos · #/perfil · #/planos · #/admin
   ══════════════════════════════════════════════════════════════ */
const App = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = () => $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // artes de editoria: nenhuma matéria fica sem imagem, mesmo sem foto no feed
  const ARTES = ['mundo','brasil','politica','economia','tecnologia','games','esportes','esports','clima','asia',
    'cinema','musica','cultura','ciencia','espaco','saude','educacao','meioambiente','automoveis','gastronomia','viagens','moda','curio'];
  const ARTE_RESERVA = { cultura: 'cinema', espaco: 'ciencia', automoveis: 'tecnologia', curio: 'mundo' };
  const arteDe = (secao) => `/img/arte-${ARTES.includes(secao) ? secao : (ARTE_RESERVA[secao] || 'mundo')}.jpg`;
  const E = API.estado;

  /* Acessadores guardados: mesmo que uma resposta venha incompleta, nenhuma
     leitura de estado entrega `undefined` para um .find/.map/.filter. */
  const secoes = () => G.lista(E.secoes);
  const fontes = () => G.lista(E.fontes);
  const temasLista = () => G.lista(E.temas);
  const cfg = () => G.obj(E.config);
  const acharSecao = (id) => secoes().find(s => s.id === id) || null;
  const acharFonte = (id) => fontes().find(f => f.id === id) || null;
  let cache = { secao: null, fonte: null, pagina: 1, ordem: null };
  let categoriasCache = null;

  /* ───────── avisos ───────── */
  function avisar(titulo, texto, tipo = 'ok') {
    const caixa = $('#avisos');
    const n = document.createElement('div');
    n.className = 'toast ' + (tipo === 'erro' ? 'erro' : '');
    n.innerHTML = `<b>${esc(titulo)}</b>${esc(texto || '')}`;
    caixa.appendChild(n);
    setTimeout(() => { n.style.opacity = '0'; n.style.transition = '.3s'; setTimeout(() => n.remove(), 320); }, 4200);
  }

  const origemNome = (id) => {
    const o = (Prefs.ORIGENS || []).find(x => x.id === id);
    return o ? o.nome : 'ainda não respondi';
  };
  const nomeSecao = (id) => (acharSecao(id) || { nome: id }).nome;
  const iconeSecao = (id) => (acharSecao(id) || { icone: '📰' }).icone;
  const nomeTema = (id) => (temasLista().find(t => t.id === id) || { nome: id, icone: '•' });

  /* ───────── veículos: identidade e situação editorial ───────── */
  const PARADAS_SIGLA = new Set(['o', 'a', 'os', 'as', 'de', 'do', 'da', 'the', 'el', 'la', 'le', 'il', 'der', 'di']);
  const siglaFonte = (f) => {
    const palavras = String((f && f.nome) || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
    const uteis = palavras.filter(p => !PARADAS_SIGLA.has(p.toLowerCase()));
    return (uteis.length > 1 ? uteis.slice(0, 2).map(p => p[0]).join('') : (uteis[0] || '?').slice(0, 2)).toUpperCase();
  };
  const fonteNoAcervo = (f) => G.num(f && f.total) > 0;
  const statusFonte = (f) => fonteNoAcervo(f)
    ? { classe: 'no-acervo', rotulo: 'No acervo' }
    : { classe: 'em-integracao', rotulo: 'Em integração' };
  const dominioFonte = (f) => {
    try { return f && f.site ? new URL(f.site).hostname.replace(/^www\./, '') : 'site em validação'; }
    catch (e) { return 'site em validação'; }
  };

  /* ───────── planos e Área VIP ───────── */
  const PLANOS_FOCA = [
    { id: 'plus', nome: 'Foca News Plus', selo: 'Entrada', nivel: 1, mensal: 9.9, anual: 99, itens: ['Resumos diários das notícias importantes', 'Boletim exclusivo por e-mail ou WhatsApp, com seu consentimento', 'Leitura sem anúncios no conteúdo próprio do Foca News'] },
    { id: 'vip', nome: 'Foca News VIP', selo: 'Recomendado', nivel: 2, mensal: 19.9, anual: 199, itens: ['Tudo do Plus', 'Reportagens especiais e análises aprofundadas', 'Acesso à Área VIP do site', 'Enquetes, perguntas para a redação e conteúdos antecipados'] },
    { id: 'premium', nome: 'Foca News Premium', selo: 'Apoiador', nivel: 3, mensal: 39.9, anual: 399, itens: ['Tudo do VIP', 'Relatórios temáticos e especiais mensais', 'Encontros on-line com a equipe, quando disponíveis', 'Selo de apoiador e voto nas pautas futuras'] },
  ];
  const precoBR = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const assinaturaAtiva = () => (E.usuario && E.usuario.assinatura && E.usuario.assinatura.status === 'ativa') ? E.usuario.assinatura : null;
  const nivelAssinante = () => { const a = assinaturaAtiva(); return a ? Number(a.nivel || PLANOS_FOCA.find(p => p.id === a.plano)?.nivel || 1) : 0; };
  let cicloPlanos = 'mensal';

  /* ═════════ CHROME ═════════ */
  function montarChrome() {
    $('#dataHoje').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    $('#anoAtual').textContent = new Date().getFullYear();
    $('#fontesAtivas').textContent = fontes().length;
    const paisesEl = $('#paisesMonitorados');
    if (paisesEl) paisesEl.textContent = new Set(fontes().map(f => f.pais).filter(Boolean)).size;

    const c = cfg();
    document.title = `${c.nomePortal} — ${c.slogan || 'as manchetes do mundo inteiro'}`;
    $('#rodapeTexto').textContent = c.descricao || '';
    $('#rodapeSecoes').innerHTML = secoes().map(s => `<li><a href="#/secao/${s.id}">${s.icone || ''} ${esc(s.nome)} <span class="mono">(${s.total})</span></a></li>`).join('');

    const rota = location.hash || '#/';
    const ativa = (alvo) => rota === alvo || (alvo !== '#/' && rota.startsWith(alvo));
    const principais = secoes().filter(s => s.nav !== false);
    $('#navSecoes .nav-rolagem').innerHTML = [
      `<a href="#/" class="${ativa('#/') && !rota.includes('/secao/') ? 'ativo' : ''}">Primeira página</a>`,
      `<a href="#/categorias" class="${ativa('#/categorias') || ativa('#/categoria/') ? 'ativo' : ''}">Categorias</a>`,
      `<a href="#/minhas-fontes" class="${ativa('#/minhas-fontes') ? 'ativo' : ''}">Minhas fontes${Prefs.estado.fontes.length ? ` <span class="mono" style="opacity:.75">${Prefs.estado.fontes.length}</span>` : ''}</a>`,
      `<a href="#/exibicao" class="${ativa('#/exibicao') ? 'ativo' : ''}">Modo de exibição</a>`,
      `<a href="#/preferencias" class="${ativa('#/preferencias') ? 'ativo' : ''}">Meu jeito de ler</a>`,
      `<a href="#/como-conheceu" class="${ativa('#/como-conheceu') ? 'ativo' : ''}">Como você chegou${Prefs.estado.origem ? ' ✓' : ''}</a>`,
      `<span class="nav-sep"></span>`,
      ...principais.map(s => `<a href="#/secao/${s.id}" class="${ativa('#/secao/' + s.id) ? 'ativo' : ''}">${s.icone || ''} ${esc(s.nome)}</a>`),
      `<a href="#/veiculos" class="${ativa('#/veiculos') ? 'ativo' : ''}">Veículos</a>`,
      `<a href="#/planos" class="${ativa('#/planos') ? 'ativo' : ''}">Planos</a>`,
      `<a href="#/vip" class="${ativa('#/vip') ? 'ativo' : ''}">Área VIP</a>`,
      `<a href="#/perfil" class="${ativa('#/perfil') ? 'ativo' : ''}">Perfil</a>`,
      E.usuario && E.usuario.papel === 'admin' ? `<a href="#/admin" class="${ativa('#/admin') ? 'ativo' : ''}" style="background:#1e1e1e;color:var(--amarelo)">Painel da redação</a>` : '',
    ].join('');

    montarTicker();
    montarUsuario();
  }

  function montarTicker() {
    const itens = (cfg().ticker && cfg().ticker.length) ? cfg().ticker : [];
    const trilho = itens.length
      ? [...itens, ...itens].map(t => `<span>${esc(t)}</span>`).join('')
      : '<span>Aguardando as primeiras manchetes…</span>';
    $('#tickerTrilho').innerHTML = trilho;
  }

  function montarUsuario() {
    const u = E.usuario;
    const topo = $('#usuarioTopo');
    const area = $('#areaUsuario');
    const regiao = Prefs.estado.cidade || Prefs.estado.uf
      ? `<span class="pilula-cep" title="Sua região (identificada pelo CEP)">📍 ${esc([Prefs.estado.cidade, Prefs.estado.uf].filter(Boolean).join('/'))}</span>`
      : '';
    const modoBtn = `<button class="btn btn-mini btn-fantasma" id="btnModo" title="Alternar entre site jornal e modo leitura">${Prefs.estado.modo === 'leitura' ? '📖 Leitura' : '📰 Jornal'}</button>`;
    const acabamentoBtn = `<button class="btn btn-mini btn-fantasma acabamento-btn" id="btnAcabamento" title="${Prefs.ehImersivo() ? 'Voltar ao jornal impresso clássico' : 'Ligar a experiência imersiva 3D'}">${Prefs.ehImersivo() ? '✨ 3D' : '🎞 Papel'}</button>`;
    const exibicaoBtn = `<span class="controle-exibicao" id="controleExibicao" title="Modo de exibição das notícias">
        ${['compacto', 'padrao', 'destaque'].map(k => `<button type="button" data-ex="${k}" class="${Prefs.estado.exibicao === k ? 'ativo' : ''}" title="${esc(Prefs.EXIBICOES[k].nome)} — ${esc(Prefs.EXIBICOES[k].resumo)}">${Prefs.EXIBICOES[k].nome[0]}</button>`).join('')}
        <button type="button" data-img="1" class="${Prefs.estado.imagens === false ? '' : 'ativo'}" title="${Prefs.estado.imagens === false ? 'Mostrar imagens nas notícias' : 'Esconder imagens nas notícias'}">🖼</button>
      </span>`;

    if (!u) {
      topo.innerHTML = (E.demo ? '<span style="color:#1668b8">modo demonstração</span>' : 'edição de ' + new Date().toLocaleDateString('pt-BR')) + regiao;
      /* Cadastro aberto é de leitor (sem limite). Administrador entra por "Entrar". */
      area.innerHTML = `${modoBtn}${acabamentoBtn}${exibicaoBtn}
        <button class="btn btn-vazio" data-abrir="modal-auth" data-perfil="leitor">Entrar</button>
        <button class="btn btn-amarelo" data-abrir="modal-auth" data-modo="registro">Criar conta</button>`;
    } else {
      const infoVagas = u.papel === 'admin' && E.vagas
        ? ` <span class="pilula-cep" title="Contas de administração do portal">${E.vagas.usadas}/${E.vagas.limite} administradores</span>` : '';
      topo.innerHTML = `Olá, <b>${esc(u.nome.split(' ')[0])}</b> <span class="pilula-perfil">${u.papel === 'admin' ? 'administrador' : 'leitor'}</span> ${regiao}${infoVagas}`;
      area.innerHTML = `${modoBtn}${acabamentoBtn}${exibicaoBtn}
        ${u.papel === 'admin' ? '<a class="btn btn-amarelo" href="#/admin">Painel da redação</a>' : ''}
        <a class="btn btn-vazio" href="#/perfil">Minha conta</a>
        <button class="btn btn-fantasma" id="btnSair">Sair</button>`;
      $('#btnSair').addEventListener('click', async () => {
        await API.sair();
        E.usuario = null;
        Prefs.carregar(null);
        avisar('Sessão encerrada', 'Você saiu da sua conta.');
        montarChrome(); rotear();
      });
    }
    $('#btnModo').addEventListener('click', async () => {
      await Prefs.definir({ modo: Prefs.estado.modo === 'leitura' ? 'jornal' : 'leitura' });
      montarChrome(); rotear();
    });
    $$('#controleExibicao [data-ex]').forEach(b => b.addEventListener('click', async () => {
      await Prefs.definir({ exibicao: b.dataset.ex }, { silencioso: true });
      avisar('Modo de exibição: ' + Prefs.EXIBICOES[b.dataset.ex].nome, Prefs.EXIBICOES[b.dataset.ex].resumo + '.');
      montarChrome(); rotear();
    }));
    $('#btnAcabamento').addEventListener('click', async () => {
      const virandoImersivo = !Prefs.ehImersivo();
      await Prefs.definir({ acabamento: virandoImersivo ? 'imersivo' : 'papel' }, { silencioso: true });
      if (window.XP) { virandoImersivo ? XP.montarCena() : XP.desmontarCena(); XP.organizar(); }
      avisar(virandoImersivo ? 'Experiência imersiva ligada' : 'Papel clássico',
        virandoImersivo ? 'Profundidade, paralaxe e cartões que reagem ao seu ponteiro.' : 'A primeira página chapada, como jornal impresso — mais leve.');
      montarChrome(); rotear();
    });
    $$('#controleExibicao [data-img]').forEach(b => b.addEventListener('click', async () => {
      await Prefs.definir({ imagens: Prefs.estado.imagens === false }, { silencioso: true });
      avisar(Prefs.estado.imagens === false ? 'Notícias sem imagens' : 'Imagens de volta', Prefs.estado.imagens === false ? 'Os recortes ficam só com texto.' : 'As chapas em meio-tom voltaram ao feed.');
      montarChrome(); rotear();
    }));
  }

  /* ═════════ CARTÕES ═════════ */
  function chapa(a, { pequena = false, grande = false, legenda = true } = {}) {
    const src = a.imagemOriginal || a.imagem || arteDe(a.secao);
    const credito = a.imagemOriginal ? 'imagem do veículo original' : 'arte da redação Foca News';
    return `<figure class="chapa ${pequena ? 'chapa-pequena' : ''} ${grande ? 'chapa-grande' : ''}" data-chapa="${src}" data-legenda="${esc(a.titulo)}">
      ${a.destaque ? '<span class="faixa-chapa">Destaque da capa</span>' : ''}
      <img src="${esc(src)}" alt="${esc(a.titulo)}" loading="lazy" onerror="this.onerror=null;this.src='${arteDe(a.secao)}'">
      ${legenda ? `<figcaption>${esc(a.fonte)} · ${esc(a.tempoRelativo || '')} · ${credito}</figcaption>` : ''}
    </figure>`;
  }

  const selos = (a) => `
    ${a.pesada ? '<span class="selo-sensivel" title="Conteúdo sensível">⚠ sensível</span>' : ''}
    ${a.lida ? '<span class="selo-lida" title="Você já leu">✓ lida</span>' : ''}
    ${(a.geo && a.geo.ufs && a.geo.ufs.length) ? `<span class="selo-regiao" title="Matéria da sua região">📍 ${esc(a.geo.ufs[0])}</span>` : ''}`;

  const cortar = (txt, n) => {
    const t = String(txt || '').trim();
    if (t.length <= n) return t;
    return t.slice(0, t.lastIndexOf(' ', n) > n * 0.6 ? t.lastIndexOf(' ', n) : n).replace(/[,;:.]$/, '') + '…';
  };

  function recorte(a) {
    const ex = Prefs.estado.exibicao || 'padrao';
    const comImagem = Prefs.estado.imagens !== false;
    const cfg = Prefs.exibicaoAtual();
    const resumo = a.resumo || '';
    const resumoVisivel = ex === 'compacto' ? cortar(resumo, cfg.limiteResumo || 96) : cortar(resumo, cfg.limiteResumo || 240);
    return `<article class="recorte f-${a.estilo || 'serif'} ex-${ex} ${a.lida ? 'ja-lida' : ''}" data-id="${a.id}">
      <div class="recorte-cabeca">
        <span class="recorte-veiculo">${a.bandeira || '📰'}<b>${esc(a.fonte)}</b></span>
        <span class="recorte-tempo">${esc(a.tempoRelativo || '')}</span>
      </div>
      ${comImagem ? chapa(a, { pequena: ex === 'compacto', grande: ex === 'destaque' }) : ''}
      <div class="selos">${selos(a)}</div>
      <h3><a href="#/noticia/${a.id}">${esc(a.titulo)}</a></h3>
      ${resumoVisivel ? `<p class="recorte-resumo">${esc(resumoVisivel)}</p>` : ''}
      <div class="temas-linha">${(a.temas || []).slice(0, 3).map(t => `<a class="chip-tema" href="#/categoria/tema:${t}">${nomeTema(t).icone || '•'} ${esc(nomeTema(t).nome)}</a>`).join('')}</div>
      <div class="recorte-rodape">
        <span class="recorte-secao ${a.destaque ? 'grifada' : ''}">${esc(nomeSecao(a.secao))}</span>
        <button class="btn btn-mini" data-acao="curtir" data-id="${a.id}">${a.curtido ? '★' : '☆'} <span data-cont="${a.id}">${a.curtidas || 0}</span></button>
        <button class="btn btn-mini" data-acao="salvar" data-id="${a.id}">${a.salvo ? '✓ Salvo' : '+ Salvar'}</button>
        <a class="btn btn-mini" href="#/noticia/${a.id}">Ler</a>
      </div>
    </article>`;
  }

  /* ═════════ BARRA "SUA EDIÇÃO" ═════════ */
  function barraEdicao(extra = {}) {
    const p = Prefs.estado;
    const chips = [
      `<a class="chip ${p.modo === 'leitura' ? 'ativo' : ''}" href="#/preferencias">${p.modo === 'leitura' ? '📖 Modo leitura' : '📰 Site jornal'}</a>`,
      `<a class="chip ${Prefs.ehImersivo() ? 'ativo' : ''}" href="#/exibicao">${Prefs.ehImersivo() ? '✨ 3D imersivo' : '🎞 Papel clássico'}</a>`,
      `<a class="chip" href="#/exibicao">exibição: ${esc(Prefs.resumo().exibicao)}</a>`,
      `<a class="chip ${p.imagens === false ? 'ativo' : ''}" href="#/exibicao">${p.imagens === false ? 'sem imagens' : 'com imagens'}</a>`,
      `<a class="chip" href="#/preferencias">tiragem: ${esc(Prefs.resumo().tamanho)}</a>`,
      `<a class="chip" href="#/preferencias">primeiro: ${esc(Prefs.ordemNome())}</a>`,
      `<a class="chip" href="#/preferencias">depois de ler: ${esc(Prefs.resumo().lidas)}</a>`,
      `<a class="chip" href="#/preferencias">região: ${esc(Prefs.resumo().regiao)}${p.cidade ? ' · ' + esc(p.cidade) + '/' + esc(p.uf) : (p.uf ? ' · ' + esc(p.uf) : '')}</a>`,
      `<a class="chip" href="#/preferencias">sensível: ${esc(Prefs.resumo().pesada)}</a>`,
      `<a class="chip" href="#/minhas-fontes">${p.fontes.length ? p.fontes.length + ' fontes escolhidas' : 'todas as fontes'}</a>`,
      ...(p.temas.length ? p.temas.map(t => `<a class="chip ativo" href="#/categoria/tema:${t}">vigia: ${esc(nomeTema(t).nome)}</a>`) : []),
      ...(extra.chips || []),
    ];
    return `<div class="barra-edicao">
      <span class="kicker" style="margin:0">sua edição</span>
      <div class="chips">${chips.join('')}</div>
      <a class="btn btn-mini btn-amarelo" href="#/preferencias">Ajustar</a>
    </div>`;
  }

  /* ═════════ ROTAS ═════════ */
  async function rotearConteudo() {
    const bruto = location.hash.replace(/^#\/?/, '');
    const [caminho] = bruto.split('?');
    const partes = caminho.split('/').filter(Boolean);
    montarChrome();
    window.scrollTo({ top: 0, behavior: 'auto' });

    try {
      if (!partes.length) return await capa();
      if (partes[0] === 'categorias') return await categorias();
      if (partes[0] === 'categoria') return await categoria(decodeURIComponent(partes.slice(1).join('/')));
      if (partes[0] === 'minhas-fontes') return await minhasFontes();
      if (partes[0] === 'exibicao') return await exibicao();
      if (partes[0] === 'preferencias') return await preferencias();
      if (partes[0] === 'como-conheceu') return await comoConheceu();
      if (partes[0] === 'secao') return await secao(partes[1]);
      if (partes[0] === 'fonte') return await secao(null, partes[1]);
      if (partes[0] === 'noticia') return await paginaNoticia(partes[1]);
      if (partes[0] === 'busca') return await busca(decodeURIComponent(partes.slice(1).join('/')));
      if (partes[0] === 'veiculos') return await veiculos();
      if (partes[0] === 'perfil') return await perfil();
      if (partes[0] === 'planos') return await planos();
      if (partes[0] === 'vip') return await areaVip();
      if (partes[0] === 'admin') return await Admin.montar();
      naoEncontrado();
    } catch (e) {
      // Nenhuma rota pode deixar a tela em branco: mostra o motivo em bom português
      // (sem jargão de programação) e oferece uma saída de um clique.
      console.error('[rota " + (location.hash || "#/") + "]', e);
      app().innerHTML = G.bloco('Não foi possível carregar', G.amigavel(e), { dentroDePagina: true });
    }
  }

  /** Invólucro de rota: entrega a troca de página ao motor 3D quando ele existe. */
  async function rotear() {
    if (window.XP && typeof XP.rotear === 'function') return XP.rotear(rotearConteudo);
    if (window.XP && XP.rotaSaindo) {
      XP.rotaSaindo();
      try { return await rotearConteudo(); } finally { XP.rotaEntrar(); }
    }
    return rotearConteudo();
  }

  const carregando = (txt = 'Compondo a página') => { app().innerHTML = `<div class="carregando">${txt}</div>`; };

  function naoEncontrado() {
    app().innerHTML = `<div class="painel-vazio" style="margin:3rem 0"><b>Página não encontrada</b>Essa edição não existe. <a href="#/" style="color:var(--amarelo)">Voltar à primeira página</a></div>`;
  }

  /* ───────── CAPA ───────── */
  async function capa() {
    carregando('Compondo a primeira página');
    const consulta = Prefs.params();
    const [respNoticias, respManchetes] = await Promise.all([
      API.get('/api/noticias?' + consulta).then(G.listagem),
      API.get('/api/manchetes?limite=90&fontes=' + encodeURIComponent(Prefs.estado.fontes.join(',')) + '&pesada=' + Prefs.estado.pesada).then(G.listagem),
    ]);
    const principais = respNoticias;
    const manchetes = respManchetes;

    const itens = Prefs.tratarLidas(principais.itens);
    const pref = principais.preferenciasAplicadas || {};
    const porBloco = pref.porBloco || 4;
    if (!principais.totalNoAcervo) return app().innerHTML = `<div class="painel-vazio"><b>Acervo vazio</b>Rode <code>node scripts/atualizar-noticias.mjs</code> para buscar as manchetes recentes de todos os veículos.</div>`;

    if (!itens.length) {
      return app().innerHTML = `<div class="pagina">${barraEdicao()}<div class="painel-vazio" style="margin-top:2rem"><b>Nada entra na sua edição com esses filtros</b>
        Você escolheu ${Prefs.estado.fontes.length} veículo(s) e ${Prefs.estado.temas.length ? 'alguns assuntos vigiados' : 'todos os assuntos'}. <a href="#/minhas-fontes" style="color:var(--amarelo)">Rever as fontes</a> ou <a href="#/preferencias" style="color:var(--amarelo)">ajustar o jeito de ler</a>.</div></div>`;
    }

    const hero = itens.find(a => a.destaque || a.fixado) || itens[0];
    const giro = itens.filter(a => a.id !== hero.id).slice(0, 7);
    const resto = itens.filter(a => a.id !== hero.id);
    const blocos = secoes()
      .filter(s => s.total > 0)
      .map(s => {
        const daSecao = resto.filter(a => a.secao === s.id).slice(0, porBloco);
        if (!daSecao.length) return '';
        return `<section>
          <div class="titulo-secao"><h2>${s.icone || ''} ${esc(s.nome)}</h2>
            <span class="contagem">${s.total} no acervo · mostrando ${daSecao.length} conforme sua tiragem</span>
            <span class="empurra"><a class="link-tudo" href="#/secao/${s.id}">Ver a editoria →</a></span></div>
          <div class="mosaico">${daSecao.map(recorte).join('')}</div>
        </section>`;
      }).join('');

    const avisosEdicao = [
      pref.fimSemanaAtivo ? `<div class="aviso-edicao">🗓️ <b>Modo fim de semana ativo:</b> menos política e economia, mais cultura, esportes, gastronomia e viagens.</div>` : '',
      principais.pesadasOcultadas ? `<div class="aviso-edicao">⚠ <b>${principais.pesadasOcultadas} notícias sensíveis</b> ficaram de fora porque você pediu "menos" conteúdo pesado. <a href="#/preferencias">Rever</a> · <button class="link-btn" data-acao="mostrar-pesadas">mostrar agora</button></div>` : '',
      Prefs.estado.pesada === 'esconder' ? `<div class="aviso-edicao">🛡️ Conteúdo sensível está <b>escondido</b> conforme sua preferência. <a href="#/preferencias">Rever</a></div>` : '',
    ].filter(Boolean).join('');

    app().innerHTML = `
      <div class="pagina">
        ${barraEdicao()}
        <p class="linha-frescor">🗞️ Acervo atualizado em <b>${E.atualizadoEm ? new Date(E.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'agora'}</b> · só entram manchetes dos últimos dias — as velhas saem sozinhas, todo dia.</p>
        ${avisosEdicao}
        <div class="capa">
          <div class="capa-principal">
            <article class="manchete-principal">
              <span class="faixa-urgente">◉ Edição de agora · ${esc(nomeSecao(hero.secao))}</span>
              ${Prefs.estado.imagens === false ? '' : chapa(hero)}
              <div class="recorte-cabeca" style="border-bottom-width:1px">
                <span class="recorte-veiculo">${hero.bandeira || '📰'}<b>${esc(hero.fonte)}</b></span>
                <span class="recorte-tempo">${esc(hero.tempoRelativo)} · ${esc(hero.pais)}</span>
              </div>
              <h1 style="margin-top:.5rem"><a href="#/noticia/${hero.id}">${esc(hero.titulo)}</a></h1>
              ${hero.resumo ? `<p class="olho">${esc(hero.resumo)}</p>` : ''}
              <div class="temas-linha">${(hero.temas || []).map(t => `<a class="chip-tema" href="#/categoria/tema:${t}">${nomeTema(t).icone} ${esc(nomeTema(t).nome)}</a>`).join('')}</div>
              <div class="acoes-leitor">
                <a class="btn btn-tinta" href="#/noticia/${hero.id}">Abrir a matéria</a>
                <a class="btn btn-vazio" href="${esc(hero.link)}" target="_blank" rel="noopener">Ler no ${esc(hero.fonte)} ↗</a>
                <button class="btn btn-vazio" data-acao="curtir" data-id="${hero.id}">${hero.curtido ? '★' : '☆'} <span data-cont="${hero.id}">${hero.curtidas || 0}</span></button>
                <button class="btn btn-vazio" data-acao="salvar" data-id="${hero.id}">${hero.salvo ? '✓ Salvo' : '+ Salvar'}</button>
              </div>
            </article>
          </div>

          <aside>
            <div class="coluna-urgente">
              <header><h3>Giro rápido</h3><span>${esc(principais.total)} matérias na sua seleção</span></header>
              <ul class="urgente-lista">
                ${giro.map((a, i) => `<li>
                  <span class="num">${String(i + 1).padStart(2, '0')}</span>
                  <span><a href="#/noticia/${a.id}"><b>${esc(a.titulo)}</b></a>
                  <span class="veic">${a.bandeira || '📰'} ${esc(a.fonte)} · ${esc(a.tempoRelativo)}${a.pesada ? ' · ⚠ sensível' : ''}${a.lida ? ' · ✓ lida' : ''}</span></span>
                </li>`).join('')}
              </ul>
            </div>
            <div class="coluna-urgente" style="margin-top:1rem">
              <header><h3>Painel do leitor</h3><span>${E.usuario ? esc(E.usuario.papel) : 'visitante'}</span></header>
              <div style="padding:.8rem">
                ${E.usuario ? `
                  <p class="sub" style="margin-bottom:.6rem">Preferências detectadas pelo seu comportamento: <b style="color:var(--amarelo)">${(E.usuario.preferencias || []).map(nomeSecao).join(' · ') || 'ainda nenhuma — salve matérias'}</b></p>
                  <a class="btn btn-amarelo" href="#/perfil">Minha coleção</a>` : `
                  <p class="sub" style="margin-bottom:.6rem">Crie sua conta para que suas fontes, seu CEP e seu jeito de ler sigam você em qualquer aparelho.</p>
                  <button class="btn btn-amarelo" data-abrir="modal-auth" data-modo="registro">Criar minha conta</button>`}
                <div class="estatisticas" style="margin-top:.9rem">
                  <div><b>${principais.total}</b><span>na sua edição</span></div>
                  <div><b>${Prefs.estado.fontes.length || fontes().length}</b><span>fontes</span></div>
                  <div><b>${secoes().length}</b><span>categorias</span></div>
                </div>
                <div style="margin-top:.8rem;display:flex;gap:.4rem;flex-wrap:wrap">
                  <a class="btn btn-mini btn-vazio" href="#/categorias">Categorias</a>
                  <a class="btn btn-mini btn-vazio" href="#/minhas-fontes">Minhas fontes</a>
                  <a class="btn btn-mini btn-vazio" href="#/preferencias">Meu jeito de ler</a>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <section class="faixa-veiculos">
          <div class="titulo-secao" style="margin-top:1.4rem">
            <h2>A capa de cada jornal</h2>
            <span class="contagem">uma manchete por veículo · ${manchetes.total} jornais${Prefs.estado.fontes.length ? ' (só as suas fontes)' : ''}</span>
            <span class="empurra"><a class="link-tudo" href="#/veiculos">Todos os veículos →</a></span>
          </div>
          <div class="desliza-veiculos">
            ${manchetes.itens.map(a => `<a class="placa-veiculo" href="#/noticia/${a.id}">
              <span class="pv-topo"><span>${a.bandeira || '📰'} ${esc(a.pais)}</span><span>${esc(a.tempoRelativo)}</span></span>
              <span class="pv-nome">${esc(a.fonte)}</span>
              <span class="pv-titulo">${esc(a.titulo)}</span>
              <span class="pv-pe">${esc(nomeSecao(a.secao))} · ${a.curtidas || 0} ★</span>
            </a>`).join('')}
          </div>
        </section>

        ${blocos}
      </div>`;
  }

  /* ───────── SEÇÃO / VEÍCULO ───────── */
  async function secao(id, fonteId, pagina = 1, ordem = null) {
    cache = { secao: id, fonte: fonteId, pagina, ordem };
    carregando('Montando a editoria');
    const fonte = fonteId && fontes().find(f => f.id === fonteId);
    const titulo = fonte ? fonte.nome : (nomeSecao(id) || 'Todas as editorias');
    const params = Prefs.params({ pagina: String(pagina), limite: '24' });
    if (id) params.set('categoria', id);
    if (fonteId) params.set('fonte', fonteId);
    if (ordem) params.set('ordem', ordem);
    const d = G.listagem(await API.get('/api/noticias?' + params));
    const itens = Prefs.tratarLidas(d.itens);

    app().innerHTML = `
      <div class="pagina">
        ${barraEdicao()}
        <div class="titulo-secao">
          <h2>${fonte ? (fonte.bandeira + ' ') : iconeSecao(id) + ' '}${esc(titulo)}</h2>
          <span class="contagem">${d.total} matérias${fonte ? ` · ${fonte.pais} · ${(fonte.idioma || '').toUpperCase()}` : ''}${Prefs.estado.fontes.length ? ' · restrito às suas fontes' : ''}</span>
          <span class="empurra">
            ${fonte && fonte.site ? `<a class="link-tudo" href="${esc(fonte.site)}" target="_blank" rel="noopener">Site oficial ↗</a>` : ''}
            <a class="link-tudo" href="#/preferencias">Ajustar meu jeito de ler →</a>
          </span>
        </div>
        <div class="filtros">
          <span class="chip ativo">Ordenar</span>
          ${['misto', 'repercutidas', 'recentes', 'lidas', 'curtidas', 'antigas'].map(o => `<button class="chip ${o === (ordem || Prefs.estado.ordem) ? 'ativo' : ''}" data-ordem="${o}">${o}</button>`).join('')}
          <span style="flex:1"></span>
          <label class="mono" style="color:#8d8d8d">veículo <select id="filtroFonte"><option value="">${Prefs.estado.fontes.length ? 'só minhas fontes' : 'todos'}</option>
            ${fontes().map(f => `<option value="${f.id}" ${f.id === (fonteId || '') ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
          </select></label>
        </div>
        ${itens.length ? `<div class="mosaico">${itens.map(recorte).join('')}</div>` : (fonte && !fonteNoAcervo(fonte)
          ? `<div class="painel-vazio"><b>${esc(fonte.nome)} entrou para o catálogo</b>Este veículo já pode ser escolhido em Minhas fontes e visitado no site oficial${fonte.site ? ` (<a href="${esc(fonte.site)}" target="_blank" rel="noopener">${esc(dominioFonte(fonte))} ↗</a>)` : ''}, mas o feed dele ainda está em integração neste ambiente — por isso nenhuma matéria foi atribuída a ele aqui. Nada de notícia inventada com a assinatura de um jornal de verdade.</div>`
          : `<div class="painel-vazio"><b>Nada por aqui</b>Nenhuma matéria nessa combinação de filtros. Suas preferências de fonte e conteúdo sensível também valem aqui. <a href="#/minhas-fontes" style="color:var(--amarelo)">Rever fontes</a></div>`)}
        ${d.paginas > 1 ? `<div class="paginacao">
          ${[...Array(Math.min(d.paginas, 14))].map((_, i) => `<button class="btn btn-mini ${i + 1 === d.pagina ? 'btn-amarelo' : ''}" data-pagina="${i + 1}">${i + 1}</button>`).join('')}
        </div>` : ''}
      </div>`;

    $$('[data-ordem]').forEach(b => b.addEventListener('click', () => secao(id, fonteId, 1, b.dataset.ordem)));
    $$('[data-pagina]').forEach(b => b.addEventListener('click', () => secao(id, fonteId, Number(b.dataset.pagina), ordem)));
    const sel = $('#filtroFonte');
    if (sel) sel.addEventListener('change', () => { if (sel.value) location.hash = `#/fonte/${sel.value}`; else if (id) location.hash = `#/secao/${id}`; else location.hash = '#/'; });
  }

  /* ───────── ABA 1 · CATEGORIAS ───────── */
  async function carregarCategorias(forcar = false) {
    if (categoriasCache && !forcar) return categoriasCache;
    const bruto = G.obj(await API.get('/api/categorias'));
    categoriasCache = { ...bruto, editorias: G.uteis(bruto.editorias, ['id']), temas: G.uteis(bruto.temas, ['id']) };
    return categoriasCache;
  }

  async function categorias() {
    carregando('Organizando as categorias');
    const d = await carregarCategorias(true);
    const p = Prefs.estado;
    const editoriasVisiveis = d.editorias.filter(e => e.total > 0);

    app().innerHTML = `
      <div class="pagina">
        <div class="titulo-secao">
          <h2>Categorias</h2>
          <span class="contagem">${editoriasVisiveis.length} editorias · ${d.temas.length} assuntos em alta · ${fontes().length} veículos</span>
          <span class="empurra"><a class="link-tudo" href="#/minhas-fontes">Escolher minhas fontes →</a></span>
        </div>
        <p class="sub">Duas camadas de categorização: as <b>editorias</b> (a mesa do jornal que publicou) e os <b>assuntos</b>, detectados no texto de cada manchete — de inteligência artificial a gastronomia. Clique em uma categoria para ler só ela; marque um assunto para <b>vigiar</b> e ele ganha peso na sua primeira página.</p>

        <div class="titulo-secao" style="margin-top:1.6rem"><h2 style="font-size:1.3rem;font-family:var(--cond);letter-spacing:.16em">EDITORIAS</h2><span class="contagem">onde a notícia foi publicada</span></div>
        <div class="grade-categorias">
          ${editoriasVisiveis.map(e => `<a class="cartao-categoria ${e.nav ? 'principal' : ''}" href="#/categoria/${e.id}">
            <span class="cc-icone">${e.icone}</span>
            <span class="cc-nome">${esc(e.nome)}</span>
            <span class="cc-total">${e.total}</span>
            <span class="cc-exemplo">${e.exemplo ? '“' + esc(e.exemplo.titulo.slice(0, 74)) + '…”' : ''}</span>
            <span class="cc-fonte">${e.exemplo ? e.exemplo.bandeira + ' ' + esc(e.exemplo.fonte) : ''}</span>
          </a>`).join('')}
        </div>

        <div class="titulo-secao" style="margin-top:2.2rem"><h2 style="font-size:1.3rem;font-family:var(--cond);letter-spacing:.16em">ASSUNTOS EM ALTA</h2><span class="contagem">detectados automaticamente nas manchetes · marque para vigiar</span></div>
        <div class="grade-temas">
          ${d.temas.map(t => {
            const vigiado = p.temas.includes(t.tema);
            return `<div class="cartao-tema ${vigiado ? 'vigiado' : ''}">
              <a class="ct-topo" href="#/categoria/tema:${t.tema}">
                <span class="cc-icone">${t.icone}</span>
                <span class="cc-nome">${esc(t.nome)}</span>
                <span class="cc-total">${t.total}</span>
              </a>
              <span class="cc-exemplo">${t.exemplo ? '“' + esc(t.exemplo.titulo.slice(0, 66)) + '…”' : ''}</span>
              <button class="btn btn-mini ${vigiado ? 'btn-amarelo' : 'btn-vazio'}" data-vigiar="${t.tema}">${vigiado ? '✓ vigiando' : '+ vigiar'}</button>
            </div>`;
          }).join('')}
        </div>

        <div class="grade-admin" style="margin-top:2.2rem">
          <div class="caixa-aviso">
            <b>Minhas fontes</b>
            <p>Diga de quais veículos você quer receber notícia — dos ${fontes().length} disponíveis. O feed passa a mostrar só o que eles publicam.</p>
            <a class="btn btn-amarelo" href="#/minhas-fontes">Escolher fontes (${p.fontes.length || 'todas'})</a>
          </div>
          <div class="caixa-aviso">
            <b>Meu jeito de ler</b>
            <p>Modo leitura ou site jornal, tiragem, o que vem primeiro, o que acontece com o que você já leu, sua região pelo CEP, conteúdo sensível e o fim de semana.</p>
            <a class="btn btn-vazio" href="#/preferencias">Ajustar meu jeito de ler</a>
          </div>
        </div>
      </div>`;

    $$('[data-vigiar]').forEach(b => b.addEventListener('click', async () => {
      const t = b.dataset.vigiar;
      const temas = Prefs.estado.temas.includes(t) ? Prefs.estado.temas.filter(x => x !== t) : [...Prefs.estado.temas, t];
      await Prefs.definir({ temas }, { silencioso: true });
      avisar(temas.includes(t) ? 'Assunto vigiado' : 'Deixou de vigiar', `${nomeTema(t).nome} ${temas.includes(t) ? 'ganha peso na sua primeira página.' : 'saiu da sua lista.'}`);
      categorias();
    }));
  }

  /* ───────── CATEGORIA (editoria ou assunto) ───────── */
  async function categoria(id, pagina = 1) {
    carregando('Abrindo a categoria');
    const isTema = id.startsWith('tema:');
    const temaId = isTema ? id.slice(5) : null;
    const params = Prefs.params({ pagina: String(pagina), limite: '30' });
    params.set('categoria', isTema ? id : id);
    const d = G.listagem(await API.get('/api/noticias?' + params));
    const itens = Prefs.tratarLidas(d.itens);
    const titulo = isTema ? `${nomeTema(temaId).icone} ${nomeTema(temaId).nome}` : `${iconeSecao(id)} ${nomeSecao(id)}`;
    const vigiando = isTema && Prefs.estado.temas.includes(temaId);

    app().innerHTML = `
      <div class="pagina">
        ${barraEdicao()}
        <div class="titulo-secao">
          <h2>${esc(titulo)}</h2>
          <span class="contagem">${d.total} matérias${isTema ? ' de todos os veículos que tocaram no assunto' : ''}${Prefs.estado.fontes.length ? ' · restrito às suas fontes' : ''}</span>
          <span class="empurra">
            ${isTema ? `<button class="btn btn-mini ${vigiando ? 'btn-amarelo' : 'btn-vazio'}" data-vigiar="${temaId}">${vigiando ? '✓ vigiando' : '+ vigiar assunto'}</button>` : ''}
            <a class="link-tudo" href="#/categorias">← todas as categorias</a>
          </span>
        </div>
        ${itens.length ? `<div class="mosaico larga">${itens.map(recorte).join('')}</div>`
          : `<div class="painel-vazio"><b>Nada nesta categoria agora</b>Pode ser o filtro das suas fontes. <a href="#/minhas-fontes" style="color:var(--amarelo)">Rever</a></div>`}
        ${d.paginas > 1 ? `<div class="paginacao">${[...Array(Math.min(d.paginas, 14))].map((_, i) => `<button class="btn btn-mini ${i + 1 === d.pagina ? 'btn-amarelo' : ''}" data-pagina="${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}
      </div>`;

    $$('[data-pagina]').forEach(b => b.addEventListener('click', () => categoria(id, Number(b.dataset.pagina))));
    const v = $('[data-vigiar]');
    if (v) v.addEventListener('click', async () => {
      const temas = Prefs.estado.temas.includes(temaId) ? Prefs.estado.temas.filter(x => x !== temaId) : [...Prefs.estado.temas, temaId];
      await Prefs.definir({ temas }, { silencioso: true });
      avisar(temas.includes(temaId) ? 'Assunto vigiado' : 'Deixou de vigiar', nomeTema(temaId).nome);
      categoria(id, pagina);
    });
  }

  /* ───────── ABA 2 · MINHAS FONTES ───────── */
  async function minhasFontes() {
    carregando('Abrindo a lista de veículos');
    const d = await carregarCategorias();
    const escolhidas = new Set(Prefs.estado.fontes);
    const grupos = secoes().map(s => ({ ...s, lista: fontes().filter(f => f.secao === s.id) })).filter(g => g.lista.length);
    const idiomas = [...new Set(fontes().map(f => f.idioma))];

    const caixa = (f) => { const st = statusFonte(f); return `<label class="opcao-fonte ${escolhidas.has(f.id) ? 'marcada' : ''}" data-id="${f.id}">
      <input type="checkbox" value="${f.id}" ${escolhidas.has(f.id) ? 'checked' : ''}>
      <span class="of-nome"><span class="fonte-sigla" aria-hidden="true">${esc(siglaFonte(f))}</span>${f.bandeira || '📰'} ${esc(f.nome)}</span>
      <span class="of-meta">${esc(f.pais)}${f.regiao && f.regiao !== f.pais ? ' · ' + esc(f.regiao) : ''} · ${(f.idioma || '').toUpperCase()} · ${fonteNoAcervo(f) ? (f.total || 0) + ' matérias no acervo' : 'em integração'}</span>
      <span class="cv-status ${st.classe}">${st.rotulo}</span>
      <span class="of-marca" aria-hidden="true"></span>
    </label>`; };

    app().innerHTML = `
      <div class="pagina">
        <div class="titulo-secao">
          <h2>Minhas fontes</h2>
          <span class="contagem">${fontes().length} veículos disponíveis</span>
          <span class="empurra"><a class="link-tudo" href="#/categorias">Ver categorias →</a></span>
        </div>

        <div class="pergunta-bloco">
          <span class="kicker">aba 2 · escolha das fontes</span>
          <h3>De quais veículos você quer receber a notícia?</h3>
          <p class="sub">Marque os jornais, agências, emissoras e portais que assinam a sua edição. Sem nenhuma marcação, o Foca News mostra <b>todas as ${fontes().length} fontes</b>.</p>
        </div>

        <div class="barra-fontes">
          <input id="buscaFonte" placeholder="filtrar por nome, país ou idioma…">
          <select id="filtroGrupo"><option value="">todas as editorias</option>${grupos.map(g => `<option value="${g.id}">${esc(g.nome)} (${g.lista.length})</option>`).join('')}</select>
          <select id="filtroIdioma"><option value="">todos os idiomas</option>${idiomas.map(i => `<option value="${i}">${String(i).toUpperCase()}</option>`).join('')}</select>
          <button class="btn btn-mini" id="btnTodas">marcar todas</button>
          <button class="btn btn-mini" id="btnBrasil">só brasileiros</button>
          <button class="btn btn-mini" id="btnLimparF">limpar</button>
          <span class="contador-fontes" id="contadorFontes">${escolhidas.size ? escolhidas.size + ' de ' + fontes().length + ' selecionados' : 'nenhuma selecionada — feed completo'}</span>
        </div>

        <div id="listaFontes">
          ${grupos.map(g => `<section class="bloco-fontes" data-grupo="${g.id}" data-idiomas="${[...new Set(g.lista.map(f => f.idioma))].join(',')}">
            <header>
              <h4>${g.icone || '📰'} ${esc(g.nome)} <span class="mono">${g.lista.length}</span></h4>
              <button class="btn btn-mini btn-vazio" data-grupo-todas="${g.id}">marcar as ${g.lista.length}</button>
            </header>
            <div class="grade-fontes">${g.lista.map(caixa).join('')}</div>
          </section>`).join('')}
        </div>

        <div class="cola-rodape">
          <div>
            <b id="resumoFontes">${escolhidas.size ? escolhidas.size + ' fontes escolhidas' : 'todas as ' + fontes().length + ' fontes'}</b>
            <span class="mono" id="resumoFontesDetalhe">${escolhidas.size ? 'a primeira página e as editorias mostrarão só o que elas publicarem' : 'nenhuma restrição: capa completa'}</span>
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <button class="btn btn-fantasma" id="btnSalvarFontes">Salvar escolha</button>
            <a class="btn btn-amarelo" href="#/" id="btnVerFeed">Ver minha primeira página</a>
          </div>
        </div>
      </div>`;

    const atualizar = () => {
      const n = escolhidas.size;
      $('#contadorFontes').textContent = n ? `${n} de ${fontes().length} selecionados` : 'nenhuma selecionada — feed completo';
      $('#resumoFontes').textContent = n ? `${n} fontes escolhidas` : `todas as ${fontes().length} fontes`;
      $('#resumoFontesDetalhe').textContent = n ? 'a primeira página e as editorias mostrarão só o que elas publicarem' : 'nenhuma restrição: capa completa';
    };
    const aplicar = async (silencioso = true) => {
      await Prefs.definir({ fontes: [...escolhidas] }, { silencioso });
      atualizar();
      montarChrome();
    };
    const marcar = (id, on) => {
      if (on) escolhidas.add(id); else escolhidas.delete(id);
      const el = $(`.opcao-fonte[data-id="${id}"]`);
      if (el) el.classList.toggle('marcada', on);
      atualizar();
    };

    $('#listaFontes').addEventListener('change', (ev) => {
      if (ev.target.matches('input[type="checkbox"]')) {
        marcar(ev.target.value, ev.target.checked);
        aplicar();
      }
    });
    $$('[data-grupo-todas]').forEach(b => b.addEventListener('click', () => {
      const g = secoes().find(s => s.id === b.dataset.grupoTodas);
      fontes().filter(f => f.secao === g.id).forEach(f => { escolhidas.add(f.id); const el = $(`.opcao-fonte[data-id="${f.id}"]`); if (el) { el.classList.add('marcada'); el.querySelector('input').checked = true; } });
      atualizar(); aplicar();
    }));
    $('#btnTodas').addEventListener('click', () => { fontes().forEach(f => marcar(f.id, true)); aplicar(); });
    $('#btnLimparF').addEventListener('click', () => { escolhidas.clear(); $$('.opcao-fonte').forEach(el => { el.classList.remove('marcada'); el.querySelector('input').checked = false; }); atualizar(); aplicar(); });
    $('#btnBrasil').addEventListener('click', () => {
      escolhidas.clear();
      fontes().filter(f => f.pais === 'Brasil').forEach(f => { escolhidas.add(f.id); const el = $(`.opcao-fonte[data-id="${f.id}"]`); if (el) { el.classList.add('marcada'); el.querySelector('input').checked = true; } });
      $$('.opcao-fonte').forEach(el => { if (!escolhidas.has(el.dataset.id)) { el.classList.remove('marcada'); el.querySelector('input').checked = false; } });
      atualizar(); aplicar();
    });
    const filtrar = () => {
      const t = $('#buscaFonte').value.toLowerCase();
      const g = $('#filtroGrupo').value;
      const idi = $('#filtroIdioma').value;
      $$('.bloco-fontes').forEach(bloco => {
        let visiveis = 0;
        $$('.opcao-fonte', bloco).forEach(op => {
          const f = fontes().find(x => x.id === op.dataset.id);
          const ok = (!t || (f.nome + ' ' + f.pais + ' ' + (f.regiao || '') + ' ' + f.idioma).toLowerCase().includes(t)) && (!idi || f.idioma === idi);
          op.style.display = ok ? '' : 'none';
          if (ok) visiveis++;
        });
        bloco.style.display = (!g || g === bloco.dataset.grupo) && visiveis ? '' : 'none';
      });
    };
    ['#buscaFonte', '#filtroGrupo', '#filtroIdioma'].forEach(s => $(s).addEventListener('input', filtrar));
    $('#btnSalvarFontes').addEventListener('click', () => aplicar(false));
    $('#btnVerFeed').addEventListener('click', () => aplicar(true));
  }

  /* ───────── ABA 3 · MEU JEITO DE LER ───────── */
  async function preferencias() {
    carregando('Abrindo suas preferências');
    const p = Prefs.estado;
    const acervoTemas = await carregarCategorias();
    const fimDeSemana = [0, 6].includes(new Date().getDay());
    const diaSemana = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });

    const opcoes = (campo, itens, atual, descricoes = {}) => itens.map(([valor, nome]) => `
      <label class="opcao-radio ${atual === valor ? 'marcada' : ''}">
        <input type="radio" name="${campo}" value="${valor}" ${atual === valor ? 'checked' : ''}>
        <b>${esc(nome)}</b>
        <small>${esc(descricoes[valor] || '')}</small>
      </label>`).join('');

    app().innerHTML = `
      <div class="pagina">
        <div class="titulo-secao">
          <h2>Meu jeito de ler</h2>
          <span class="contagem">vale na hora — e fica salvo na sua conta</span>
          <span class="empurra"><button class="btn btn-mini btn-vazio" id="btnPadrao">restaurar padrão</button></span>
        </div>

        <div class="pergunta-bloco">
          <span class="kicker">aba 5 · preferências de leitura</span>
          <h3>Como você quer receber o noticiário?</h3>
          <p class="sub">Tudo aqui muda de verdade a sua primeira página: o jeito de exibir, o tamanho da tiragem, a ordem, o destino do que você já leu, o peso da sua região, o conteúdo sensível e o fim de semana.</p>
        </div>

        <div class="grade-preferencias">
          <section class="bloco-pref">
            <header><span class="bp-num">1</span><h4>Site jornal ou modo leitura?</h4></header>
            <div class="opcoes">
              ${opcoes('modo', [['jornal', '📰 Site jornal'], ['leitura', '📖 Modo leitura']], p.modo, {
                jornal: 'a primeira página ilustrada: fotos em clichê de meio-tom, recortes, tipografia por veículo',
                leitura: 'só texto: sem imagens, sem textura — coluna limpa para ler na sequência, sem distração',
              })}
            </div>
          </section>

          <section class="bloco-pref">
            <header><span class="bp-num">2</span><h4>Tamanho do feed</h4></header>
            <div class="opcoes">
              ${opcoes('tamanho', [['minimal', 'Minimalista'], ['curto', 'Curto'], ['medio', 'Médio'], ['longo', 'Longo']], p.tamanho,
                Object.fromEntries(Object.entries(E.tamanhos || {}).map(([k, v]) => [k, v.descricao])))}
            </div>
          </section>

          <section class="bloco-pref">
            <header><span class="bp-num">3</span><h4>O que vem primeiro?</h4></header>
            <div class="opcoes">
              ${opcoes('ordem', [['repercutidas', 'Mais repercutidas'], ['recentes', 'Mais recentes'], ['misto', 'Misto']], p.ordem, {
                repercutidas: 'quantos veículos cobrem o mesmo assunto + o que os leitores mais curtem e comentam',
                recentes: 'cronologia pura: o que acabou de cair na mesa',
                misto: 'metade cronologia, metade repercussão, com o peso da sua região e dos seus assuntos',
              })}
            </div>
          </section>

          <section class="bloco-pref">
            <header><span class="bp-num">4</span><h4>Depois que eu leio, a notícia…</h4></header>
            <div class="opcoes">
              ${opcoes('lidas', [['descem', '⬇ Desce para o fim'], ['somem', '✕ Some do feed'], ['ficam', '↔ Fica no mesmo lugar']], p.lidas, {
                descem: 'o que você já abriu vai para o fim da lista, o não lido fica no topo',
                somem: 'o feed esconde o que você já leu — deixa só assunto novo',
                ficam: 'nada muda de lugar; o que foi lido ganha a marca ✓ lida',
              })}
            </div>
            <p class="mono nota-pref">Você já leu <b id="totalLidas">—</b> matérias neste navegador. <button class="link-btn" id="btnZerarLidas">marcar todas como não lidas</button></p>
          </section>

          <section class="bloco-pref larga">
            <header><span class="bp-num">5</span><h4>Notícias da minha região</h4></header>
            <div class="opcoes horizontal">
              ${opcoes('regiao', [['pouco', 'Pouco (mais do país)'], ['medio', 'Médio (equilibrado)'], ['muito', 'Muito (mais da cidade)']], p.regiao, {
                pouco: 'a capa puxa o noticiário nacional e internacional; a cidade aparece pouco',
                medio: 'equilíbrio entre cidade, país e mundo',
                muito: 'a sua cidade e o seu estado sobem para o topo da fila',
              })}
            </div>
            <div class="cep-bloco">
              <div class="campo">
                <label>Identificador de CEP</label>
                <div style="display:flex;gap:.5rem;flex-wrap:wrap">
                  <input id="campoCep" placeholder="Ex.: 45600-000" value="${esc(p.cep || '')}" maxlength="9" style="max-width:180px">
                  <button class="btn btn-amarelo" id="btnCep">Identificar minha região</button>
                  ${p.uf ? `<button class="btn btn-vazio" id="btnCepLimpar">remover</button>` : ''}
                </div>
              </div>
              <div class="cep-resultado ${p.uf ? 'ok' : ''}" id="cepResultado">
                ${p.uf
        ? `<b>📍 ${esc([p.cidade, p.uf].filter(Boolean).join(' — '))}</b>
                     <span>${esc(p.regiaoNome || '')}${p.cidade ? ` · a capa vai priorizar ${esc(p.cidade)} e o entorno` : ''}</span>`
        : '<span>Sem CEP informado: a capa trata todas as regiões do país do mesmo jeito.</span>'}
              </div>
              <p class="mono nota-pref">O CEP é usado só para achar cidade/estado (consulta ao ViaCEP) e nunca aparece para outros leitores. No painel da redação ele aparece de forma agregada — quantos leitores acompanham cada região.</p>
            </div>
          </section>

          <section class="bloco-pref">
            <header><span class="bp-num">6</span><h4>Notícia pesada</h4></header>
            <div class="opcoes">
              ${opcoes('pesada', [['mostrar', 'Mostrar tudo'], ['menos', 'Mostrar menos'], ['esconder', 'Esconder']], p.pesada, {
                mostrar: 'morte, violência, desastre e guerra entram normalmente na capa',
                menos: 'ficam no máximo ~18% do feed e caem para o fim',
                esconder: 'saem da sua edição; você pode revelar quando quiser',
              })}
            </div>
            <p class="mono nota-pref">A redação marca automaticamente mortes, violência, desastres e guerras.<span id="contPesadas"></span></p>
          </section>

          <section class="bloco-pref">
            <header><span class="bp-num">7</span><h4>Fim de semana</h4></header>
            <label class="opcao-check ${p.fimSemana ? 'marcada' : ''}">
              <input type="checkbox" id="checkFimSemana" ${p.fimSemana ? 'checked' : ''}>
              <span>Nos fins de semana, quero <b>menos política</b> e <b>mais cultura e esportes</b></span>
            </label>
            <p class="mono nota-pref">${fimDeSemana && p.fimSemana ? '🗓️ Hoje é ' + diaSemana + ' — modo fim de semana <b>ativo agora</b>.' : p.fimSemana ? 'Hoje é ' + diaSemana + ': a regra entra em vigor no sábado e no domingo.' : 'Desligado: a capa mantém o mesmo equilíbrio todos os dias.'}</p>
          </section>

          <section class="bloco-pref larga">
            <header><span class="bp-num">8</span><h4>Assuntos que eu quero vigiar</h4></header>
            <p class="sub">Assuntos marcados ganham peso na sua primeira página, em qualquer editoria.</p>
            <div class="grade-temas compacta">
              ${acervoTemas.temas.slice(0, 16).map(t => `<button class="chip-vigiar ${p.temas.includes(t.tema) ? 'ativo' : ''}" data-vigiar="${t.tema}">${t.icone} ${esc(t.nome)} <span class="mono">${t.total}</span></button>`).join('')}
            </div>
          </section>
        </div>

        <div class="cola-rodape">
          <div>
            <b>Sua edição agora</b>
            <span class="mono" id="resumoPrefs">${esc(Prefs.descricaoCurta())}</span>
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <button class="btn btn-amarelo" id="btnVerCapa">Ver como fica na primeira página</button>
          </div>
        </div>
      </div>`;

    const atualizarResumo = () => { $('#resumoPrefs').textContent = Prefs.descricaoCurta(); };
    const ligarRadios = (campo) => $$(`input[name="${campo}"]`).forEach(input => input.addEventListener('change', async () => {
      const valor = input.value;
      $$(`input[name="${campo}"]`).forEach(i => i.closest('.opcao-radio').classList.toggle('marcada', i.checked));
      await Prefs.definir({ [campo]: valor });
      atualizarResumo();
      if (campo === 'modo') { montarChrome(); rotear(); }
    }));
    ['modo', 'tamanho', 'ordem', 'lidas', 'regiao', 'pesada'].forEach(ligarRadios);

    $('#checkFimSemana').addEventListener('change', async (ev) => {
      ev.target.closest('.opcao-check').classList.toggle('marcada', ev.target.checked);
      await Prefs.definir({ fimSemana: ev.target.checked });
      atualizarResumo(); preferencias();
    });

    $('#btnCep').addEventListener('click', async () => {
      const cep = $('#campoCep').value.replace(/\D/g, '');
      if (cep.length !== 8) return avisar('CEP incompleto', 'Informe os 8 dígitos.', 'erro');
      const alvo = $('#cepResultado');
      alvo.className = 'cep-resultado';
      alvo.innerHTML = 'Consultando o CEP…';
      try {
        const d = await API.get('/api/cep/' + cep);
        await Prefs.definir({ cep: d.cep, cidade: d.cidade || '', uf: d.uf || '', regiaoNome: d.regiaoNome || '' });
        alvo.className = 'cep-resultado ok';
        alvo.innerHTML = `<b>📍 ${esc([d.cidade, d.uf].filter(Boolean).join(' — '))}</b>
          <span>${esc(d.regiaoNome || '')} · ${d.aproximado ? 'localizado pela faixa do CEP' : 'confirmado no ViaCEP'}${d.bairro ? ' · ' + esc(d.bairro) : ''}</span>`;
        avisar('Região identificada', `${[d.cidade, d.uf].filter(Boolean).join('/')} — a capa já está priorizando a sua região.`);
        montarChrome(); atualizarResumo();
      } catch (e) {
        alvo.innerHTML = `<span style="color:#ff9d8d">${esc(e.message)}</span>`;
      }
    });
    const limparCep = $('#btnCepLimpar');
    if (limparCep) limparCep.addEventListener('click', async () => {
      await Prefs.definir({ cep: '', cidade: '', uf: '', regiaoNome: '' });
      avisar('Região removida', 'A capa voltou a tratar todas as regiões igualmente.');
      montarChrome(); preferencias();
    });

    $('#btnPadrao').addEventListener('click', async () => {
      await Prefs.restaurar();
      avisar('Padrões restaurados', 'Mantivemos apenas o seu CEP.');
      montarChrome(); preferencias();
    });
    $('#btnVerCapa').addEventListener('click', () => { location.hash = '#/'; });
    $('#btnZerarLidas').addEventListener('click', () => {
      Prefs.zerarLidas();
      avisar('Histórico limpo', 'Todas as notícias voltam a aparecer como não lidas.');
      preferencias();
    });
    $$('[data-vigiar]').forEach(b => b.addEventListener('click', async () => {
      const t = b.dataset.vigiar;
      const temas = p.temas.includes(t) ? p.temas.filter(x => x !== t) : [...p.temas, t];
      await Prefs.definir({ temas }, { silencioso: true });
      b.classList.toggle('ativo', temas.includes(t));
      avisar(temas.includes(t) ? 'Assunto vigiado' : 'Deixou de vigiar', nomeTema(t).nome);
      atualizarResumo();
    }));
    $('#totalLidas').textContent = Prefs.totalLidas().toLocaleString('pt-BR');
  }

  /* ───────── BUSCA ───────── */
  async function busca(termo) {
    if (!termo) return location.hash = '#/';
    carregando(`Procurando “${termo}”`);
    const d = G.listagem(await API.get('/api/noticias?busca=' + encodeURIComponent(termo) + '&limite=60&ordem=' + Prefs.estado.ordem + '&pesada=' + Prefs.estado.pesada));
    const itens = Prefs.tratarLidas(d.itens);
    const porVeiculo = {};
    itens.forEach(a => { porVeiculo[a.fonte] = (porVeiculo[a.fonte] || 0) + 1; });
    app().innerHTML = `
      <div class="pagina">
        <div class="titulo-secao"><h2>Busca: “${esc(termo)}”</h2><span class="contagem">${d.total} resultados em todo o acervo</span></div>
        ${d.total ? `
          <p class="sub" style="margin-bottom:1.2rem">Veículos que cobrem o assunto: ${Object.entries(porVeiculo).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([f, n]) => `<b style="color:var(--amarelo)">${esc(f)}</b> (${n})`).join(' · ')}</p>
          <div class="mosaico larga">${itens.map(recorte).join('')}</div>`
          : `<div class="painel-vazio"><b>Sem resultados</b>Tente outro termo — ou navegue pelas categorias.</div>`}
      </div>`;
  }

  /* ───────── PÁGINA DA NOTÍCIA ───────── */
  async function paginaNoticia(id) {
    carregando('Imprimindo a matéria');
    Prefs.marcarLida(id);
    const d = G.obj(await API.get('/api/noticia/' + id));
    const a = G.obj(d.artigo);
    if (!a.id) throw new Error('Essa matéria não está mais no acervo.');
    const st = a.estilo || 'serif';
    document.title = `${a.titulo} — ${a.fonte} | ${cfg().nomePortal}`;
    // A ficha vem da API e pode chegar parcial (ou ausente): normalizamos os três campos
    const fichaBruta = G.obj(d.ficha || a.ficha);
    const ficha = {
      temas: G.lista(fichaBruta.temas),
      pesada: typeof fichaBruta.pesada === 'boolean' ? fichaBruta.pesada : !!a.pesada,
      geo: G.obj(fichaBruta.geo || a.geo),
    };

    /* O corpo vem do relato publicado no feed (`texto`). Quando o feed trouxe
       só o chamariz, o próprio resumo abre a matéria — e o bloco avisa, em vez
       de fingir que existe reportagem aqui dentro. */
    const relato = G.txt(a.texto).trim();
    const corpo = G.paragrafos(relato || a.resumo, 5);
    const soChamariz = !relato || relato === G.txt(a.resumo).trim();
    const linkFonte = /^https?:\/\//i.test(G.txt(a.link)) ? G.txt(a.link) : '';
    const mostrarSub = !!a.resumo && !(soChamariz && corpo.length === 1);

    app().innerHTML = `
      <div class="pagina">
        <div style="margin-bottom:1rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <a class="btn btn-mini btn-fantasma" href="#/">← Primeira página</a>
          <a class="btn btn-mini btn-fantasma" href="#/secao/${a.secao}">${iconeSecao(a.secao)} ${esc(nomeSecao(a.secao))}</a>
          <span class="chip">${a.bandeira || '📰'} ${esc(a.pais)}</span>
          <span class="chip">${esc(a.idioma.toUpperCase())}</span>
          ${ficha.pesada ? '<span class="chip chip-sensivel">⚠ conteúdo sensível</span>' : ''}
          ${G.lista(ficha.geo.ufs).map(uf => `<a class="chip chip-regiao" href="#/preferencias">📍 ${esc(uf)}</a>`).join('')}
        </div>

        <article class="pagina-jornal f-${st} ${Prefs.estado.modo === 'leitura' ? 'so-texto' : ''}">
          <header class="jornal-cabeca">
            <div class="cidade">${esc(a.pais)} · edição Foca News</div>
            <div class="masthead">${esc(a.fonte)}</div>
            <div class="expediente">
              <span>${esc(API.dataLonga(a.publicadoEm))}</span><span>·</span>
              <span>${esc(a.tempoRelativo)}</span><span>·</span>
              <span>${esc(nomeSecao(a.secao))}</span><span>·</span>
              <span>${(a.visualizacoes || 0)} leituras</span>
            </div>
          </header>

          ${a.destaque ? '<div class="olho-etiqueta"><span class="faixa-urgente">★ Destacada pela redação</span></div>' : ''}
          <h1 class="manchete">${esc(a.titulo)}</h1>
          ${mostrarSub ? `<p class="sub-manchete">${esc(a.resumo)}</p>` : ''}

          <div class="assinatura">
            <span>Por ${esc(a.fonte)}</span><span>·</span><span>${esc(a.pais)}</span><span>·</span>
            <span>${new Date(a.publicadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            ${a.editadoPor ? `<span>· revisado por ${esc(a.editadoPor)}</span>` : ''}
          </div>

          ${ficha.temas.length ? `<div class="temas-linha centro">${ficha.temas.map(t => `<a class="chip-tema" href="#/categoria/tema:${esc(G.txt(t.id))}">${esc(G.txt(t.icone, '•'))} ${esc(G.txt(t.nome, t.id))}</a>`).join('')}</div>` : ''}

          <div style="display:grid;grid-template-columns:minmax(0,1fr);gap:1rem">
            ${chapa(a, { legenda: true })}
            <div class="corpo-jornal">
              ${corpo.length
        ? corpo.map(par => `<p>${esc(par)}</p>`).join('')
        : `<p>${esc('O veículo publicou apenas a manchete no feed — o texto integral está no site de origem.')}</p>`}
              ${linkFonte
        ? `<p class="origem-linha">Matéria completa no site de origem:<a class="link-origem" href="${esc(linkFonte)}" target="_blank" rel="noopener">${esc(a.fonte)} ↗</a></p>`
        : `<p class="origem-linha">Esta matéria veio do acervo da redação — não há link externo para a íntegra.</p>`}
              <div class="aviso-transparencia">
                <span style="font-size:1.2rem">🛈</span>
                <span><b>Conteúdo agregado${soChamariz ? ' (chamariz)' : ''}.</b> O texto acima é o relato publicado no feed de <b>${esc(a.fonte)}</b>. A íntegra da reportagem — texto, fotos e direitos — pertence ao veículo, e o link ao lado leva direto para lá.</span>
              </div>
            </div>
          </div>

          <div class="entrelinha"></div>

          <div class="acoes-leitor">
            <button class="btn btn-tinta" data-acao="curtir" data-id="${a.id}">${a.curtido ? '★ Curtida' : '☆ Curtir'} <span class="pilula-contagem" data-cont="${a.id}">${a.curtidas || 0}</span></button>
            <button class="btn btn-vazio" data-acao="salvar" data-id="${a.id}">${a.salvo ? '✓ Na sua coleção' : '+ Salvar para depois'}</button>
            <button class="btn btn-vazio" data-acao="compartilhar" data-id="${a.id}">↗ Copiar link do Foca News</button>
            <a class="btn btn-amarelo" href="${esc(a.link || '#')}" target="_blank" rel="noopener">Ler a íntegra em ${esc(a.fonte)} ↗</a>
            <span class="mono" style="color:#6f6f6f">${(a.totalComentarios || 0)} comentários · ${(a.visualizacoes || 0)} leituras</span>
          </div>

          <section class="bloco-comentarios">
            <h3>Conversa dos leitores</h3>
            <div id="listaComentarios">
              ${G.lista(d.comentarios).length ? G.lista(d.comentarios).map(c => `
                <div class="comentario" data-coment="${c.id}">
                  <span class="avatar" style="background:${esc(c.cor || '#2f9dff')}">${esc((c.autor || '?')[0].toUpperCase())}</span>
                  <div style="flex:1">
                    <div class="comentario-cabeca">
                      <b>${esc(c.autor)}</b>
                      <time>${esc(API.tempoRelativo(c.criadoEm))}</time>
                      ${c.status !== 'publicado' ? `<span class="etiqueta ${c.status}">${c.status}</span>` : ''}
                      ${(c.meu || (E.usuario && E.usuario.papel === 'admin')) ? '<button class="btn btn-mini btn-perigo" data-apagar-coment="' + c.id + '">apagar</button>' : ''}
                    </div>
                    <p>${esc(c.texto)}</p>
                  </div>
                </div>`).join('') : '<p class="sub">Seja o primeiro a comentar esta matéria.</p>'}
            </div>
            ${E.usuario
        ? `<form class="form-comentario" id="formComentario">
                   <textarea id="textoComentario" placeholder="Escreva seu comentário sobre esta notícia…" maxlength="800"></textarea>
                   <button class="btn btn-amarelo" type="submit">Publicar</button>
                 </form>${cfg().moderacaoComentarios ? '<p class="mono" style="color:#8d8d8d">Moderação ativa: sua mensagem entra na fila da redação.</p>' : ''}`
        : `<button class="btn btn-amarelo" data-abrir="modal-auth">Entrar para comentar</button>`}
          </section>

          ${G.lista(d.relacionados).length ? `
            <section class="relacionados">
              <h3>Na mesma editoria e no mesmo veículo</h3>
              <div class="mosaico">${Prefs.tratarLidas(G.lista(d.relacionados)).map(recorte).join('')}</div>
            </section>` : ''}
        </article>
      </div>`;

    const form = $('#formComentario');
    if (form) form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const texto = $('#textoComentario').value.trim();
      if (!texto) return;
      try {
        await API.post(`/api/noticia/${a.id}/comentar`, { texto });
        avisar('Comentário enviado', cfg().moderacaoComentarios ? 'Aguardando moderação da redação.' : 'Já está no ar.');
        paginaNoticia(id);
      } catch (e) { avisar('Não deu', e.message, 'erro'); }
    });
  }

  /* ───────── VEÍCULOS ───────── */
  async function veiculos() {
    const d = await API.get('/api/bootstrap').catch(() => null);
    const lista = (d && Array.isArray(d.fontes) && d.fontes.length) ? G.fontes(d.fontes) : fontes();
    const grupos = secoes().map(s => ({ ...s, lista: lista.filter(f => f.secao === s.id) })).filter(g => g.lista.length);
    const paises = [...new Set(lista.map(f => f.pais).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const comAcervo = lista.filter(fonteNoAcervo).length;
    const cartao = (f) => { const st = statusFonte(f); return `<a class="cartao-veiculo ${f.ativa === false ? 'pausado' : ''} f-${esc(f.estilo || 'serif')}" href="#/fonte/${f.id}"
        data-busca="${esc((f.nome + ' ' + f.pais + ' ' + (f.regiao || '') + ' ' + (f.idioma || '')).toLowerCase())}" data-pais="${esc(f.pais)}" data-status="${st.classe}">
        <span class="cv-topo"><span class="fonte-sigla" aria-hidden="true">${esc(siglaFonte(f))}</span><span class="cv-status ${st.classe}">${f.ativa === false ? 'Pausado' : st.rotulo}</span></span>
        <span class="cv-nome">${f.bandeira || '📰'} ${esc(f.nome)}${Prefs.estado.fontes.includes(f.id) ? ' <span class="selo-fonte">na minha edição</span>' : ''}</span>
        <span class="cv-meta">${esc(f.pais)}${f.regiao && f.regiao !== f.pais ? ' · ' + esc(f.regiao) : ''} · ${esc((f.idioma || '').toUpperCase())}</span>
        <span class="cv-rodape">${fonteNoAcervo(f) ? `<b>${f.total || 0}</b> matérias no acervo` : 'feed em integração'}<span class="cv-dominio">${esc(dominioFonte(f))} ↗</span></span>
      </a>`; };

    app().innerHTML = `
      <div class="pagina">
        <div class="titulo-secao"><h2>Veículos monitorados</h2>
          <span class="contagem">${lista.length} jornais, agências, emissoras e portais · ${paises.length} países</span>
          <span class="empurra"><a class="link-tudo" href="#/minhas-fontes">Escolher minhas fontes →</a></span>
        </div>
        <p class="sub lede-catalogo">A banca completa do Foca News: imprensa regional brasileira, jornais nacionais, agências de checagem e a grande imprensa internacional — cada veículo com nome de praça, região, idioma e site oficial. <b>${comAcervo}</b> já têm matérias no acervo; os demais entram como <b>em integração</b>, sem notícia inventada com assinatura alheia. ${API.estado.demo ? '<b style="color:#1668b8">Modo demonstração: rode o servidor para sincronizar os feeds ao vivo.</b>' : ''}</p>

        <div class="barra-fontes barra-veiculos">
          <input id="buscaVeiculo" type="search" placeholder="Buscar por veículo, região ou país…" aria-label="Buscar veículo">
          <select id="filtroPaisVeiculo" aria-label="Filtrar por país"><option value="">todos os países</option>${paises.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select>
          <select id="filtroStatusVeiculo" aria-label="Filtrar por situação"><option value="">todas as situações</option><option value="no-acervo">com matérias no acervo</option><option value="em-integracao">em integração</option></select>
          <span class="contador-fontes" id="contadorVeiculos">${lista.length} veículos</span>
        </div>

        <div id="listaVeiculos">
        ${grupos.length ? grupos.map(g => `
          <section class="grupo-veiculos" data-grupo="${g.id}">
            <div class="titulo-secao" style="margin-top:1.6rem"><h2 style="font-size:1.4rem;font-family:var(--cond);letter-spacing:.16em">${g.icone || ''} ${esc(g.nome)}</h2><span class="contagem">${g.lista.length} veículos</span></div>
            <div class="grade-veiculos">${g.lista.map(cartao).join('')}</div>
          </section>`).join('') : G.vazio('Nenhum veículo para mostrar', 'O catálogo de fontes ainda não chegou. Tente de novo em instantes.')}
        </div>
        <div class="painel-vazio" id="veiculosVazio" hidden><b>Nenhum veículo nessa busca</b>Confira a grafia ou limpe os filtros para voltar à banca completa.</div>
      </div>`;

    const filtrarVeiculos = () => {
      const t = ($('#buscaVeiculo').value || '').toLowerCase().trim();
      const p = $('#filtroPaisVeiculo').value, s = $('#filtroStatusVeiculo').value;
      let visiveis = 0;
      $$('#listaVeiculos .grupo-veiculos').forEach(grupo => {
        let noGrupo = 0;
        $$('.cartao-veiculo', grupo).forEach(c => {
          const ok = (!t || c.dataset.busca.includes(t)) && (!p || c.dataset.pais === p) && (!s || c.dataset.status === s);
          c.style.display = ok ? '' : 'none'; if (ok) { visiveis++; noGrupo++; }
        });
        grupo.style.display = noGrupo ? '' : 'none';
      });
      $('#contadorVeiculos').textContent = `${visiveis} ${visiveis === 1 ? 'veículo' : 'veículos'}`;
      $('#veiculosVazio').hidden = visiveis > 0;
    };
    ['#buscaVeiculo', '#filtroPaisVeiculo', '#filtroStatusVeiculo'].forEach(sel => { const el = $(sel); if (el) el.addEventListener('input', filtrarVeiculos); });
  }

  /* ───────── PERFIL ───────── */
  /* ───────── ABA: MODO DE EXIBIÇÃO ───────── */
  async function exibicao() {
    carregando('Preparando os modos de exibição');
    const p = Prefs.estado;
    const amostra = await API.get('/api/noticias?' + Prefs.params({ tamanho: 'curto', limite: 3 }));
    const itens = Prefs.tratarLidas(amostra.itens || []);
    const detalhe = Prefs.EXIBICOES;

    const esqueleto = (id) => `<div class="amostra amostra-${id}" aria-hidden="true">
        ${p.imagens === false && id !== 'compacto' ? '' : '<i class="a-chapa"></i>'}
        <i class="a-veiculo"></i>
        <b class="a-titulo">Manchete da notícia</b>
        ${id === 'compacto'
        ? '<span class="a-resumo-curto">resumo em uma linha…</span>'
        : '<span class="a-resumo">O resumo completo da notícia aparece aqui, com duas ou três linhas de chamada.</span>'}
      </div>`;

    app().innerHTML = `
      <div class="pagina">
        <div class="titulo-secao">
          <h2>Modo de exibição</h2>
          <span class="contagem">vale para a capa, as editorias e a sua coleção</span>
          <span class="empurra"><a class="btn btn-mini btn-vazio" href="#/">ver no feed</a></span>
        </div>

        <div class="pergunta-bloco">
          <span class="kicker">aba 3 · modo de exibição</span>
          <h3>Como você quer ver cada notícia?</h3>
          <p class="sub">Primeiro escolha o <b>acabamento</b> do portal — experiência imersiva em 3D ou o jornal impresso clássico. Depois, o formato de cada notícia: dá para trocar quando quiser pelos atalhos <b>C</b>, <b>P</b> e <b>D</b> no cabeçalho.</p>
        </div>

        <section class="bloco-pref larga bloco-acabamento">
          <header><span class="bp-num">✨</span><h4>Acabamento do portal</h4></header>
          <div class="opcoes horizontal">
            ${Object.entries(Prefs.ACABAMENTOS).map(([id, a]) => `
              <label class="opcao-radio ${p.acabamento === id ? 'marcada' : ''}">
                <input type="radio" name="acabamento" value="${id}" ${p.acabamento === id ? 'checked' : ''}>
                <b>${esc(a.nome)}${id === 'imersivo' ? ' ✨' : ' 🎞'}</b>
                <small>${esc(a.resumo)} — ${esc(a.descricao)}</small>
              </label>`).join('')}
          </div>
          ${window.XP ? `<p class="mono nota-pref">Motor 3D: ${XP.estado.leve ? 'modo leve (o aparelho ou o sistema pediu menos efeitos)' : 'completo'} · último quadro medido: ${XP.estado.ultimoFps} fps</p>` : ''}
        </section>

        <div class="grade-exibicao">
          ${Object.entries(detalhe).map(([id, e]) => `
            <label class="cartao-exibicao ${p.exibicao === id ? 'escolhido' : ''}" data-ex="${id}">
              <input type="radio" name="exibicao" value="${id}" ${p.exibicao === id ? 'checked' : ''}>
              <header>
                <b>${esc(e.nome)}</b>
                <small>${esc(e.resumo)}</small>
              </header>
              ${esqueleto(id)}
              <p>${esc(e.descricao)}</p>
              <span class="marca-escolha">${p.exibicao === id ? '✓ em uso' : 'usar este'}</span>
            </label>`).join('')}
        </div>

        <section class="bloco-pref larga bloco-imagens">
          <header><span class="bp-num">🖼</span><h4>Imagens nas notícias</h4></header>
          <label class="opcao-check">
            <input type="checkbox" id="checkImagens" ${p.imagens === false ? '' : 'checked'}>
            <b>Quero imagens nas notícias</b>
            <small>Desmarcado, os recortes ficam só com texto — mais rápido de carregar e mais discreto para ler no trabalho. No modo leitura as imagens já saem de cena.</small>
          </label>
          <p class="mono nota-pref">Hoje o acervo tem <b>${fontes().length}</b> veículos enviando imagem; quando a foto não vem no feed, entra uma arte de editoria em meio-tom.</p>
        </section>

        <div class="titulo-secao"><h2>Prévia com o noticiário de agora</h2><span class="contagem">${esc(Prefs.exibicaoNome())}${p.imagens === false ? ' · sem imagens' : ''}</span></div>
        <div class="mosaico previa-exibicao">
          ${itens.slice(0, 3).map(recorte).join('') || '<div class="painel-vazio"><b>Sem matérias para prévia</b>Ajuste as fontes ou a tiragem.</div>'}
        </div>

        ${barraEdicao()}
      </div>`;

    $$('.cartao-exibicao').forEach(c => c.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await Prefs.definir({ exibicao: c.dataset.ex });
      montarChrome();
      await exibicao();
      const alvo = $('.cartao-exibicao.escolhido');
      if (alvo && typeof alvo.scrollIntoView === 'function') alvo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }));
    $$('input[name="acabamento"]').forEach(r => r.addEventListener('change', async () => {
      await Prefs.definir({ acabamento: r.value }, { silencioso: true });
      if (window.XP) { r.value === 'imersivo' ? XP.montarCena() : XP.desmontarCena(); XP.organizar(); }
      avisar(r.value === 'imersivo' ? 'Experiência imersiva ligada' : 'Papel clássico ligado', Prefs.ACABAMENTOS[r.value].descricao + '.');
      montarChrome();
      await exibicao();
    }));
    const cx = $('#checkImagens');
    cx && cx.addEventListener('change', async () => {
      await Prefs.definir({ imagens: cx.checked }, { silencioso: true });
      avisar(cx.checked ? 'Imagens ligadas' : 'Feed sem imagens', cx.checked ? 'As chapas em meio-tom voltam aos recortes.' : 'Os recortes agora são só texto.');
      montarChrome();
      await exibicao();
    });
  }

  /* ───────── ABA: COMO VOCÊ CONHECEU O APP ───────── */
  async function comoConheceu() {
    carregando('Carregando a pergunta');
    const p = Prefs.estado;
    const escolhida = (Prefs.ORIGENS || []).find(o => o.id === p.origem);
    const pedeDetalhe = ['indicacao', 'imprensa', 'outro'].includes(p.origem);

    app().innerHTML = `
      <div class="pagina">
        <div class="titulo-secao">
          <h2>Como você conheceu o Foca News?</h2>
          <span class="contagem">${p.origem ? 'resposta registrada em ' + esc(escolhida ? escolhida.nome : p.origem) : 'uma pergunta rápida'}</span>
        </div>

        <div class="pergunta-bloco">
          <span class="kicker">aba 4 · de onde vêm os leitores</span>
          <h3>Por onde você chegou até aqui?</h3>
          <p class="sub">A redação usa isso para saber onde o Foca News está sendo descoberto — e para investir nos canais que realmente trazem leitor. A resposta é gravada no seu perfil e aparece no painel apenas somada com a de outros leitores.</p>
        </div>

        <div class="grade-origens">
          ${(Prefs.ORIGENS || []).map(o => `
            <button class="cartao-origem ${p.origem === o.id ? 'escolhido' : ''}" data-origem="${o.id}">
              <span class="oi">${o.icone}</span>
              <b>${esc(o.nome)}</b>
              <small>${p.origem === o.id ? '✓ sua resposta' : 'escolher'}</small>
            </button>`).join('')}
        </div>

        <section class="bloco-pref larga ${pedeDetalhe ? '' : 'escondido'}" id="blocoDetalhe">
          <header><span class="bp-num">✍️</span><h4>Conte um pouco mais</h4></header>
          <div class="campo">
            <label for="campoDetalhe">${p.origem === 'indicacao' ? 'Quem te indicou?' : p.origem === 'imprensa' ? 'Onde você viu ou ouviu falar?' : 'Como foi?'}</label>
            <input id="campoDetalhe" maxlength="120" placeholder="${p.origem === 'indicacao' ? 'Ex.: minha irmã, o pessoal do trabalho…' : 'Ex.: podcast, reportagem, newsletter…'}" value="${esc(p.origemDetalhe || '')}">
          </div>
          <button class="btn btn-amarelo" id="btnSalvarDetalhe">Salvar resposta</button>
        </section>

        <div class="caixa-obrigado ${p.origem ? '' : 'escondido'}" id="caixaObrigado">
          <b>${p.origem ? 'Obrigado — resposta anotada.' : ''}</b>
          <span>${p.origem ? `Você chegou pelo caminho <b>${esc(escolhida ? escolhida.nome : p.origem)}</b>${p.origemDetalhe ? `: “${esc(p.origemDetalhe)}”` : ''}.` : ''}</span>
          <div class="chips">
            <a class="chip" href="#/exibicao">modo de exibição</a>
            <a class="chip" href="#/preferencias">meu jeito de ler</a>
            <a class="chip" href="#/minhas-fontes">minhas fontes</a>
            <a class="chip" href="#/perfil">meu perfil</a>
          </div>
        </div>

        <div class="titulo-secao"><h2>Enquanto isso, na capa</h2><span class="empurra"><a class="btn btn-mini btn-amarelo" href="#/">ir para a primeira página</a></span></div>
      </div>`;

    $$('.cartao-origem').forEach(b => b.addEventListener('click', async () => {
      await Prefs.definir({ origem: b.dataset.origem });
      montarChrome();
      await comoConheceu();
    }));
    const btn = $('#btnSalvarDetalhe');
    btn && btn.addEventListener('click', async () => {
      await Prefs.definir({ origemDetalhe: $('#campoDetalhe').value.trim() });
      await comoConheceu();
    });
  }

  async function perfil() {
    if (!E.usuario) {
      app().innerHTML = `<div class="pagina"><div class="painel-vazio"><b>Entre na sua conta</b>Sua coleção, curtidas, CEP e preferências ficam guardadas e seguem você em qualquer aparelho.</div>
        <div style="text-align:center"><button class="btn btn-amarelo" data-abrir="modal-auth">Entrar ou criar conta</button></div></div>`;
      return;
    }
    carregando('Abrindo sua edição');
    const d = await API.get('/api/eu');
    const u = G.obj(d.usuario);
    const prefs = G.lista(u.preferencias).map(nomeSecao);
    const p = Prefs.estado;
    app().innerHTML = `
      <div class="pagina">
        <div class="cartao-perfil">
          <span class="avatar" style="background:${esc(u.cor)}">${esc(u.nome[0].toUpperCase())}</span>
          <div>
            <h2>${esc(u.nome)}</h2>
            <p class="bio">${esc(u.bio || 'Sem descrição — conte em uma linha quem você é na sua biografia.')}</p>
            <div class="estatisticas">
              <div><b>${G.lista(d.salvos).length}</b><span>salvas</span></div>
              <div><b>${G.num(d.curtidos)}</b><span>curtidas</span></div>
              <div><b>${G.num(d.comentarios)}</b><span>comentários</span></div>
              <div><b>${G.num(d.lidas)}</b><span>lidas</span></div>
              <div><b>${esc(u.papel === 'admin' ? 'Administrador' : 'Leitor')}</b><span>perfil de acesso</span></div>
            </div>
          </div>
          <div class="acoes" style="display:flex;gap:.5rem;flex-direction:column">
            ${u.papel === 'admin' ? '<a class="btn btn-amarelo" href="#/admin">Painel da redação</a>' : ''}
            <a class="btn btn-vazio" href="#/preferencias">Meu jeito de ler</a>
          </div>
        </div>

        ${barraEdicao()}

        <div class="titulo-secao"><h2>Meu Foca News em quatro linhas</h2><span class="contagem">é isto que a sua conta guarda</span></div>
        <div class="resumo-leitor">
          <div class="item">
            <small>modo de exibição</small>
            <b><a href="#/exibicao">${esc(Prefs.exibicaoNome())}</a></b>
            <span>${esc(Prefs.exibicaoAtual().resumo)}${p.imagens === false ? ' · sem imagens' : ' · com imagens'}</span>
          </div>
          <div class="item">
            <small>como você chegou</small>
            <b><a href="#/como-conheceu">${esc(origemNome(p.origem))}</a></b>
            <span>${p.origemDetalhe ? esc(p.origemDetalhe) : (p.origem ? 'resposta registrada' : 'responda em um toque')}</span>
          </div>
          <div class="item">
            <small>minha região</small>
            <b>${p.cidade || p.uf ? esc([p.cidade, p.uf].filter(Boolean).join(' — ')) : 'não informada'}</b>
            <span>${esc(Prefs.resumo().regiao)}${p.regiaoNome ? ' · ' + esc(p.regiaoNome) : ''}</span>
          </div>
          <div class="item">
            <small>meu jeito de ler</small>
            <b><a href="#/preferencias">${esc(Prefs.resumo().modo)}</a></b>
            <span>tiragem ${esc(Prefs.resumo().tamanho)} · ${p.fontes.length ? p.fontes.length + ' fontes' : 'todas as fontes'} · ${p.temas.length} assunto(s) vigiado(s)</span>
          </div>
        </div>

        <p class="perfil-quota">
          <b>Contas do portal: ${(E.vagas ? E.vagas.leitores + E.vagas.usadas : 1)} — ${(E.vagas ? E.vagas.usadas : 1)} de administração (${(E.vagas ? E.vagas.limite : 2)} no máximo) e o resto de leitor.</b>
          A administração do Foca News nasce com duas contas, criadas na instalação; o cadastro aberto no site é sempre de leitor.
          ${u.papel === 'admin' ? ' Você pode gerenciar tudo no <a href="#/admin" style="color:var(--tinta)">painel da redação</a>.' : ' Precisa de outro acesso? Fale com a redação.'}
        </p>

        <div class="abas">
          <button class="ativo" data-aba="salvos">Minha coleção (${G.lista(d.salvos).length})</button>
          <button data-aba="conta">Perfil</button>
          <button data-aba="preferencias">Preferências</button>
        </div>

        <div id="painelAba">
          ${G.lista(d.salvos).length ? `<div class="mosaico">${Prefs.tratarLidas(G.lista(d.salvos)).map(recorte).join('')}</div>`
        : `<div class="painel-vazio"><b>Sua coleção está vazia</b>Use o botão “+ Salvar” nos recortes para montar sua edição pessoal.</div>`}
        </div>
      </div>`;

    const painel = $('#painelAba');
    $$('.abas button').forEach(b => b.addEventListener('click', async () => {
      $$('.abas button').forEach(x => x.classList.remove('ativo'));
      b.classList.add('ativo');
      if (b.dataset.aba === 'salvos') {
        painel.innerHTML = G.lista(d.salvos).length ? `<div class="mosaico">${Prefs.tratarLidas(G.lista(d.salvos)).map(recorte).join('')}</div>` : '<div class="painel-vazio"><b>Coleção vazia</b>Salve recortes para montar sua edição.</div>';
      }
      if (b.dataset.aba === 'conta') {
        painel.innerHTML = `
          <div class="grade-admin" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
            <div class="caixa"><header><h3>Dados da conta</h3></header><div class="miolo">
              <form class="form-editor" id="formPerfil">
                <div class="campo"><label>Nome de exibição</label><input name="nome" value="${esc(u.nome)}"></div>
                <div class="campo"><label>Biografia</label><textarea name="bio" style="min-height:80px">${esc(u.bio || '')}</textarea></div>
                <button class="btn btn-amarelo" type="submit">Salvar dados</button>
              </form>
            </div></div>
            <div class="caixa"><header><h3>Trocar senha</h3></header><div class="miolo">
              <form class="form-editor" id="formSenha">
                <div class="campo"><label>Senha atual</label><input type="password" name="senhaAtual" required></div>
                <div class="campo"><label>Nova senha</label><input type="password" name="senhaNova" required minlength="6"></div>
                <button class="btn btn-amarelo" type="submit">Trocar senha</button>
              </form>
            </div></div>
            <div class="caixa"><header><h3>Como você conheceu o Foca News</h3></header><div class="miolo">
              <p class="sub">Resposta registrada: <b style="color:var(--amarelo)">${esc(origemNome(p.origem))}</b>${p.origemDetalhe ? ` — “${esc(p.origemDetalhe)}”` : ''}.</p>
              <p class="mono" style="color:#6f6f6f">Usada só para a redação entender de onde vêm os leitores, de forma somada. Você pode trocar quando quiser.</p>
              <a class="btn btn-vazio" href="#/como-conheceu">${p.origem ? 'trocar minha resposta' : 'responder agora'}</a>
            </div></div>
            <div class="caixa"><header><h3>Perfil de acesso</h3></header><div class="miolo">
              <p class="sub">Você está no perfil <b style="color:var(--amarelo)">${esc(u.papel === 'admin' ? 'Administrador' : 'Leitor')}</b>.</p>
              <ul class="rodape-lista">
                <li>${u.papel === 'admin' ? '✓' : '·'} Curadoria da primeira página, destaques e status</li>
                <li>${u.papel === 'admin' ? '✓' : '·'} Painel de veículos, categorias e sincronização de feeds</li>
                <li>${u.papel === 'admin' ? '✓' : '·'} Moderação de comentários e gestão de usuários</li>
                <li>✓ Leitura, coleção, curtidas, comentários e preferências (todos os perfis)</li>
              </ul>
              <p class="mono" style="color:#6f6f6f;margin-top:.6rem">e-mail: ${esc(u.email)} · conta criada em ${new Date(u.criadoEm).toLocaleDateString('pt-BR')}</p>
            </div></div>
          </div>`;
        $('#formPerfil').addEventListener('submit', async (ev) => {
          ev.preventDefault(); const f = new FormData(ev.target);
          try { const r = await API.patch('/api/eu', { nome: f.get('nome'), bio: f.get('bio') }); E.usuario = { ...E.usuario, ...r.usuario }; avisar('Dados salvos', 'Seu perfil foi atualizado.'); montarChrome(); perfil(); }
          catch (e) { avisar('Erro', e.message, 'erro'); }
        });
        $('#formSenha').addEventListener('submit', async (ev) => {
          ev.preventDefault(); const f = new FormData(ev.target);
          try { await API.patch('/api/eu', { senhaAtual: f.get('senhaAtual'), senhaNova: f.get('senhaNova') }); avisar('Senha trocada', 'Use a nova senha no próximo acesso.'); ev.target.reset(); }
          catch (e) { avisar('Erro', e.message, 'erro'); }
        });
      }
      if (b.dataset.aba === 'preferencias') {
        painel.innerHTML = `
          <div class="grade-admin" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
            <div class="caixa"><header><h3>Minha edição</h3><span class="apoio">declarada nas abas novas</span></header><div class="miolo">
              <table class="tabela"><tbody>
                ${Object.entries(Prefs.resumo()).map(([k, v]) => `<tr><td class="mono" style="color:#8d8d8d">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}
                <tr><td class="mono" style="color:#8d8d8d">fontes</td><td><b>${p.fontes.length ? p.fontes.length + ' escolhidas' : 'todas (' + fontes().length + ')'}</b></td></tr>
                <tr><td class="mono" style="color:#8d8d8d">região</td><td><b>${p.cidade ? esc(p.cidade) + '/' + esc(p.uf) : (p.uf ? esc(p.uf) : 'não informada')}</b></td></tr>
                <tr><td class="mono" style="color:#8d8d8d">assuntos vigiados</td><td><b>${p.temas.length ? p.temas.map(t => esc(nomeTema(t).nome)).join(', ') : 'nenhum'}</b></td></tr>
              </tbody></table>
              <div style="display:flex;gap:.5rem;margin-top:.8rem;flex-wrap:wrap">
                <a class="btn btn-amarelo" href="#/preferencias">Ajustar</a>
                <a class="btn btn-vazio" href="#/minhas-fontes">Minhas fontes</a>
              </div>
            </div></div>
            <div class="caixa"><header><h3>Como o Foca News lê você</h3><span class="apoio">sinais de comportamento</span></header><div class="miolo">
              <p class="sub">Salvar uma matéria vale 2 pontos para a editoria; comentar vale 1. Suas editorias no topo:</p>
              <p style="font-family:var(--black);font-size:1.6rem;color:var(--amarelo)">${prefs.join(' · ') || 'nenhuma ainda'}</p>
              <p class="mono" style="color:#6f6f6f">Isso alimenta o motor de relevância da ordenação "relevantes".</p>
            </div></div>
          </div>`;
      }
    }));
  }

  /* ───────── PLANOS ───────── */
  async function planos() {
    const ativa = assinaturaAtiva();
    const anual = cicloPlanos === 'anual';
    app().innerHTML = `
      <div class="pagina">
        <div class="titulo-secao"><h2>Planos do Foca News</h2><span class="contagem">leitura gratuita continua — assinatura é profundidade</span></div>
        <p class="sub lede-catalogo">As notícias do dia seguem abertas para todo mundo. Quem assina recebe o que toma tempo da redação: <b>resumo do dia, análises, boletins e participação</b>. Preços de lançamento — a recomendação continua sendo começar pelo <b>VIP</b> e só abrir os outros quando os leitores mostrarem o que valorizam.</p>
        <div class="ciclo-planos" role="group" aria-label="Ciclo de cobrança">
          <button class="btn btn-mini ${!anual ? 'btn-amarelo' : ''}" data-ciclo="mensal">Mensal</button>
          <button class="btn btn-mini ${anual ? 'btn-amarelo' : ''}" data-ciclo="anual">Anual <span class="selo-economia">2 meses grátis</span></button>
        </div>
        <div class="grade-planos">
          ${PLANOS_FOCA.map(p => { const atual = ativa && ativa.plano === p.id; return `<div class="cartao-plano ${p.id === 'vip' ? 'destaque' : ''}">
            <span class="kicker">${esc(p.selo)}</span>
            <h3>${esc(p.nome)}</h3>
            <span class="preco">${precoBR(anual ? p.anual : p.mensal)}<small>/${anual ? 'ano' : 'mês'}</small></span>
            ${anual ? `<span class="preco-mes">equivale a ${precoBR(p.anual / 12)} por mês</span>` : ''}
            <ul>${p.itens.map(it => `<li>${esc(it)}</li>`).join('')}</ul>
            <button class="btn ${p.id === 'vip' ? 'btn-amarelo' : 'btn-vazio'} btn-largo" data-assinar="${p.id}" ${atual ? 'disabled' : ''}>${atual ? '✓ Seu plano atual' : 'Assinar ' + esc(p.nome)}</button>
          </div>`; }).join('')}
        </div>
        <p class="nota-planos">Ambiente de demonstração: o pagamento é <b>simulado</b> para testar o fluxo inteiro (assinar → liberar → Área VIP). No site publicado, este botão liga num gateway de verdade — Mercado Pago, Stripe ou similar — e é <b>o servidor quem confirma o pagamento</b> antes de liberar qualquer conteúdo. Nada de só esconder botão.</p>
        <div class="titulo-secao" style="margin-top:2.4rem"><h2>O que sustenta o produto</h2></div>
        <div class="grade-admin">
          <div class="caixa"><header><h3>Notícias frescas todo dia</h3></header><div class="miolo"><p class="sub">${fontes().length} veículos varridos diariamente pelo script de atualização: as manchetes velhas saem, as recentes entram — ninguém precisa lembrar de trocar.</p></div></div>
          <div class="caixa"><header><h3>Categorias de verdade</h3></header><div class="miolo"><p class="sub">Cada manchete recebe editoria + assuntos detectados no texto — é isso que alimenta as análises da Área VIP.</p></div></div>
          <div class="caixa"><header><h3>Personalização honesta</h3></header><div class="miolo"><p class="sub">Suas escolhas são explícitas e reversíveis: nenhum algoritmo secreto decidindo o que você não pode ver.</p></div></div>
        </div>
      </div>`;
    $$('[data-ciclo]').forEach(b => b.addEventListener('click', () => { cicloPlanos = b.dataset.ciclo; planos(); }));
    $$('[data-assinar]').forEach(b => b.addEventListener('click', () => abrirCheckout(b.dataset.assinar)));
  }

  function abrirCheckout(planoId) {
    const plano = PLANOS_FOCA.find(p => p.id === planoId);
    if (!plano) return;
    if (!E.usuario) { abrirAuth('registro', 'leitor'); avisar('Crie sua conta', 'A assinatura fica ligada à sua conta de leitor.'); return; }
    const m = $('#modal-checkout'); if (!m) return;
    const anual = cicloPlanos === 'anual';
    $('#conteudoCheckout').innerHTML = `
      <div class="auth-cabeca"><span class="selo">Assinatura Foca News</span>
        <h2 id="tituloCheckout">${esc(plano.nome)}</h2>
        <p>${precoBR(anual ? plano.anual : plano.mensal)} / ${anual ? 'ano' : 'mês'} · renova automaticamente · cancele quando quiser</p></div>
      <ul class="checkout-itens">${plano.itens.map(it => `<li>${esc(it)}</li>`).join('')}</ul>
      <div class="caixa-aviso"><b>Pagamento simulado.</b> Neste ambiente de demonstração nenhum valor é cobrado. No site publicado, esta tela é do gateway (Mercado Pago/Stripe) e a liberação só acontece após a confirmação do servidor.</div>
      <button class="btn btn-amarelo btn-largo" id="btnConfirmarAssinatura">Confirmar pagamento simulado</button>
      <button class="btn btn-vazio btn-largo" data-fechar style="margin-top:.5rem">Agora não</button>`;
    m.hidden = false;
    $('#btnConfirmarAssinatura').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Confirmando…';
      try {
        const r = await API.post('/api/assinaturas/assinar', { plano: plano.id, ciclo: cicloPlanos });
        if (r && r.usuario) E.usuario = { ...E.usuario, ...r.usuario };
        else if (E.usuario) E.usuario.assinatura = r.assinatura;
        fechar('modal-checkout'); montarChrome();
        avisar('Assinatura ativa', `${plano.nome} liberado. Bem-vindo(a) à Área VIP.`);
        location.hash = '#/vip';
      } catch (e) { avisar('Não deu', e.message, 'erro'); btn.disabled = false; btn.textContent = 'Confirmar pagamento simulado'; }
    });
  }

  /* ───────── ÁREA VIP ───────── */
  async function areaVip() {
    const u = E.usuario, ativa = assinaturaAtiva(), nivel = nivelAssinante();
    let dados = { resumoDia: [], porSecao: [], totalHoje: 0, tally: {}, meuVoto: '' };
    try { dados = { ...dados, ...G.obj(await API.get('/api/vip')) }; } catch (e) { /* sem servidor: mostra a vitrine */ }
    const iniciais = u ? String(u.nome || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() : 'FN';
    const cartaoAssinatura = u ? `
      <aside class="cartao-membro">
        <h3>Sua assinatura</h3>
        <div class="membro-quem"><span class="membro-avatar" aria-hidden="true">${esc(iniciais)}</span>
          <div><b>${esc(u.nome)}</b><span>${esc(u.email)}</span>
          <span>${ativa ? `${esc(ativa.nome)} · ${ativa.ciclo === 'anual' ? 'Anual' : 'Mensal'} — ${precoBR(ativa.preco)}/${ativa.ciclo === 'anual' ? 'ano' : 'mês'}` : 'Leitor gratuito'}</span></div></div>
        ${ativa ? `<span class="cv-status no-acervo">Ativa</span> <span class="membro-renova">renova em ${new Date(ativa.renovaEm).toLocaleDateString('pt-BR')}</span>
          <div class="membro-acoes"><a class="btn btn-mini btn-amarelo" href="#/planos">Trocar de plano</a><button class="btn btn-mini btn-vazio" id="btnCancelarAssinatura">Cancelar</button></div>`
        : `<p class="sub">Você lê tudo o que é aberto. A assinatura libera resumo do dia, análises e a conversa com a redação.</p><a class="btn btn-amarelo btn-largo" href="#/planos">Ver planos</a>`}
      </aside>` : `
      <aside class="cartao-membro"><h3>Sua assinatura</h3>
        <p class="sub">Entre ou crie sua conta para assinar e liberar esta área.</p>
        <button class="btn btn-amarelo btn-largo" data-abrir="modal-auth" data-modo="registro">Criar conta de leitor</button>
        <button class="btn btn-vazio btn-largo" data-abrir="modal-auth" style="margin-top:.5rem">Já tenho conta</button></aside>`;

    const trava = (precisa, titulo) => `<div class="vip-trava"><b>🔒 ${esc(titulo)}</b><span>${nivel ? `Exclusivo a partir do plano ${precisa}.` : 'Conteúdo de assinante.'}</span><a class="btn btn-mini btn-amarelo" href="#/planos">${nivel ? 'Fazer upgrade' : 'Assinar'}</a></div>`;
    const resumo = nivel >= 1 ? `
      <section class="caixa vip-bloco"><header><h3>☀️ Resumo do dia</h3><span class="apoio">${dados.totalHoje} manchetes nas últimas 24h</span></header>
        <div class="miolo"><ul class="resumo-dia">${dados.resumoDia.map(a => `<li><span class="mono">${new Date(a.publicadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span> <a href="#/noticia/${a.id}"><b>${esc(a.titulo)}</b></a> <span class="cv-meta">${a.bandeira || ''} ${esc(a.fonte)}</span></li>`).join('') || '<li>Nenhuma manchete recente agora — a atualização diária já já repõe.</li>'}</ul>
        <div class="boletins"><b>Boletins</b>
          <label><input type="checkbox" id="bolEmail" ${ativa && ativa.boletins && ativa.boletins.diario !== false ? 'checked' : ''}> Resumo diário por e-mail</label>
          <label><input type="checkbox" id="bolWhats" ${ativa && ativa.boletins && ativa.boletins.whatsapp ? 'checked' : ''}> Avisos por WhatsApp <span class="mono">(só com o seu consentimento)</span></label>
        </div></div></section>` : trava('Foca News Plus', 'Resumo do dia e boletins');
    const analises = nivel >= 2 ? `
      <section class="caixa vip-bloco"><header><h3>🔎 O dia por editoria</h3><span class="apoio">análise a partir do acervo de hoje</span></header>
        <div class="miolo"><div class="barras-h">${dados.porSecao.map(([s, n]) => `<div><span>${esc(nomeSecao(s))}</span><i style="width:${Math.max(4, Math.round(n / Math.max(1, dados.porSecao[0][1]) * 100))}%"></i><b>${n}</b></div>`).join('')}</div>
        <p class="sub">Leitura da redação: onde o noticiário concentrou força hoje — base das reportagens especiais e das perguntas que levamos às fontes.</p></div></section>
      <section class="caixa vip-bloco"><header><h3>🗳️ Enquete da redação</h3><span class="apoio">assinantes VIP e Premium</span></header>
        <div class="miolo"><p class="sub"><b>Qual editoria merece a próxima reportagem especial?</b></p>
        <div class="enquete">${['Politica', 'Economia', 'Tecnologia', 'Esportes'].map(o => `<button class="btn btn-mini ${dados.meuVoto === o ? 'btn-amarelo' : 'btn-vazio'}" data-voto="${o}">${o}${dados.tally[o] ? ` · ${dados.tally[o]}` : ''}</button>`).join('')}</div>
        ${dados.meuVoto ? `<p class="mono nota-voto">seu voto: ${esc(dados.meuVoto)}</p>` : ''}</div></section>` : trava('Foca News VIP', 'Análises e enquetes da redação');
    const relatorio = nivel >= 3 ? `
      <section class="caixa vip-bloco destaque-premium"><header><h3>🏅 Relatório do apoiador</h3><span class="apoio">Premium</span></header>
        <div class="miolo"><p><span class="selo-apoiador">★ Apoiador Foca News</span></p>
        <p class="sub">Seu relatório temático mensal é montado sobre estes mesmos números — editorias em alta, temas recorrentes e o que a redação vai perseguir. Você também vota nas pautas futuras e encontra a equipe nos encontros on-line anunciados aqui.</p></div></section>` : trava('Foca News Premium', 'Relatórios mensais e selo de apoiador');

    app().innerHTML = `
      <div class="pagina">
        <div class="titulo-secao"><h2>Área VIP</h2><span class="contagem">informação com profundidade, para assinantes</span>
          <span class="empurra"><a class="link-tudo" href="#/planos">Planos →</a></span></div>
        <div class="vip-grade">
          <div class="vip-conteudo">${resumo}${analises}${relatorio}</div>
          ${cartaoAssinatura}
        </div>
      </div>`;
    const cancelar = $('#btnCancelarAssinatura');
    if (cancelar) cancelar.addEventListener('click', async () => {
      try { const r = await API.post('/api/assinaturas/cancelar', {}); if (E.usuario) E.usuario.assinatura = r.assinatura; montarChrome(); areaVip(); avisar('Assinatura cancelada', 'Você mantém o acesso aberto de leitor.'); }
      catch (e) { avisar('Não deu', e.message, 'erro'); }
    });
    const salvarBoletins = async () => {
      try { const r = await API.post('/api/vip/boletins', { boletins: { diario: $('#bolEmail').checked, whatsapp: $('#bolWhats').checked } }); if (E.usuario) E.usuario.assinatura = r.assinatura; avisar('Boletins atualizados', 'Vale a partir do próximo resumo.'); }
      catch (e) { avisar('Não deu', e.message, 'erro'); }
    };
    if ($('#bolEmail')) $('#bolEmail').addEventListener('change', salvarBoletins);
    if ($('#bolWhats')) $('#bolWhats').addEventListener('change', salvarBoletins);
    $$('[data-voto]').forEach(b => b.addEventListener('click', async () => {
      try { await API.post('/api/vip/enquete', { opcao: b.dataset.voto }); areaVip(); avisar('Voto registrado', 'Obrigado por pautar a redação.'); }
      catch (e) { avisar('Não deu', e.message, 'erro'); }
    }));
  }

  /* ═════════ MODAL DE ACESSO ═════════ */
  function abrirAuth(modo = 'login', papel = 'leitor') {
    const m = $('#modal-auth');
    /* Conta de administrador não se cria na tela: quem escolhe "Administrador"
       está entrando com uma conta da redação. A senha nunca vem preenchida. */
    if (papel === 'admin') modo = 'login';
    m.hidden = false;
    m.dataset.papel = papel;
    $('#campoNome').hidden = modo !== 'registro';
    $('#tituloAuth').textContent = modo === 'registro' ? 'Criar sua conta' : 'Entre na sua edição';
    $('#btnAuth').textContent = (modo === 'registro' ? 'Criar conta de ' : 'Entrar como ') + (papel === 'admin' ? 'Administrador' : 'Leitor');
    $('#textoTroca').textContent = modo === 'registro' ? 'Já tem conta?' : 'Ainda não tem conta?';
    $('#linkTroca').textContent = modo === 'registro' ? 'Entrar' : 'Criar conta de Leitor';
    /* Administrador não é oferecido no cadastro: sem link de criar conta aqui. */
    $('#linkTroca').hidden = papel === 'admin';
    const troca = $('#linkTroca').closest('.troca-modo');
    if (troca) troca.hidden = papel === 'admin';
    $('#formAuth').dataset.modo = modo;
    $('#avisoAuth').hidden = true;
    const nota = $('#notaVagas');
    if (nota) {
      nota.classList.toggle('nota-info', papel === 'admin');
      nota.hidden = papel !== 'admin';
      nota.classList.add('nota-info');
      nota.innerHTML = `<b>Acesso da redação.</b> As contas de administrador são criadas na instalação do portal — use o e-mail e a senha da redação. Para virar administrador, peça a um dos responsáveis.`;
    }
    $('#btnAuth').disabled = false;
    $$('.perfil').forEach(b => b.classList.toggle('ativo', b.dataset.perfil === papel));
    $('#authEmail').value = ''; $('#authSenha').value = '';
    setTimeout(() => $(modo === 'registro' ? '#authNome' : '#authEmail').focus(), 60);
  }
  const fechar = (id) => { const m = $('#' + id); if (m) m.hidden = true; };

  async function submeterAuth(ev) {
    ev.preventDefault();
    const modo = $('#formAuth').dataset.modo || 'login';
    const papel = $('#modal-auth').dataset.papel || 'leitor';
    const f = new FormData(ev.target);
    const aviso = $('#avisoAuth');
    const btn = $('#btnAuth');
    btn.disabled = true;
    try {
      const r = modo === 'registro'
        ? await API.post('/api/auth/registro', { nome: f.get('nome'), email: f.get('email'), senha: f.get('senha'), papel, preferencias: Prefs.estado })
        : await API.post('/api/auth/login', { email: f.get('email'), senha: f.get('senha') });
      API.guardarToken(r.token);
      E.usuario = r.usuario;
      if (r.usuario.preferenciasLeitura) Prefs.carregar(r.usuario.preferenciasLeitura);
      // normaliza antes de gravar: uma resposta parcial não pode apagar o estado do site
      G.mesclar(E, G.bootstrap(await API.get('/api/bootstrap').catch(() => null)));
      fechar('modal-auth');
      montarChrome();
      avisar(`Bem-vindo, ${r.usuario.nome.split(' ')[0]}`, r.usuario.papel === 'admin' ? 'Painel da redação liberado.' : 'Suas fontes, CEP e preferências estão guardados.');
      rotear();
    } catch (e) {
      aviso.hidden = false;
      aviso.textContent = e.message;
    } finally { btn.disabled = false; }
  }

  /* ═════════ AÇÕES ═════════ */
  async function tratarClique(ev) {
    const abrir = ev.target.closest('[data-abrir]');
    if (abrir) {
      ev.preventDefault();
      const perfil = abrir.dataset.perfil || 'leitor';
      montarChrome();
      return abrirAuth(abrir.dataset.modo || 'login', perfil);
    }
    if (ev.target.closest('[data-fechar]')) { ev.target.closest('.cortina').hidden = true; return; }
    if (ev.target.classList.contains('cortina')) { ev.target.hidden = true; return; }

    const botaoLink = ev.target.closest('.link-btn');
    if (botaoLink && botaoLink.dataset.acao === 'mostrar-pesadas') {
      await Prefs.definir({ pesada: 'mostrar' }, { silencioso: true });
      avisar('Conteúdo sensível liberado', 'Agora a capa mostra tudo, inclusive as notícias pesadas.');
      rotear();
      return;
    }

    const chapaEl = ev.target.closest('.chapa');
    if (chapaEl && !ev.target.closest('button,a')) {
      const img = chapaEl.dataset.chapa || chapaEl.querySelector('img').src;
      const legenda = chapaEl.dataset.legenda || chapaEl.querySelector('img').alt;
      $('#conteudoArtigo').innerHTML = `<figure style="margin:0">
        <img src="${esc(img)}" alt="${esc(legenda)}" style="display:block;width:100%;filter:grayscale(1) contrast(1.18);border:10px solid #fdfcf7;outline:1px solid #000">
        <figcaption style="background:var(--amarelo);color:var(--tinta);padding:.5rem .7rem;font-family:var(--serif);font-style:italic">${esc(legenda)} · chapa ampliada</figcaption>
      </figure>`;
      $('#modal-artigo').hidden = false;
      return;
    }

    const btn = ev.target.closest('[data-acao]');
    if (btn) {
      ev.preventDefault();
      const { acao, id } = btn.dataset;
      if (acao === 'tentar-de-novo') { montarChrome(); return rotear(); }
      if (!E.usuario && acao !== 'compartilhar') {
        montarChrome();
        return abrirAuth('login', 'leitor');
      }
      try {
        if (acao === 'curtir') {
          const r = await API.post(`/api/noticia/${id}/curtir`);
          $$(`[data-cont="${id}"]`).forEach(s => s.textContent = r.curtidas);
          avisar(r.curtido ? 'Curtida registrada' : 'Curtida removida', 'Isso alimenta a sua capa personalizada.');
        }
        if (acao === 'salvar') {
          const r = await API.post(`/api/noticia/${id}/salvar`);
          avisar(r.salvo ? 'Salvo na sua coleção' : 'Removido da coleção', 'Acesse em Minha conta → Minha coleção.');
          btn.textContent = r.salvo ? '✓ Na sua coleção' : '+ Salvar para depois';
        }
        if (acao === 'compartilhar') {
          const url = location.origin + location.pathname + '#/noticia/' + id;
          await navigator.clipboard.writeText(url).catch(() => {});
          avisar('Link copiado', url);
        }
      } catch (e) {
        if (e.status === 401) { montarChrome(); return abrirAuth('login'); }
        avisar('Ops', e.message, 'erro');
      }
      return;
    }

    const apagar = ev.target.closest('[data-apagar-coment]');
    if (apagar) {
      const id = apagar.dataset.apagarComent;
      try {
        await API.del('/api/comentario/' + id);
        apagar.closest('.comentario').remove();
        avisar('Comentário apagado', '');
      } catch (e) { avisar('Ops', e.message, 'erro'); }
    }
  }

  /* ═════════ BOOT ═════════ */
  async function iniciar() {
    /* Boot à prova de falhas: se o pacote inicial não vier, o site ainda
       abre — com a moldura, um aviso honesto e um botão de tentar de novo. */
    try {
      await API.iniciar();
    } catch (e) {
      console.error('[boot]', e);
      E.erroBoot = E.erroBoot || G.amigavel(e);
    }
    Prefs.carregar(E.usuario ? E.usuario.preferenciasLeitura : null);

    // ?acabamento=papel|imersivo · ?modo=leitura|jornal · ?exibicao=compacto|padrao|destaque
    // abrem o portal já no jeito pedido (bom para compartilhar um link e para conferir na mão)
    const pedido = new URLSearchParams(location.search);
    const ajustes = {};
    const acab = pedido.get('acabamento');
    if (acab && Prefs.ACABAMENTOS[acab]) ajustes.acabamento = acab;
    const md = pedido.get('modo');
    if (md === 'leitura' || md === 'jornal') ajustes.modo = md;
    const ex = pedido.get('exibicao');
    if (ex && Prefs.EXIBICOES[ex]) ajustes.exibicao = ex;
    if (Object.keys(ajustes).length) await Prefs.definir(ajustes, { silencioso: true });
    montarChrome();
    if (E.erroBoot) avisar('Conteúdo parcial', E.erroBoot, 'erro');   // aviso da casa (toast), sem mexer no layout
    await rotear();

    window.addEventListener('hashchange', rotear);
    document.addEventListener('click', tratarClique);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') $$('.cortina').forEach(m => m.hidden = true);
      if (ev.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        ev.preventDefault(); $('#campoBusca').focus();
      }
    });
    $('#formBusca').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = $('#campoBusca').value.trim();
      if (t) location.hash = '#/busca/' + encodeURIComponent(t);
    });
    $('#formAuth').addEventListener('submit', submeterAuth);

    $$('.perfil').forEach(b => b.addEventListener('click', () => abrirAuth($('#formAuth').dataset.modo || 'login', b.dataset.perfil)));
    $('#linkTroca').addEventListener('click', (ev) => {
      ev.preventDefault();
      const modo = ($('#formAuth').dataset.modo || 'login') === 'login' ? 'registro' : 'login';
      abrirAuth(modo, $('#modal-auth').dataset.papel);
    });
  }

  return { iniciar, rotear, avisar, recorte, montarChrome, esc, nomeSecao, abrirAuth, barraEdicao, arteDe, ARTES };
})();

window.addEventListener('DOMContentLoaded', () => App.iniciar());

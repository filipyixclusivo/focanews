/* ══════════════════════════════════════════════════════════════
   Foca News — camada de dados do navegador
   • Fala com a API Node (/api/...) quando o servidor está no ar.
   • Se o arquivo for aberto direto (file://) ou a API falhar, entra em
     MODO DEMONSTRAÇÃO: reproduz as mesmas rotas em memória a partir do
     acervo embutido em /data/seed.js.
   ══════════════════════════════════════════════════════════════ */
const API = (() => {
  const CHAVE_TOKEN = 'grid_token';
  /** O Foca News nasce com 2 contas de administração; leitor entra sem limite. */
  const LIMITE_ADMINS = 2;
  const ADMIN_PADRAO = [
    { id: 'u-admin', nome: 'F. Pellegrini', email: 'fpellegrini348@gmail.com' },
    { id: 'u-admin2', nome: 'João Daniel', email: 'joaodanielm17@gmail.com' },
  ];
  const adminsEm = (lista) => G.lista(lista).filter(u => u.papel === 'admin').length;
  const CHAVE_DEMO = 'grid_demo_estado';

  const estado = {
    demo: false,
    token: localStorage.getItem(CHAVE_TOKEN) || '',
    usuario: null,
    config: { nomePortal: 'Foca News', slogan: '', descricao: '', ticker: [], rodape: '', planos: [] },
    secoes: [],
    fontes: [],
    temas: [],
    tamanhos: {},
    preferenciasPadrao: {},
    exibicoes: {},
    origens: [],
    vagas: { limite: 2, usadas: 0, restantes: 2 },
    total: 0,
    artigos: [],
    atualizadoEm: null,
  };

  /* ───────── utilidades ───────── */
  const agora = () => new Date().toISOString();
  const hoje = () => agora().slice(0, 10);
  const uid = (p) => p + Math.random().toString(36).slice(2, 11);

  /* ───────── classificação (mesma taxonomia do servidor) ───────── */
  const TAX = () => window.__TAXONOMIA__ || { temas: [], pesada: [], ufs: {}, cidades: {}, tamanhos: {}, preferenciasPadrao: {} };
  const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const _fichas = new Map();
  function classificar(a) {
    if (_fichas.has(a.id)) return _fichas.get(a.id);
    const t = TAX();
    const texto = normalizar((a.titulo || '') + ' ' + String(a.resumo || '').slice(0, 340));
    const temas = [];
    for (const tema of (t.temas || [])) {
      if (tema.chaves.some(c => texto.includes(normalizar(c)))) temas.push(tema.id);
      if (temas.length >= 3) break;
    }
    const pesada = (t.pesada || []).some(k => texto.includes(normalizar(k)));
    const cidades = [];
    for (const [cidade, uf] of Object.entries(t.cidades || {})) {
      if (new RegExp(`\\b${cidade}\\b`).test(texto)) cidades.push({ cidade, uf });
    }
    const ufs = new Set(cidades.map(c => c.uf));
    for (const [sigla, info] of Object.entries(t.ufs || {})) {
      const re = new RegExp('\\b' + normalizar(info[0]).replace(/\s+/g, '\\s+') + '\\b');
      if (re.test(texto)) ufs.add(sigla);
    }
    const ficha = { temas, pesada, geo: { cidades, ufs: [...ufs], nacional: a.pais === 'Brasil' || ufs.size > 0 } };
    _fichas.set(a.id, ficha);
    return ficha;
  }

  async function hashSenha(txt) {
    const base = 'grid::' + txt;
    if (crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // reserva simples (ambientes sem WebCrypto, ex.: file://)
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < base.length; i++) {
      h1 = (h1 ^ base.charCodeAt(i)) * 16777619 >>> 0;
      h2 = (h2 + base.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return 'fb' + h1.toString(16) + h2.toString(16);
  }
  const chaveDeLink = (s) => String(s || '').replace(/[?#].*$/, '').trim().toLowerCase();
  const tempoRelativo = (iso) => {
    const seg = (Date.now() - new Date(iso).getTime()) / 1000;
    if (seg < 90) return 'agora mesmo';
    if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
    if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
    if (seg < 604800) return `há ${Math.floor(seg / 86400)} d`;
    return new Date(iso).toLocaleDateString('pt-BR');
  };
  const dataLonga = (iso) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  /* ═════════ MODO DEMONSTRAÇÃO ═════════ */
  const semente = () => (window.__SEED__ && window.__SEED__.artigos) ? window.__SEED__ : { artigos: [], fontes: [], secoes: [] };

  /** Espelho de resumoPreferencias() do servidor, para o painel funcionar offline. */
  function resumoPreferenciasDemo() {
    const t = TAX();
    const todas = Object.values(demo ? demo.preferencias : {});
    const contar = (campo) => todas.reduce((m, p) => { const v = p[campo]; m[v] = (m[v] || 0) + 1; return m; }, {});
    const temas = {};
    for (const p of todas) for (const x of (p.temas || [])) temas[x] = (temas[x] || 0) + 1;
    const regioes = {};
    for (const p of todas) if (p.uf) regioes[p.uf] = (regioes[p.uf] || 0) + 1;
    return {
      total: todas.length,
      modos: contar('modo'), tamanhos: contar('tamanho'), ordens: contar('ordem'), lidas: contar('lidas'),
      exibicoes: contar('exibicao'), acabamentos: contar('acabamento'),
      comImagens: todas.filter(p => p.imagens !== false).length,
      pesada: contar('pesada'), regiao: contar('regiao'),
      fimSemana: todas.filter(p => p.fimSemana).length,
      comCep: todas.filter(p => p.cep).length,
      comFontesEscolhidas: todas.filter(p => (p.fontes || []).length).length,
      fontesMediasPorLeitor: todas.length ? Math.round(todas.reduce((s, p) => s + (p.fontes || []).length, 0) / todas.length) : 0,
      temasMaisSeguidos: Object.entries(temas).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([id, n]) => ({ tema: ((t.temas || []).find(x => x.id === id) || {}).nome || id, total: n })),
      regioesMaisUsadas: Object.entries(regioes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([uf, n]) => ({ uf, total: n })),
      cepsConsultados: d.metricas.ceps || {},
      origens: (t.origens || []).map(o => ({
        id: o.id, nome: o.nome, icone: o.icone,
        total: todas.filter(p => p.origem === o.id).length,
        detalhes: todas.filter(p => p.origem === o.id && p.origemDetalhe).map(p => p.origemDetalhe).slice(0, 6),
      })).sort((a, b) => b.total - a.total),
      semRespostaOrigem: todas.filter(p => !p.origem).length,
    };
  }

  function estadoDemoNovo() {
    const s = G.obj(semente());
    return {
      artigos: G.artigos(s.artigos).map(a => ({ ...a, imagemOriginal: a.imagem || '', imagem: a.imagem || App.arteDe(a.secao), status: 'publicado', destaque: false, fixado: false, curtidas: 0, visualizacoes: 0 })),
      fontes: G.fontes(s.fontes).map(f => ({ ...f, ativa: true, ultimaSync: null, ultimoStatus: 'semente', totalImportado: 0 })),
      /* No modo demonstração (servidor fora do ar) a senha é a convenção do sandbox;
         aqui o que importa é o papel e o e-mail das contas de administração. */
      usuarios: ADMIN_PADRAO.map(u => ({ ...u, papel: 'admin', cor: '#2f9dff', bio: 'Redação — curadoria da primeira página.', ativo: true, criadoEm: agora(), senha: 'demo' })),
      sessoes: {}, comentarios: [], salvos: {}, curtidas: {}, lidas: {}, auditoria: [], demo: true, versao: 4,
      preferencias: {
        'u-admin': { ...(TAX().preferenciasPadrao || {}) },
        'u-leitor': { ...(TAX().preferenciasPadrao || {}), origem: 'indicacao', origemDetalhe: 'veio pela redação' },
      },
      metricas: { leituras: {}, sincronizacoes: [] },
      config: {
        nomePortal: 'Foca News',
        slogan: 'Todos os jornais do mundo. Uma só primeira página.',
        descricao: `Foca News: manchetes coletadas dos feeds de ${s.fontes.length} veículos do Brasil e do mundo. Foca no que tá rolando.`,
        rodape: `Foca News reúne ${s.fontes.length} veículos em um só lugar. Se virou assunto, a Foca tá de olho.`,
        ticker: s.artigos.slice(0, 12).map(a => a.titulo),
        secoesDestaque: ['mundo', 'brasil', 'economia', 'esportes'],
        moderacaoComentarios: false, intervaloMinutos: 20, planos: [],
      },
      secoes: G.lista(s.secoes),
    };
  }
  let demo = null;
  const carregarDemo = () => {
    if (demo) return demo;
    let bruto = null;
    try { bruto = JSON.parse(localStorage.getItem(CHAVE_DEMO) || 'null'); } catch (e) { bruto = null; }
    /* Estado velho, parcial ou corrompido no navegador era a causa nº 1 de
       "Cannot read properties of undefined": o guarda antigo só checava
       `artigos`, e o resto (fontes, usuarios, comentarios, salvos…) vinha
       undefined. Aqui tudo é completado a partir de um estado novo. */
    const completo = G.estadoDemo(bruto, estadoDemoNovo);
    if (!G.demoUtil(completo)) {
      // sem acervo utilizável: começa limpo e regrava
      demo = G.estadoDemo(null, estadoDemoNovo);
      try { localStorage.setItem(CHAVE_DEMO, JSON.stringify(demo)); } catch (e) { /* cota */ }
      return demo;
    }
    demo = completo;
    return demo;
  };
  const gravarDemo = () => { try { localStorage.setItem(CHAVE_DEMO, JSON.stringify(demo)); } catch (e) { /* cota */ } };
  const zerarDemo = () => { localStorage.removeItem(CHAVE_DEMO); localStorage.removeItem('grid_leitor_senha'); demo = null; };

  const PLANOS_DEMO = { plus: { nome: 'Foca News Plus', mensal: 9.9, anual: 99, nivel: 1 }, vip: { nome: 'Foca News VIP', mensal: 19.9, anual: 199, nivel: 2 }, premium: { nome: 'Foca News Premium', mensal: 39.9, anual: 399, nivel: 3 } };
  const publicoDemo = (u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, bio: u.bio || '', cor: u.cor, criadoEm: u.criadoEm, ativo: u.ativo !== false, assinatura: u.assinatura || null });
  const usuarioDemo = () => {
    const d = carregarDemo();
    const s = G.obj(d.sessoes)[estado.token];
    if (!s || !s.usuarioId) return null;
    return G.lista(d.usuarios).find(u => u.id === s.usuarioId) || null;
  };
  const preferenciasDemo = (id) => {
    const d = carregarDemo(), cont = {};
    G.lista(G.obj(d.salvos)[id]).forEach(aid => { const a = G.lista(d.artigos).find(x => x.id === aid); if (a) cont[a.secao] = (cont[a.secao] || 0) + 2; });
    G.lista(d.comentarios).filter(c => c.autorId === id).forEach(c => { const a = G.lista(d.artigos).find(x => x.id === c.artigoId); if (a) cont[a.secao] = (cont[a.secao] || 0) + 1; });
    return Object.entries(cont).sort((a, b) => b[1] - a[1]).map(([x]) => x).slice(0, 3);
  };
  /** Preferências de leitura gravadas no demo (por usuário). */
  function prefsLeitura(usuarioId) {
    const d = carregarDemo();
    const padrao = TAX().preferenciasPadrao || {};
    return { ...padrao, ...((usuarioId && d.preferencias[usuarioId]) || {}) };
  }

  const cruzarDemo = (a, u) => {
    const f = classificar(a);
    const d = carregarDemo();
    return {
      ...a,
      tempoRelativo: tempoRelativo(a.publicadoEm),
      salvo: u ? G.lista(d.salvos[u.id]).includes(a.id) : false,
      curtido: u ? G.lista(d.curtidas[u.id]).includes(a.id) : false,
      lida: u ? G.lista(d.lidas[u.id]).includes(a.id) : false,
      temas: f.temas,
      pesada: f.pesada,
      geo: { ufs: f.geo.ufs.slice(0, 2), nacional: f.geo.nacional },
      totalComentarios: G.lista(d.comentarios).filter(c => c.artigoId === a.id && c.status === 'publicado').length,
      fonteAtiva: (G.lista(d.fontes).find(f => f.id === a.fonteId) || {}).ativa !== false,
    };
  };

  async function demoReq(metodo, caminho, corpoDados) {
    const d = carregarDemo();
    /* ── Supabase: a sessão real (quando configurada) manda no lugar da demo ── */
    const SB = window.FOCA_DB;
    let sbPerfil = null;
    if (SB && SB.configurado && SB.sessao()) {
      try { sbPerfil = await SB.perfilAtual(); } catch (e) { sbPerfil = null; }
      if (sbPerfil && !SB.sincronizado) {
        try {
          const listas = await SB.minhasListas(sbPerfil.id);
          d.curtidas[sbPerfil.id] = listas.curtidas;
          d.salvos[sbPerfil.id] = listas.salvos;
          gravarDemo(); SB.sincronizado = true;
        } catch (e) { /* segue com o espelho local */ }
      }
    }
    /* Com o Supabase ativo, sessão de demonstração antiga NÃO vale: sem login
       real, o site pede entrada — assim curtida/comentário nunca cai no limbo
       local achando que foi para o banco. */
    const u = sbPerfil
      ? { id: sbPerfil.id, nome: sbPerfil.nome, email: sbPerfil.email, papel: sbPerfil.papel, bio: sbPerfil.bio || '', cor: '#2f9dff', ativo: sbPerfil.ativo !== false, criadoEm: sbPerfil.criado_em }
      : (SB && SB.configurado ? null : usuarioDemo());
    const [rota, buscaStr] = caminho.split('?');
    const q = Object.fromEntries(new URLSearchParams(buscaStr || ''));
    const partes = rota.split('/').filter(Boolean);   // ['api', ...]
    const r = partes.slice(1).join('/');
    const erro = (mensagem, status) => { const e = new Error(mensagem); e.status = status || 400; throw e; };
    const logs = (acao, det) => { d.auditoria.unshift({ id: uid('log-'), quando: agora(), usuario: u ? u.nome : 'sistema', papel: u ? u.papel : '-', acao, detalhe: det || '' }); d.auditoria = d.auditoria.slice(0, 300); };
    const publicados = () => d.artigos.filter(a => a.status === 'publicado');

    /* ── SUPABASE: login real e perfil no banco ── */
    const montarUsuarioSb = (perfil) => ({
      id: perfil.id, nome: perfil.nome, email: perfil.email, papel: perfil.papel,
      bio: perfil.bio || '', cor: '#2f9dff', criadoEm: perfil.criado_em, ativo: perfil.ativo !== false,
      assinatura: null,
      preferencias: preferenciasDemo(perfil.id),
      preferenciasLeitura: { ...prefsLeitura(perfil.id), ...((perfil.preferencias && typeof perfil.preferencias === 'object') ? perfil.preferencias : {}) },
    });
    if (SB && SB.configurado) {
      if (r === 'auth/registro') {
        const b = corpoDados || {};
        if (!b.nome || !b.email || !b.senha) erro('Informe nome, e-mail e senha.');
        if (String(b.senha).length < 6) erro('A senha precisa ter ao menos 6 caracteres.');
        if (b.papel === 'admin') erro('Contas de administrador são criadas pela própria redação — o cadastro aqui é de leitor.', 403);
        await SB.registrar(String(b.nome), String(b.email).toLowerCase(), String(b.senha));
        const perfil = await SB.perfilAtual(true);
        return { token: (SB.sessao() || {}).access_token, usuario: montarUsuarioSb(perfil) };
      }
      if (r === 'auth/login') {
        const b = corpoDados || {};
        if (!b.email || !b.senha) erro('Informe e-mail e senha.', 401);
        await SB.entrar(String(b.email).toLowerCase(), String(b.senha));
        const perfil = await SB.perfilAtual(true);
        if (perfil && perfil.ativo === false) { await SB.sairRemoto(); erro('Esta conta está suspensa.', 403); }
        return { token: (SB.sessao() || {}).access_token, usuario: montarUsuarioSb(perfil) };
      }
      if (r === 'auth/sair') {
        await SB.sairRemoto();
        estado.token = ''; localStorage.removeItem(CHAVE_TOKEN);
        return { ok: true };
      }
      if (sbPerfil && r === 'eu' && metodo === 'PATCH') {
        const patch = {};
        if (corpoDados.nome) patch.nome = String(corpoDados.nome).slice(0, 80);
        if (corpoDados.bio !== undefined) patch.bio = String(corpoDados.bio).slice(0, 240);
        const perfil = await SB.atualizarPerfil(patch);
        return { usuario: montarUsuarioSb(perfil) };
      }
      if (sbPerfil && r === 'eu/preferencias' && metodo === 'PATCH') {
        const atuais = (sbPerfil.preferencias && typeof sbPerfil.preferencias === 'object') ? sbPerfil.preferencias : {};
        const merged = { ...atuais, ...(corpoDados || {}) };
        await SB.atualizarPerfil({ preferencias: merged });
        d.preferencias[u.id] = { ...prefsLeitura(u.id), ...merged }; gravarDemo();
        return { preferencias: merged };
      }
    }

    /* comentários da notícia: Supabase quando ativo, espelho local como reserva */
    const comentariosDaNoticia = async (aid) => {
      if (SB && SB.configurado) {
        try {
          const l = await SB.comentarios(aid);
          return l.map(c => ({ ...c, meu: u ? c.autorId === u.id : false }));
        } catch (e) { /* cai para o espelho local */ }
      }
      return d.comentarios.filter(c => c.artigoId === aid && (c.status === 'publicado' || (u && u.papel === 'admin'))).map(c => ({ ...c, meu: u ? c.autorId === u.id : false }));
    };

    /* --- públicos --- */
    if (r === 'saude') return { ok: true, demo: true, artigos: d.artigos.length, fontes: d.fontes.length, usuarios: d.usuarios.length, versao: 'demo' };

    if (r === 'bootstrap') {
      const pub = publicados();
      const t = TAX();
      return {
        config: d.config, total: pub.length, atualizadoEm: (semente() && semente().geradoEm) || agora(),
        secoes: (d.secoes.length ? d.secoes : [...new Set(d.artigos.map(a => a.secao))].map(s => ({ id: s, nome: s }))).map(s => ({ ...s, total: pub.filter(a => a.secao === s.id).length })),
        fontes: d.fontes.map(f => ({ ...f, total: pub.filter(a => a.fonteId === f.id).length })),
        usuario: u ? { ...publicoDemo(u), preferencias: preferenciasDemo(u.id), preferenciasLeitura: prefsLeitura(u.id) } : null,
        temas: (t.temas || []).map(({ id, nome, icone }) => ({ id, nome, icone })),
        tamanhos: t.tamanhos || {},
        preferenciasPadrao: t.preferenciasPadrao || {},
        exibicoes: t.exibicoes || {},
        origens: t.origens || [],
        vagas: { limite: LIMITE_ADMINS, usadas: adminsEm(d.usuarios), restantes: Math.max(0, LIMITE_ADMINS - adminsEm(d.usuarios)), admins: LIMITE_ADMINS, leitores: d.usuarios.length - adminsEm(d.usuarios), cadastroLeitor: true },
      };
    }

    if (r === 'categorias') {
      const pub = publicados();
      const porTema = new Map((TAX().temas || []).map(t => [t.id, { total: 0, exemplo: null }]));
      const porEditoria = new Map();
      for (const a of pub) {
        const f = classificar(a);
        for (const t of f.temas) {
          const reg = porTema.get(t);
          if (reg) { reg.total++; if (!reg.exemplo) reg.exemplo = a; }
        }
        if (!porEditoria.has(a.secao)) porEditoria.set(a.secao, { total: 0, exemplo: null });
        const reg = porEditoria.get(a.secao);
        reg.total++;
        if (!reg.exemplo) reg.exemplo = a;
      }
      const exemplo = (a) => a && ({ id: a.id, titulo: a.titulo, fonte: a.fonte, bandeira: a.bandeira });
      return {
        editorias: d.secoes.filter(s => porEditoria.has(s.id) || s.nav).map(s => {
          const reg = porEditoria.get(s.id) || { total: 0, exemplo: null };
          return { id: s.id, nome: s.nome, icone: s.icone || '📰', nav: !!s.nav, total: reg.total, exemplo: exemplo(reg.exemplo) };
        }),
        temas: [...porTema.entries()].map(([id, reg]) => {
          const t = (TAX().temas || []).find(x => x.id === id) || {};
          return { id: 'tema:' + id, tema: id, nome: t.nome, icone: t.icone, total: reg.total, exemplo: exemplo(reg.exemplo) };
        }).filter(t => t.total > 0).sort((a, b) => b.total - a.total),
        taxonomia: { temas: (TAX().temas || []).map(({ id, nome, icone }) => ({ id, nome, icone })), tamanhos: TAX().tamanhos || {} },
        totalNoAcervo: pub.length,
      };
    }

    if (r.startsWith('cep/')) {
      const cep = r.split('/')[1].replace(/\D/g, '');
      if (cep.length !== 8) erro('Informe um CEP com 8 dígitos.');
      try {
        const resp = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
        const j = await resp.json();
        if (j && !j.erro && j.uf) {
          const info = (TAX().ufs || {})[j.uf] || [];
          return { cep, cidade: j.localidade, uf: j.uf, bairro: j.bairro || '', regiaoNome: info[1] || '', fonte: 'ViaCEP' };
        }
      } catch (e) { /* offline */ }
      const p = Number(cep.slice(0, 2));
      const faixas = [[1, 19, 'SP'], [20, 28, 'RJ'], [29, 29, 'ES'], [30, 39, 'MG'], [40, 48, 'BA'], [49, 49, 'SE'], [50, 56, 'PE'], [57, 57, 'AL'], [58, 58, 'PB'], [59, 59, 'RN'], [60, 63, 'CE'], [64, 64, 'PI'], [65, 65, 'MA'], [66, 68, 'PA'], [69, 69, 'AM'], [70, 72, 'DF'], [73, 77, 'GO'], [78, 79, 'MT'], [80, 87, 'PR'], [88, 89, 'SC'], [90, 99, 'RS']];
      const faixa = faixas.find(([de, ate]) => p >= de && p <= ate);
      const uf = faixa ? faixa[2] : '';
      return { cep, cidade: '', uf, bairro: '', regiaoNome: ((TAX().ufs || {})[uf] || [])[1] || '', fonte: 'faixa de CEP', aproximado: true };
    }

    if (r === 'noticias') {
      const prefs = prefsLeitura(u ? u.id : null);
      const fontes = String(q.fontes !== undefined ? q.fontes : (prefs.fontes || []).join(',')).split(',').map(s => s.trim()).filter(Boolean);
      const tamanho = (q.tamanho && TAX().tamanhos[q.tamanho]) ? q.tamanho : prefs.tamanho;
      const ordem = q.ordem || prefs.ordem || 'misto';
      const pesada = q.pesada || prefs.pesada || 'mostrar';
      const regiaoPref = q.regiao || prefs.regiao || 'medio';
      const categoria = q.categoria || q.secao || prefs.categoria || 'todas';
      const ufUsuario = q.uf !== undefined ? q.uf : (prefs.uf || '');
      const cidadeUsuario = q.cidade !== undefined ? q.cidade : (prefs.cidade || '');
      const fimLigado = q.fimSemana !== undefined ? q.fimSemana === '1' : !!prefs.fimSemana;
      const fimAtivo = fimLigado && (q.simularFimSemana === '1' || [0, 6].includes(new Date().getDay()));
      const temasVigiados = String(q.temas || '').split(',').map(s => s.trim()).filter(Boolean);
      const totalNoAcervo = publicados().length;

      let itens = publicados();
      if (fontes.length) itens = itens.filter(a => fontes.includes(a.fonteId));
      if (q.fonte) itens = itens.filter(a => a.fonteId === q.fonte);
      if (q.idioma && q.idioma !== 'todos') itens = itens.filter(a => a.idioma === q.idioma);
      if (q.comFoto === '1') itens = itens.filter(a => a.imagemOriginal);
      if (q.salvos === '1' && u) itens = itens.filter(a => (d.salvos[u.id] || []).includes(a.id));
      if (q.busca) { const t = q.busca.toLowerCase(); itens = itens.filter(a => (a.titulo + ' ' + (a.resumo || '') + ' ' + a.fonte).toLowerCase().includes(t)); }
      if (categoria && categoria !== 'todas') {
        if (categoria.startsWith('tema:')) { const tema = categoria.slice(5); itens = itens.filter(a => classificar(a).temas.includes(tema)); }
        else itens = itens.filter(a => a.secao === categoria);
      }
      let pesadasEscondidas = 0;
      if (pesada === 'esconder') { const antes = itens.length; itens = itens.filter(a => !classificar(a).pesada); pesadasEscondidas = antes - itens.length; }

      /* repercussão simplificada: quantos veículos tocam nos mesmos assuntos */
      const cobertura = new Map();
      for (const a of publicados()) for (const t of classificar(a).temas) {
        if (!cobertura.has(t)) cobertura.set(t, new Set());
        cobertura.get(t).add(a.fonteId);
      }
      const pesosRegiao = (TAX().pesos && TAX().pesos.regiao) || { medio: { local: 0.5, pais: 0.5, mundo: 0.25 } };
      const tabela = pesosRegiao[regiaoPref] || pesosRegiao.medio;
      const peso = (a) => {
        const f = classificar(a);
        let w = (a.destaque || a.fixado) ? 4 : 0;
        const casaCidade = cidadeUsuario && f.geo.cidades.some(c => c.cidade === normalizar(cidadeUsuario));
        const casaUf = ufUsuario && f.geo.ufs.includes(ufUsuario);
        if (casaCidade) w += tabela.local + 1; else if (casaUf) w += tabela.local;
        else if (f.geo.nacional) w += tabela.pais; else w += tabela.mundo;
        if (fimAtivo) {
          if (['cultura', 'esportes', 'gastronomia', 'viagens', 'curio'].includes(a.secao)) w += 2.5;
          if (['politica', 'economia'].includes(a.secao)) w -= 2.5;
        }
        if (temasVigiados.length && f.temas.some(t => temasVigiados.includes(t))) w += 1.6;
        return w;
      };
      const repercussao = (a) => {
        const f = classificar(a);
        const cob = f.temas.reduce((s, t) => s + Math.max(0, (cobertura.get(t) ? cobertura.get(t).size : 1) - 1), 0);
        return cob * 2.2 + (a.curtidas || 0) * 2 + Math.log10((a.visualizacoes || 0) + 1);
      };
      const t = TAX().tamanhos || {};
      const limite = Number(q.limite) || (t[tamanho] ? t[tamanho].recortes : 28);
      const recente = (a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm);

      let ordenados;
      if (ordem === 'antigas') ordenados = [...itens].sort((a, b) => -recente(a, b));
      else if (ordem === 'lidas') ordenados = [...itens].sort((a, b) => (b.visualizacoes || 0) - (a.visualizacoes || 0));
      else if (ordem === 'curtidas') ordenados = [...itens].sort((a, b) => (b.curtidas || 0) - (a.curtidas || 0));
      else if (ordem === 'recentes') ordenados = [...itens].sort(recente);
      else if (ordem === 'repercutidas') ordenados = [...itens].sort((a, b) => (repercussao(b) + peso(b) * 1.2) - (repercussao(a) + peso(a) * 1.2));
      else if (ordem === 'relevantes') {
        const pref = u ? preferenciasDemo(u.id) : [];
        ordenados = [...itens].sort((a, b) => ((pref.includes(b.secao) ? 2 : 0) + peso(b)) - ((pref.includes(a.secao) ? 2 : 0) + peso(a)) || recente(a, b));
      } else {
        const rec = [...itens].sort(recente);
        const posR = new Map(rec.map((a, i) => [a.id, i / Math.max(1, rec.length - 1)]));
        const rep = [...itens].sort((a, b) => repercussao(b) - repercussao(a));
        const posP = new Map(rep.map((a, i) => [a.id, i / Math.max(1, rep.length - 1)]));
        ordenados = [...itens].sort((x, y) => (posR.get(x.id) + posP.get(x.id)) * 50 - peso(x) * 1.5 - ((posR.get(y.id) + posP.get(y.id)) * 50 - peso(y) * 1.5));
      }

      let pesadasOcultadas = 0;
      if (pesada === 'menos') {
        const teto = Math.max(1, Math.round(ordenados.length * 0.18));
        let vistas = 0;
        ordenados = ordenados.filter(a => { if (!classificar(a).pesada) return true; vistas++; if (vistas > teto) { pesadasOcultadas++; return false; } return true; });
      }

      const p = Math.max(1, Number(q.pagina) || 1);
      const fatia = ordenados.slice((p - 1) * limite, p * limite);
      const rotuloTamanho = (t[tamanho] || { nome: tamanho, porBloco: 4 });
      return {
        total: ordenados.length, pagina: p, porPagina: limite, paginas: Math.ceil(ordenados.length / limite) || 1,
        totalNoAcervo, pesadasOcultadas, pesadasEscondidas,
        itens: fatia.map(a => cruzarDemo(a, u)), atualizadoEm: agora(),
        preferenciasAplicadas: {
          tamanho, tamanhoNome: rotuloTamanho.nome, porBloco: rotuloTamanho.porBloco, ordem, pesada, regiao: regiaoPref,
          categoria, uf: ufUsuario, cidade: cidadeUsuario, fimSemana: fimLigado, fimSemanaAtivo: fimAtivo,
          fontes: fontes.length, temas: temasVigiados,
        },
      };
    }

    if (r === 'manchetes') {
      const fontes = String(q.fontes || '').split(',').map(s => s.trim()).filter(Boolean);
      const pesada = q.pesada || 'mostrar';
      const vistos = new Set(), itens = [];
      for (const a of publicados()) {
        if (fontes.length && !fontes.includes(a.fonteId)) continue;
        if (pesada === 'esconder' && classificar(a).pesada) continue;
        if (vistos.has(a.fonteId)) continue;
        vistos.add(a.fonteId); itens.push(cruzarDemo(a, u));
        if (itens.length >= (Number(q.limite) || 57)) break;
      }
      return { total: itens.length, itens };
    }

    const mNoticia = r.match(/^noticia\/([^/]+)(?:\/(curtir|salvar|comentar|visualizar))?$/);
    if (mNoticia) {
      const [, id, acao] = mNoticia;
      const a = G.lista(d.artigos).find(x => x.id === id);
      if (!a) erro('Notícia não encontrada.', 404);
      if (!acao && metodo === 'GET') {
        a.visualizacoes = (a.visualizacoes || 0) + 1;
        d.metricas.leituras[hoje()] = (d.metricas.leituras[hoje()] || 0) + 1;
        if (u) {
          const lidas = d.lidas[u.id] || (d.lidas[u.id] = []);
          if (!lidas.includes(a.id)) lidas.unshift(a.id);
        }
        gravarDemo();
        const f = classificar(a);
        return {
          artigo: cruzarDemo(a, u),
          ficha: {
            temas: f.temas.map(t => { const info = (TAX().temas || []).find(x => x.id === t) || {}; return { id: t, nome: info.nome, icone: info.icone }; }),
            pesada: f.pesada, geo: f.geo,
          },
          comentarios: await comentariosDaNoticia(a.id),
          relacionados: d.artigos.filter(x => x.id !== a.id && x.status === 'publicado' && (x.secao === a.secao || x.fonteId === a.fonteId)).slice(0, 6).map(x => cruzarDemo(x, u)),
        };
      }
      if (acao === 'visualizar') { a.visualizacoes = (a.visualizacoes || 0) + 1; gravarDemo(); return { ok: true }; }
      if (!u) erro('Entre na conta para isso.', 401);
      if (acao === 'curtir') {
        if (sbPerfil) {
          const curtidoSb = await SB.alternar('curtidas', u.id, a.id);
          const lSb = d.curtidas[u.id] || (d.curtidas[u.id] = []);
          const ix = lSb.indexOf(a.id);
          if (curtidoSb && ix < 0) lSb.push(a.id);
          if (!curtidoSb && ix >= 0) lSb.splice(ix, 1);
          try { a.curtidas = await SB.contar('curtidas', a.id); } catch (e) { /* mantém */ }
          gravarDemo(); return { curtido: curtidoSb, curtidas: a.curtidas };
        }
        const lista = d.curtidas[u.id] || (d.curtidas[u.id] = []);
        const i = lista.indexOf(a.id);
        if (i >= 0) { lista.splice(i, 1); a.curtidas = Math.max(0, (a.curtidas || 0) - 1); } else { lista.push(a.id); a.curtidas = (a.curtidas || 0) + 1; }
        gravarDemo(); return { curtido: i < 0, curtidas: a.curtidas };
      }
      if (acao === 'salvar') {
        if (sbPerfil) {
          const salvoSb = await SB.alternar('salvos', u.id, a.id);
          const lSb = d.salvos[u.id] || (d.salvos[u.id] = []);
          const ix = lSb.indexOf(a.id);
          if (salvoSb && ix < 0) lSb.push(a.id);
          if (!salvoSb && ix >= 0) lSb.splice(ix, 1);
          gravarDemo(); return { salvo: salvoSb };
        }
        const lista = d.salvos[u.id] || (d.salvos[u.id] = []);
        const i = lista.indexOf(a.id);
        if (i >= 0) lista.splice(i, 1); else lista.push(a.id);
        gravarDemo(); return { salvo: i < 0 };
      }
      if (acao === 'comentar') {
        if (sbPerfil) {
          const textoSb = String((corpoDados || {}).texto || '').trim();
          if (textoSb.length < 2) erro('Escreva um comentário.');
          const novoSb = await SB.comentar(u.id, a.id, u.nome, textoSb.slice(0, 800));
          return { comentario: novoSb };
        }
        const texto = String((corpoDados || {}).texto || '').trim();
        if (texto.length < 2) erro('Escreva um comentário.');
        const c = { id: uid('c-'), artigoId: a.id, autorId: u.id, autor: u.nome, cor: u.cor, texto: texto.slice(0, 800), status: d.config.moderacaoComentarios ? 'pendente' : 'publicado', criadoEm: agora() };
        d.comentarios.unshift(c); gravarDemo();
        return { comentario: { ...c, meu: true } };
      }
    }

    if (r.startsWith('comentario/') && metodo === 'DELETE') {
      if (sbPerfil) { await SB.apagarComentario(r.split('/')[1]); return { ok: true }; }
      const id = r.split('/')[1];
      const c = G.lista(d.comentarios).find(x => x.id === id);
      if (!c) erro('Comentário não encontrado.', 404);
      if (!u || (c.autorId !== u.id && u.papel !== 'admin')) erro('Sem permissão.', 403);
      d.comentarios = d.comentarios.filter(x => x.id !== id); gravarDemo();
      return { ok: true };
    }

    /* --- sessão --- */
    if (r === 'auth/login') {
      const email = String((corpoDados || {}).email || '').toLowerCase();
      const senha = String((corpoDados || {}).senha || '');
      const alvo = G.lista(d.usuarios).find(x => x.email === email);
      if (!alvo) erro('E-mail ou senha incorretos.', 401);
      if (alvo.senha !== 'demo') {
        const h = await hashSenha(senha);
        if (h !== alvo.senha) erro('E-mail ou senha incorretos.', 401);
      } else if (alvo.papel === 'leitor' && senha.length < 4) erro('E-mail ou senha incorretos.', 401);
      if (alvo.ativo === false) erro('Esta conta está suspensa.', 403);
      const token = uid('tk-');
      d.sessoes[token] = { usuarioId: alvo.id, criadoEm: agora() };
      estado.token = token; localStorage.setItem(CHAVE_TOKEN, token);
      logs('entrou no portal', alvo.papel === 'admin' ? 'acesso ao painel da redação' : 'acesso de leitor');
      gravarDemo();
      return { token, usuario: { ...publicoDemo(alvo), preferencias: preferenciasDemo(alvo.id), preferenciasLeitura: prefsLeitura(alvo.id) } };
    }
    if (r === 'auth/registro') {
      const b = corpoDados || {};
      if (!b.nome || !b.email || !b.senha) erro('Informe nome, e-mail e senha.');
      if (String(b.senha).length < 6) erro('A senha precisa ter ao menos 6 caracteres.');
      if (b.papel === 'admin') erro('Contas de administrador são criadas pela própria redação — o cadastro aqui é de leitor.', 403);
      if (d.usuarios.some(x => x.email === String(b.email).toLowerCase())) erro('Este e-mail já tem conta.', 409);
      const novo = { id: uid('u-'), nome: b.nome, email: String(b.email).toLowerCase(), papel: 'leitor', bio: '', cor: ['#2f9dff', '#e8e3d7', '#9a9a9a'][d.usuarios.length % 3], ativo: true, criadoEm: agora(), senha: await hashSenha(b.senha) };
      d.usuarios.push(novo);
      d.preferencias[novo.id] = { ...(TAX().preferenciasPadrao || {}), ...(b.preferencias || {}) };
      const token = uid('tk-');
      d.sessoes[token] = { usuarioId: novo.id, criadoEm: agora() };
      estado.token = token; localStorage.setItem(CHAVE_TOKEN, token);
      logs('novo cadastro', `${novo.email} como ${novo.papel}`);
      gravarDemo();
      return { token, usuario: { ...publicoDemo(novo), preferencias: [], preferenciasLeitura: prefsLeitura(novo.id) } };
    }
    if (r === 'auth/sair') {
      if (estado.token) { delete d.sessoes[estado.token]; logs('saiu do portal', ''); gravarDemo(); }
      estado.token = ''; localStorage.removeItem(CHAVE_TOKEN);
      return { ok: true };
    }
    if (r === 'eu' && metodo === 'GET') {
      if (!u) erro('Sem sessão ativa.', 401);
      return {
        usuario: { ...publicoDemo(u), preferencias: preferenciasDemo(u.id), preferenciasLeitura: prefsLeitura(u.id) },
        salvos: G.lista(G.obj(d.salvos)[u.id]).map(id => G.lista(d.artigos).find(a => a.id === id)).filter(Boolean).map(a => cruzarDemo(a, u)),
        lidas: (d.lidas[u.id] || []).length,
        curtidos: (d.curtidas[u.id] || []).length,
        comentarios: d.comentarios.filter(c => c.autorId === u.id).length,
      };
    }

    if (r === 'eu/preferencias' && metodo === 'PATCH') {
      if (!u) erro('Sem sessão ativa.', 401);
      d.preferencias[u.id] = { ...prefsLeitura(u.id), ...(corpoDados || {}) };
      logs('ajustou as preferências de leitura', `modo ${d.preferencias[u.id].modo} · ordem ${d.preferencias[u.id].ordem}`);
      gravarDemo();
      return { preferencias: d.preferencias[u.id] };
    }
    if (r === 'eu' && metodo === 'PATCH') {
      if (!u) erro('Sem sessão ativa.', 401);
      if (corpoDados.nome) u.nome = corpoDados.nome;
      if (corpoDados.bio !== undefined) u.bio = String(corpoDados.bio).slice(0, 240);
      if (corpoDados.senhaNova) {
        if (u.senha !== 'demo' && (await hashSenha(corpoDados.senhaAtual)) !== u.senha) erro('Senha atual incorreta.');
        u.senha = await hashSenha(corpoDados.senhaNova);
      }
      logs('atualizou o perfil', ''); gravarDemo();
      return { usuario: { ...publicoDemo(u), preferencias: preferenciasDemo(u.id) } };
    }

    /* --- assinaturas e Área VIP (demonstração) ---
       No site publicado, quem valida pagamento e libera conteúdo é o
       servidor/gateway (Mercado Pago, Stripe...). Aqui o pagamento é
       simulado para dar para testar o fluxo inteiro, e o combinado fica
       gravado na conta — nada de só esconder botão. */
    if (r === 'assinaturas/assinar' && metodo === 'POST') {
      if (!u) erro('Entre na sua conta para assinar.', 401);
      const plano = PLANOS_DEMO[(corpoDados || {}).plano];
      if (!plano) erro('Plano inválido.');
      const ciclo = (corpoDados || {}).ciclo === 'anual' ? 'anual' : 'mensal';
      const renova = new Date(Date.now() + (ciclo === 'anual' ? 365 : 30) * 864e5).toISOString();
      u.assinatura = { plano: (corpoDados || {}).plano, nome: plano.nome, nivel: plano.nivel, ciclo, preco: ciclo === 'anual' ? plano.anual : plano.mensal, status: 'ativa', desde: agora(), renovaEm: renova, simulada: true, boletins: { diario: true, whatsapp: false } };
      logs('assinatura ativada (simulada)', `${plano.nome} · ${ciclo}`); gravarDemo();
      return { assinatura: u.assinatura, usuario: publicoDemo(u) };
    }
    if (r === 'assinaturas/cancelar' && metodo === 'POST') {
      if (!u) erro('Entre na sua conta.', 401);
      if (u.assinatura) u.assinatura.status = 'cancelada';
      logs('assinatura cancelada', ''); gravarDemo();
      return { assinatura: u.assinatura, usuario: publicoDemo(u) };
    }
    if (r === 'vip/boletins' && metodo === 'POST') {
      if (!u || !u.assinatura || u.assinatura.status !== 'ativa') erro('Assinatura ativa necessária.', 403);
      u.assinatura.boletins = { ...(u.assinatura.boletins || {}), ...((corpoDados || {}).boletins || {}) };
      gravarDemo(); return { assinatura: u.assinatura };
    }
    if (r === 'vip/enquete' && metodo === 'POST') {
      if (!u || !u.assinatura || u.assinatura.status !== 'ativa' || (u.assinatura.nivel || 0) < 2) erro('Enquete exclusiva dos planos VIP e Premium.', 403);
      d.vipVotos = d.vipVotos || {};
      d.vipVotos[u.id] = String((corpoDados || {}).opcao || '');
      gravarDemo();
      const tally = {};
      Object.values(d.vipVotos).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
      return { tally, meuVoto: d.vipVotos[u.id] };
    }
    if (r === 'vip' && metodo === 'GET') {
      const pub = publicados().slice().sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));
      const porSecaoVip = {};
      pub.forEach(a => { porSecaoVip[a.secao] = (porSecaoVip[a.secao] || 0) + 1; });
      const tally = {};
      Object.values(d.vipVotos || {}).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
      return {
        resumoDia: pub.slice(0, 10).map(a => cruzarDemo(a, u)),
        porSecao: Object.entries(porSecaoVip).sort((a, b) => b[1] - a[1]).slice(0, 6),
        totalHoje: pub.filter(a => Date.now() - new Date(a.publicadoEm).getTime() < 864e5).length,
        tally, meuVoto: u ? (d.vipVotos || {})[u.id] || '' : '',
      };
    }

    /* --- administração --- */
    if (r.startsWith('admin/')) {
      if (!u || u.papel !== 'admin') erro('Apenas administradores.', 403);
      if (r === 'admin/resumo') {
        const pub = publicados(), dias = [...Array(7)].map((_, i) => {
          const dia = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10);
          return { dia, total: d.artigos.filter(a => a.publicadoEm.slice(0, 10) === dia).length, leituras: d.metricas.leituras[dia] || 0 };
        });
        return {
          kpis: {
            artigos: d.artigos.length, publicados: pub.length,
            rascunhos: d.artigos.filter(a => a.status === 'rascunho').length,
            arquivados: d.artigos.filter(a => a.status === 'arquivado').length,
            fontesAtivas: d.fontes.filter(f => f.ativa !== false).length, fontes: d.fontes.length,
            leitores: d.usuarios.length, admins: d.usuarios.filter(x => x.papel === 'admin').length,
            comentarios: d.comentarios.length, pendentes: d.comentarios.filter(c => c.status === 'pendente').length,
            leiturasHoje: d.metricas.leituras[hoje()] || 0,
            curtidas: d.artigos.reduce((s, a) => s + (a.curtidas || 0), 0),
            ultimaSync: (d.metricas.sincronizacoes[0] || {}).quando || null,
          },
          porSecao: (d.secoes.length ? d.secoes : []).map(s => ({ ...s, total: d.artigos.filter(a => a.secao === s.id).length })),
          porFonte: d.fontes.map(f => ({ fonte: f.nome, bandeira: f.bandeira, total: d.artigos.filter(a => a.fonteId === f.id).length })).sort((a, b) => b.total - a.total),
          ultimos7: dias, sincronizacoes: d.metricas.sincronizacoes.slice(0, 6),
          recentes: d.artigos.slice(0, 8).map(a => ({ id: a.id, titulo: a.titulo, fonte: a.fonte, quando: agora(), status: a.status })),
          preferenciasLeitores: resumoPreferenciasDemo(),
        };
      }
      if (r === 'admin/noticias' && metodo === 'GET') {
        let itens = [...d.artigos].sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));
        if (q.status && q.status !== 'todas') itens = itens.filter(a => a.status === q.status);
        if (q.secao && q.secao !== 'todas') itens = itens.filter(a => a.secao === q.secao);
        if (q.fonte) itens = itens.filter(a => a.fonteId === q.fonte);
        if (q.busca) { const t = q.busca.toLowerCase(); itens = itens.filter(a => (a.titulo + ' ' + a.fonte).toLowerCase().includes(t)); }
        const porPagina = Math.min(200, Number(q.limite) || 40), p = Math.max(1, Number(q.pagina) || 1);
        return { total: itens.length, pagina: p, paginas: Math.ceil(itens.length / porPagina) || 1, itens: itens.slice((p - 1) * porPagina, p * porPagina) };
      }
      if (r === 'admin/noticias' && metodo === 'POST') {
        const f = G.lista(d.fontes).find(x => x.id === corpoDados.fonteId) || { id: corpoDados.fonteId, nome: corpoDados.fonteId, bandeira: '📰', pais: '—', idioma: 'pt', secao: 'mundo', estilo: 'serif' };
        const a = {
          id: uid('a-'), fonteId: f.id, fonte: f.nome, bandeira: f.bandeira, pais: f.pais, idioma: corpoDados.idioma || f.idioma,
          secao: corpoDados.secao || f.secao, estilo: f.estilo, titulo: corpoDados.titulo, resumo: corpoDados.resumo || '',
          link: corpoDados.link || '', imagemOriginal: corpoDados.imagemOriginal || '',
          imagem: corpoDados.imagemOriginal || App.arteDe(corpoDados.secao || f.secao),
          publicadoEm: corpoDados.publicadoEm || agora(), importadoEm: agora(), status: corpoDados.status || 'publicado',
          destaque: !!corpoDados.destaque, fixado: !!corpoDados.fixado, curtidas: 0, visualizacoes: 0, criadoPor: u.nome,
        };
        d.artigos.unshift(a); logs('criou matéria', a.titulo); gravarDemo();
        return { artigo: a };
      }
      const mId = r.match(/^admin\/noticia\/([^/]+)$/);
      if (mId && metodo === 'GET') {
        const a = G.lista(d.artigos).find(x => x.id === mId[1]);
        if (!a) erro('Matéria não encontrada.', 404);
        return { artigo: a };
      }
      const mA = r.match(/^admin\/noticias\/([^/]+)$/);
      if (mA && (metodo === 'PATCH' || metodo === 'DELETE')) {
        const a = G.lista(d.artigos).find(x => x.id === mA[1]);
        if (!a) erro('Matéria não encontrada.', 404);
        if (metodo === 'DELETE') { d.artigos = d.artigos.filter(x => x.id !== a.id); logs('removeu matéria', a.titulo); gravarDemo(); return { ok: true }; }
        ['titulo', 'resumo', 'link', 'secao', 'status', 'imagem', 'imagemOriginal', 'publicadoEm', 'fonteId'].forEach(k => { if (corpoDados[k] !== undefined) a[k] = corpoDados[k]; });
        if (corpoDados.destaque !== undefined) a.destaque = !!corpoDados.destaque;
        if (corpoDados.fixado !== undefined) a.fixado = !!corpoDados.fixado;
        a.editadoPor = u.nome; a.editadoEm = agora();
        logs('editou matéria', a.titulo); gravarDemo();
        return { artigo: a };
      }
      const mS = r.match(/^admin\/noticia\/([^/]+)\/(status|destaque)$/);
      if (mS) {
        const a = G.lista(d.artigos).find(x => x.id === mS[1]);
        if (!a) erro('Matéria não encontrada.', 404);
        if (mS[2] === 'status') { if (!['publicado', 'rascunho', 'arquivado'].includes(corpoDados.status)) erro('Status inválido.'); a.status = corpoDados.status; logs(`marcou como ${a.status}`, a.titulo); gravarDemo(); return { artigo: a }; }
        a.destaque = !a.destaque; logs(a.destaque ? 'destacou na capa' : 'removeu destaque', a.titulo); gravarDemo();
        return { destaque: a.destaque };
      }
      if (r === 'admin/fontes' && metodo === 'GET') return { fontes: d.fontes.map(f => ({ ...f, total: d.artigos.filter(a => a.fonteId === f.id).length })) };
      const mF = r.match(/^admin\/fontes\/([^/]+)$/);
      if (mF && metodo === 'PATCH') {
        const f = G.lista(d.fontes).find(x => x.id === mF[1]);
        if (!f) erro('Veículo não encontrado.', 404);
        if (corpoDados.ativa !== undefined) f.ativa = !!corpoDados.ativa;
        if (corpoDados.secao) f.secao = corpoDados.secao;
        logs(f.ativa ? 'ativou veículo' : 'pausou veículo', f.nome); gravarDemo();
        return { fonte: f };
      }
      if (r === 'admin/sincronizar') {
        const registro = { quando: agora(), duracaoMs: 900, fontes: d.fontes.length, importados: 0, duplicados: 0, falhas: 0, demo: true };
        d.metricas.sincronizacoes.unshift(registro);
        logs('tentou sincronizar feeds', 'modo demonstração — sem acesso à rede');
        gravarDemo();
        erro('Modo demonstração: rode "node server.js" para sincronizar feeds reais.', 503);
      }
      if (r === 'admin/comentarios' && metodo === 'GET') {
        let itens = d.comentarios;
        if (q.status && q.status !== 'todos') itens = itens.filter(c => c.status === q.status);
        return { itens: itens.map(c => ({ ...c, titulo: (G.lista(d.artigos).find(a => a.id === c.artigoId) || {}).titulo || '—' })), total: itens.length };
      }
      const mC = r.match(/^admin\/comentarios\/([^/]+)$/);
      if (mC) {
        const c = G.lista(d.comentarios).find(x => x.id === mC[1]);
        if (!c) erro('Comentário não encontrado.', 404);
        if (metodo === 'DELETE') { d.comentarios = d.comentarios.filter(x => x.id !== c.id); logs('apagou comentário', c.autor); gravarDemo(); return { ok: true }; }
        c.status = corpoDados.status; logs(`comentário ${c.status}`, c.autor); gravarDemo();
        return { comentario: c };
      }
      if (r === 'admin/usuarios' && metodo === 'GET') {
        if (true) return { vagas: { limite: LIMITE_ADMINS, usadas: adminsEm(d.usuarios), restantes: Math.max(0, LIMITE_ADMINS - adminsEm(d.usuarios)), admins: LIMITE_ADMINS, leitores: d.usuarios.length - adminsEm(d.usuarios), cadastroLeitor: true }, usuarios: d.usuarios.map(x => ({ ...publicoDemo(x), salvos: (d.salvos[x.id] || []).length, curtidas: (d.curtidas[x.id] || []).length, comentarios: d.comentarios.filter(c => c.autorId === x.id).length })) };
      }
      if (r === 'admin/usuarios' && metodo === 'POST') {
        if (d.usuarios.some(x => x.email === String(corpoDados.email).toLowerCase())) erro('E-mail já cadastrado.', 409);
        if (corpoDados.papel === 'admin' && adminsEm(d.usuarios) >= LIMITE_ADMINS) erro(`O portal tem ${LIMITE_ADMINS} contas de administrador — rebaixe uma antes de criar outra.`, 403);
        const novo = { id: uid('u-'), nome: corpoDados.nome, email: String(corpoDados.email).toLowerCase(), papel: corpoDados.papel === 'admin' ? 'admin' : 'leitor', bio: corpoDados.bio || '', cor: '#2f9dff', ativo: true, criadoEm: agora(), senha: await hashSenha(corpoDados.senha || 'demo1234') };
        d.usuarios.push(novo); logs('criou usuário', `${novo.email} (${novo.papel})`); gravarDemo();
        return { usuario: publicoDemo(novo) };
      }
      const mU = r.match(/^admin\/usuarios\/([^/]+)$/);
      if (mU && metodo === 'PATCH') {
        const alvo = G.lista(d.usuarios).find(x => x.id === mU[1]);
        if (!alvo) erro('Usuário não encontrado.', 404);
        if (corpoDados.papel) alvo.papel = corpoDados.papel;
        if (corpoDados.ativo !== undefined) alvo.ativo = !!corpoDados.ativo;
        if (corpoDados.novaSenha) alvo.senha = await hashSenha(corpoDados.novaSenha);
        logs('atualizou usuário', `${alvo.email} → ${alvo.papel}`); gravarDemo();
        return { usuario: publicoDemo(alvo) };
      }
      if (r === 'admin/config' && metodo === 'GET') return { config: d.config };
      if (r === 'admin/config' && metodo === 'PATCH') {
        Object.assign(d.config, corpoDados); logs('atualizou configurações', ''); gravarDemo();
        return { config: d.config };
      }
      if (r === 'admin/auditoria') return { registros: d.auditoria.slice(0, 120) };
      if (r === 'admin/exportar') return { exportadoEm: agora(), config: d.config, totais: { artigos: d.artigos.length, comentarios: d.comentarios.length, usuarios: d.usuarios.length }, artigos: d.artigos.slice(0, 500).map(({ id, titulo, fonte, secao, status, publicadoEm, link }) => ({ id, titulo, fonte, secao, status, publicadoEm, link })) };
    }

    erro('Rota não encontrada no modo demonstração: ' + metodo + ' ' + caminho, 404);
  }

  /* ═════════ CLIENTE HTTP ═════════ */
  async function pedido(metodo, caminho, corpoDados) {
    if (estado.demo) return demoReq(metodo, caminho, corpoDados);
    const cabecalhos = { 'content-type': 'application/json' };
    if (estado.token) cabecalhos.authorization = 'Bearer ' + estado.token;
    let r;
    try {
      r = await fetch(caminho, { method: metodo, headers: cabecalhos, body: corpoDados ? JSON.stringify(corpoDados) : undefined });
    } catch (e) {
      // servidor fora do ar / sem rede: mensagem clara e status próprio
      const erro = new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
      erro.status = 0; erro.rede = true;
      throw erro;
    }
    let dados = null;
    try { dados = await r.json(); } catch (e) { dados = null; }
    if (!r.ok) {
      const e = new Error(G.txt(G.obj(dados).erro, 'Falha na requisição (' + r.status + ')'));
      e.status = r.status;
      throw e;
    }
    return dados === null ? {} : dados;   // corpo vazio/ inválido não derruba quem chamou
  }

  async function iniciar() {
    try {
      const s = await pedido('GET', '/api/saude');
      estado.demo = false;
      estado.servico = G.obj(s);
    } catch (e) {
      estado.demo = true;
      carregarDemo();
      console.info('%cFoca News · modo demonstração (servidor offline)','color:#2f9dff');
    }

    /* O bootstrap é a espinha dorsal da página. Se ele vier vazio, parcial ou
       falhar, o app NÃO pode morrer: normalizamos o que veio (G.bootstrap) e
       guardamos o motivo para a interface mostrar um aviso amigável. */
    let bruto = null, falha = null;
    try {
      bruto = await pedido('GET', '/api/bootstrap');
    } catch (e) {
      falha = e;
    }
    const pacote = G.bootstrap(bruto);
    estado.erroBoot = falha ? G.amigavel(falha) : (bruto ? null : 'A resposta do servidor veio vazia; mostrando o essencial.');
    G.mesclar(estado, pacote);
    estado.servico = estado.servico || (estado.demo ? { ok: true, demo: true } : {});
    return pacote;
  }

  const sair = async () => {
    try { await pedido('POST', '/api/auth/sair'); } catch (e) { /* segue */ }
    estado.token = ''; estado.usuario = null; localStorage.removeItem(CHAVE_TOKEN);
    if (estado.demo) { demo.sessoes = {}; gravarDemo(); }
  };

  return {
    estado, iniciar, sair, tempoRelativo, dataLonga, zerarDemo, gravarDemo, hashSenha,
    get: (c) => pedido('GET', c),
    post: (c, b) => pedido('POST', c, b),
    patch: (c, b) => pedido('PATCH', c, b),
    del: (c) => pedido('DELETE', c),
    guardarToken: (t) => { estado.token = t; localStorage.setItem(CHAVE_TOKEN, t); },
    preferenciasDemo,
  };
})();

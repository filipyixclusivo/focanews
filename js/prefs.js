/* ══════════════════════════════════════════════════════════════
   Foca News — preferências do leitor
   As três abas novas (Categorias · Minhas fontes · Meu jeito de ler)
   alimentam este módulo. Visitante guarda no navegador; quem entra na
   conta também grava no servidor (segue o leitor em qualquer aparelho).
   ══════════════════════════════════════════════════════════════ */
const Prefs = (() => {
  const CHAVE = 'grid_prefs';
  const CHAVE_LIDAS = 'grid_lidas';

  // espelho da taxonomia (data/taxonomia.js → public/data/taxonomia.js)
  const TAX = window.__TAXONOMIA__ || {};
  const ACABAMENTOS = TAX.acabamentos || {
    imersivo: { nome: 'Imersivo 3D', resumo: 'profundidade, paralaxe e cartões vivos', descricao: 'cena com camadas de fundo, cartões que inclinam sob o ponteiro e transições suaves entre as páginas' },
    papel: { nome: 'Papel clássico', resumo: 'o impresso chapado, sem efeitos', descricao: 'a primeira página como folha de jornal: sem profundidade, sem animação — leve e direto' },
  };
  const EXIBICOES = TAX.exibicoes || {
    compacto: { nome: 'Compacto', resumo: 'Título e resumo curto', descricao: 'cabe o dobro de notícias na tela: título, uma linha de resumo e a assinatura do veículo', limiteResumo: 96 },
    padrao: { nome: 'Padrão', resumo: 'Título e resumo', descricao: 'o recorte clássico do Foca News: título, chamada completa, imagem em meio-tom e a linha de ações', limiteResumo: 240 },
    destaque: { nome: 'Destaque', resumo: 'Título maior', descricao: 'títulos grandes, imagem larga e mais respiro — para ler passeando os olhos pela página', limiteResumo: 240 },
  };
  const ORIGENS = TAX.origens || [
    { id: 'instagram', nome: 'Instagram', icone: '📸' },
    { id: 'tiktok', nome: 'TikTok', icone: '🎵' },
    { id: 'youtube', nome: 'YouTube', icone: '▶️' },
    { id: 'google', nome: 'Busca no Google', icone: '🔎' },
    { id: 'indicacao', nome: 'Indicação de alguém', icone: '💬' },
    { id: 'imprensa', nome: 'Notícia, blog ou podcast', icone: '📰' },
    { id: 'whatsapp', nome: 'WhatsApp ou Telegram', icone: '📱' },
    { id: 'outro', nome: 'Outro caminho', icone: '✨' },
  ];

  const PADRAO = {
    modo: 'jornal',        // jornal | leitura
    acabamento: 'imersivo',// imersivo (3D) | papel (clássico)
    exibicao: 'padrao',    // compacto | padrao | destaque
    imagens: true,         // mostrar imagens nas notícias
    tamanho: 'medio',      // minimal | curto | medio | longo
    ordem: 'misto',        // repercutidas | recentes | misto
    lidas: 'ficam',        // ficam | descem | somem
    regiao: 'medio',       // pouco | medio | muito
    cep: '', cidade: '', uf: '', regiaoNome: '',
    pesada: 'mostrar',     // mostrar | menos | esconder
    fimSemana: true,
    fontes: [],            // ids dos veículos escolhidos (vazio = todas)
    categoria: 'todas',
    temas: [],             // assuntos vigiados
    origem: '',            // como conheceu o app
    origemDetalhe: '',     // quem indicou / onde viu
  };

  const PADRAO_EXIBICAO = ['compacto', 'padrao', 'destaque'];

  let estado = { ...PADRAO };

  const ler = (chave, reserva) => { try { return JSON.parse(localStorage.getItem(chave)) ?? reserva; } catch (e) { return reserva; } };
  const gravar = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* cota */ } };

  /** Valida campo a campo: preferência antiga, editada à mão ou de outra versão
   *  nunca vira surpresa no meio da página. Roda no carregamento e a cada salvamento. */
  function sanearEstado() {
    const TAMANHOS = Object.keys(window.__TAMANHOS__ || { minimal: 1, curto: 1, medio: 1, longo: 1 });
    estado.fontes = G.lista(estado.fontes).filter(f => typeof f === 'string');
    estado.temas = G.lista(estado.temas).filter(t => typeof t === 'string');
    estado.filtroGrupo = G.txt(estado.filtroGrupo, '');
    estado.modo = G.umDe(estado.modo, ['jornal', 'leitura'], PADRAO.modo);
    estado.acabamento = G.umDe(estado.acabamento, Object.keys(ACABAMENTOS), PADRAO.acabamento);
    estado.exibicao = G.umDe(estado.exibicao, PADRAO_EXIBICAO, PADRAO.exibicao);
    estado.tamanho = G.umDe(estado.tamanho, TAMANHOS, PADRAO.tamanho);
    estado.ordem = G.umDe(estado.ordem, ['misto', 'repercutidas', 'recentes', 'lidas', 'curtidas', 'antigas'], PADRAO.ordem);
    estado.lidas = G.umDe(estado.lidas, ['ficam', 'descem', 'somem'], PADRAO.lidas);
    estado.pesada = G.umDe(estado.pesada, ['mostrar', 'menos', 'esconder'], PADRAO.pesada);
    estado.categoria = G.txt(estado.categoria, PADRAO.categoria) || PADRAO.categoria;
    estado.regiao = G.umDe(estado.regiao, ['pouco', 'medio', 'muito'], PADRAO.regiao);
    estado.cep = G.txt(estado.cep, '');            // CEP é texto ("45600-090")
    estado.cidade = G.txt(estado.cidade, '');
    estado.uf = G.txt(estado.uf, '');
    estado.regiaoNome = G.txt(estado.regiaoNome, '');
    estado.origem = G.txt(estado.origem, '');
    estado.origemDetalhe = G.txt(estado.origemDetalhe, '');
    estado.fimSemana = estado.fimSemana !== false;
    estado.imagens = estado.imagens !== false;
    return estado;
  }

  function carregar(prefsServidor) {
    const local = ler(CHAVE, {});
    // muta no lugar: quem guarda a referência (App, painel) enxerga os novos valores
    for (const k of Object.keys(estado)) delete estado[k];
    /* Guarda na entrada: preferências antigas, parciais ou com tipo errado
       não podem deixar `fontes`/`temas` como undefined (isso quebrava
       .join/.includes/.length mais adiante). */
    Object.assign(estado, PADRAO, G.obj(local), G.obj(prefsServidor));
    sanearEstado();
    aplicarModo();
    return estado;
  }

  function aplicarModo() {
    const corpo = document.body;
    corpo.classList.toggle('modo-leitura', estado.modo === 'leitura');
    corpo.dataset.modo = estado.modo;

    // acabamento: Imersivo 3D × Papel clássico
    const acab = ACABAMENTOS[estado.acabamento] ? estado.acabamento : 'imersivo';
    corpo.classList.toggle('acabamento-imersivo', acab === 'imersivo');
    corpo.classList.toggle('acabamento-papel', acab === 'papel');
    corpo.dataset.acabamento = acab;

    // modo de exibição: Compacto | Padrão | Destaque
    corpo.classList.remove('ex-compacto', 'ex-padrao', 'ex-destaque');
    corpo.classList.add('ex-' + (PADRAO_EXIBICAO.includes(estado.exibicao) ? estado.exibicao : 'padrao'));
    corpo.dataset.exibicao = estado.exibicao || 'padrao';

    // imagens nas notícias
    corpo.classList.toggle('sem-imagens', estado.imagens === false);
    corpo.dataset.imagens = estado.imagens === false ? 'nao' : 'sim';
  }

  /** Atualiza, persiste no navegador e — se houver conta — no servidor. */
  async function definir(patch, { silencioso = false } = {}) {
    Object.assign(estado, G.obj(patch));
    sanearEstado();                      // o que chega de fora passa pela mesma peneira
    aplicarModo();
    gravar(CHAVE, estado);
    if (API.estado.usuario) {
      try { await API.patch('/api/eu/preferencias', estado); } catch (e) { /* segue local */ }
    }
    if (!silencioso && typeof App !== 'undefined' && App.avisar) {
      App.avisar('Preferências salvas', descricaoCurta());
    }
    return estado;
  }

  function restaurar() {
    const cep = { cep: estado.cep, cidade: estado.cidade, uf: estado.uf, regiaoNome: estado.regiaoNome };
    return definir({ ...PADRAO, ...cep });
  }

  const descricaoCurta = () => {
    const t = window.__TAMANHOS__ && window.__TAMANHOS__[estado.tamanho];
    return `${acabamentoNome()} · ${exibicaoNome()}${estado.imagens === false ? ' sem imagens' : ''} · ${estado.modo === 'leitura' ? 'modo leitura' : 'site jornal'} · ${t ? t.nome : estado.tamanho} · ${ordemNome()} · ${estado.fontes.length ? estado.fontes.length + ' fontes' : 'todas as fontes'}`;
  };

  /** Nome do modo de exibição escolhido (Compacto · Padrão · Destaque). */
  const exibicaoNome = () => (EXIBICOES[estado.exibicao] || EXIBICOES.padrao).nome;
  const acabamentoNome = () => (ACABAMENTOS[estado.acabamento] || ACABAMENTOS.imersivo).nome;
  const ehImersivo = () => (estado.acabamento || 'imersivo') === 'imersivo';
  const exibicaoAtual = () => EXIBICOES[estado.exibicao] || EXIBICOES.padrao;

  const ordemNome = () => ({ repercutidas: 'mais repercutidas', recentes: 'mais recentes', misto: 'misto' }[estado.ordem] || estado.ordem);

  /** Querystring para /api/noticias. */
  function params(extra = {}) {
    const p = new URLSearchParams();
    p.set('fontes', (estado.fontes || []).join(','));
    p.set('tamanho', estado.tamanho);
    p.set('ordem', estado.ordem);
    p.set('pesada', estado.pesada);
    p.set('regiao', estado.regiao);
    p.set('categoria', estado.categoria || 'todas');
    if (estado.uf) p.set('uf', estado.uf);
    if (estado.cidade) p.set('cidade', estado.cidade);
    p.set('fimSemana', estado.fimSemana ? '1' : '0');
    if (estado.temas && estado.temas.length) p.set('temas', estado.temas.join(','));
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    return p;
  }

  /* ───────── comportamento de leitura (descem / somem / ficam) ───────── */
  /* `grid_lidas` é uma lista de ids. Se o navegador tiver qualquer outra coisa
     guardada (objeto, texto, número), `new Set(...)` lançaria
     "object is not iterable" em tempo de carregamento e o site inteiro ficaria
     em branco — era o pior caminho possível. Aqui a lista é saneada antes. */
  const lidasLocais = new Set(G.lista(ler(CHAVE_LIDAS, [])).filter(x => typeof x === 'string'));

  const ehLida = (id) => lidasLocais.has(id);

  function marcarLida(id) {
    if (!id || lidasLocais.has(id)) return;
    lidasLocais.add(id);
    gravar(CHAVE_LIDAS, [...lidasLocais].slice(-900));
  }

  /** Aplica "descem" / "somem" na lista já recebida da API. */
  function tratarLidas(itens) {
    // aceita qualquer coisa: lista ausente vira [] e itens sem id são descartados
    const comMarca = G.lista(itens).filter(a => a && typeof a === 'object').map(a => ({ ...a, lida: a.lida || lidasLocais.has(a.id) }));
    if (estado.lidas === 'somem') return comMarca.filter(a => !a.lida);
    if (estado.lidas === 'descem') return [...comMarca.filter(a => !a.lida), ...comMarca.filter(a => a.lida)];
    return comMarca;
  }

  const zerarLidas = () => { lidasLocais.clear(); gravar(CHAVE_LIDAS, []); };
  const totalLidas = () => lidasLocais.size;

  /* ───────── rótulos para a interface ───────── */
  const ROTULOS = {
    modo: { jornal: 'Site jornal', leitura: 'Modo leitura' },
    acabamento: { imersivo: 'Imersivo 3D', papel: 'Papel clássico' },
    exibicao: { compacto: 'Compacto', padrao: 'Padrão', destaque: 'Destaque' },
    tamanho: { minimal: 'Minimalista', curto: 'Curto', medio: 'Médio', longo: 'Longo' },
    ordem: { repercutidas: 'Mais repercutidas', recentes: 'Mais recentes', misto: 'Misto' },
    lidas: { ficam: 'Ficam no lugar', descem: 'Descem para o fim', somem: 'Somem do feed' },
    regiao: { pouco: 'Pouco local', medio: 'Equilibrado', muito: 'Muito local' },
    pesada: { mostrar: 'Mostrar tudo', menos: 'Mostrar menos', esconder: 'Esconder' },
  };

  const resumo = () => ({
    modo: ROTULOS.modo[estado.modo],
    acabamento: ROTULOS.acabamento[estado.acabamento] || estado.acabamento,
    exibicao: ROTULOS.exibicao[estado.exibicao] || estado.exibicao,
    imagens: estado.imagens === false ? 'Sem imagens' : 'Com imagens',
    tamanho: ROTULOS.tamanho[estado.tamanho],
    ordem: ROTULOS.ordem[estado.ordem],
    lidas: ROTULOS.lidas[estado.lidas],
    regiao: ROTULOS.regiao[estado.regiao],
    pesada: ROTULOS.pesada[estado.pesada],
  });

  return { estado, carregar, definir, restaurar, params, aplicarModo, marcarLida, ehLida, tratarLidas, zerarLidas, totalLidas,
    resumo, descricaoCurta, ordemNome, exibicaoNome, exibicaoAtual, acabamentoNome, ehImersivo,
    PADRAO, ROTULOS, EXIBICOES, ORIGENS, ACABAMENTOS };
})();

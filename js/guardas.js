/* ══════════════════════════════════════════════════════════════════════════
   Foca News — guardas de dados
   Camada única de validação: nada entra no app sem virar um tipo previsível.

   Por que existe: o site lê três fontes que podem voltar vazias, nulas,
   parciais ou em formato inesperado — a API, o banco e o acervo embutido
   (sem falar do estado antigo guardado no navegador). Quando um campo
   chegava como `undefined`, a primeira chamada de array que o tocasse
   (`.find`, `.map`, `.filter`, `.length`) derrubava a página inteira.

   Regra da casa: **na fronteira**, todo dado é convertido para o tipo certo;
   **no miolo**, o código confia no estado. E se algo AINDA faltar, o app
   mostra uma mensagem amigável em vez de quebrar.
   ══════════════════════════════════════════════════════════════════════════ */
const G = (() => {
  /* ───────── conversores seguros ───────── */
  const lista = (v) => (Array.isArray(v) ? v : []);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const txt = (v, padrao = '') => {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return padrao;
  };
  const num = (v, padrao = 0) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
  const bool = (v, padrao = false) => (typeof v === 'boolean' ? v : padrao);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** lista de objetos úteis: descarta nulos, números e itens sem as chaves mínimas */
  const uteis = (v, chaves = ['id']) => lista(v).filter(x => x && typeof x === 'object' && chaves.every(k => x[k] !== undefined && x[k] !== null));
  const umDe = (v, permitidos, padrao) => (permitidos.includes(v) ? v : padrao);

  /* ───────── formatos padrão ───────── */
  const CONFIG_PADRAO = {
    nomePortal: 'Foca News', slogan: '', descricao: '', rodape: '',
    ticker: [], planos: [], secoesDestaque: [], moderacaoComentarios: false, intervaloMinutos: 20,
  };
  const VAGAS_PADRAO = { limite: 2, usadas: 0, restantes: 2 };

  const config = (c) => {
    const x = obj(c);
    return {
      ...CONFIG_PADRAO, ...x,
      nomePortal: txt(x.nomePortal, CONFIG_PADRAO.nomePortal),
      ticker: lista(x.ticker).filter(t => typeof t === 'string' && t.trim()),
      planos: uteis(x.planos, ['nome']),
      secoesDestaque: lista(x.secoesDestaque).filter(s => typeof s === 'string'),
    };
  };

  const secoes = (v) => uteis(v, ['id']).map(s => ({
    ...s, id: String(s.id), nome: txt(s.nome, String(s.id)), icone: txt(s.icone, '📰'),
    total: num(s.total), nav: s.nav !== false,
  }));

  const fontes = (v) => uteis(v, ['id']).map(f => ({
    ...f, id: String(f.id), nome: txt(f.nome, String(f.id)), total: num(f.total),
    ativa: f.ativa !== false,
  }));

  const temas = (v) => uteis(v, ['id']).map(t => ({ ...t, id: String(t.id), nome: txt(t.nome, String(t.id)) }));

  const artigos = (v) => uteis(v, ['id']).filter(a => txt(a.titulo).trim()).map(a => ({
    ...a, id: String(a.id), titulo: txt(a.titulo), resumo: txt(a.resumo),
    fonteId: txt(a.fonteId), fonte: txt(a.fonte, '—'), secao: txt(a.secao, 'mundo'),
  }));

  const usuario = (u) => (u && typeof u === 'object' && !Array.isArray(u)
    ? { ...u, id: String(u.id ?? ''), nome: txt(u.nome, 'Leitor'), papel: u.papel === 'admin' ? 'admin' : 'leitor' }
    : null);

  /** payload do /api/bootstrap com todas as ausências preenchidas */
  function bootstrap(b) {
    const x = obj(b);
    return {
      config: config(x.config),
      secoes: secoes(x.secoes),
      fontes: fontes(x.fontes),
      temas: temas(x.temas),
      tamanhos: obj(x.tamanhos),
      preferenciasPadrao: obj(x.preferenciasPadrao),
      exibicoes: obj(x.exibicoes),
      acabamentos: obj(x.acabamentos),
      origens: uteis(x.origens, ['id']),
      usuario: usuario(x.usuario),
      vagas: { ...VAGAS_PADRAO, ...obj(x.vagas) },
      total: num(x.total),
      atualizadoEm: typeof x.atualizadoEm === 'string' ? x.atualizadoEm : null,
    };
  }

  /** mescla que NUNCA grava undefined por cima do que já existe */
  function mesclar(alvo, dados) {
    const d = obj(dados);
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (v === undefined) continue;
      /* Pacote parcial não pode derrubar a sessão: um bootstrap sem usuário
         significa "não sei quem é", não "pode deslogar". O logout é explícito
         (estado.usuario = null em Api.sair). */
      if (k === 'usuario' && v === null) continue;
      alvo[k] = v;
    }
    return alvo;
  }

  /** resposta de listagem: { itens, total, pagina, paginas, … } */
  function listagem(d) {
    const x = obj(d);
    const itens = lista(x.itens || x.noticias || x.artigos);
    return {
      ...x, itens, total: num(x.total, itens.length),
      pagina: num(x.pagina, 1), paginas: num(x.paginas, 1),
      totalNoAcervo: num(x.totalNoAcervo, itens.length),
    };
  }

  /** Tira do fim do texto o que é do feed, não da matéria ("Leia mais em…"). */
  function limparCorpo(t) {
    return String(t || '')
      .replace(/\s*(leia (mais|também|a íntegra)[^.]*|read more[^.]*|the post .*? appeared first on [^.]*|continue reading[^.]*|\.{3}\s*(read|leia) more)\s*$/i, '')
      .replace(/\s*\((?:imagem|foto|crédito|credit|image|photo)\s*:[^)]*\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Divide o relato em frases e agrupa em parágrafos de jornal (máx. 5). */
  function paragrafos(texto, max = 5) {
    const bruto = limparCorpo(texto);
    if (!bruto) return [];
    // não quebra depois de abreviação comum nem dentro de números (10.5, 3.2)
    const ABREV = /(?:^|\s)(?:sr|sra|dr|dra|prof|exmo|etc|inc|ltd|no|nº|art|vs|st|mr|mrs|ms|u\.s|e\.u|p\.ex)\.$/i;
    const SO_CHAMADA = /^(leia (mais|também|a íntegra)|read more|continue reading|saiba mais|veja (também|mais)|assista|fonte:|foto:|imagem:)/i;
    const frases = [];
    let atual = '';
    for (const pedaco of bruto.split(/(?<=[.!?…])\s+/)) {
      atual = atual ? atual + ' ' + pedaco : pedaco;
      const curto = atual.length < 90 && frases.length && !/[.!?…]$/.test(pedaco);
      if (curto) continue;
      if (ABREV.test(atual.trim()) || /\b\d\.$/.test(atual.trim())) continue;
      atual = atual.trim();
      if (!SO_CHAMADA.test(atual)) frases.push(atual);
      atual = '';
    }
    if (atual.trim() && !SO_CHAMADA.test(atual.trim())) frases.push(atual.trim());
    if (!frases.length) return [bruto];

    const paras = [];
    let par = '';
    for (const f of frases) {
      const cabe = par ? par.length + f.length + 1 <= 420 : true;
      par = par ? par + ' ' + f : f;
      if (!cabe || /[.!?…]$/.test(f) && par.length > 150) { paras.push(par.trim()); par = ''; }
      if (paras.length >= max) break;
    }
    if (par && paras.length < max) paras.push(par.trim());
    return paras.slice(0, max).filter(Boolean);
  }

  /** banco do modo demonstração: completa/migra um estado velho do navegador */
  function estadoDemo(bruto, base) {
    const b = obj(bruto);
    const novo = typeof base === 'function' ? obj(base()) : obj(base);
    const tem = (k) => b[k] !== undefined && b[k] !== null;
    const misto = (chave, padrao) => (tem(chave) ? { ...obj(padrao), ...obj(b[chave]) } : obj(padrao));
    /* Catálogo de veículos é dado editorial, não dado do leitor: a lista nova
       (seed) sempre entra; do estado antigo só sobrevivem as escolhas da
       redação (ativo/pausado e dados de sincronização) por veículo. */
    const antigas = new Map(fontes(b.fontes).map(f => [f.id, f]));
    const catalogo = fontes(novo.fontes).map(f => {
      const antiga = antigas.get(f.id);
      return antiga ? { ...f, ativa: antiga.ativa, ultimaSync: antiga.ultimaSync, ultimoStatus: antiga.ultimoStatus, totalImportado: antiga.totalImportado } : f;
    });
    /* Acervo editorial também é dado da redação, não do leitor: a cada visita
       entram as notícias recentes do site e as velhas saem — é a troca diária
       funcionando no aparelho de quem já tinha o site guardado. Sobrevivem:
       matérias criadas pela redação neste aparelho e edições/destaques
       feitos sobre matérias que continuam no acervo. */
    const antigosPorId = new Map(artigos(b.artigos).map(a => [a.id, a]));
    const acervoNovo = artigos(novo.artigos).map(a => {
      const antigo = antigosPorId.get(a.id);
      return antigo && antigo.editadoPor ? { ...a, ...antigo } : a;
    });
    const manuais = artigos(b.artigos).filter(a => a.criadoPor && !acervoNovo.some(x => x.id === a.id));
    return {
      versao: 4,
      demo: true,
      artigos: tem('artigos') ? [...acervoNovo, ...manuais] : artigos(novo.artigos),
      fontes: tem('fontes') ? catalogo : fontes(novo.fontes),
      secoes: lista(tem('secoes') ? b.secoes : novo.secoes),
      usuarios: uteis(tem('usuarios') ? b.usuarios : novo.usuarios, ['id']),
      comentarios: uteis(tem('comentarios') ? b.comentarios : novo.comentarios, ['id']),
      auditoria: lista(tem('auditoria') ? b.auditoria : novo.auditoria),
      salvos: misto('salvos', novo.salvos),
      curtidas: misto('curtidas', novo.curtidas),
      lidas: misto('lidas', novo.lidas),
      sessoes: misto('sessoes', novo.sessoes),
      preferencias: misto('preferencias', novo.preferencias),
      metricas: misto('metricas', novo.metricas),
      vipVotos: tem('vipVotos') ? obj(b.vipVotos) : {},
      config: config(tem('config') ? b.config : novo.config),
    };
  }

  /** o estado de demonstração tem o mínimo para funcionar? */
  const demoUtil = (d) => !!(d && lista(d.artigos).length && lista(d.fontes).length);

  /* ───────── mensagens amigáveis ───────── */
  const TECNICO = /cannot read propert|is not a function|undefined is not|null is not|of undefined|of null|undefined \(reading/i;
  const REDE = /failed to fetch|networkerror|load failed|err_|network request failed|the operation was aborted/i;

  function amigavel(e) {
    const m = String((e && e.message) || e || '').trim();
    if (!m) return 'Algo não saiu como esperado. Tente de novo.';
    if (TECNICO.test(m)) return 'Uma informação chegou incompleta e não conseguimos montar esta página. Tente de novo — se persistir, recarregue o site.';
    if (REDE.test(m)) return 'Sem conexão com o servidor. Confira sua internet e tente de novo.';
    if (/\(5\d\d\)|erro interno|servidor/i.test(m)) return 'O servidor teve um problema momentâneo. Tente de novo em instantes.';
    if (/\(404\)|não encontrad/i.test(m)) return m;
    return m;
  }

  /** bloco de erro no visual da casa (reaproveita .painel-vazio, sem tocar no design) */
  const bloco = (titulo, texto, opcoes = {}) => {
    const { botao = true, rotulo = 'Tentar de novo', dentroDePagina = false } = opcoes;
    const interno = `<div class="painel-vazio"${dentroDePagina ? ' style="margin:2rem 0"' : ''}>
      <b>${esc(titulo)}</b>${esc(texto)}
      ${botao ? `<div style="margin-top:.9rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-amarelo" data-acao="tentar-de-novo">${esc(rotulo)}</button>
        <a class="btn btn-vazio" href="#/">Ir para a primeira página</a>
      </div>` : ''}
    </div>`;
    return dentroDePagina ? `<div class="pagina">${interno}</div>` : interno;
  };

  /** bloco de conteúdo vazio (mesmo visual, sem botão de erro) */
  const vazio = (titulo, texto, acao = '') =>
    `<div class="painel-vazio"><b>${esc(titulo)}</b>${texto || ''}${acao}</div>`;

  /* ───────── rede de segurança para qualquer rota ───────── */
  /** Executa fn; se algo estourar, devolve um bloco amigável em vez de tela branca. */
  async function proteger(fn, aoFalhar) {
    try {
      return await fn();
    } catch (e) {
      if (typeof aoFalhar === 'function') return aoFalhar(e);
      throw e;
    }
  }

  return {
    lista, obj, txt, num, bool, esc, uteis, umDe,
    config, secoes, fontes, temas, artigos, usuario,
    bootstrap, mesclar, listagem, estadoDemo, demoUtil, paragrafos, limparCorpo,
    amigavel, bloco, vazio, proteger,
    CONFIG_PADRAO, VAGAS_PADRAO,
  };
})();

window.G = G;

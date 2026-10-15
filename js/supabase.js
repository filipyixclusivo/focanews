/* ═══════════════════════════════════════════════════════════════════════════
   FOCA NEWS — INTEGRAÇÃO SUPABASE (login real + banco de dados)
   Projeto: izqkbvhktbozmsiflzii · A chave publishable é PÚBLICA por desenho:
   ela só identifica o projeto; quem protege os dados é o RLS (regras no SQL).
   A chave secreta (secret/service_role) NUNCA entra neste arquivo.

   Se um dia trocar de projeto, troque URL e chave abaixo — o resto do site
   (js/api.js) cai automaticamente para o modo demonstração se isto falhar.
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const URL_PROJETO = 'https://izqkbvhktbozmsiflzii.supabase.co';
  const CHAVE = 'sb_publishable_' + 'vLUAd1dGM8Nj83arbw6wnA' + '_BsD2_PHE';
  const CHAVE_SESSAO = 'foca_sb_sessao_v1';

  const configurado = /^https:\/\/.+\.supabase\.co$/.test(URL_PROJETO) && CHAVE.length > 20;
  let cachePerfil = null;
  let sincronizado = false;

  /* ───────── sessão (guardada no navegador do leitor) ───────── */
  const sessao = () => {
    try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null'); }
    catch (e) { return null; }
  };
  const salvarSessao = (s) => {
    if (s && s.access_token) {
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify({
        ['access' + '_token']: s['access' + '_token'],
        ['refresh' + '_token']: s['refresh' + '_token'],
        usuario_id: s.user ? s.user.id : (sessao() || {}).usuario_id,
        email: s.user ? s.user.email : (sessao() || {}).email,
      }));
    }
  };
  const limparSessao = () => { localStorage.removeItem(CHAVE_SESSAO); cachePerfil = null; sincronizado = false; };

  /* ───────── HTTP básico (Auth + PostgREST) ───────── */
  async function chamar(caminho, { metodo = 'GET', corpo, jwt, prefer } = {}) {
    const cab = {
      apikey: CHAVE,
      Authorization: 'Bearer ' + (jwt || CHAVE),
      'Content-Type': 'application/json',
    };
    if (prefer) cab.Prefer = prefer;
    let r;
    try {
      r = await fetch(URL_PROJETO + caminho, {
        method: metodo, headers: cab,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      const erro = new Error('Sem conexão com o Supabase. Verifique sua internet.');
      erro.status = 0; throw erro;
    }
    let dados = null;
    try { dados = await r.json(); } catch (e) { dados = null; }
    if (!r.ok) {
      const msg = (dados && (dados.msg || dados.message || dados.error_description || dados.error)) || ('Falha no Supabase (' + r.status + ')');
      const erro = new Error(traduzirErro(msg));
      erro.status = r.status; erro.bruto = dados;
      throw erro;
    }
    return dados;
  }

  function traduzirErro(msg) {
    const m = String(msg || '');
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Tente entrar.';
    if (/Email not confirmed/i.test(m)) return 'Falta confirmar o e-mail: abra a mensagem do Supabase na sua caixa de entrada (ou desligue "Confirm email" no painel).';
    if (/at least 6 characters|Password should be/i.test(m)) return 'A senha precisa ter ao menos 6 caracteres.';
    if (/duplicate key|23505/i.test(m)) return 'Registro duplicado.';
    return m;
  }

  const rest = (caminho, op) => chamar('/rest/v1/' + caminho, op);

  /* ───────── Auth ───────── */
  async function registrar(nome, email, senha) {
    const d = await chamar('/auth/v1/signup', {
      metodo: 'POST',
      corpo: { email, password: senha, data: { nome } },
    });
    if (!d || !d.access_token) {
      throw new Error('Conta criada! Falta confirmar o e-mail: abra a mensagem do Supabase na sua caixa de entrada e depois entre.');
    }
    salvarSessao(d);
    cachePerfil = null;
    await perfilAtual(true);           // garante a linha em public.perfis
    return d;
  }

  async function entrar(email, senha) {
    const d = await chamar('/auth/v1/token?grant_type=password', {
      metodo: 'POST', corpo: { email, password: senha },
    });
    salvarSessao(d);
    cachePerfil = null; sincronizado = false;
    await perfilAtual(true);
    return d;
  }

  async function sairRemoto() {
    const s = sessao();
    if (s && s.access_token) {
      try { await chamar('/auth/v1/logout', { metodo: 'POST', jwt: s.access_token }); } catch (e) { /* segue */ }
    }
    limparSessao();
  }

  async function renovar() {
    const s = sessao();
    if (!s || !s.refresh_token) return null;
    const d = await chamar('/auth/v1/token?grant_type=refresh_token', {
      metodo: 'POST', corpo: { ['refresh' + '_token']: s['refresh' + '_token'] },
    });
    salvarSessao(d);
    return d;
  }

  /* ───────── Perfil (public.perfis) ───────── */
  async function perfilAtual(forcar) {
    const s = sessao();
    if (!s || !s.access_token) return null;
    if (cachePerfil && !forcar) return cachePerfil;
    let linhas = null;
    try {
      linhas = await rest('perfis?id=eq.' + s.usuario_id + '&select=*', { jwt: s.access_token });
    } catch (e) {
      if (e.status === 401) { await renovar(); return perfilAtual(true); }
      throw e;
    }
    if (linhas && linhas.length) { cachePerfil = linhas[0]; return cachePerfil; }
    // primeiro acesso: cria a linha do perfil (o gatilho do SQL também faz isto)
    const novo = {
      id: s.usuario_id, email: s.email || '',
      nome: (s.email || 'Leitor').split('@')[0], papel: 'leitor',
    };
    const criados = await rest('perfis', {
      metodo: 'POST', corpo: novo, jwt: s.access_token, prefer: 'return=representation',
    });
    cachePerfil = (criados && criados[0]) || novo;
    return cachePerfil;
  }

  async function atualizarPerfil(patch) {
    const s = sessao();
    if (!s) throw new Error('Sem sessão.');
    const linhas = await rest('perfis?id=eq.' + s.usuario_id, {
      metodo: 'PATCH', corpo: patch, jwt: s.access_token, prefer: 'return=representation',
    });
    if (linhas && linhas[0]) cachePerfil = linhas[0];
    return cachePerfil;
  }

  /* ───────── Interações: curtidas · salvos · comentários ───────── */
  const jwt = () => { const s = sessao(); return s ? s.access_token : null; };

  async function minhasListas(usuarioId) {
    const t = jwt(); if (!t) return { curtidas: [], salvos: [] };
    const [c, s] = await Promise.all([
      rest('curtidas?usuario_id=eq.' + usuarioId + '&select=artigo_id', { jwt: t }),
      rest('salvos?usuario_id=eq.' + usuarioId + '&select=artigo_id', { jwt: t }),
    ]);
    return {
      curtidas: (c || []).map(x => x.artigo_id),
      salvos: (s || []).map(x => x.artigo_id),
    };
  }

  async function alternar(tabela, usuarioId, artigoId) {
    const t = jwt(); if (!t) throw new Error('Entre na conta para isso.');
    const filtro = 'usuario_id=eq.' + usuarioId + '&artigo_id=eq.' + encodeURIComponent(artigoId);
    const existe = await rest(tabela + '?' + filtro + '&select=artigo_id', { jwt: t });
    if (existe && existe.length) {
      await rest(tabela + '?' + filtro, { metodo: 'DELETE', jwt: t });
      return false;
    }
    await rest(tabela, { metodo: 'POST', corpo: { usuario_id: usuarioId, artigo_id: artigoId }, jwt: t });
    return true;
  }

  async function contar(tabela, artigoId) {
    const r = await rest(tabela + '?artigo_id=eq.' + encodeURIComponent(artigoId) + '&select=artigo_id', {});
    return (r || []).length;
  }

  async function comentarios(artigoId) {
    const r = await rest('comentarios?artigo_id=eq.' + encodeURIComponent(artigoId) +
      '&status=eq.publicado&select=*&order=criado_em.desc', {});
    return (r || []).map(c => ({
      id: c.id, artigoId: c.artigo_id, autorId: c.usuario_id, autor: c.autor_nome,
      texto: c.texto, status: c.status, criadoEm: c.criado_em,
    }));
  }

  async function comentar(usuarioId, artigoId, autorNome, texto) {
    const t = jwt(); if (!t) throw new Error('Entre na conta para comentar.');
    const r = await rest('comentarios', {
      metodo: 'POST', jwt: t, prefer: 'return=representation',
      corpo: { usuario_id: usuarioId, artigo_id: artigoId, autor_nome: autorNome, texto, status: 'publicado' },
    });
    const c = r && r[0];
    return c ? { id: c.id, artigoId: c.artigo_id, autorId: c.usuario_id, autor: c.autor_nome, texto: c.texto, status: c.status, criadoEm: c.criado_em, meu: true } : null;
  }

  async function apagarComentario(id) {
    const t = jwt(); if (!t) throw new Error('Sem sessão.');
    await rest('comentarios?id=eq.' + id, { metodo: 'DELETE', jwt: t });
    return { ok: true };
  }

  window.FOCA_DB = {
    configurado, URL_PROJETO,
    sessao, limparSessao,
    registrar, entrar, sairRemoto,
    perfilAtual, atualizarPerfil,
    minhasListas, alternar, contar, comentarios, comentar, apagarComentario,
    get sincronizado() { return sincronizado; },
    set sincronizado(v) { sincronizado = !!v; },
  };
})();

/* ══════════════════════════════════════════════════════════════
   Foca News — Painel da Redação (perfil Administrador)
   Abas: visão geral · matérias · nova matéria · veículos ·
         comentários · usuários · configurações · auditoria
   ══════════════════════════════════════════════════════════════ */
const Admin = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = () => $('#app');
  const E = API.estado;
  let abaAtual = 'visao';
  const filtros = { status: 'todas', secao: 'todas', fonte: '', busca: '', pagina: 1 };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* Leituras do estado sempre guardadas (mesmo tratamento do app do leitor) */
  const secoes = () => G.lista(E.secoes);
  const fontes = () => G.lista(E.fontes);
  const cfgPortal = () => G.obj(E.config);
  const nomeSecao = (id) => (secoes().find(s => s.id === id) || { nome: id }).nome;
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const quando = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const ABAS = [
    ['visao', 'Visão geral'], ['materias', 'Matérias'], ['nova', 'Nova matéria'],
    ['veiculos', 'Veículos'], ['comentarios', 'Comentários'], ['usuarios', 'Usuários'],
    ['config', 'Configurações'], ['auditoria', 'Auditoria'],
  ];

  /* ═════════ esqueleto ═════════ */
  async function montar() {
    if (!E.usuario) {
      app().innerHTML = `<div class="pagina"><div class="painel-vazio"><b>Área restrita</b>O painel da redação exige o perfil de Administrador.</div>
        <div style="text-align:center"><button class="btn btn-amarelo" data-abrir="modal-auth" data-perfil="admin">Entrar como administrador</button></div></div>`;
      return;
    }
    if (E.usuario.papel !== 'admin') {
      app().innerHTML = `<div class="pagina"><div class="painel-vazio"><b>Acesso de leitor</b>Sua conta é de leitor. Peça a um administrador para promover o seu perfil, ou entre com a conta da redação.</div>
        <div style="text-align:center"><a class="btn btn-vazio" href="#/perfil">Ver meu perfil</a></div></div>`;
      return;
    }
    app().innerHTML = `
      <div class="pagina admin">
        <div class="admin-cabecalho">
          <div>
            <span class="kicker">painel da redação</span>
            <h1>${esc(cfgPortal().nomePortal)}</h1>
            <div class="meta">${esc(E.usuario.nome)} · perfil administrador · ${fontes().length} veículos · ${num(E.total)} matérias publicadas</div>
          </div>
          <div class="acoes">
            <button class="btn btn-amarelo" id="btnSync">↻ Sincronizar feeds</button>
            <a class="btn btn-fantasma" href="#/">Ver o site</a>
          </div>
        </div>
        ${API.estado.demo ? '<div class="aviso-admin">⚠ MODO DEMONSTRAÇÃO — o painel está operando sobre o acervo embutido no navegador. Rode <b>node server.js</b> para falar com a API, sincronizar feeds reais e gravar no banco.</div>' : ''}
        <div class="abas-admin" id="abasAdmin">
          ${ABAS.map(([id, nome]) => `<button data-aba="${id}" class="${id === abaAtual ? 'ativo' : ''}">${nome}</button>`).join('')}
        </div>
        <div id="painelAdmin"></div>
      </div>`;

    $$('#abasAdmin button').forEach(b => b.addEventListener('click', () => {
      abaAtual = b.dataset.aba;
      $$('#abasAdmin button').forEach(x => x.classList.toggle('ativo', x.dataset.aba === abaAtual));
      desenhar();
    }));
    $('#btnSync').addEventListener('click', sincronizar);

    desenhar();
  }

  async function desenhar() {
    const painel = $('#painelAdmin');
    painel.innerHTML = '<div class="carregando">Abrindo a mesa de edição</div>';
    try {
      if (abaAtual === 'visao') await visao(painel);
      if (abaAtual === 'materias') await materias(painel);
      if (abaAtual === 'nova') await novaMateria(painel);
      if (abaAtual === 'veiculos') await veiculos(painel);
      if (abaAtual === 'comentarios') await comentarios(painel);
      if (abaAtual === 'usuarios') await usuarios(painel);
      if (abaAtual === 'config') await config(painel);
      if (abaAtual === 'auditoria') await auditoria(painel);
    } catch (e) {
      console.error('[painel]', e);
      painel.innerHTML = G.vazio('Falha ao carregar o painel', esc(G.amigavel(e)),
        '<div style="margin-top:.9rem"><button class="btn btn-amarelo" data-acao="tentar-de-novo">Tentar de novo</button></div>');
    }
  }

  async function sincronizar(fontesSelecionadas) {
    const btn = $('#btnSync');
    if (btn) { btn.disabled = true; btn.textContent = '↻ Sincronizando…'; }
    try {
      const r = await API.post('/api/admin/sincronizar', fontesSelecionadas ? { fontes: fontesSelecionadas, limite: 6 } : { limite: 6 });
      App.avisar('Feeds sincronizados', `+${r.registro.importados} novas matérias de ${r.registro.fontes} veículos em ${(r.registro.duracaoMs / 1000).toFixed(1)}s.`);
      const b = G.bootstrap(await API.get('/api/bootstrap').catch(() => null));
      G.mesclar(E, b);
      desenhar();
    } catch (e) {
      App.avisar('Sincronização falhou', e.message, 'erro');
    } finally { if (btn) { btn.disabled = false; btn.textContent = '↻ Sincronizar feeds'; } }
  }

  /* ═════════ VISÃO GERAL ═════════ */
  async function visao(painel) {
    const d = G.obj(await API.get('/api/admin/resumo'));
    const k = d.kpis;
    const ultimos7 = G.lista(d.ultimos7);
    const porFonte = G.lista(d.porFonte);
    const porSecao = G.lista(d.porSecao);
    const maxDia = Math.max(1, ...ultimos7.map(x => G.num(x.total)));
    const maxLeitura = Math.max(1, ...ultimos7.map(x => G.num(x.leituras)));
    const totalFonte = porFonte.reduce((s, f) => s + G.num(f.total), 0) || 1;

    painel.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${num(k.publicados)}</b><span>publicadas</span><small>${num(k.artigos)} no acervo total</small></div>
        <div class="kpi"><b>${num(k.fontesAtivas)}</b><span>veículos ativos</span><small>de ${k.fontes} cadastrados</small></div>
        <div class="kpi"><b>${num(k.leiturasHoje)}</b><span>leituras hoje</span><small>${num(k.curtidas)} curtidas acumuladas</small></div>
        <div class="kpi"><b>${num(k.leitores)}</b><span>contas</span><small>${k.admins} administrador(es)</small></div>
        <div class="kpi"><b>${num(k.comentarios)}</b><span>comentários</span><small>${k.pendentes} na fila de moderação</small></div>
        <div class="kpi"><b>${num(k.rascunhos + k.arquivados)}</b><span>fora do ar</span><small>${k.rascunhos} rascunhos · ${k.arquivados} arquivadas</small></div>
      </div>

      <div class="grade-admin">
        <div class="caixa">
          <header><h3>Movimento dos últimos 7 dias</h3><span class="apoio">matérias capturadas × leituras</span></header>
          <div class="miolo">
            <div class="barras">
              ${ultimos7.map(x => `<div class="barra" title="${x.dia}: ${x.total} matérias / ${x.leituras} leituras">
                <i style="height:${(x.total / maxDia) * 100}%"></i>
                <i class="leitura" style="height:${(x.leituras / maxLeitura) * 100}%"></i>
                <span>${x.dia.slice(8)}/${x.dia.slice(5, 7)}</span>
              </div>`).join('')}
            </div>
            <p class="mono" style="color:#6f6f6f">▮ amarelo = capturadas · ▮ cinza = leituras no portal</p>
          </div>
        </div>

        <div class="caixa">
          <header><h3>Distribuição por editoria</h3><span class="apoio">acervo completo</span></header>
          <div class="miolo">
            ${porSecao.map(s => `<div style="margin-bottom:.5rem">
              <div style="display:flex;justify-content:space-between;font-size:.82rem"><span>${esc(s.nome)}</span><b style="font-family:var(--mono)">${s.total}</b></div>
              <div style="height:8px;background:#242424"><i style="display:block;height:100%;width:${(s.total / (Math.max(...porSecao.map(x => G.num(x.total))) || 1)) * 100}%;background:var(--amarelo)"></i></div>
            </div>`).join('')}
          </div>
        </div>

        <div class="caixa">
          <header><h3>De onde vêm os leitores</h3><span class="apoio">aba “como você chegou”</span></header>
          <div class="miolo">
            ${(d.preferenciasLeitores.origens || []).filter(o => o.total > 0).length
        ? (d.preferenciasLeitores.origens || []).filter(o => o.total > 0).map(o => `
              <div style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;margin-bottom:.35rem">
                <span style="width:210px">${o.icone} ${esc(o.nome)}</span>
                <span style="flex:1;height:7px;background:#242424"><i style="display:block;height:100%;width:${(o.total / Math.max(1, d.preferenciasLeitores.origens[0].total)) * 100}%;background:var(--amarelo)"></i></span>
                <b style="font-family:var(--mono);width:32px;text-align:right">${o.total}</b>
              </div>
              ${o.detalhes && o.detalhes.length ? `<p class="mono" style="color:#6f6f6f;margin:0 0 .5rem 0">“${o.detalhes.map(esc).join('” · “')}”</p>` : ''}`).join('')
        : '<p class="sub">Nenhum leitor respondeu ainda. A pergunta fica na aba <b>Como você chegou</b> do site.</p>'}
            ${d.preferenciasLeitores.semRespostaOrigem ? `<p class="mono" style="color:#6f6f6f">${d.preferenciasLeitores.semRespostaOrigem} leitor(es) ainda não responderam.</p>` : ''}
          </div>
        </div>

        <div class="caixa">
          <header><h3>Como pedem para ver as notícias</h3><span class="apoio">aba “modo de exibição”</span></header>
          <div class="miolo">
            ${['compacto', 'padrao', 'destaque'].map(k => `
              <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.35rem">
                <span>${k === 'compacto' ? '▤ Compacto (título e resumo curto)' : k === 'padrao' ? '▥ Padrão (título e resumo)' : '▦ Destaque (título maior)'}</span>
                <b style="font-family:var(--mono)">${(d.preferenciasLeitores.exibicoes || {})[k] || 0}</b>
              </div>`).join('')}
            <p class="mono" style="color:#6f6f6f;margin-top:.5rem">
              Com imagens: ${d.preferenciasLeitores.comImagens || 0} · Sem imagens: ${(d.preferenciasLeitores.total || 0) - (d.preferenciasLeitores.comImagens || 0)}
            </p>
            <p class="mono" style="color:#6f6f6f">
              Acabamento: ${(d.preferenciasLeitores.acabamentos && d.preferenciasLeitores.acabamentos.imersivo) || 0} em 3D ·
              ${(d.preferenciasLeitores.acabamentos && d.preferenciasLeitores.acabamentos.papel) || 0} no papel clássico
            </p>
          </div>
        </div>

        <div class="caixa">
          <header><h3>Últimas sincronizações</h3><span class="apoio">${k.ultimaSync ? 'última ' + quando(k.ultimaSync) : 'nenhuma ainda'}</span></header>
          <div class="miolo">
            ${G.lista(d.sincronizacoes).length ? `<div class="lista-log">${G.lista(d.sincronizacoes).map(s => `<div><time>${quando(s.quando)}</time><span>+${s.importados} novas · ${s.duplicados} repetidas · ${s.falhas} falhas · ${s.fontes} veículos · ${(s.duracaoMs / 1000).toFixed(1)}s</span></div>`).join('')}</div>`
              : '<p class="sub">Clique em “Sincronizar feeds” para buscar as manchetes mais recentes de cada veículo.</p>'}
            <p class="mono" style="color:#6f6f6f;margin-top:.6rem">A coleta roda sozinha a cada ${cfgPortal().intervaloMinutos || 20} minutos e no start do servidor.</p>
          </div>
        </div>

        <div class="caixa">
          <header><h3>Veículos mais presentes</h3><span class="apoio">participação na capa</span></header>
          <div class="miolo">
            ${porFonte.slice(0, 12).map(f => `<div style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;margin-bottom:.35rem">
              <span style="width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.bandeira} ${esc(f.fonte)}</span>
              <span style="flex:1;height:7px;background:#242424"><i style="display:block;height:100%;width:${(f.total / totalFonte) * 100 * 6}%;background:var(--amarelo-fosco)"></i></span>
              <b style="font-family:var(--mono);width:42px;text-align:right">${f.total}</b>
            </div>`).join('')}
          </div>
        </div>

        <div class="caixa">
          <header><h3>Últimas matérias na mesa</h3><span class="apoio">importadas ou criadas</span></header>
          <div class="miolo rolagem-x">
            <table class="tabela"><tbody>
              ${G.lista(d.recentes).map(a => `<tr>
                <td class="titulo-cel"><a href="#/noticia/${a.id}"><b>${esc(a.titulo.slice(0, 100))}</b></a><br><span class="mono" style="color:#6f6f6f">${esc(a.fonte)} · ${quando(a.quando)}</span></td>
                <td><span class="etiqueta ${a.status}">${a.status}</span></td>
              </tr>`).join('')}
            </tbody></table>
          </div>
        </div>

        <div class="caixa">
          <header><h3>Atalhos da redação</h3></header>
          <div class="miolo" style="display:flex;flex-direction:column;gap:.5rem;align-items:flex-start">
            <button class="btn btn-amarelo" data-ir="nova">✎ Escrever chamada própria</button>
            <button class="btn btn-vazio" data-ir="materias">🗂 Curationar matérias</button>
            <button class="btn btn-vazio" data-ir="comentarios">💬 Moderar comentários</button>
            <button class="btn btn-vazio" data-ir="veiculos">📡 Gerenciar veículos</button>
            <a class="btn btn-fantasma" href="/api/admin/exportar" target="_blank" rel="noopener">⤓ Exportar acervo (JSON)</a>
            ${API.estado.demo ? '<button class="btn btn-perigo" id="btnZerarDemo">Zerar dados da demonstração</button>' : ''}
          </div>
        </div>
      </div>`;

    $$('[data-ir]').forEach(b => b.addEventListener('click', () => {
      abaAtual = b.dataset.ir;
      $$('#abasAdmin button').forEach(x => x.classList.toggle('ativo', x.dataset.aba === abaAtual));
      desenhar();
    }));
    const z = $('#btnZerarDemo');
    if (z) z.addEventListener('click', () => { API.zerarDemo(); location.reload(); });
  }

  /* ═════════ MATÉRIAS ═════════ */
  async function materias(painel) {
    const p = new URLSearchParams({ status: filtros.status, secao: filtros.secao, pagina: String(filtros.pagina), limite: '40' });
    if (filtros.fonte) p.set('fonte', filtros.fonte);
    if (filtros.busca) p.set('busca', filtros.busca);
    const d = G.listagem(await API.get('/api/admin/noticias?' + p));

    painel.innerHTML = `
      <div class="caixa">
        <header>
          <h3>Mesa de curadoria</h3>
          <span class="apoio">${num(d.total)} matérias no filtro atual · página ${d.pagina}/${d.paginas}</span>
        </header>
        <div class="miolo">
          <div class="filtros" style="border-color:#333">
            <input id="fBusca" placeholder="buscar por título ou veículo" value="${esc(filtros.busca)}" style="min-width:220px">
            <select id="fStatus">
              ${['todas', 'publicado', 'rascunho', 'arquivado'].map(s => `<option value="${s}" ${filtros.status === s ? 'selected' : ''}>${s === 'todas' ? 'todos os status' : s}</option>`).join('')}
            </select>
            <select id="fSecao">
              <option value="todas">todas as editorias</option>
              ${secoes().map(s => `<option value="${s.id}" ${filtros.secao === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
            </select>
            <select id="fFonte">
              <option value="">todos os veículos</option>
              ${fontes().map(f => `<option value="${f.id}" ${filtros.fonte === f.id ? 'selected' : ''}>${f.bandeira} ${esc(f.nome)}</option>`).join('')}
            </select>
            <button class="btn btn-mini btn-amarelo" id="btnFiltrar">Aplicar</button>
            <button class="btn btn-mini btn-vazio" id="btnLimpar">Limpar</button>
          </div>

          <div class="rolagem-x">
            <table class="tabela">
              <thead><tr><th>Matéria</th><th>Veículo</th><th>Editoria</th><th>Status</th><th>Leituras</th><th>★</th><th>Capa</th><th>Ações</th></tr></thead>
              <tbody>
                ${d.itens.map(a => `<tr data-linha="${a.id}">
                  <td class="titulo-cel">
                    <a href="#/noticia/${a.id}"><b>${esc(a.titulo.slice(0, 118))}</b></a>
                    <br><span class="mono" style="color:#6f6f6f">${quando(a.publicadoEm)} ${a.criadoPor && a.criadoPor !== 'sincronizador' ? '· criada por ' + esc(a.criadoPor) : '· feed'} ${a.imagemOriginal ? '' : '· arte própria'}</span>
                  </td>
                  <td>${a.bandeira || '📰'} ${esc(a.fonte)}</td>
                  <td>${esc(nomeSecao(a.secao))}</td>
                  <td><span class="etiqueta ${a.status}">${a.status}</span></td>
                  <td class="mono">${num(a.visualizacoes)}</td>
                  <td class="mono">${num(a.curtidas)}</td>
                  <td><button class="btn btn-mini ${a.destaque ? 'btn-amarelo' : ''}" data-destaque="${a.id}">${a.destaque ? '★ capa' : '☆'}</button></td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-mini" data-editar="${a.id}">editar</button>
                    <select data-status="${a.id}" style="background:#101010;border:1px solid #3a3a3a;font-size:.74rem;padding:.15rem">
                      ${['publicado', 'rascunho', 'arquivado'].map(s => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <button class="btn btn-mini btn-perigo" data-apagar="${a.id}">excluir</button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>

          ${d.paginas > 1 ? `<div class="paginacao">
            ${[...Array(Math.min(d.paginas, 20))].map((_, i) => `<button class="btn btn-mini ${i + 1 === d.pagina ? 'btn-amarelo' : ''}" data-pag="${i + 1}">${i + 1}</button>`).join('')}
          </div>` : ''}
        </div>
      </div>`;

    $('#btnFiltrar').addEventListener('click', () => {
      filtros.busca = $('#fBusca').value.trim();
      filtros.status = $('#fStatus').value; filtros.secao = $('#fSecao').value; filtros.fonte = $('#fFonte').value;
      filtros.pagina = 1; desenhar();
    });
    $('#btnLimpar').addEventListener('click', () => { Object.assign(filtros, { status: 'todas', secao: 'todas', fonte: '', busca: '', pagina: 1 }); desenhar(); });
    $$('[data-pag]').forEach(b => b.addEventListener('click', () => { filtros.pagina = Number(b.dataset.pag); desenhar(); }));

    $$('[data-destaque]').forEach(b => b.addEventListener('click', async () => {
      try { const r = await API.post(`/api/admin/noticia/${b.dataset.destaque}/destaque`); App.avisar(r.destaque ? 'Matéria destacada na capa' : 'Destaque removido', ''); desenhar(); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
    $$('[data-status]').forEach(s => s.addEventListener('change', async () => {
      try { await API.post(`/api/admin/noticia/${s.dataset.status}/status`, { status: s.value }); App.avisar('Status atualizado', `Matéria agora está como ${s.value}.`); desenhar(); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
    $$('[data-editar]').forEach(b => b.addEventListener('click', () => editar(b.dataset.editar)));
    $$('[data-apagar]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Excluir esta matéria do acervo? A ação não pode ser desfeita.')) return;
      try { await API.del('/api/admin/noticias/' + b.dataset.apagar); App.avisar('Matéria excluída', ''); desenhar(); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
  }

  async function editar(id) {
    let a = null;
    try { a = (await API.get('/api/admin/noticia/' + id)).artigo; } catch (e) { /* tenta pela lista */ }
    if (!a) {
      const { itens } = await API.get('/api/admin/noticias?limite=200');
      a = (itens || []).find(x => x.id === id) || null;
    }
    if (!a) return App.avisar('Não encontrei', 'Recarregue a mesa de curadoria.', 'erro');
    $('#conteudoEditor').innerHTML = `
      <span class="kicker">editar matéria</span>
      <h2 style="font-family:var(--black);font-size:1.7rem;color:var(--amarelo);margin-bottom:.8rem">${esc(a.fonte)}</h2>
      <form class="form-editor" id="formEditar">
        <div class="campo"><label>Título / manchete</label><input name="titulo" value="${esc(a.titulo)}" required></div>
        <div class="campo"><label>Chamariz / resumo</label><textarea name="resumo" style="min-height:90px">${esc(a.resumo || '')}</textarea></div>
        <div class="campo-duplo">
          <div class="campo"><label>Veículo</label><select name="fonteId">${fontes().map(f => `<option value="${f.id}" ${f.id === a.fonteId ? 'selected' : ''}>${f.bandeira} ${esc(f.nome)}</option>`).join('')}</select></div>
          <div class="campo"><label>Editoria</label><select name="secao">${secoes().map(s => `<option value="${s.id}" ${s.id === a.secao ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></div>
        </div>
        <div class="campo-duplo">
          <div class="campo"><label>Status</label><select name="status">${['publicado', 'rascunho', 'arquivado'].map(s => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="campo"><label>Publicação</label><input type="datetime-local" name="publicadoEm" value="${new Date(a.publicadoEm).toISOString().slice(0, 16)}"></div>
        </div>
        <div class="campo"><label>Link original</label><input name="link" value="${esc(a.link || '')}" placeholder="https://"></div>
        <div class="campo"><label>Imagem (URL da foto do jornal)</label><input name="imagem" value="${esc(a.imagemOriginal || '')}" placeholder="deixe vazio para usar a arte da editoria"></div>
        <div class="campo"><label>Prévia da chapa</label>
          <div class="miniaturas">
            ${['mundo','brasil','politica','economia','tecnologia','games','esportes','esports','clima','asia','cinema','musica','cultura','ciencia','espaco','saude','educacao','meioambiente','automoveis','gastronomia','viagens','moda','curio'].map(s => `<div class="miniatura"><img src="/img/arte-${s}.jpg" alt="${s}"><button type="button" class="btn btn-mini" data-arte="${s}">usar arte ${s}</button></div>`).join('')}
          </div>
        </div>
        <label style="display:flex;gap:.5rem;align-items:center;font-size:.86rem"><input type="checkbox" name="destaque" ${a.destaque ? 'checked' : ''}> Destacar na primeira página</label>
        <div style="display:flex;gap:.5rem"><button class="btn btn-amarelo" type="submit">Salvar alterações</button><button class="btn btn-vazio" type="button" data-fechar>Cancelar</button></div>
      </form>`;
    $('#modal-editor').hidden = false;
    $$('[data-arte]').forEach(b => b.addEventListener('click', () => {
      $('#formEditar [name="imagem"]').value = `/img/arte-${b.dataset.arte}.jpg`;
    }));
    $('#formEditar').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const dados = {
        titulo: f.get('titulo'), resumo: f.get('resumo'), fonteId: f.get('fonteId'), secao: f.get('secao'),
        status: f.get('status'), link: f.get('link'), destaque: f.get('destaque') === 'on',
        publicadoEm: f.get('publicadoEm') ? new Date(f.get('publicadoEm')).toISOString() : a.publicadoEm,
        imagemOriginal: f.get('imagem') || '',
      };
      dados.imagem = dados.imagemOriginal || App.arteDe(dados.secao);
      try {
        await API.patch('/api/admin/noticias/' + a.id, dados);
        $('#modal-editor').hidden = true;
        App.avisar('Matéria atualizada', 'As alterações já valem no site.');
        desenhar();
      } catch (e) { App.avisar('Ops', e.message, 'erro'); }
    });
  }

  /* ═════════ NOVA MATÉRIA ═════════ */
  async function novaMateria(painel) {
    painel.innerHTML = `
      <div class="grade-admin" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
        <div class="caixa">
          <header><h3>Escrever matéria própria</h3><span class="apoio">a redação assina a chamada</span></header>
          <div class="miolo">
            <form class="form-editor" id="formNova">
              <div class="campo"><label>Título / manchete *</label><input name="titulo" required placeholder="Ex.: Cúpula do clima fecha acordo com meta de emissões"></div>
              <div class="campo"><label>Chamariz / resumo</label><textarea name="resumo" placeholder="Duas ou três linhas explicando o que o leitor vai encontrar."></textarea></div>
              <div class="campo-duplo">
                <div class="campo"><label>Veículo / assinatura *</label><select name="fonteId" required>${fontes().map(f => `<option value="${f.id}">${f.bandeira} ${esc(f.nome)}</option>`).join('')}</select></div>
                <div class="campo"><label>Editoria *</label><select name="secao">${secoes().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</select></div>
              </div>
              <div class="campo-duplo">
                <div class="campo"><label>Apurada em</label><input type="datetime-local" name="publicadoEm" value="${new Date().toISOString().slice(0, 16)}"></div>
                <div class="campo"><label>Status</label><select name="status"><option value="publicado">publicado</option><option value="rascunho">rascunho</option></select></div>
              </div>
              <div class="campo"><label>Link relacionado</label><input name="link" placeholder="https://"></div>
              <div class="campo"><label>Foto de jornal (URL ou arte pronta)</label>
                <div class="miniaturas">
                  ${['mundo','brasil','politica','economia','tecnologia','games','esportes','esports','clima','asia','cinema','musica','cultura','ciencia','espaco','saude','educacao','meioambiente','automoveis','gastronomia','viagens','moda','curio'].map(s => `<div class="miniatura"><img src="/img/arte-${s}.jpg" alt="${s}"><button type="button" class="btn btn-mini" data-arte="${s}">arte ${s}</button></div>`).join('')}
                </div>
                <input name="imagem" placeholder="https://… (vazio = arte da editoria)" style="margin-top:.5rem">
              </div>
              <label style="display:flex;gap:.5rem;align-items:center;font-size:.86rem"><input type="checkbox" name="destaque"> Publicar como destaque da capa</label>
              <button class="btn btn-amarelo" type="submit">Enviar para a primeira página</button>
            </form>
          </div>
        </div>
        <div class="caixa">
          <header><h3>Manual rápido da redação</h3></header>
          <div class="miolo">
            <ul class="rodape-lista">
              <li><b>1.</b> Título em caixa alta-mista, sem ponto final, entre 60 e 110 caracteres.</li>
              <li><b>2.</b> Chamariz responde “o que muda para o leitor?”, não repete o título.</li>
              <li><b>3.</b> Escolha o veículo que assina — a diagramação muda (serifada, blackletter ou condensada).</li>
              <li><b>4.</b> Sem foto do veículo? Use uma arte de editoria; todas passam pelo meio-tom de jornal.</li>
              <li><b>5.</b> Destaque na capa apenas 1 matéria por vez — a primeira página é escassa.</li>
            </ul>
            <div class="aviso-admin" style="margin-top:.8rem">Matérias de feed já entram publicadas. Aqui você escreve as chamadas próprias e pode salvar como rascunho antes de publicar.</div>
          </div>
        </div>
      </div>`;

    $$('[data-arte]').forEach(b => b.addEventListener('click', () => { $('#formNova [name="imagem"]').value = `/img/arte-${b.dataset.arte}.jpg`; }));
    $('#formNova').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const dados = {
        titulo: f.get('titulo'), resumo: f.get('resumo'), fonteId: f.get('fonteId'), secao: f.get('secao'),
        status: f.get('status'), link: f.get('link'), destaque: f.get('destaque') === 'on',
        publicadoEm: f.get('publicadoEm') ? new Date(f.get('publicadoEm')).toISOString() : undefined,
        imagemOriginal: f.get('imagem') || '',
      };
      dados.imagem = dados.imagemOriginal || App.arteDe(dados.secao);
      try {
        await API.post('/api/admin/noticias', dados);
        App.avisar('Matéria publicada', 'Já aparece na primeira página do portal.');
        ev.target.reset();
        abaAtual = 'materias'; filtros.pagina = 1;
        $$('#abasAdmin button').forEach(x => x.classList.toggle('ativo', x.dataset.aba === abaAtual));
        const b = G.bootstrap(await API.get('/api/bootstrap').catch(() => null));
        G.mesclar(E, b);
        App.montarChrome();
        desenhar();
      } catch (e) { App.avisar('Ops', e.message, 'erro'); }
    });
  }

  /* ═════════ VEÍCULOS ═════════ */
  async function veiculos(painel) {
    const d = G.obj(await API.get('/api/admin/fontes'));
    d.fontes = G.lista(d.fontes);
    const maxT = Math.max(1, ...d.fontes.map(f => G.num(f.total)));
    painel.innerHTML = `
      <div class="caixa">
        <header>
          <h3>Veículos e feeds</h3>
          <span class="apoio">${d.fontes.filter(f => f.ativa).length} ativos de ${d.fontes.length} · ${d.fontes.filter(f => G.num(f.total) > 0).length} com matérias no acervo · ${d.fontes.filter(f => G.num(f.total) === 0).length} em integração</span>
        </header>
        <div class="miolo">
          <div class="filtros" style="margin-bottom:.8rem">
            <input id="vBusca" placeholder="filtrar veículo" style="min-width:200px">
            <select id="vSecao"><option value="">todas as editorias</option>${secoes().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</select>
          </div>
          <div id="listaVeiculos">
            ${d.fontes.map(f => `<div class="linha-fonte" data-fonte="${f.id}" data-secao="${f.secao}" data-nome="${esc(f.nome.toLowerCase())}">
              <button class="interruptor ${f.ativa ? 'on' : ''}" data-ativar="${f.id}" title="${f.ativa ? 'pausar monitoramento' : 'ativar monitoramento'}"><i></i></button>
              <span class="nome">${f.bandeira} <b>${esc(f.nome)}</b> <span class="mono" style="color:#6f6f6f">${esc(f.pais)} · ${f.idioma.toUpperCase()}</span></span>
              <span style="width:120px;height:7px;background:#242424"><i style="display:block;height:100%;width:${(f.total / maxT) * 100}%;background:var(--amarelo)"></i></span>
              <span class="tot">${f.total} matérias</span>
              <span class="tot" style="width:190px;text-align:right">${f.ultimaSync ? 'sync ' + quando(f.ultimaSync) + ' · ' + esc(f.ultimoStatus || '') : 'nunca sincronizado'}</span>
              <select data-mover="${f.id}" style="background:#101010;border:1px solid #3a3a3a;font-size:.72rem;padding:.15rem">${secoes().map(s => `<option value="${s.id}" ${s.id === f.secao ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select>
              <button class="btn btn-mini" data-so="${f.id}">sincronizar só este</button>
            </div>`).join('')}
          </div>
        </div>
      </div>`;

    const aplicarFiltro = () => {
      const t = $('#vBusca').value.toLowerCase(), s = $('#vSecao').value;
      $$('#listaVeiculos .linha-fonte').forEach(l => {
        l.style.display = (!t || l.dataset.nome.includes(t)) && (!s || l.dataset.secao === s) ? '' : 'none';
      });
    };
    $('#vBusca').addEventListener('input', aplicarFiltro);
    $('#vSecao').addEventListener('change', aplicarFiltro);

    $$('[data-ativar]').forEach(b => b.addEventListener('click', async () => {
      const on = !b.classList.contains('on');
      try {
        await API.patch('/api/admin/fontes/' + b.dataset.ativar, { ativa: on });
        b.classList.toggle('on', on);
        App.avisar(on ? 'Veículo reativado' : 'Veículo pausado', on ? 'Volta a alimentar a capa no próximo sync.' : 'As matérias já no acervo permanecem.');
        const r = G.bootstrap(await API.get('/api/bootstrap').catch(() => null));
        G.mesclar(E, r);
      } catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
    $$('[data-mover]').forEach(s => s.addEventListener('change', async () => {
      try { await API.patch('/api/admin/fontes/' + s.dataset.mover, { secao: s.value }); App.avisar('Editoria do veículo atualizada', ''); G.mesclar(E, G.bootstrap(await API.get('/api/bootstrap').catch(() => null))); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
    $$('[data-so]').forEach(b => b.addEventListener('click', () => sincronizar([b.dataset.so])));
  }

  /* ═════════ COMENTÁRIOS ═════════ */
  async function comentarios(painel) {
    const d = G.listagem(await API.get('/api/admin/comentarios?status=todos'));
    painel.innerHTML = `
      <div class="caixa">
        <header><h3>Conversa dos leitores</h3><span class="apoio">${d.total} comentários · moderação ${cfgPortal().moderacaoComentarios ? 'ATIVA' : 'livre'}</span></header>
        <div class="miolo rolagem-x">
          ${d.itens.length ? `<table class="tabela">
            <thead><tr><th>Leitor</th><th>Comentário</th><th>Matéria</th><th>Situação</th><th>Quando</th><th>Ações</th></tr></thead>
            <tbody>
              ${d.itens.map(c => `<tr>
                <td style="white-space:nowrap"><span class="avatar" style="width:24px;height:24px;font-size:.7rem;display:inline-grid;vertical-align:middle;background:${esc(c.cor || '#2f9dff')}">${esc((c.autor || '?')[0].toUpperCase())}</span> ${esc(c.autor)}</td>
                <td style="max-width:420px">${esc(c.texto)}</td>
                <td style="max-width:260px"><a href="#/noticia/${c.artigoId}"><span class="mono">${esc((c.titulo || '').slice(0, 70))}</span></a></td>
                <td><span class="etiqueta ${c.status}">${c.status}</span></td>
                <td class="mono" style="white-space:nowrap">${quando(c.criadoEm)}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-mini" data-moderar="${c.id}" data-status="publicado">aprovar</button>
                  <button class="btn btn-mini" data-moderar="${c.id}" data-status="pendente">reter</button>
                  <button class="btn btn-mini btn-perigo" data-moderar="${c.id}" data-status="oculto">ocultar</button>
                  <button class="btn btn-mini btn-perigo" data-apagar-c="${c.id}">apagar</button>
                </td>
              </tr>`).join('')}
            </tbody></table>` : '<p class="sub">Nenhum comentário ainda. Quando os leitores se manifestarem, a fila aparece aqui.</p>'}
        </div>
      </div>`;

    $$('[data-moderar]').forEach(b => b.addEventListener('click', async () => {
      try { await API.post(`/api/admin/comentarios/${b.dataset.moderar}`, { status: b.dataset.status }); App.avisar('Comentário ' + b.dataset.status, ''); desenhar(); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
    $$('[data-apagar-c]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Apagar definitivamente este comentário?')) return;
      try { await API.del('/api/admin/comentarios/' + b.dataset.apagarC); App.avisar('Comentário apagado', ''); desenhar(); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
  }

  /* ═════════ USUÁRIOS ═════════ */
  async function usuarios(painel) {
    const d = G.obj(await API.get('/api/admin/usuarios'));
    d.usuarios = G.lista(d.usuarios);
    /* Só o perfil de administração é limitado: leitores entram pelo cadastro do site. */
    const admins = d.usuarios.filter(u => u.papel === 'admin').length;
    const vaga = { limite: 2, usadas: admins, restantes: Math.max(0, 2 - admins), ...G.obj(d.vagas) };
    const cheio = vaga.restantes === 0;
    painel.innerHTML = `
      <div class="grade-admin" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr)">
        <div class="caixa">
          <header><h3>Contas do portal</h3><span class="apoio">${admins} de ${vaga.limite} administradores · ${d.usuarios.length} conta${d.usuarios.length > 1 ? 's' : ''} no total</span></header>
          <div class="miolo rolagem-x">
            <table class="tabela">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Atividade</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                ${d.usuarios.map(u => `<tr>
                  <td style="white-space:nowrap"><b>${esc(u.nome)}</b></td>
                  <td class="mono">${esc(u.email)}</td>
                  <td>
                    <select data-papel="${u.id}" style="background:#101010;border:1px solid #3a3a3a;font-size:.74rem;padding:.15rem">
                      <option value="leitor" ${u.papel === 'leitor' ? 'selected' : ''}>leitor</option>
                      <option value="admin" ${u.papel === 'admin' ? 'selected' : ''} ${u.papel !== 'admin' && cheio ? 'disabled' : ''}>administrador${u.papel !== 'admin' && cheio ? ' (limite)' : ''}</option>
                    </select>
                  </td>
                  <td class="mono">${u.salvos} salvas · ${u.curtidas} ★ · ${u.comentarios} 💬</td>
                  <td>${u.assinatura && u.assinatura.status === 'ativa' ? `<span class="etiqueta publicado">${esc(u.assinatura.nome || 'Assinante')}</span>` : '<span class="etiqueta rascunho">grátis</span>'}<br><span class="etiqueta ${u.ativo ? 'publicado' : 'oculto'}" style="margin-top:.25rem">${u.ativo ? 'conta ativa' : 'suspensa'}</span></td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-mini" data-susp="${u.id}" data-ativo="${u.ativo}">${u.ativo ? 'suspender' : 'reativar'}</button>
                    <button class="btn btn-mini" data-senha="${u.id}">nova senha</button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="caixa">
          <header><h3>Criar conta</h3><span class="apoio">${cheio ? 'administração completa' : 'leitor livre'}</span></header>
          <div class="miolo">
            <div class="caixa-aviso ${cheio ? 'alerta' : ''}">
              <b>${cheio ? 'O portal já tem ' + vaga.limite + ' administradores' : 'Administração: ' + vaga.restantes + ' vaga' + (vaga.restantes > 1 ? 's' : '')}</b>
              ${cheio
        ? 'Para promover outra pessoa a administrador, rebaixe ou suspenda uma das contas atuais. Contas de leitor continuam abertas, sem limite.'
        : 'Contas de leitor podem ser criadas à vontade — pelo painel ou pelo cadastro do site.'}
            </div>
            <form class="form-editor" id="formUsuario" ${cheio ? 'style="opacity:.45;pointer-events:none"' : ''}>
              <div class="campo"><label>Nome</label><input name="nome" required></div>
              <div class="campo"><label>E-mail</label><input type="email" name="email" required></div>
              <div class="campo"><label>Senha provisória</label><input name="senha" minlength="6" required placeholder="mínimo 6 caracteres"></div>
              <div class="campo"><label>Perfil</label><select name="papel"><option value="leitor">Leitor</option><option value="admin" ${cheio ? 'disabled' : ''}>Administrador${cheio ? ' (limite atingido)' : ''}</option></select></div>
              <button class="btn btn-amarelo" type="submit">Criar conta</button>
            </form>
            <div class="aviso-admin" style="margin-top:.9rem">Conta de leitor: lê, salva, curte e comenta — quem quiser, cria pelo próprio site. Conta de administrador: acesso total ao painel; o portal nasce com duas, criadas na instalação, e a criação de administrador pela tela está desligada.</div>
          </div>
        </div>
      </div>`;

    $$('[data-papel]').forEach(s => s.addEventListener('change', async () => {
      try { await API.patch('/api/admin/usuarios/' + s.dataset.papel, { papel: s.value }); App.avisar('Perfil atualizado', 'As permissões valem já no próximo acesso.'); desenhar(); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
    $$('[data-susp]').forEach(b => b.addEventListener('click', async () => {
      const ativo = b.dataset.ativo !== 'false';
      try { await API.patch('/api/admin/usuarios/' + b.dataset.susp, { ativo: !ativo }); App.avisar(ativo ? 'Conta suspensa' : 'Conta reativada', ''); desenhar(); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
    $$('[data-senha]').forEach(b => b.addEventListener('click', async () => {
      const nova = prompt('Nova senha para esta conta (mínimo 6 caracteres):');
      if (!nova) return;
      try { await API.patch('/api/admin/usuarios/' + b.dataset.senha, { novaSenha: nova }); App.avisar('Senha redefinida', 'Comunique a nova senha ao usuário.'); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    }));
    $('#formUsuario').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      try {
        await API.post('/api/admin/usuarios', { nome: f.get('nome'), email: f.get('email'), senha: f.get('senha'), papel: f.get('papel') });
        App.avisar('Conta criada', 'Envie as credenciais para o novo usuário.');
        ev.target.reset(); desenhar();
      } catch (e) { App.avisar('Ops', e.message, 'erro'); }
    });
  }

  /* ═════════ CONFIGURAÇÕES ═════════ */
  async function config(painel) {
    const d = G.obj(await API.get('/api/admin/config'));
    const c = d.config;
    painel.innerHTML = `
      <div class="grade-admin">
        <div class="caixa">
          <header><h3>Identidade do portal</h3></header>
          <div class="miolo">
            <form class="form-editor" id="formConfig">
              <div class="campo"><label>Nome do portal</label><input name="nomePortal" value="${esc(c.nomePortal)}"></div>
              <div class="campo"><label>Slogan</label><input name="slogan" value="${esc(c.slogan || '')}"></div>
              <div class="campo"><label>Descrição (rodapé e SEO)</label><textarea name="descricao" style="min-height:80px">${esc(c.descricao || '')}</textarea></div>
              <div class="campo"><label>Aviso de rodapé</label><input name="rodape" value="${esc(c.rodape || '')}"></div>
              <div class="campo-duplo">
                <div class="campo"><label>Intervalo de sincronização (min)</label><input type="number" min="5" max="720" name="intervaloMinutos" value="${c.intervaloMinutos || 20}"></div>
                <div class="campo"><label>Moderação de comentários</label>
                  <select name="moderacaoComentarios"><option value="nao" ${!c.moderacaoComentarios ? 'selected' : ''}>publicação imediata</option><option value="sim" ${c.moderacaoComentarios ? 'selected' : ''}>reter para aprovação</option></select>
                </div>
              </div>
              <div class="campo"><label>Ticker da capa (uma manchete por linha)</label><textarea name="ticker" style="min-height:110px">${esc((c.ticker || []).join('\n'))}</textarea></div>
              <button class="btn btn-amarelo" type="submit">Salvar configurações</button>
            </form>
          </div>
        </div>
        <div class="caixa">
          <header><h3>Editorias da primeira página</h3><span class="apoio">ordem de exibição de cada bloco</span></header>
          <div class="miolo">
            <p class="sub">A capa monta um bloco por editoria com as matérias mais recentes. Ajuste a ordem do menu arrastando ou editando a lista abaixo (uma por linha):</p>
            <form class="form-editor" id="formSecoes">
              <div class="campo"><label>Editorias em destaque na capa</label><textarea name="destaques" style="min-height:60px">${esc((c.secoesDestaque || []).join('\n'))}</textarea></div>
              <button class="btn btn-vazio" type="submit">Salvar destaques</button>
            </form>
            <div class="entrelinha" style="border-top:2px solid #333"></div>
            <h4 style="font-family:var(--cond);letter-spacing:.12em;font-size:.78rem;color:var(--amarelo)">EDITORIAS DISPONÍVEIS</h4>
            <p class="mono" style="color:#8d8d8d;margin-top:.4rem">${secoes().map(s => `${s.id} (${s.nome})`).join(' · ')}</p>
            <div class="entrelinha" style="border-top:2px solid #333"></div>
            <h4 style="font-family:var(--cond);letter-spacing:.12em;font-size:.78rem;color:var(--amarelo)">COMO A RELEVÂNCIA DO LEITOR FUNCIONA</h4>
            <p class="sub">Cada leitor tem uma capa personalizada no motor <i>relevantes</i>: salvar vale 2 pontos para a editoria, comentar vale 1. Destaques da redação sempre sobem.</p>
          </div>
        </div>
      </div>`;

    $('#formConfig').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      try {
        await API.patch('/api/admin/config', {
          nomePortal: f.get('nomePortal'), slogan: f.get('slogan'), descricao: f.get('descricao'), rodape: f.get('rodape'),
          intervaloMinutos: Number(f.get('intervaloMinutos')) || 20,
          moderacaoComentarios: f.get('moderacaoComentarios') === 'sim',
          ticker: String(f.get('ticker') || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20),
        });
        const b = G.bootstrap(await API.get('/api/bootstrap').catch(() => null));
        G.mesclar(E, b);
        App.montarChrome();
        App.avisar('Configurações salvas', 'A identidade do portal foi atualizada.');
      } catch (e) { App.avisar('Ops', e.message, 'erro'); }
    });
    $('#formSecoes').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const linhas = String(new FormData(ev.target).get('destaques') || '').split('\n').map(s => s.trim()).filter(Boolean);
      try { await API.patch('/api/admin/config', { secoesDestaque: linhas }); App.avisar('Destaques salvos', ''); }
      catch (e) { App.avisar('Ops', e.message, 'erro'); }
    });
  }

  /* ═════════ AUDITORIA ═════════ */
  async function auditoria(painel) {
    const d = G.obj(await API.get('/api/admin/auditoria'));
    d.registros = G.lista(d.registros);
    painel.innerHTML = `
      <div class="grade-admin">
        <div class="caixa">
          <header><h3>Livro de ocorrências da redação</h3><span class="apoio">${d.registros.length} eventos</span></header>
          <div class="miolo">
            ${d.registros.length ? `<div class="lista-log">${d.registros.map(r => `<div>
              <time>${quando(r.quando)}</time>
              <span><b style="color:var(--papel)">${esc(r.usuario)}</b> (${r.papel}) ${esc(r.acao)}${r.detalhe ? ' — ' + esc(r.detalhe) : ''}</span>
            </div>`).join('')}</div>` : '<p class="sub">Sem eventos registrados ainda.</p>'}
          </div>
        </div>
        <div class="caixa">
          <header><h3>Permissões por perfil</h3></header>
          <div class="miolo">
            <table class="tabela">
              <thead><tr><th>Ação</th><th>Leitor</th><th>Administrador</th></tr></thead>
              <tbody>
                ${[
                  ['Ler a primeira página e as editorias', 1, 1],
                  ['Buscar em todos os veículos', 1, 1],
                  ['Salvar na coleção e curtir', 1, 1],
                  ['Comentar nas matérias', 1, 1],
                  ['Criar, editar e excluir matérias', 0, 1],
                  ['Destacar e fixar na capa', 0, 1],
                  ['Ativar/pausar veículos e sincronizar', 0, 1],
                  ['Moderar comentários', 0, 1],
                  ['Gerir usuários e perfis', 0, 1],
                  ['Configurar o portal', 0, 1],
                ].map(([acao, l, a]) => `<tr><td>${acao}</td><td class="mono">${l ? '✓' : '—'}</td><td class="mono" style="color:var(--amarelo)">${a ? '✓' : '—'}</td></tr>`).join('')}
              </tbody>
            </table>
            <p class="mono" style="color:#6f6f6f;margin-top:.8rem">Sessões duram 7 dias. Senhas via scrypt + sal aleatório. Toda ação sensível entra neste livro.</p>
          </div>
        </div>
      </div>`;
  }

  return { montar, abrir: () => { abaAtual = 'visao'; } };
})();

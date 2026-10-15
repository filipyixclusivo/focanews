#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   FOCA NEWS — ATUALIZAÇÃO DIÁRIA AUTOMÁTICA DE NOTÍCIAS
   Troca o acervo velho pelas manchetes recentes de cada veículo.

   Como funciona:
   1. Lê o catálogo de veículos de data/seed.js (nome, país, editoria, site).
   2. Para cada veículo, consulta o Google Notícias pelo domínio oficial
      (site:dominio) — a mesma "rede de segurança" citada no painel — e
      fica só com o que foi publicado dentro da janela de recência.
   3. Deduplica por título/link, limita por veículo e monta o novo acervo.
   4. TRAVA DE SEGURANÇA EDITORIAL: se o resultado vier fraco demais
      (rede fora, bloqueio, poucas fontes), o script NÃO publica: mantém
      o acervo anterior e sai com erro (ou 0, com --tolerante).
   5. Nenhuma manchete é inventada: título, resumo, data e link vêm do feed.

   Uso:
     node scripts/atualizar-noticias.mjs                # troca o acervo
     node scripts/atualizar-noticias.mjs --simular      # mostra, não grava
     node scripts/atualizar-noticias.mjs --por-fonte=3 --janela-horas=48
   Agendamento: ver ATUALIZACAO-AUTOMATICA.md (GitHub Actions diário).
   Sem dependências: só Node 18+ (fetch global).
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const SIMULAR = !!args.simular;
const TOLERANTE = !!args.tolerante;
const JANELA_H = Number(args['janela-horas'] || 72);        // recentes: até 3 dias
const JANELA_RESERVA_H = Number(args['janela-reserva-horas'] || 168); // reserva: 7 dias
const POR_FONTE = Number(args['por-fonte'] || 2);
const TOTAL_MAX = Number(args.total || 650);
const MINIMO = Number(args.minimo || 120);
const CONCORRENCIA = Number(args.concorrencia || 10);
const CAMINHO_SEED = path.resolve(RAIZ, String(args.seed || 'data/seed.js'));

const LOCALES = {
  pt: 'hl=pt-BR&gl=BR&ceid=BR:pt-419', en: 'hl=en-US&gl=US&ceid=US:en',
  es: 'hl=es-419&gl=US&ceid=US:es-419', fr: 'hl=fr&gl=FR&ceid=FR:fr',
  de: 'hl=de&gl=DE&ceid=DE:de', it: 'hl=it&gl=IT&ceid=IT:it',
  ja: 'hl=ja&gl=JP&ceid=JP:ja', nl: 'hl=nl&gl=NL&ceid=NL:nl',
};

const decodificar = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const textoLimpo = (s) => decodificar(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const campo = (bloco, tag) => { const m = bloco.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? decodificar(m[1]).trim() : ''; };
const normalizar = (s) => textoLimpo(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const idDe = (link) => 'a-' + createHash('sha1').update(link).digest('hex').slice(0, 16);

function urlFeed(fonte) {
  if (!fonte.site) return null;
  let host;
  try { host = new URL(fonte.site).hostname.replace(/^www\./, ''); } catch { return null; }
  if (!host || host === 'localhost') return null;
  const loc = LOCALES[fonte.idioma] || LOCALES.en;
  return `https://news.google.com/rss/search?q=${encodeURIComponent('site:' + host)}&${loc}`;
}

async function buscarFonte(fonte) {
  const url = urlFeed(fonte);
  if (!url) return [];
  const resp = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (FocaNews atualizacao diaria)' },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const xml = await resp.text();
  const itens = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    let titulo = textoLimpo(campo(b, 'title'));
    const origem = textoLimpo(campo(b, 'source'));
    if (origem && titulo.toLowerCase().endsWith(' - ' + origem.toLowerCase())) titulo = titulo.slice(0, -(origem.length + 3)).trim();
    const link = campo(b, 'link');
    const quando = new Date(campo(b, 'pubDate'));
    if (!titulo || !link || Number.isNaN(quando.getTime())) continue;
    let resumo = textoLimpo(campo(b, 'description'));
    if (normalizar(resumo).startsWith(normalizar(titulo).slice(0, 40))) resumo = resumo.slice(titulo.length).trim();
    itens.push({
      id: idDe(link), fonteId: fonte.id, fonte: fonte.nome, bandeira: fonte.bandeira || '📰',
      pais: fonte.pais, idioma: fonte.idioma, secao: fonte.secao, estilo: fonte.estilo || 'serif',
      titulo, resumo: resumo.slice(0, 320), link, imagem: '',
      publicadoEm: quando.toISOString(), importadoEm: new Date().toISOString(),
    });
  }
  return itens;
}

async function principal() {
  const bruto = await readFile(CAMINHO_SEED, 'utf8');
  const seed = JSON.parse(bruto.replace(/^window\.__SEED__\s*=\s*/, '').replace(/;\s*$/, ''));
  const fontes = Array.isArray(seed.fontes) ? seed.fontes : [];
  console.log(`Foca News · atualização diária — ${fontes.length} veículos no catálogo`);

  const coletados = [];
  let falhas = 0, fila = [...fontes];
  async function trabalhador() {
    while (fila.length) {
      const fonte = fila.shift();
      try { coletados.push(...await buscarFonte(fonte)); }
      catch (e) { falhas++; }
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));

  const agora = Date.now();
  const dentro = (h) => new Date(agora - h * 3600e3);
  const vistos = new Set();
  const montar = (limiteH) => {
    const lista = [];
    const porFonte = new Map();
    for (const a of coletados.sort((x, y) => new Date(y.publicadoEm) - new Date(x.publicadoEm))) {
      if (new Date(a.publicadoEm) < dentro(limiteH)) continue;
      const chave = normalizar(a.titulo).slice(0, 90) + '|' + a.link;
      if (vistos.has(chave)) continue;
      const n = porFonte.get(a.fonteId) || 0;
      if (n >= POR_FONTE) continue;
      vistos.add(chave); porFonte.set(a.fonteId, n + 1); lista.push(a);
      if (lista.length >= TOTAL_MAX) break;
    }
    return lista;
  };

  let artigos = montar(JANELA_H);
  if (artigos.length < MINIMO) { vistos.clear(); artigos = montar(JANELA_RESERVA_H); console.log(`janela de ${JANELA_H}h fraca — usando reserva de ${JANELA_RESERVA_H}h`); }

  const comNoticia = new Set(artigos.map(a => a.fonteId)).size;
  console.log(`coletados: ${coletados.length} · aproveitados: ${artigos.length} · veículos com notícia: ${comNoticia} · falhas: ${falhas}`);

  if (artigos.length < MINIMO || comNoticia < 30) {
    console.error(`TRAVA EDITORIAL: resultado fraco (${artigos.length} matérias de ${comNoticia} veículos). Acervo anterior mantido.`);
    process.exit(TOLERANTE ? 0 : 1);
  }

  seed.artigos = artigos;
  seed.total = artigos.length;
  seed.geradoEm = new Date().toISOString();
  seed.atualizadoEm = seed.geradoEm;
  seed.janelaRecenciaHoras = JANELA_H;
  seed.porSecao = {};
  for (const a of artigos) seed.porSecao[a.secao] = (seed.porSecao[a.secao] || 0) + 1;

  if (SIMULAR) { console.log('--simular: nada gravado.'); return; }
  const tmp = CAMINHO_SEED + '.tmp';
  await writeFile(tmp, 'window.__SEED__ = ' + JSON.stringify(seed) + ';\n', 'utf8');
  await rename(tmp, CAMINHO_SEED);
  console.log(`OK — acervo trocado: ${artigos.length} matérias recentes (${seed.geradoEm}).`);
}

principal().catch(e => { console.error('Falha na atualização:', e.message); process.exit(TOLERANTE ? 0 : 1); });

/* =====================================================================
   app.js - navegação (mostrarTela), contexto, avisos, confirmação,
   fluxo de acesso e utilitários comuns
   ===================================================================== */
const APP = (function () {
  // ---------------- Ícones (mesmos traços do protótipo) ----------------
  const ICO = {
    painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    entrada: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>',
    saida: '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M4 21h16"/>',
    saldo: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    montagem: '<path d="M12 2L7 22"/><path d="M12 2l5 20"/><path d="M5 8h14"/><path d="M9 14h6"/><path d="M3 22h18"/>',
    inventario: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    empresas: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 10h.01"/><path d="M15 10h.01"/>',
    lc: '<path d="M12 2l4 20"/><path d="M12 2L8 22"/><path d="M6 9h12"/><path d="M4 14h16"/><path d="M9 3h6"/>',
    composicao: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10"/><path d="M7 12h10"/><path d="M7 16h6"/>',
    materiais: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/>',
    fornecedores: '<path d="M3 21V9l6-4v4l6-4v4l6-4v16z"/>',
    frentes: '<path d="M12 2l3 7h-6z"/><path d="M9 9l-3 13"/><path d="M15 9l3 13"/><path d="M7 16h10"/>',
    movimentacoes: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 5-6"/>',
    mais: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
  };
  function svg(nome, tam) {
    tam = tam || 18;
    return '<svg aria-hidden="true" width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICO[nome] || '') + '</svg>';
  }

  // ---------------- Menu ----------------
  const MENU = [
    { grupo: 'OPERAÇÃO', itens: [
      { id: 'tela-inicio', t: 'Painel do estoque', curto: 'Painel', ico: 'painel', etapa: 1 },
      { id: 'tela-entrada', t: 'Portal de Entrada', curto: 'Entrada', ico: 'entrada', etapa: 3 },
      { id: 'tela-saida', t: 'Portal de Saída', curto: 'Saída', ico: 'saida', etapa: 4 },
      { id: 'tela-saldo', t: 'Saldo por material', curto: 'Saldo', ico: 'saldo', etapa: 4 },
      { id: 'tela-montagem', t: 'Composição e montagem', curto: 'Montagem', ico: 'montagem', etapa: 6 },
      { id: 'tela-inventario', t: 'Inventário', curto: 'Inventário', ico: 'inventario', etapa: 7 }
    ] },
    { grupo: 'CADASTROS', itens: [
      { id: 'tela-contexto', t: 'Empresas, projetos e lotes', curto: 'Empresas', ico: 'empresas', etapa: 1 },
      { id: 'tela-lc', t: 'Lista de construção (LC)', curto: 'LC', ico: 'lc', etapa: 5 },
      { id: 'tela-composicao-cad', t: 'Composição de torres', curto: 'Composição', ico: 'composicao', etapa: 6 },
      { id: 'tela-materiais', t: 'Materiais', curto: 'Materiais', ico: 'materiais', etapa: 2 },
      { id: 'tela-fornecedores', t: 'Fornecedores', curto: 'Fornecedores', ico: 'fornecedores', etapa: 2 },
      { id: 'tela-frentes', t: 'Frentes de serviço', curto: 'Frentes', ico: 'frentes', etapa: 2 }
    ] },
    { grupo: 'RELATÓRIOS', itens: [
      { id: 'tela-movimentacoes', t: 'Movimentações', curto: 'Movimentações', ico: 'movimentacoes', etapa: 7 }
    ] }
  ];
  const NAV_INFERIOR = ['tela-inicio', 'tela-entrada', 'tela-saida', 'tela-saldo', 'tela-montagem'];
  const ETAPAS = [
    'Base, acesso e cadastros de contexto',
    'Materiais, preços, fornecedores e frentes',
    'Portal de Entrada com anexos PDF',
    'Portal de Saída e Saldo por material',
    'Importação da Lista de construção',
    'Composição de torres e mapa de montagem',
    'Inventário, Movimentações e Painel',
    'PDFs e exportações'
  ];
  function itemMenu(id) {
    for (const g of MENU) for (const i of g.itens) if (i.id === id) return Object.assign({ grupo: g.grupo }, i);
    return null;
  }

  function renderMenu() {
    const html = MENU.map(g => '<div class="menu-grupo"><div class="titulo">' + g.grupo + '</div>' +
      g.itens.map(i => '<button type="button" class="menu-item" data-tela="' + i.id + '">' + svg(i.ico) + '<span class="rot">' + esc(i.t) +
        (i.etapa > CONFIG.etapa ? '<small class="etapa">etapa ' + i.etapa + '</small>' : '') + '</span></button>').join('') + '</div>').join('');
    document.getElementById('menu-lateral').innerHTML = html;
    document.getElementById('mais-conteudo').innerHTML = html;
    const nav = NAV_INFERIOR.map(id => { const i = itemMenu(id); return '<button type="button" data-tela="' + id + '">' + svg(i.ico, 22) + '<span>' + esc(i.curto) + '</span></button>'; }).join('') +
      '<button type="button" id="btn-mais" aria-haspopup="dialog">' + svg('mais', 22) + '<span>Mais</span></button>';
    document.getElementById('nav-inferior').innerHTML = nav;
    document.querySelectorAll('[data-tela]').forEach(b => b.addEventListener('click', () => { fecharMais(); mostrarTela(b.dataset.tela); }));
    document.getElementById('btn-mais').addEventListener('click', abrirMais);
  }
  function abrirMais() { const p = document.getElementById('mais-painel'); p.hidden = false; const b = p.querySelector('button'); if (b) b.focus(); }
  function fecharMais() { document.getElementById('mais-painel').hidden = true; }

  // ---------------- Navegação ----------------
  let telaAtual = null;
  const TELAS_ACESSO = ['tela-login', 'tela-aguardando'];

  function mostrarTela(id) {
    const acesso = TELAS_ACESSO.indexOf(id) >= 0;
    document.body.classList.toggle('modo-acesso', acesso);
    const item = itemMenu(id);
    let alvo = id;
    if (!acesso && !document.getElementById(id)) alvo = 'tela-em-breve';
    document.querySelectorAll('section.tela').forEach(s => { s.hidden = s.id !== alvo; });
    telaAtual = id;
    if (!acesso) {
      document.querySelectorAll('[data-tela]').forEach(b => { if (b.dataset.tela === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
      const maisAtivo = NAV_INFERIOR.indexOf(id) < 0;
      const bm = document.getElementById('btn-mais'); if (bm) { if (maisAtivo) bm.setAttribute('aria-current', 'page'); else bm.removeAttribute('aria-current'); }
      const bc = document.getElementById('breadcrumb');
      bc.innerHTML = 'Estoque de materiais' + (item ? ' <span aria-hidden="true">›</span> ' + esc(item.grupo.charAt(0) + item.grupo.slice(1).toLowerCase()) + ' <span aria-hidden="true">›</span> <strong>' + esc(item.t) + '</strong>' : '');
      if (alvo === 'tela-em-breve' && item) {
        document.getElementById('embreve-titulo').textContent = item.t;
        document.getElementById('embreve-texto').textContent = 'Esta funcionalidade entra na etapa ' + item.etapa + ' (' + ETAPAS[item.etapa - 1] + '). As etapas são liberadas uma a uma, depois de testadas.';
      }
      try { localStorage.setItem('estoque_tela', id); } catch (e) { /* segue */ }
      window.scrollTo(0, 0);
    }
    if (id === 'tela-inicio') montarInicio();
    if (id === 'tela-contexto' && window.CAD) CAD.montar();
    if (id === 'tela-materiais' && window.CADM) CADM.montar('materiais');
    if (id === 'tela-fornecedores' && window.CADM) CADM.montar('fornecedores');
    if (id === 'tela-frentes' && window.CADM) CADM.montar('frentes');
    if (id === 'tela-entrada' && window.ENTRADA) ENTRADA.montar();
    const h1 = document.querySelector('#' + alvo + ' h1, #' + alvo + ' h2');
    if (h1 && !acesso) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }
  function remontar() { if (telaAtual && TELAS_ACESSO.indexOf(telaAtual) < 0) mostrarTela(telaAtual); }

  // ---------------- Avisos e confirmação ----------------
  function aviso(msg, tipo, ms) {
    const box = document.getElementById('avisos');
    const d = document.createElement('div');
    d.className = 'aviso ' + (tipo || '');
    d.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    d.innerHTML = '<span>' + esc(msg) + '</span><button type="button" aria-label="Fechar aviso">×</button>';
    d.querySelector('button').addEventListener('click', () => d.remove());
    box.appendChild(d);
    setTimeout(() => d.remove(), ms || (tipo === 'erro' ? 8000 : 4500));
  }

  function confirmar(op) {
    op = op || {};
    return new Promise(resolve => {
      const m = document.getElementById('modal-confirmar');
      const ok = document.getElementById('modal-conf-ok');
      const ca = document.getElementById('modal-conf-cancelar');
      document.getElementById('modal-conf-titulo').textContent = op.titulo || 'Confirmar';
      document.getElementById('modal-conf-texto').textContent = op.mensagem || 'Deseja continuar?';
      ok.textContent = op.ok || 'Confirmar';
      ok.className = 'btn ' + (op.perigo ? 'btn-perigo-cheio' : 'btn-primario');
      const anterior = document.activeElement;
      m.hidden = false; ca.focus();
      function fim(v) {
        m.hidden = true; ok.onclick = null; ca.onclick = null; document.removeEventListener('keydown', tecla);
        if (anterior && anterior.focus) anterior.focus();
        resolve(v);
      }
      function tecla(e) { if (e.key === 'Escape') fim(false); }
      ok.onclick = () => fim(true); ca.onclick = () => fim(false);
      document.addEventListener('keydown', tecla);
    });
  }

  // ---------------- Utilitários ----------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtNum(n, casas) {
    if (n == null || n === '' || isNaN(n)) return '-';
    casas = casas == null ? 0 : casas;
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }
  function fmtMoeda(n) { return n == null || isNaN(n) ? '-' : 'R$ ' + fmtNum(n, 2); }
  /** Converte "1.234,56" / "1234,56" / "1234.56" em número. Retorna NaN se inválido. */
  function parseNum(v) {
    if (typeof v === 'number') return v;
    let s = String(v == null ? '' : v).trim().replace(/\s|R\$/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }
  function arred(n, casas) { const f = Math.pow(10, casas); return Math.round((Number(n) + Number.EPSILON) * f) / f; }
  /** dd/mm/aaaa -> aaaa-mm-dd (ou null se inválida) */
  function dataISO(br) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
    if (!m) return null;
    const d = +m[1], mes = +m[2], a = +m[3];
    const dt = new Date(Date.UTC(a, mes - 1, d));
    if (a < 1900 || a > 2100 || dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
    return m[3] + '-' + m[2] + '-' + m[1];
  }
  function dataBR(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }
  function dataHoraBR(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function mascaraData(inp) {
    inp.addEventListener('input', () => {
      let v = inp.value.replace(/\D/g, '').slice(0, 8);
      if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
      else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
      inp.value = v;
    });
  }
  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
  function validarCNPJ(c) {
    c = soDigitos(c);
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === +c[12] && calc(13) === +c[13];
  }
  function formatarCNPJ(c) {
    c = soDigitos(c);
    if (c.length !== 14) return c;
    return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  function mascaraCNPJ(inp) {
    inp.addEventListener('input', () => {
      let v = soDigitos(inp.value).slice(0, 14), o = v;
      if (v.length > 12) o = v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5, 8) + '/' + v.slice(8, 12) + '-' + v.slice(12);
      else if (v.length > 8) o = v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5, 8) + '/' + v.slice(8);
      else if (v.length > 5) o = v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5);
      else if (v.length > 2) o = v.slice(0, 2) + '.' + v.slice(2);
      inp.value = o;
    });
  }
  function validarPlaca(p) { return /^[A-Z]{3}\d{4}$|^[A-Z]{3}\d[A-Z]\d{2}$/.test(String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')); }
  function validarChaveNFe(c) { return /^\d{44}$/.test(soDigitos(c)) && soDigitos(c).length === String(c).replace(/\s/g, '').length; }
  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[\s\-–—_]+/g, ' ').trim();
  }
  function iniciais(nome) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '-').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  /** Exportação Excel: CSV com ";" e BOM UTF-8. */
  function baixarCSV(nome, cabecalho, linhas) {
    const cel = v => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const txt = '﻿' + [cabecalho].concat(linhas).map(l => l.map(cel).join(';')).join('\r\n');
    baixarArquivo(new Blob([txt], { type: 'text/csv;charset=utf-8' }), nome);
  }
  /** Lê CSV (;) ou XLSX com SheetJS e devolve linhas com chaves normalizadas (ex.: PESO_UNIT). */
  async function lerPlanilha(file) {
    if (!window.XLSX) throw new Error('Leitor de planilhas indisponível. Recarregue o aplicativo.');
    let wb;
    try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array', codepage: 65001, raw: false }); }
    catch (e) { throw new Error('Não foi possível ler o arquivo. Use o modelo (CSV com ";" ou XLSX).'); }
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    return linhas.map(l => { const o = {}; Object.keys(l).forEach(k => { o[normalizar(k).replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')] = String(l[k]).trim(); }); return o; });
  }
  function baixarArquivo(blob, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function rotuloTipoEmpresa(v) { const x = CONFIG.tiposEmpresa.find(t => t.v === v); return x ? x.t : (v || '-'); }
  function rotuloFamilia(v) { const x = CONFIG.familias.find(t => t.v === v); return x ? x.t : (v || '-'); }
  function rotuloPerfil(v) { const x = CONFIG.perfis.find(t => t.v === v); return x ? x.t : (v || '-'); }
  function marcaSync(r) {
    if (!r || r._sync === 'sincronizado' || !r._sync) return '';
    if (r._sync === 'erro') return '<span class="sync-ico erro" title="' + esc(r._erro || 'Erro no envio') + '">⚠ erro no envio</span>';
    return '<span class="sync-ico pendente">● aguardando envio</span>';
  }

  // ---------------- Contexto (Empresa, Projeto, Lote, Local) ----------------
  const CTX = (function () {
    const CH = 'estoque_contexto';
    let ctx = {};
    try { ctx = JSON.parse(localStorage.getItem(CH) || '{}') || {}; } catch (e) { ctx = {}; }
    function gravar() { try { localStorage.setItem(CH, JSON.stringify(ctx)); } catch (e) { /* segue */ } }
    function opt(v, t, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(t) + '</option>'; }

    async function montar() {
      const [empresas, projetos, lotes, locais] = await Promise.all([DB.listar('empresas'), DB.listar('projetos'), DB.listar('lotes'), DB.listar('locais')]);
      const u = AUTH.usuario() || {};
      const admin = AUTH.ehAdmin();
      const projVis = projetos.filter(p => admin || (u.projetos || []).indexOf(p.id) >= 0).sort((a, b) => a.nome.localeCompare(b.nome));
      const idsEmp = new Set(projVis.map(p => p.empresa_id).filter(Boolean));
      let emps = empresas.filter(e => idsEmp.has(e.id));
      if (!emps.length) emps = empresas.filter(e => e.tipo === 'concessionaria');
      emps.sort((a, b) => a.razao_social.localeCompare(b.razao_social));
      if (!emps.find(e => e.id === ctx.empresa)) ctx.empresa = emps[0] ? emps[0].id : '';
      const pj = projVis.filter(p => !ctx.empresa || p.empresa_id === ctx.empresa || !p.empresa_id);
      if (!pj.find(p => p.id === ctx.projeto)) ctx.projeto = pj[0] ? pj[0].id : '';
      const lt = lotes.filter(l => l.projeto_id === ctx.projeto && (admin || (u.lotes || []).map(x => x.toUpperCase()).indexOf(String(l.codigo).toUpperCase()) >= 0))
        .sort((a, b) => a.codigo.localeCompare(b.codigo));
      if (ctx.lote && !lt.find(l => l.codigo === ctx.lote)) ctx.lote = '';
      const lc = locais.filter(l => l.projeto_id === ctx.projeto && (admin || !(u.locais || []).length || u.locais.indexOf(l.id) >= 0))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      if (ctx.local && !lc.find(l => l.id === ctx.local)) ctx.local = '';
      gravar();
      const se = document.getElementById('ctx-empresa'), sp = document.getElementById('ctx-projeto'),
            sl = document.getElementById('ctx-lote'), so = document.getElementById('ctx-local');
      se.innerHTML = emps.length ? emps.map(e => opt(e.id, e.razao_social, e.id === ctx.empresa)).join('') : opt('', 'Sem empresa liberada', true);
      sp.innerHTML = pj.length ? pj.map(p => opt(p.id, p.nome, p.id === ctx.projeto)).join('') : opt('', 'Sem projeto liberado', true);
      sl.innerHTML = (lt.length !== 1 ? opt('', 'Todos os lotes', !ctx.lote) : '') + lt.map(l => opt(l.codigo, l.codigo, l.codigo === ctx.lote || lt.length === 1)).join('');
      if (lt.length === 1) ctx.lote = lt[0].codigo;
      so.innerHTML = (lc.length !== 1 ? opt('', 'Todos os locais', !ctx.local) : '') + lc.map(l => opt(l.id, l.nome, l.id === ctx.local || lc.length === 1)).join('');
      if (lc.length === 1) ctx.local = lc[0].id;
      gravar();
    }
    function ligar() {
      [['ctx-empresa', 'empresa'], ['ctx-projeto', 'projeto'], ['ctx-lote', 'lote'], ['ctx-local', 'local']].forEach(([id, ch]) => {
        document.getElementById(id).addEventListener('change', async ev => {
          ctx[ch] = ev.target.value;
          if (ch === 'empresa') { ctx.projeto = ''; ctx.lote = ''; ctx.local = ''; }
          if (ch === 'projeto') { ctx.lote = ''; ctx.local = ''; }
          gravar();
          await montar();
          document.dispatchEvent(new CustomEvent('ctx:mudou', { detail: Object.assign({}, ctx) }));
          remontar();
        });
      });
    }
    return { montar, ligar, get: () => Object.assign({}, ctx) };
  })();

  // ---------------- Painel (início da etapa 1) ----------------
  async function montarInicio() {
    const c = CTX.get();
    const [proj, lotes, locais, usuarios, pend] = await Promise.all([
      DB.obter('projetos', c.projeto), DB.listar('lotes', l => l.projeto_id === c.projeto),
      DB.listar('locais', l => l.projeto_id === c.projeto), DB.listar('usuarios'), DB.contarPendentes()]);
    const ult = await DB.metaObter('ultima_sync');
    const cards = [
      { r: 'Projeto', v: proj ? proj.nome : 'Nenhum projeto liberado', d: proj ? (proj.leilao_contrato || '') : 'Peça liberação ao administrador' },
      { r: 'Lotes no projeto', v: fmtNum(lotes.length), d: lotes.map(l => l.codigo).sort().join(' - ') || '-' },
      { r: 'Locais de estoque', v: fmtNum(locais.length), d: locais.map(l => l.nome).join(' - ') || '-' },
      AUTH.ehAdmin()
        ? { r: 'Usuários aguardando liberação', v: fmtNum(usuarios.filter(u => u.status === 'pendente' && !u.excluido_em).length), d: 'Em Cadastros > Usuários e acessos' }
        : { r: 'Sincronização', v: pend.pendentes ? fmtNum(pend.pendentes) + ' a enviar' : 'Em dia', d: ult ? 'Última: ' + dataHoraBR(ult) : 'Ainda não sincronizado' }
    ];
    document.getElementById('inicio-cards').innerHTML = cards.map(k => '<div class="card kpi"><div class="rotulo">' + esc(k.r) + '</div><div class="valor">' + esc(k.v) + '</div><div class="det">' + esc(k.d) + '</div></div>').join('');
    document.getElementById('inicio-etapas').innerHTML = ETAPAS.map((t, i) => {
      const n = i + 1, feita = n <= CONFIG.etapa;
      return '<li class="' + (feita ? 'feita' : '') + '"><span class="n" aria-hidden="true">' + n + '</span><span>' + esc(t) + '</span><span class="status ' + (feita ? 'st-ok' : 'st-neutro') + '">' + (feita ? 'Disponível' : 'Próxima etapa') + '</span></li>';
    }).join('');
    const u = AUTH.usuario() || {};
    const nomesLocais = (u.locais || []).length ? (await DB.listar('locais', l => u.locais.indexOf(l.id) >= 0)).map(l => l.nome).join(', ') : 'Todos os locais dos projetos liberados';
    document.getElementById('inicio-acesso').innerHTML =
      '<div class="form-grid">' +
      '<div><strong>' + esc(u.nome || '-') + '</strong><br><span class="muted">' + esc(u.email || '') + '</span></div>' +
      '<div><span class="status st-info">' + esc(rotuloPerfil(u.perfil)) + '</span> <span class="status st-ok">Ativo</span></div>' +
      '<div class="muted">Lotes: <strong>' + esc(u.perfil === 'admin' ? 'Todos' : ((u.lotes || []).join(', ') || '-')) + '</strong></div>' +
      '<div class="muted">Locais: <strong>' + esc(u.perfil === 'admin' ? 'Todos' : nomesLocais) + '</strong></div>' +
      '<div class="muted">Versão ' + esc(CONFIG.versao) + (ult ? ' - sincronizado em ' + esc(dataHoraBR(ult)) : '') + '</div></div>';
  }

  // ---------------- Fluxo de acesso ----------------
  let modoLogin = 'entrar';
  function definirModoLogin(m) {
    modoLogin = m;
    const cad = m === 'cadastrar', rec = m === 'recuperar';
    document.getElementById('login-titulo').textContent = cad ? 'Criar conta' : rec ? 'Recuperar senha' : 'Entrar';
    document.getElementById('login-sub').textContent = cad ? 'Depois de confirmar o e-mail, um administrador libera o seu acesso.' : rec ? 'Informe o e-mail para receber o link de nova senha.' : 'Use o e-mail corporativo cadastrado.';
    document.getElementById('campo-login-nome').hidden = !cad;
    document.getElementById('campo-login-senha').hidden = rec;
    document.getElementById('login-senha-ajuda').hidden = !cad;
    document.getElementById('login-senha').autocomplete = cad ? 'new-password' : 'current-password';
    document.getElementById('login-enviar').textContent = cad ? 'Criar conta' : rec ? 'Enviar link' : 'Entrar';
    document.getElementById('login-alternar').textContent = m === 'entrar' ? 'Criar conta' : 'Já tenho conta';
    document.getElementById('login-esqueci').hidden = m !== 'entrar';
  }

  function ligarAcesso() {
    document.getElementById('login-alternar').addEventListener('click', () => definirModoLogin(modoLogin === 'entrar' ? 'cadastrar' : 'entrar'));
    document.getElementById('login-esqueci').addEventListener('click', () => definirModoLogin('recuperar'));
    document.getElementById('form-login').addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!AUTH.configurado()) { aviso('A base central ainda não foi configurada (config.js).', 'erro'); return; }
      const nome = document.getElementById('login-nome').value.trim();
      const email = document.getElementById('login-email').value.trim().toLowerCase();
      const senha = document.getElementById('login-senha').value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { aviso('Informe um e-mail válido.', 'erro'); document.getElementById('login-email').focus(); return; }
      if (modoLogin === 'cadastrar' && nome.length < 3) { aviso('Informe o nome completo.', 'erro'); document.getElementById('login-nome').focus(); return; }
      if (modoLogin !== 'recuperar' && senha.length < (modoLogin === 'cadastrar' ? 8 : 1)) { aviso(modoLogin === 'cadastrar' ? 'A senha precisa ter pelo menos 8 caracteres.' : 'Informe a senha.', 'erro'); document.getElementById('login-senha').focus(); return; }
      if (!navigator.onLine) { aviso('Sem conexão. Conecte-se à internet para entrar pela primeira vez.', 'erro'); return; }
      const bt = document.getElementById('login-enviar'); bt.disabled = true;
      try {
        if (modoLogin === 'entrar') { await AUTH.entrar(email, senha); await rotear(); }
        else if (modoLogin === 'cadastrar') {
          const r = await AUTH.cadastrar(nome, email, senha);
          if (r.confirmado) await rotear();
          else { aviso('Cadastro criado. Abra o link enviado para ' + email + ' para confirmar o e-mail e depois entre.', 'ok', 10000); definirModoLogin('entrar'); }
        } else { await AUTH.recuperar(email); aviso('Se o e-mail estiver cadastrado, você receberá o link para criar uma nova senha.', 'ok', 8000); definirModoLogin('entrar'); }
      } catch (e) { aviso(e.message, 'erro'); }
      finally { bt.disabled = false; }
    });
    document.getElementById('aguard-verificar').addEventListener('click', async () => {
      try { await AUTH.carregarUsuario(); } catch (e) { aviso(e.message, 'erro'); }
      await rotear();
      if (AUTH.estado() === 'pendente') aviso('Seu acesso ainda não foi liberado.', 'info');
    });
    document.getElementById('aguard-sair').addEventListener('click', sair);
    document.getElementById('btn-sair').addEventListener('click', async () => {
      const c = await DB.contarPendentes();
      const ok = await confirmar({ titulo: 'Sair do sistema', perigo: c.pendentes > 0, ok: 'Sair',
        mensagem: c.pendentes ? 'Há ' + c.pendentes + ' registro(s) ainda não enviados. Se sair agora, eles serão perdidos neste aparelho. Deseja sair mesmo assim?' : 'Deseja sair do sistema neste aparelho?' });
      if (ok) sair();
    });
    document.getElementById('faixa-sync-enviar').addEventListener('click', () => SYNC.sincronizar());
    document.getElementById('mais-painel').addEventListener('click', ev => { if (ev.target.id === 'mais-painel') fecharMais(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharMais(); });
  }

  async function sair() {
    SYNC.parar(); clearInterval(pollPendente);
    await AUTH.sair();
    definirModoLogin('entrar');
    mostrarTela('tela-login');
  }

  let pollPendente = null;
  let appIniciado = false;
  async function rotear() {
    document.getElementById('login-sem-config').hidden = AUTH.configurado();
    const est = AUTH.estado();
    if (est === 'sem-sessao' || est === 'carregando') { SYNC.parar(); mostrarTela('tela-login'); return; }
    if (est === 'pendente' || est === 'bloqueado') {
      const u = AUTH.usuario();
      document.getElementById('aguard-titulo').textContent = est === 'bloqueado' ? 'Acesso bloqueado' : 'Acesso em análise';
      document.getElementById('aguard-texto').textContent = est === 'bloqueado'
        ? 'Seu acesso a este sistema está bloqueado. Procure o administrador do estoque.'
        : 'Seu cadastro foi recebido e aguarda liberação de um administrador. Assim que for liberado, esta tela muda sozinha.';
      document.getElementById('aguard-dados').innerHTML = '<strong>' + esc(u.nome || '') + '</strong><br>' + esc(u.email || '');
      document.getElementById('aguard-verificar').hidden = est === 'bloqueado';
      mostrarTela('tela-aguardando');
      SYNC.conectarRT();
      clearInterval(pollPendente);
      if (est === 'pendente') pollPendente = setInterval(async () => {
        if (!navigator.onLine) return;
        try { await AUTH.carregarUsuario(); } catch (e) { return; }
        if (AUTH.estado() !== 'pendente') rotear();
      }, 20000);
      return;
    }
    clearInterval(pollPendente);
    entrarNoApp();
  }

  async function entrarNoApp() {
    const u = AUTH.usuario();
    document.getElementById('usr-nome').textContent = u.nome || u.email;
    document.getElementById('usr-papel').textContent = rotuloPerfil(u.perfil) + ' · ' + (u.perfil === 'admin' ? 'todos os lotes' : (u.lotes || []).join(', '));
    document.getElementById('usr-iniciais').textContent = iniciais(u.nome || u.email);
    await CTX.montar();
    let ini = 'tela-inicio';
    try { ini = localStorage.getItem('estoque_tela') || ini; } catch (e) { /* segue */ }
    mostrarTela(itemMenu(ini) ? ini : 'tela-inicio');
    if (!appIniciado) { appIniciado = true; }
    SYNC.iniciar().then(async () => { await CTX.montar(); remontar(); });
  }

  // ---------------- Service worker ----------------
  function registrarSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    let recarregou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (recarregou) return; recarregou = true; location.reload(); });
    navigator.serviceWorker.register('service-worker.js').then(reg => {
      if (!reg) return;
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) aviso('Nova versão disponível. Atualizando...', 'info');
        });
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(e => console.warn('[sw]', e));
  }

  // ---------------- Inicialização ----------------
  async function iniciar() {
    renderMenu();
    ligarAcesso();
    CTX.ligar();
    registrarSW();
    // Formulário em edição não é redesenhado pela sincronização em segundo plano
    const principal = document.getElementById('principal');
    ['input', 'change'].forEach(evn => principal.addEventListener(evn, ev => {
      const f = ev.target.closest && ev.target.closest('form');
      if (f) f.dataset.sujo = '1';
    }));
    document.addEventListener('sync:recebido', async () => {
      if (AUTH.estado() !== 'ativo') { if (document.body.classList.contains('modo-acesso')) rotear(); return; }
      await CTX.montar();
      const tela = telaAtual && document.getElementById(telaAtual);
      if (tela && tela.querySelector('form[data-sujo]')) return;
      const ae = document.activeElement;
      if (tela && ae && tela.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
      if (telaAtual === 'tela-entrada' && window.ENTRADA && ENTRADA.estado() && ENTRADA.estado().sujo) return;
      remontar();
    });
    document.addEventListener('auth:escopo', async ev => {
      const d = ev.detail.depois;
      if (d.status !== 'ativo' || d.excluido_em) { rotear(); return; }
      if (document.body.classList.contains('modo-acesso')) { aviso('Acesso liberado. Bem-vindo!', 'ok'); rotear(); return; }
      aviso('Seu acesso foi atualizado pelo administrador. Recarregando os dados...', 'info');
      await SYNC.recomecar();
      entrarNoApp();
    });
    document.addEventListener('auth:expirou', () => { aviso('Sua sessão expirou. Entre novamente.', 'alerta'); rotear(); });
    window.addEventListener('online', SYNC.atualizarFaixa);
    window.addEventListener('offline', SYNC.atualizarFaixa);

    await AUTH.lerRetornoUrl();
    if (AUTH.temSessao() && navigator.onLine && AUTH.configurado()) {
      try { await AUTH.carregarUsuario(); }
      catch (e) { if (!AUTH.usuario()) { aviso(e.message, 'erro', 10000); } }
    }
    await rotear();
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  return {
    mostrarTela, remontar, aviso, confirmar, svg, CTX,
    esc, fmtNum, fmtMoeda, parseNum, arred, dataISO, dataBR, dataHoraBR, mascaraData,
    soDigitos, validarCNPJ, formatarCNPJ, mascaraCNPJ, validarPlaca, validarChaveNFe, normalizar,
    iniciais, baixarCSV, lerPlanilha, baixarArquivo, rotuloTipoEmpresa, rotuloPerfil, rotuloFamilia, marcaSync,
    telaAtual: () => telaAtual
  };
})();
window.APP = APP;

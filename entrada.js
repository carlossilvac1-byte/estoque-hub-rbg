/* =====================================================================
   entrada.js - Portal de Entrada (recebimento por NF / romaneio)
   Família: Cabos / Isoladores / Fixadores / Ferragem
   Etapas: Documento -> Itens -> Conferência -> Confirmação
   Cálculos ao vivo (também refeitos no servidor pelo gatilho do 06-entrada.sql):
     Cabos       valor = peso líquido x R$/kg da família
     Isoladores  valor = quantidade x preço unitário do material
     Fixadores / Ferragem  peso = peso unit. x quantidade; valor = peso x R$/kg
     Sem peso unitário (ou sem preço) -> Pendente, valor 0, linha rosa
   ===================================================================== */
const ENTRADA = (function () {
  const A = () => window.APP;
  const CH_RASCUNHO = 'entrada_em_edicao';
  let est = null;              // estado do lançamento em tela
  let c = {};                  // cache de dados do contexto
  let itemEdit = null;         // id do item em edição no formulário "novo item"
  let ligado = false;
  let tGravar = null;

  const COLUNAS = {
    cabos: ['#', 'Tipo de cabo', 'Carretel', 'Tipo carretel', 'Lance (m)', 'Peso líq. (kg)', 'Valor (R$)', 'Status', ''],
    isoladores: ['#', 'Código', 'Descrição', 'Tipo', 'Qtd. (un)', 'Peso líq. (kg)', 'Preço unit. (R$)', 'Valor (R$)', 'Status', ''],
    fixadores: ['#', 'Descrição', 'Categoria', 'Qtd. (un)', 'Peso unit. (kg)', 'Peso total (kg)', 'Valor (R$)', 'Status', ''],
    ferragem: ['#', 'Descrição (peça/volume)', 'Torre', 'Qtd. (vol./pç)', 'Peso unit. (kg)', 'Peso total (kg)', 'Valor (R$)', 'Status', '']
  };

  function esc(s) { return A().esc(s); }
  function opt(v, t, s) { return '<option value="' + esc(v) + '"' + (s ? ' selected' : '') + '>' + esc(t) + '</option>'; }
  function hojeISO() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function n(v) { return v == null || v === '' ? null : Number(v); }

  // ---------------- Cálculo (igual ao servidor) ----------------
  function precoFamilia(familia, dataIso) {
    return window.CADM ? CADM.precoVigente(familia, dataIso, c.precos) : null;
  }
  function calcularItem(familia, item, material, precoKg) {
    const r = Object.assign({}, item, { status_item: item.status_item === 'aguardando' ? 'aguardando' : 'conferido', motivo_pendencia: null });
    const arred = A().arred;
    if (familia === 'cabos') {
      r.quantidade = r.quantidade == null ? 1 : r.quantidade;
      r.peso_unit = null;
      r.peso_liquido = arred(n(r.peso_liquido) || 0, 3);
      r.preco_unit = precoKg;
      if (precoKg == null) { r.status_item = 'pendente'; r.motivo_pendencia = 'Sem preço de referência vigente para Cabos'; r.valor = 0; }
      else r.valor = arred(r.peso_liquido * precoKg, 2);
    } else if (familia === 'isoladores') {
      r.peso_unit = null;
      r.peso_liquido = arred(n(r.peso_liquido) || 0, 3);
      r.preco_unit = material ? n(material.preco_unit) : null;
      if (r.preco_unit == null) { r.status_item = 'pendente'; r.motivo_pendencia = 'Material sem preço unitário'; r.valor = 0; }
      else r.valor = arred((n(r.quantidade) || 0) * r.preco_unit, 2);
    } else {
      r.peso_unit = material ? n(material.peso_unit) : null;
      r.preco_unit = precoKg;
      if (r.peso_unit == null) { r.status_item = 'pendente'; r.motivo_pendencia = 'Material sem peso unitário'; r.peso_liquido = 0; r.valor = 0; }
      else {
        r.peso_liquido = arred(r.peso_unit * (n(r.quantidade) || 0), 3);
        if (precoKg == null) { r.status_item = 'pendente'; r.motivo_pendencia = 'Sem preço de referência vigente'; r.valor = 0; }
        else r.valor = arred(r.peso_liquido * precoKg, 2);
      }
    }
    return r;
  }
  function recalcularTodos() {
    if (!est) return;
    const p = precoFamilia(est.entrada.familia, est.entrada.data_recebimento);
    est.itens = est.itens.map(i => calcularItem(est.entrada.familia, i, material(i.material_id), p));
  }

  // ---------------- Dados ----------------
  const material = id => c.materiais.find(m => m.id === id);
  const fornecedor = id => c.fornecedores.find(f => f.id === id);
  function nomeForn(id) { const f = fornecedor(id); if (!f) return '-'; const e = c.empresas.find(x => x.id === f.empresa_id); return e ? (e.fantasia || e.razao_social) : '-'; }

  async function carregar() {
    const ctx = A().CTX.get();
    const [materiais, fornecedores, empresas, precos, lotes, locais, entradas, itens, anexos] = await Promise.all([
      DB.listar('materiais'), DB.listar('fornecedores'), DB.listar('empresas'),
      DB.listar('precos_referencia', p => p.projeto_id === ctx.projeto),
      DB.listar('lotes', l => l.projeto_id === ctx.projeto), DB.listar('locais', l => l.projeto_id === ctx.projeto),
      DB.listar('entradas'), DB.listar('entrada_itens'), DB.listar('anexos', a => a.documento_tipo === 'entrada')]);
    const u = AUTH.usuario() || {};
    const admin = AUTH.ehAdmin();
    const lotesUsu = lotes.filter(l => admin || (u.lotes || []).map(x => x.toUpperCase()).indexOf(l.codigo.toUpperCase()) >= 0).sort((a, b) => a.codigo.localeCompare(b.codigo));
    const locaisUsu = locais.filter(l => admin || !(u.locais || []).length || u.locais.indexOf(l.id) >= 0);
    c = { materiais, fornecedores, empresas, precos, lotes: lotesUsu, locais: locaisUsu, entradasTodas: entradas, itensTodos: itens, anexos,
      entradas: entradas.filter(e => e.projeto_id === ctx.projeto && (!ctx.lote || e.lote === ctx.lote) && (!ctx.local || e.local_id === ctx.local)) };
  }

  function novoEstado(familia) {
    const ctx = A().CTX.get();
    const lote = ctx.lote || (c.lotes.length === 1 ? c.lotes[0].codigo : '');
    const loteReg = c.lotes.find(l => l.codigo === lote);
    const local = ctx.local || (loteReg && loteReg.local_id) || (c.locais.length === 1 ? c.locais[0].id : '');
    const id = DB.uuid();
    return {
      entrada: { id: id, projeto_id: ctx.projeto, familia: familia || 'cabos', data_recebimento: hojeISO(), nf: '', serie: '', data_emissao: null,
        chave_nfe: '', romaneio: '', fornecedor_id: '', transportadora: '', placa: '', local_id: local, lote: lote, status: 'rascunho', observacoes: '' },
      itens: [], itensRemovidos: [],
      conferencia: { id: id, entrada_id: id, quantidades_conferidas: false, volumes_conferidos: false, avarias_registradas: false, pendencias_comunicadas: false },
      anexos: {}, anexosRemovidos: [], salvo: false, sujo: false
    };
  }

  async function abrirExistente(id) {
    const e = await DB.obter('entradas', id);
    if (!e || e.excluido_em) { A().aviso('Lançamento não encontrado neste aparelho.', 'erro'); return; }
    const itens = (await DB.listar('entrada_itens', i => i.entrada_id === id)).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const conf = (await DB.listar('entrada_conferencia', x => x.entrada_id === id))[0];
    const anexos = await DB.listar('anexos', a => a.documento_tipo === 'entrada' && a.documento_id === id);
    const st = novoEstado(e.familia);
    st.entrada = Object.assign({}, e);
    st.itens = itens.map(i => Object.assign({}, i, { _salvo: true }));
    st.conferencia = conf ? Object.assign({}, conf) : st.conferencia;
    if (!conf) { st.conferencia.id = e.id; st.conferencia.entrada_id = e.id; }
    st.anexos = {}; anexos.forEach(a => { st.anexos[a.tipo] = Object.assign({}, a, { _salvo: true }); });
    st.salvo = true; st.sujo = false;
    est = st; itemEdit = null;
    await DB.metaGravar(CH_RASCUNHO, null);
    render();
    window.scrollTo(0, 0);
  }

  function somenteLeitura() { return !est || !AUTH.podeGravar() || est.entrada.status === 'confirmado'; }

  function marcarSujo() {
    if (!est || somenteLeitura()) return;
    est.sujo = true;
    clearTimeout(tGravar);
    tGravar = setTimeout(() => DB.metaGravar(CH_RASCUNHO, est).catch(() => {}), 400);
  }

  // ---------------- Validação ----------------
  function nfDuplicada() {
    const e = est.entrada;
    if (!e.nf || !e.fornecedor_id) return null;
    const nf = String(e.nf).trim().toUpperCase(), se = String(e.serie || '').trim().toUpperCase();
    return c.entradasTodas.find(x => x.id !== e.id && !x.excluido_em && x.fornecedor_id === e.fornecedor_id &&
      String(x.nf).trim().toUpperCase() === nf && String(x.serie || '').trim().toUpperCase() === se) || null;
  }
  function errosDocumento() {
    const e = est.entrada, er = {};
    if (!e.data_recebimento) er['en-data'] = 'Informe a data do recebimento (dd/mm/aaaa).';
    else if (e.data_recebimento > hojeISO()) er['en-data'] = 'A data de recebimento não pode ser futura.';
    if (!String(e.nf || '').trim()) er['en-nf'] = 'Informe o número da NF.';
    if (e._dataEmissaoInvalida) er['en-emissao'] = 'Data inválida. Use dd/mm/aaaa.';
    else if (e.data_emissao && e.data_recebimento && e.data_emissao > e.data_recebimento) er['en-emissao'] = 'A emissão não pode ser depois do recebimento.';
    if (e._dataRecebInvalida) er['en-data'] = 'Data inválida. Use dd/mm/aaaa.';
    if (e.chave_nfe && !/^\d{44}$/.test(e.chave_nfe)) er['en-chave'] = 'A chave da NF-e tem 44 dígitos.';
    if (!e.fornecedor_id) er['en-forn'] = 'Escolha o fornecedor.';
    if (e.placa && !A().validarPlaca(e.placa)) er['en-placa'] = 'Placa nos formatos AAA0000 ou AAA0A00.';
    if (!e.local_id) er['en-local'] = 'Escolha o local de estoque.';
    if (!e.lote) er['en-lote'] = 'Escolha o lote.';
    if (nfDuplicada()) er['en-nf'] = 'Esta NF (mesma série e fornecedor) já foi lançada.';
    return er;
  }
  function pendencias() {
    const p = [];
    const er = errosDocumento();
    if (Object.keys(er).length) p.push('Dados do documento: ' + Object.values(er)[0] + (Object.keys(er).length > 1 ? ' (+' + (Object.keys(er).length - 1) + ')' : ''));
    if (!est.anexos.nf) p.push('Anexar a nota fiscal (PDF).');
    if (!est.anexos.relatorio_fotografico) p.push('Anexar o relatório fotográfico (PDF).');
    if (!est.itens.length) p.push('Lançar ao menos um item.');
    const semQtd = est.itens.filter(i => est.entrada.familia === 'cabos' ? !(n(i.lance_m) > 0) || !(n(i.peso_liquido) > 0)
      : est.entrada.familia === 'isoladores' ? !(n(i.quantidade) > 0) || !(n(i.peso_liquido) > 0) : !(n(i.quantidade) > 0));
    if (semQtd.length) p.push(semQtd.length + ' item(ns) sem quantidade' + (est.entrada.familia === 'cabos' ? '/lance/peso' : est.entrada.familia === 'isoladores' ? '/peso' : '') + '.');
    return p;
  }
  function totais() {
    const t = { itens: est.itens.length, qtd: 0, lance: 0, peso: 0, valor: 0, pend: 0 };
    est.itens.forEach(i => { t.qtd += n(i.quantidade) || 0; t.lance += n(i.lance_m) || 0; t.peso += n(i.peso_liquido) || 0; t.valor += n(i.valor) || 0; if (i.status_item === 'pendente') t.pend++; });
    t.peso = A().arred(t.peso, 3); t.valor = A().arred(t.valor, 2);
    return t;
  }

  // ---------------- Montagem ----------------
  async function montar() {
    await carregar();
    if (!est) {
      const salvo = await DB.metaObter(CH_RASCUNHO);
      if (salvo && salvo.entrada && salvo.entrada.projeto_id === A().CTX.get().projeto) { est = salvo; est.sujo = true; }
      else est = novoEstado('cabos');
    }
    if (!est.entrada.projeto_id) est.entrada.projeto_id = A().CTX.get().projeto;
    render();
  }

  function render() {
    const ro = somenteLeitura();
    const pode = AUTH.podeGravar();
    const e = est.entrada;
    const fam = e.familia;
    const cont = document.getElementById('ent-conteudo');
    // Cartões de família (valor recebido confirmado no contexto)
    const conf = c.entradas.filter(x => x.status === 'confirmado');
    const cards = CONFIG.familias.map(f => {
      const ids = new Set(conf.filter(x => x.familia === f.v).map(x => x.id));
      const v = c.itensTodos.filter(i => ids.has(i.entrada_id)).reduce((s, i) => s + (n(i.valor) || 0), 0);
      const ult = conf.filter(x => x.familia === f.v).sort((a, b) => String(b.data_recebimento).localeCompare(String(a.data_recebimento)))[0];
      return '<button type="button" class="card-fam' + (f.v === fam ? ' ativo' : '') + '" data-familia="' + f.v + '" aria-pressed="' + (f.v === fam) + '"' + (ro || (est.salvo && est.itens.length) ? ' disabled' : '') + '>' +
        '<span class="rotulo">' + esc(f.t.toUpperCase()) + '</span><span class="valor">' + A().fmtMoeda(v) + '</span><span class="det">em estoque' + (ult ? ' - NF ' + esc(ult.nf) : '') + '</span></button>';
    }).join('');

    const banner = e.status === 'confirmado'
      ? '<div class="nota ok-faixa" role="status"><strong>Recebimento confirmado</strong> em ' + esc(A().dataHoraBR(e.confirmado_em)) + '. Somente leitura' + (AUTH.ehAdmin() ? ' (o administrador pode excluir o lançamento).' : '.') + '</div>'
      : (!pode ? '<div class="nota info">Seu perfil permite consulta: abra os lançamentos na lista ao lado.</div>'
        : (est.salvo ? '<div class="nota info">Rascunho salvo' + (e._sync === 'sincronizado' ? '' : ' neste aparelho') + '. Complete e confirme o recebimento.</div>' : ''));

    const forn = c.fornecedores.filter(f => f.ativo !== false || f.id === e.fornecedor_id)
      .sort((a, b) => (((b.familias || []).indexOf(fam) >= 0) - ((a.familias || []).indexOf(fam) >= 0)) || nomeForn(a.id).localeCompare(nomeForn(b.id)));
    const transp = c.empresas.filter(x => x.tipo === 'transportadora');
    const dis = ro ? ' disabled' : '';
    const campo = (id, rot, html, obrig, cls) => '<div class="campo' + (obrig ? ' obrig' : '') + (cls ? ' ' + cls : '') + '" id="c-' + id + '"><label for="' + id + '">' + esc(rot) + (obrig ? ' *' : '') + '</label>' + html + '</div>';
    const inp = (id, v, extra) => '<input id="' + id + '" type="text" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + dis + '>';

    const documento = '<section class="card"><div class="card-cab card-cab-escuro"><h2>Dados do documento</h2><span>Campos em amarelo são obrigatórios</span></div><div class="card-corpo grade-doc">' +
      campo('en-data', 'Data recebimento', inp('en-data', A().dataBR(e.data_recebimento) || e._dataRecebTxt || '', ' inputmode="numeric" placeholder="dd/mm/aaaa"'), true) +
      campo('en-nf', 'Nota fiscal', inp('en-nf', e.nf, ' class="mono" inputmode="numeric" autocomplete="off"'), true) +
      campo('en-serie', 'Série', inp('en-serie', e.serie, ' class="mono" placeholder="Série"')) +
      campo('en-emissao', 'Data emissão', inp('en-emissao', A().dataBR(e.data_emissao) || e._dataEmissaoTxt || '', ' inputmode="numeric" placeholder="dd/mm/aaaa"')) +
      campo('en-chave', 'Chave NF-e', inp('en-chave', e.chave_nfe, ' class="mono" inputmode="numeric" maxlength="54" placeholder="44 dígitos da chave de acesso"'), false, 'span2') +
      campo('en-romaneio', 'Romaneio', inp('en-romaneio', e.romaneio, ' class="mono" placeholder="Nº do romaneio"')) +
      campo('en-forn', 'Fornecedor', '<select id="en-forn"' + dis + '><option value="">Selecione</option>' + forn.map(f => opt(f.id, nomeForn(f.id) + ((f.familias || []).indexOf(fam) < 0 ? ' (outra família)' : ''), f.id === e.fornecedor_id)).join('') + '</select>' +
        (pode && !ro && !forn.length ? '<span class="ajuda">Cadastre o fornecedor em Cadastros > Fornecedores.</span>' : ''), true) +
      campo('en-transp', 'Transportadora', inp('en-transp', e.transportadora, ' list="lista-transp" placeholder="Razão social"') + '<datalist id="lista-transp">' + transp.map(t => '<option value="' + esc(t.razao_social) + '">').join('') + '</datalist>') +
      campo('en-placa', 'Placa', inp('en-placa', e.placa, ' class="mono" maxlength="8" autocapitalize="characters" placeholder="AAA0A00"')) +
      campo('en-local', 'Local / prefixo', '<select id="en-local"' + dis + '><option value="">Selecione</option>' + c.locais.map(l => opt(l.id, l.nome, l.id === e.local_id)).join('') + '</select>', true) +
      campo('en-lote', 'Lote', '<select id="en-lote"' + dis + '><option value="">Selecione</option>' + c.lotes.map(l => opt(l.codigo, l.codigo, l.codigo === e.lote)).join('') + '</select>', true) +
      '</div></section>';

    const anexos = '<section class="card"><div class="card-cab card-cab-escuro"><h2>Anexos (PDF)</h2><span>Sem nota fiscal e relatório fotográfico o recebimento não pode ser confirmado</span></div>' +
      '<div class="card-corpo grade-anexos">' + ['nf', 'relatorio_fotografico', 'romaneio'].map(t => slotAnexo(t, t !== 'romaneio', ro)).join('') + '</div></section>';

    const precoTxt = fam === 'isoladores' ? 'Valor = quantidade x preço unitário do material'
      : (precoFamilia(fam, e.data_recebimento) != null ? 'Preço de referência R$ ' + A().fmtNum(precoFamilia(fam, e.data_recebimento), fam === 'cabos' ? 4 : 3) + '/kg (peso x preço)' : 'Sem preço de referência vigente: itens ficam Pendentes');
    const itens = '<section class="card" aria-labelledby="ent-itens-tit"><div class="card-cab"><div><h2 id="ent-itens-tit">Itens do lançamento - ' + esc(A().rotuloFamilia(fam)) + '</h2><span>' + esc(precoTxt) + '</span></div>' +
      (!ro ? '<div class="acoes"><button type="button" class="btn btn-peq" data-acao="modelo-itens">Modelo</button><button type="button" class="btn btn-peq" data-acao="importar-itens">Importar planilha</button><input type="file" id="ent-arquivo-itens" accept=".csv,.xlsx,.xls,.xlsm" hidden></div>' : '') +
      '</div><div id="ent-itens"></div>' + (!ro ? '<div id="ent-novo-item" class="novo-item"></div>' : '') + '</section>';

    const aside = '<aside class="ent-lateral">' +
      '<section class="card"><div class="card-cab"><h2>Resumo do lançamento</h2></div><div class="card-corpo" id="ent-resumo"></div></section>' +
      '<section class="card"><div class="card-cab"><h2>Conferência física</h2></div><div class="card-corpo form-grid">' +
      [['quantidades_conferidas', 'Quantidades e pesos conferidos com a NF'], ['volumes_conferidos', 'Volumes conferidos com o romaneio'], ['avarias_registradas', 'Avarias registradas com fotos'], ['pendencias_comunicadas', 'Pendências comunicadas ao fornecedor']]
        .map(([k, t]) => '<label class="check-linha"><input type="checkbox" data-conf="' + k + '"' + (est.conferencia[k] ? ' checked' : '') + dis + '> ' + esc(t) + '</label>').join('') +
      '<div class="campo"><label for="en-obs">Observações</label><textarea id="en-obs" placeholder="Divergências, avarias, itens sem peso unitário..."' + dis + '>' + esc(e.observacoes || '') + '</textarea></div></div></section>' +
      listasLaterais() + '</aside>';

    const passos = '<ol class="passos" id="ent-passos" aria-label="Etapas do recebimento"></ol>';
    const acoes = '<div class="acoes">' +
      (est.salvo || est.sujo ? '<button type="button" class="btn" data-acao="cancelar">' + (ro ? 'Novo recebimento' : 'Cancelar') + '</button>' : '') +
      (!ro ? '<button type="button" class="btn btn-contorno-entrada" data-acao="rascunho">Salvar rascunho</button><button type="button" class="btn btn-entrada" data-acao="confirmar" id="ent-btn-confirmar">Confirmar recebimento</button>' : '') +
      ((e.status === 'confirmado' && AUTH.ehAdmin()) || (est.salvo && e.status === 'rascunho' && pode) ? '<button type="button" class="btn btn-perigo" data-acao="excluir-lanc">Excluir lançamento</button>' : '') + '</div>';

    cont.innerHTML = '<div class="tela-cabecalho"><div><h1 id="entrada-titulo">Portal de Entrada <span class="chip-tela chip-entrada">ENTRADA</span></h1><p>Recebimento de materiais por nota fiscal e romaneio.</p></div>' + acoes + '</div>' +
      '<div class="grade-fam" role="group" aria-label="Família de material">' + cards + '</div>' + passos + banner +
      '<div class="grade-entrada"><div class="ent-principal">' + documento + anexos + itens + '</div>' + aside + '</div>';
    renderItens();
    atualizarResumo();
    ['en-data', 'en-emissao'].forEach(id => { const x = document.getElementById(id); if (x && !ro) A().mascaraData(x); });
    if (!ligado) ligar();
  }

  function listasLaterais() {
    const ult = c.entradas.filter(x => x.status === 'confirmado').sort((a, b) => String(b.data_recebimento).localeCompare(String(a.data_recebimento)) || String(b.confirmado_em).localeCompare(String(a.confirmado_em))).slice(0, 8);
    const ras = c.entradas.filter(x => x.status === 'rascunho').sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
    const li = x => '<li><button type="button" class="link-lista' + (est && x.id === est.entrada.id ? ' atual' : '') + '" data-abrir="' + x.id + '"><span><span class="mono">NF ' + esc(x.nf) + (x.serie ? '-' + esc(x.serie) : '') + '</span> - ' + esc(nomeForn(x.fornecedor_id)) + A().marcaSync(x) + '</span><span class="muted">' + esc(A().dataBR(x.data_recebimento)) + ' - ' + esc(A().rotuloFamilia(x.familia)) + '</span></button></li>';
    return (ras.length ? '<section class="card"><div class="card-cab"><h2>Rascunhos</h2><span>' + ras.length + '</span></div><ul class="lista-lanc">' + ras.map(li).join('') + '</ul></section>' : '') +
      '<section class="card"><div class="card-cab"><h2>Últimos recebimentos</h2></div>' + (ult.length ? '<ul class="lista-lanc">' + ult.map(li).join('') + '</ul>' : '<div class="card-corpo"><p class="muted">Nenhum recebimento confirmado neste contexto.</p></div>') + '</section>';
  }

  function slotAnexo(tipo, obrig, ro) {
    const a = est.anexos[tipo];
    const rot = ANEXOS.rotulo(tipo);
    const cab = '<div class="slot-cab"><span class="rotulo">' + esc(rot.toUpperCase()) + (obrig ? ' *' : '') + '</span>' + (obrig ? '<span class="status st-pendente-forte">OBRIGATÓRIO</span>' : '<span class="muted">Opcional</span>') + '</div>';
    if (a) {
      return '<div class="slot-anexo">' + cab + '<div class="arquivo-card"><span class="ico-pdf" aria-hidden="true">PDF</span><button type="button" class="arquivo-nome" data-abrir-anexo="' + tipo + '" title="Abrir ' + esc(a.nome_arquivo) + '">' + esc(a.nome_arquivo) + '</button>' +
        '<span class="muted arquivo-det">PDF' + (a.paginas ? ' - ' + a.paginas + (a.paginas === 1 ? ' página' : ' páginas') : '') + (a.bytes ? ' - ' + ANEXOS.tamanhoTxt(a.bytes) : '') + (a._sync && a._sync !== 'sincronizado' ? ' - aguardando envio' : '') + '</span>' +
        (!ro ? '<button type="button" class="arquivo-x" data-remover-anexo="' + tipo + '" aria-label="Remover ' + esc(rot) + '">×</button>' : '') + '</div></div>';
    }
    if (ro) return '<div class="slot-anexo">' + cab + '<p class="muted">Não anexado.</p></div>';
    return '<div class="slot-anexo">' + cab + '<label class="zona-anexo' + (obrig ? ' obrig' : '') + '" data-zona="' + tipo + '"><input type="file" accept="application/pdf,.pdf" data-anexo="' + tipo + '" class="sr-only">' +
      '<span class="ico-up" aria-hidden="true">⇪</span><strong>Anexar ' + esc(rot.toLowerCase()) + '</strong><span class="muted">Toque para selecionar ou arraste o PDF - até ' + CONFIG.limitePdfMB + ' MB</span></label></div>';
  }

  function renderItens() {
    const box = document.getElementById('ent-itens'); if (!box) return;
    const ro = somenteLeitura();
    const fam = est.entrada.familia;
    const t = totais();
    const fmt = A().fmtNum;
    const st = i => i.status_item === 'pendente' ? '<span class="status st-pendente">Pendente</span>' + (i.motivo_pendencia ? '<br><small>' + esc(i.motivo_pendencia) + '</small>' : '') : i.status_item === 'aguardando' ? '<span class="status st-info">Aguardando</span>' : '<span class="status st-ok">Conferido</span>';
    const acoes = i => ro ? '' : '<td class="ctr nowrap"><button type="button" class="btn btn-peq" data-editar-item="' + i.id + '" aria-label="Editar item ' + esc(i.descricao || '') + '">Editar</button> <button type="button" class="btn btn-peq btn-perigo" data-remover-item="' + i.id + '" aria-label="Remover item ' + esc(i.descricao || '') + '">×</button></td>';
    const linhas = est.itens.map((i, k) => {
      const m = material(i.material_id) || {};
      const cls = (i.status_item === 'pendente' ? 'pendente' : '') + (itemEdit === i.id ? ' selecionada' : '');
      let cel;
      if (fam === 'cabos') cel = [k + 1, esc(m.descricao || i.descricao), '<span class="mono">' + esc(i.carretel || '') + '</span>', esc(i.tipo_carretel || '-'), fmt(i.lance_m, 0), fmt(i.peso_liquido, 3), fmt(i.valor, 2)];
      else if (fam === 'isoladores') cel = [k + 1, '<span class="mono">' + esc(m.codigo || '-') + '</span>', esc(m.descricao || i.descricao), esc(m.tipo_categoria_torre || '-'), fmt(i.quantidade, 0), fmt(i.peso_liquido, 3), i.preco_unit != null ? fmt(i.preco_unit, 2) : '-', fmt(i.valor, 2)];
      else cel = [k + 1, esc(m.descricao || i.descricao), esc(m.tipo_categoria_torre || '-'), fmt(i.quantidade, 0), i.peso_unit != null ? fmt(i.peso_unit, 3) : '-', fmt(i.peso_liquido, 3), fmt(i.valor, 2)];
      const nNum = { cabos: [4, 5, 6], isoladores: [4, 5, 6, 7], fixadores: [3, 4, 5, 6], ferragem: [3, 4, 5, 6] }[fam];
      return '<tr class="' + cls + '">' + cel.map((v, j) => '<td' + (j === 0 ? ' class="ctr"' : nNum.indexOf(j) >= 0 ? ' class="num"' : '') + '>' + v + '</td>').join('') + '<td class="ctr">' + st(i) + '</td>' + acoes(i) + '</tr>';
    });
    const cols = COLUNAS[fam].slice(0, ro ? -1 : undefined);
    const tot = fam === 'cabos' ? ['', '<strong>TOTAL DO LANÇAMENTO</strong>', '', '', '<strong>' + fmt(t.lance, 0) + '</strong>', '<strong>' + fmt(t.peso, 3) + '</strong>']
      : fam === 'isoladores' ? ['', '', '<strong>TOTAL DO LANÇAMENTO</strong>', '', '<strong>' + fmt(t.qtd, 0) + '</strong>', '<strong>' + fmt(t.peso, 3) + '</strong>', '']
        : ['', '<strong>TOTAL DO LANÇAMENTO</strong>', '', '<strong>' + fmt(t.qtd, 0) + '</strong>', '', '<strong>' + fmt(t.peso, 3) + '</strong>'];
    box.innerHTML = '<div class="tabela-wrap"><table class="tabela tabela-itens"><thead><tr>' + cols.map((h, j) => '<th scope="col"' + (j === 0 ? ' class="ctr"' : /\(|Qtd|Lance|Peso|Valor|Preço/.test(h) ? ' class="num"' : h === 'Status' ? ' class="ctr"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      (linhas.length ? linhas.join('') : '<tr><td colspan="' + cols.length + '" class="tabela-vazia">Nenhum item lançado. ' + (ro ? '' : 'Use o formulário abaixo ou "Importar planilha".') + '</td></tr>') +
      '</tbody>' + (linhas.length ? '<tfoot><tr class="linha-total">' + tot.map(v => '<td class="num">' + v + '</td>').join('') + '<td class="num"><span class="total-destaque">' + A().fmtMoeda(t.valor) + '</span></td><td colspan="' + (ro ? 1 : 2) + '"></td></tr></tfoot>' : '') + '</table></div>';
    if (!ro) renderNovoItem();
  }

  function renderNovoItem() {
    const box = document.getElementById('ent-novo-item'); if (!box) return;
    const fam = est.entrada.familia;
    const it = itemEdit ? est.itens.find(i => i.id === itemEdit) : null;
    const m = it ? material(it.material_id) : null;
    const mats = c.materiais.filter(x => x.familia === fam && x.ativo !== false);
    const dl = '<datalist id="lista-mat">' + mats.map(x => '<option value="' + esc(x.descricao) + '">' + esc((x.codigo ? x.codigo + ' - ' : '') + (x.tipo_categoria_torre || '')) + '</option>').join('') + '</datalist>';
    const campo = (id, rot, html, obrig) => '<div class="campo' + (obrig ? ' obrig' : '') + '" id="c-' + id + '"><label for="' + id + '">' + esc(rot) + (obrig ? ' *' : '') + '</label>' + html + '</div>';
    const inp = (id, v, extra) => '<input id="' + id + '" type="text" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '>';
    const f = A().fmtNum;
    let campos;
    const descRot = fam === 'cabos' ? 'Tipo de cabo' : fam === 'ferragem' ? 'Descrição (peça/volume)' : 'Descrição';
    const desc = campo('ni-desc', descRot, inp('ni-desc', m ? m.descricao : '', ' list="lista-mat" autocomplete="off" placeholder="Digite para buscar no catálogo"'), true);
    if (fam === 'cabos') campos = desc + campo('ni-carretel', 'Carretel', inp('ni-carretel', it ? it.carretel : '', ' class="mono" placeholder="3C2-240625/0000" autocapitalize="characters"'), true) +
      campo('ni-tipocar', 'Tipo carretel', inp('ni-tipocar', it ? it.tipo_carretel : (m ? m.tipo_categoria_torre : ''), ' class="mono" placeholder="190/100"')) +
      campo('ni-lance', 'Lance (m)', inp('ni-lance', it ? f(it.lance_m, 0) : '', ' inputmode="decimal" placeholder="2.450"'), true) +
      campo('ni-peso', 'Peso líq. (kg)', inp('ni-peso', it ? f(it.peso_liquido, 3) : '', ' inputmode="decimal" placeholder="2.869"'), true);
    else if (fam === 'isoladores') campos = desc + campo('ni-qtd', 'Quantidade (un)', inp('ni-qtd', it ? f(it.quantidade, 0) : '', ' inputmode="decimal"'), true) +
      campo('ni-peso', 'Peso líq. (kg)', inp('ni-peso', it ? f(it.peso_liquido, 3) : '', ' inputmode="decimal" placeholder="Conforme NF"'), true);
    else campos = desc + campo('ni-qtd', fam === 'ferragem' ? 'Quantidade (vol./pç)' : 'Quantidade (un)', inp('ni-qtd', it ? f(it.quantidade, 0) : '', ' inputmode="decimal"'), true) +
      '<div class="campo"><span class="rotulo">Peso unit. (kg)</span><output id="ni-pu" class="saida-calc">' + (m ? (m.peso_unit != null ? f(m.peso_unit, 3) : 'sem peso - Pendente') : 'do catálogo') + '</output></div>';
    box.innerHTML = '<form id="form-item" novalidate><div class="novo-item-tit">' + (it ? 'EDITAR ITEM ' + (est.itens.indexOf(it) + 1) : 'NOVO ITEM') + ' - ' + esc(A().rotuloFamilia(fam).toUpperCase()) + '</div><div class="grade-doc">' + campos +
      '<div class="campo"><span class="rotulo">&nbsp;</span><button type="submit" class="btn btn-entrada">' + (it ? 'Atualizar item' : 'Incluir item') + '</button></div>' +
      (it ? '<div class="campo"><span class="rotulo">&nbsp;</span><button type="button" class="btn" data-acao="cancelar-item">Cancelar edição</button></div>' : '') +
      '</div>' + dl + '<p class="ajuda">' + (fam === 'cabos' ? 'Peso informado da NF; valor = peso x R$/kg da família.' : fam === 'isoladores' ? 'Peso informado da NF; valor = quantidade x preço unitário do material.' : 'Peso = peso unitário do catálogo x quantidade; valor = peso x R$/kg da família.') +
      ' Material novo pode ser cadastrado na hora.</p></form>';
    const d = document.getElementById('ni-desc');
    if (d && fam !== 'cabos' && fam !== 'isoladores') d.addEventListener('input', () => {
      const mm = window.CADM ? c.materiais.find(x => x.familia === fam && A().normalizar(x.descricao) === A().normalizar(d.value)) : null;
      const o = document.getElementById('ni-pu'); if (o) o.textContent = mm ? (mm.peso_unit != null ? f(mm.peso_unit, 3) : 'sem peso - Pendente') : 'do catálogo';
    });
  }

  function atualizarResumo() {
    const box = document.getElementById('ent-resumo'); if (!box || !est) return;
    const t = totais();
    const fam = est.entrada.familia;
    const pend = est.entrada.status === 'confirmado' ? [] : pendencias();
    box.innerHTML = '<div class="resumo-grade">' +
      '<div class="resumo-box"><span class="rotulo">Itens</span><span class="v">' + t.itens + '</span></div>' +
      '<div class="resumo-box"><span class="rotulo">' + (fam === 'cabos' ? 'Lance total (m)' : 'Quantidade') + '</span><span class="v">' + A().fmtNum(fam === 'cabos' ? t.lance : t.qtd, 0) + '</span></div>' +
      '<div class="resumo-box"><span class="rotulo">Peso líquido (kg)</span><span class="v">' + A().fmtNum(t.peso, 3) + '</span></div>' +
      '<div class="resumo-box' + (t.pend ? ' alerta' : '') + '"><span class="rotulo">Pendências</span><span class="v">' + t.pend + '</span></div>' +
      '<div class="resumo-box total"><span class="rotulo">Valor do lançamento</span><span class="v">' + A().fmtMoeda(t.valor) + '</span></div></div>' +
      (pend.length && !somenteLeitura() ? '<div class="pendencias-conf" role="status"><strong>Para confirmar o recebimento:</strong><ul>' + pend.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul></div>' : '');
    const bt = document.getElementById('ent-btn-confirmar');
    if (bt) { bt.disabled = pend.length > 0; bt.title = pend.length ? 'Falta: ' + pend.join(' ') : 'Confirmar o recebimento'; bt.setAttribute('aria-disabled', String(pend.length > 0)); }
    // Etapas
    const er = errosDocumento();
    const okDoc = !Object.keys(er).length;
    const okItens = est.itens.length > 0 && !pend.some(p => /item/.test(p));
    const okConf = !!(est.anexos.nf && est.anexos.relatorio_fotografico);
    const okFim = est.entrada.status === 'confirmado';
    const feitos = [okDoc, okItens, okConf, okFim];
    const atual = feitos.indexOf(false);
    document.getElementById('ent-passos').innerHTML = ['Documento', 'Itens', 'Conferência', 'Confirmação'].map((t2, k) =>
      '<li class="passo' + (feitos[k] ? ' feito' : '') + (k === atual ? ' atual' : '') + '"' + (k === atual ? ' aria-current="step"' : '') + '><span class="n">' + (feitos[k] ? '✓' : k + 1) + '</span>' + t2 + '<span class="sr-only">' + (feitos[k] ? ' (concluída)' : ' (pendente)') + '</span></li>').join('');
    // erros inline só depois de interagir
    if (est._mostrarErros) mostrarErrosCampos(er);
  }
  function mostrarErrosCampos(er) {
    document.querySelectorAll('#ent-conteudo .grade-doc .campo').forEach(cpo => { cpo.classList.remove('erro'); const m = cpo.querySelector('.msg-erro'); if (m) m.remove(); });
    Object.keys(er).forEach(id => { const cpo = document.getElementById('c-' + id); if (!cpo) return; cpo.classList.add('erro'); const s = document.createElement('span'); s.className = 'msg-erro'; s.textContent = er[id]; cpo.appendChild(s); });
  }

  // ---------------- Ações ----------------
  async function trocarFamilia(fam) {
    if (fam === est.entrada.familia || somenteLeitura()) return;
    if (est.itens.length) {
      const ok = await A().confirmar({ titulo: 'Trocar família', perigo: true, ok: 'Trocar e remover itens', mensagem: 'Trocar para ' + A().rotuloFamilia(fam) + ' remove os ' + est.itens.length + ' item(ns) já lançados neste recebimento. Deseja continuar?' });
      if (!ok) return;
      est.itensRemovidos = est.itensRemovidos.concat(est.itens.filter(i => i._salvo || i.recebido_em));
      est.itens = [];
    }
    est.entrada.familia = fam; itemEdit = null; marcarSujo(); render();
  }

  function lerCampoDoc(id, v) {
    const e = est.entrada;
    switch (id) {
      case 'en-data': { const iso = A().dataISO(v); e._dataRecebInvalida = !!v && !iso; e._dataRecebTxt = v; e.data_recebimento = iso; recalcularTodos(); renderItens(); break; }
      case 'en-emissao': { const iso = A().dataISO(v); e._dataEmissaoInvalida = !!v && !iso; e._dataEmissaoTxt = v; e.data_emissao = iso; break; }
      case 'en-nf': e.nf = v.trim(); break;
      case 'en-serie': e.serie = v.trim(); break;
      case 'en-chave': e.chave_nfe = A().soDigitos(v); break;
      case 'en-romaneio': e.romaneio = v.trim(); break;
      case 'en-forn': e.fornecedor_id = v; break;
      case 'en-transp': e.transportadora = v.trim(); break;
      case 'en-placa': e.placa = String(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); break;
      case 'en-local': e.local_id = v; break;
      case 'en-lote': e.lote = v; { const l = c.lotes.find(x => x.codigo === v); if (l && l.local_id && !e.local_id) { e.local_id = l.local_id; const s = document.getElementById('en-local'); if (s) s.value = l.local_id; } } break;
      case 'en-obs': e.observacoes = v; break;
      default: return;
    }
    marcarSujo(); atualizarResumo();
  }

  async function verificarDuplicada() {
    const d = nfDuplicada(); if (!d) return false;
    const ok = await A().confirmar({ titulo: 'NF já lançada', ok: 'Abrir a NF existente',
      mensagem: 'A NF ' + d.nf + (d.serie ? ' série ' + d.serie : '') + ' do fornecedor ' + nomeForn(d.fornecedor_id) + ' já foi lançada em ' + A().dataBR(d.data_recebimento) + ' (' + (d.status === 'confirmado' ? 'confirmada' : 'rascunho') + '). Não é permitido lançar a mesma NF duas vezes. Abrir o lançamento existente? O que foi digitado aqui será descartado.' });
    if (ok) { await descartarArquivosNaoSalvos(); await abrirExistente(d.id); }
    return true;
  }

  async function anexar(tipo, file) {
    if (somenteLeitura()) return;
    try {
      const r = await ANEXOS.lerArquivo(file);
      const id = DB.uuid();
      await ANEXOS.gravarBytes(id, r.bytes);
      const ant = est.anexos[tipo];
      if (ant) { if (ant.recebido_em || ant._salvo) est.anexosRemovidos.push(ant); else await DB.db.arquivos.delete(ant.id); }
      est.anexos[tipo] = { id: id, tipo: tipo, documento_tipo: 'entrada', documento_id: est.entrada.id, nome_arquivo: r.nome, bytes: r.tamanho, paginas: r.paginas, _novo: true, _sync: 'pendente' };
      marcarSujo(); render();
      A().aviso(ANEXOS.rotulo(tipo) + ' anexado(a).', 'ok');
    } catch (e) { A().aviso(e.message, 'erro', 7000); }
  }
  async function removerAnexo(tipo) {
    const a = est.anexos[tipo]; if (!a) return;
    const ok = await A().confirmar({ titulo: 'Remover anexo', perigo: true, ok: 'Remover', mensagem: 'Remover "' + a.nome_arquivo + '" (' + ANEXOS.rotulo(tipo) + ')?' + (a._novo ? '' : ' A remoção fica registrada no histórico ao salvar.') });
    if (!ok) return;
    if (a._novo) await DB.db.arquivos.delete(a.id); else est.anexosRemovidos.push(a);
    delete est.anexos[tipo];
    marcarSujo(); render();
  }

  async function salvarItem() {
    const fam = est.entrada.familia;
    const raiz = document.getElementById('form-item');
    raiz.querySelectorAll('.campo.erro').forEach(x => x.classList.remove('erro')); raiz.querySelectorAll('.msg-erro').forEach(x => x.remove());
    const er = {};
    const desc = (document.getElementById('ni-desc').value || '').replace(/\s+/g, ' ').trim();
    const num = id => { const el = document.getElementById(id); if (!el) return null; const t = el.value.trim(); if (!t) return null; return A().parseNum(t); };
    const lance = num('ni-lance'), peso = num('ni-peso'), qtd = num('ni-qtd');
    const carretel = document.getElementById('ni-carretel') ? document.getElementById('ni-carretel').value.trim().toUpperCase() : null;
    if (desc.length < 3) er['ni-desc'] = 'Informe o material.';
    if (fam === 'cabos') {
      if (!carretel) er['ni-carretel'] = 'Informe o carretel.';
      else {
        const dupTela = est.itens.find(i => i.id !== itemEdit && String(i.carretel || '').toUpperCase() === carretel);
        const dupBase = c.itensTodos.find(i => i.entrada_id !== est.entrada.id && !i.excluido_em && String(i.carretel || '').trim().toUpperCase() === carretel);
        if (dupTela) er['ni-carretel'] = 'Carretel já incluído neste lançamento.';
        else if (dupBase) { const en = c.entradasTodas.find(x => x.id === dupBase.entrada_id); er['ni-carretel'] = 'Carretel já recebido' + (en ? ' na NF ' + en.nf : '') + '.'; }
      }
      if (lance == null || isNaN(lance) || lance <= 0) er['ni-lance'] = 'Informe o lance em metros (maior que zero).';
      if (peso == null || isNaN(peso) || peso <= 0) er['ni-peso'] = 'Informe o peso líquido em kg (maior que zero).';
    } else {
      if (qtd == null || isNaN(qtd) || qtd <= 0) er['ni-qtd'] = 'Informe a quantidade (maior que zero).';
      if (fam === 'isoladores' && (peso == null || isNaN(peso) || peso <= 0)) er['ni-peso'] = 'Informe o peso líquido em kg (maior que zero).';
    }
    if (Object.keys(er).length) {
      Object.keys(er).forEach(id => { const cpo = document.getElementById('c-' + id); if (cpo) { cpo.classList.add('erro'); const s = document.createElement('span'); s.className = 'msg-erro'; s.textContent = er[id]; cpo.appendChild(s); } });
      A().aviso('Corrija os campos do item.', 'erro'); return;
    }
    let m = c.materiais.find(x => x.familia === fam && A().normalizar(x.descricao) === A().normalizar(desc)) ||
      (fam === 'isoladores' ? c.materiais.find(x => x.familia === fam && x.codigo && A().normalizar(x.codigo) === A().normalizar(desc)) : null);
    if (!m) {
      const ok = await A().confirmar({ titulo: 'Material não cadastrado', ok: 'Cadastrar e incluir',
        mensagem: '"' + desc.toUpperCase() + '" não está no catálogo de ' + A().rotuloFamilia(fam) + '. Cadastrar agora? ' + (fam === 'fixadores' || fam === 'ferragem' ? 'Ele entra sem peso unitário (Pendente, valor 0) até o cadastro ser completado em Materiais.' : fam === 'isoladores' ? 'Ele entra sem preço unitário (Pendente) até o cadastro ser completado em Materiais.' : '') });
      if (!ok) return;
      const fi = CONFIG.familias.find(x => x.v === fam);
      m = await DB.salvar('materiais', { id: DB.uuid(), familia: fam, descricao: desc.toUpperCase(), unidade: fi.unidade, ativo: true,
        tipo_categoria_torre: fam === 'cabos' && document.getElementById('ni-tipocar') ? (document.getElementById('ni-tipocar').value.trim() || null) : null });
      c.materiais.push(m);
    }
    const base = itemEdit ? est.itens.find(i => i.id === itemEdit) : { id: DB.uuid(), status_item: 'conferido' };
    const novo = Object.assign({}, base, { material_id: m.id, descricao: m.descricao,
      carretel: fam === 'cabos' ? carretel : null, tipo_carretel: fam === 'cabos' ? (document.getElementById('ni-tipocar').value.trim() || null) : null,
      lance_m: fam === 'cabos' ? A().arred(lance, 3) : null, quantidade: fam === 'cabos' ? 1 : A().arred(qtd, 3),
      peso_liquido: fam === 'cabos' || fam === 'isoladores' ? A().arred(peso, 3) : null });
    const calc = calcularItem(fam, novo, m, precoFamilia(fam, est.entrada.data_recebimento));
    if (itemEdit) est.itens[est.itens.findIndex(i => i.id === itemEdit)] = calc; else est.itens.push(calc);
    itemEdit = null;
    marcarSujo(); renderItens(); atualizarResumo();
    if (calc.status_item === 'pendente') A().aviso('Item incluído como Pendente: ' + calc.motivo_pendencia.toLowerCase() + '.', 'alerta');
    const d = document.getElementById('ni-desc'); if (d) d.focus();
  }

  async function removerItem(id) {
    const i = est.itens.find(x => x.id === id); if (!i) return;
    const ok = await A().confirmar({ titulo: 'Remover item', perigo: true, ok: 'Remover', mensagem: 'Remover o item "' + (i.descricao || '') + (i.carretel ? ' - carretel ' + i.carretel : '') + '" deste lançamento?' });
    if (!ok) return;
    if (i.recebido_em || i._salvo) est.itensRemovidos.push(i);
    est.itens = est.itens.filter(x => x.id !== id);
    if (itemEdit === id) itemEdit = null;
    marcarSujo(); renderItens(); atualizarResumo();
  }

  async function importarItens(file) {
    const fam = est.entrada.familia;
    let linhas;
    try { linhas = await A().lerPlanilha(file); } catch (e) { A().aviso(e.message, 'erro'); return; }
    let ok = 0, novosMat = 0; const erros = [];
    const num = v => { const t = String(v || '').trim(); if (!t) return null; return A().parseNum(t); };
    const carretelsTela = new Set(est.itens.map(i => String(i.carretel || '').toUpperCase()));
    for (let k = 0; k < linhas.length; k++) {
      const l = linhas[k];
      const desc = (l.DESCRICAO || l.TIPO_DE_CABO || l.TIPO_CABO || l.DESCRICAO_PECA_VOLUME || l.PRODUTO || '').replace(/\s+/g, ' ').trim();
      if (!desc) continue;
      const lin = 'linha ' + (k + 2);
      const qtd = num(l.QUANTIDADE || l.QTD || l.QUANT), peso = num(l.PESO_LIQ_KG || l.PESO_LIQUIDO || l.PESO_LIQ || l.PESO), lance = num(l.LANCE_M || l.LANCE || l.METRO);
      const pu = num(l.PESO_UNIT || l.PESO_UNITARIO || l.PESO_UNIT_KG);
      const carretel = String(l.CARRETEL || '').trim().toUpperCase();
      if ([qtd, peso, lance, pu].some(x => x != null && isNaN(x))) { erros.push(lin + ': número inválido'); continue; }
      if (fam === 'cabos') {
        if (!carretel || !(lance > 0) || !(peso > 0)) { erros.push(lin + ': carretel, lance e peso são obrigatórios'); continue; }
        if (carretelsTela.has(carretel) || c.itensTodos.some(i => i.entrada_id !== est.entrada.id && !i.excluido_em && String(i.carretel || '').trim().toUpperCase() === carretel)) { erros.push(lin + ': carretel ' + carretel + ' já recebido'); continue; }
      } else if (!(qtd > 0)) { erros.push(lin + ': quantidade'); continue; }
      else if (fam === 'isoladores' && !(peso > 0)) { erros.push(lin + ': peso líquido'); continue; }
      let m = c.materiais.find(x => x.familia === fam && A().normalizar(x.descricao) === A().normalizar(desc)) ||
        (l.CODIGO ? c.materiais.find(x => x.familia === fam && x.codigo && A().normalizar(x.codigo) === A().normalizar(l.CODIGO)) : null);
      if (!m) {
        if (!AUTH.podeGravar()) { erros.push(lin + ': material não cadastrado'); continue; }
        const fi = CONFIG.familias.find(x => x.v === fam);
        m = await DB.salvar('materiais', { id: DB.uuid(), familia: fam, descricao: desc.toUpperCase(), codigo: l.CODIGO || null, unidade: fi.unidade, ativo: true,
          tipo_categoria_torre: (l.CATEGORIA || l.TORRE || l.TIPO || l.TIPO_CARRETEL || '').toUpperCase() || null,
          peso_unit: (fam === 'fixadores' || fam === 'ferragem') && pu != null ? A().arred(pu, 3) : null });
        c.materiais.push(m); novosMat++;
      }
      const it = { id: DB.uuid(), status_item: 'conferido', material_id: m.id, descricao: m.descricao,
        carretel: fam === 'cabos' ? carretel : null, tipo_carretel: fam === 'cabos' ? (l.TIPO_CARRETEL || m.tipo_categoria_torre || null) : null,
        lance_m: fam === 'cabos' ? A().arred(lance, 3) : null, quantidade: fam === 'cabos' ? 1 : A().arred(qtd, 3),
        peso_liquido: fam === 'cabos' || fam === 'isoladores' ? A().arred(peso, 3) : null };
      est.itens.push(calcularItem(fam, it, m, precoFamilia(fam, est.entrada.data_recebimento)));
      if (carretel) carretelsTela.add(carretel);
      ok++;
    }
    marcarSujo(); renderItens(); atualizarResumo();
    A().aviso('Importação: ' + ok + ' item(ns) incluído(s)' + (novosMat ? ', ' + novosMat + ' material(is) cadastrado(s)' : '') + (erros.length ? '; ' + erros.length + ' linha(s) ignorada(s) (' + erros.slice(0, 3).join('; ') + (erros.length > 3 ? '...' : '') + ')' : '') + '.', erros.length ? 'alerta' : 'ok', 10000);
  }
  function baixarModelo() {
    const fam = est.entrada.familia;
    const M = {
      cabos: [['tipo_de_cabo', 'carretel', 'tipo_carretel', 'lance_m', 'peso_liq_kg'], [['CABO AL NU CAL LIGA 1120-838', '3C2-240625/0007', '190/100', '2450', '2869']]],
      isoladores: [['codigo', 'descricao', 'quantidade', 'peso_liq_kg'], [['2574023-1', 'ISOLADOR - 210KN', '30', '525,69']]],
      fixadores: [['descricao', 'categoria', 'quantidade', 'peso_unit'], [['PARAF SEXT M16 X 50', 'PARAFUSOS', '1000', '0,107']]],
      ferragem: [['descricao', 'torre', 'quantidade', 'peso_unit'], [['TORRE BASICA - SL5 (VOL.9/9)', 'SL5', '2', '305,774']]]
    }[fam];
    A().baixarCSV('modelo-entrada-' + fam + '.csv', M[0], M[1]);
  }

  async function salvar(confirmar) {
    if (somenteLeitura()) return;
    est._mostrarErros = true;
    const er = errosDocumento();
    if (nfDuplicada()) { await verificarDuplicada(); return; }
    if (Object.keys(er).length) { atualizarResumo(); A().aviso('Corrija os dados do documento destacados.', 'erro'); const p = document.querySelector('#ent-conteudo .campo.erro input, #ent-conteudo .campo.erro select'); if (p) p.focus(); return; }
    const pend = pendencias();
    if (confirmar && pend.length) { atualizarResumo(); A().aviso('Ainda falta: ' + pend.join(' '), 'erro', 8000); return; }
    const t = totais();
    if (confirmar) {
      const ok = await A().confirmar({ titulo: 'Confirmar recebimento', ok: 'Confirmar recebimento',
        mensagem: 'NF ' + est.entrada.nf + ' - ' + nomeForn(est.entrada.fornecedor_id) + ' - ' + A().rotuloFamilia(est.entrada.familia) + ': ' + t.itens + ' item(ns), ' + A().fmtNum(t.peso, 3) + ' kg, ' + A().fmtMoeda(t.valor) +
          (t.pend ? '. Atenção: ' + t.pend + ' item(ns) pendente(s) entram com valor 0' : '') + '. Depois de confirmado, somente o administrador pode alterar.' });
      if (!ok) return;
    }
    const e = est.entrada;
    const ent = {}; Object.keys(e).forEach(k => { if (k.charAt(0) !== '_' || k === '_sync') ent[k] = e[k]; });
    delete ent._sync;
    ent.chave_nfe = ent.chave_nfe || null; ent.serie = ent.serie || null; ent.romaneio = ent.romaneio || null; ent.transportadora = ent.transportadora || null; ent.placa = ent.placa || null; ent.observacoes = ent.observacoes || null;
    ent.nf = String(ent.nf).trim();
    if (confirmar) { ent.status = 'confirmado'; ent.confirmado_em = DB.agora(); }
    // Anexos (antes da entrada: a confirmação no servidor exige os PDFs)
    for (const tipo of Object.keys(est.anexos)) {
      const a = est.anexos[tipo];
      if (a._novo) {
        await DB.salvar('anexos', { id: a.id, documento_tipo: 'entrada', documento_id: ent.id, projeto_id: ent.projeto_id, lote: ent.lote, tipo: tipo,
          caminho_storage: ANEXOS.caminho(ent.projeto_id, ent.lote, 'entrada', ent.id, tipo, a.nome_arquivo), nome_arquivo: a.nome_arquivo, bytes: a.bytes, paginas: a.paginas });
      }
    }
    for (const a of est.anexosRemovidos) { if (a.id) await DB.excluir('anexos', a.id, { tipo: a.tipo, nome: a.nome_arquivo, entrada: ent.id }); }
    await DB.salvar('entradas', ent);
    for (let k = 0; k < est.itens.length; k++) {
      const i = est.itens[k];
      const reg = {}; Object.keys(i).forEach(x => { if (x.charAt(0) !== '_') reg[x] = i[x]; });
      Object.assign(reg, { entrada_id: ent.id, projeto_id: ent.projeto_id, lote: ent.lote, ordem: k + 1 });
      await DB.salvar('entrada_itens', reg);
    }
    for (const i of est.itensRemovidos) { if (await DB.obter('entrada_itens', i.id)) await DB.excluir('entrada_itens', i.id, { descricao: i.descricao, carretel: i.carretel, entrada: ent.id }); }
    const cf = {}; Object.keys(est.conferencia).forEach(x => { if (x.charAt(0) !== '_') cf[x] = est.conferencia[x]; });
    await DB.salvar('entrada_conferencia', Object.assign(cf, { id: ent.id, entrada_id: ent.id, projeto_id: ent.projeto_id, lote: ent.lote }));
    if (confirmar) await DB.registrarHistorico('entradas', ent.id, 'confirmacao_recebimento', { nf: ent.nf, serie: ent.serie, familia: ent.familia, itens: t.itens, peso: t.peso, valor: t.valor }, { projeto_id: ent.projeto_id, lote: ent.lote });
    await DB.metaGravar(CH_RASCUNHO, null);
    if (confirmar) {
      A().aviso('Recebimento confirmado: NF ' + ent.nf + ' - ' + A().fmtMoeda(t.valor) + '. Saldo atualizado.', 'ok', 7000);
      await carregar();
      est = novoEstado(ent.familia); itemEdit = null;
      render();
      window.scrollTo(0, 0);
    } else {
      A().aviso('Rascunho salvo. Ele aparece em "Rascunhos" para continuar depois.', 'ok');
      await carregar();
      await abrirExistente(ent.id);
    }
  }

  async function descartarArquivosNaoSalvos() {
    if (!est) return;
    for (const t of Object.keys(est.anexos)) { const a = est.anexos[t]; if (a && a._novo) { try { await DB.db.arquivos.delete(a.id); } catch (e) { /* segue */ } } }
  }
  async function cancelar() {
    if (est && est.sujo && !somenteLeitura()) {
      const ok = await A().confirmar({ titulo: 'Descartar alterações', perigo: true, ok: 'Descartar', mensagem: est.salvo ? 'Descartar as alterações feitas desde o último salvamento deste rascunho?' : 'Descartar este recebimento? O que foi digitado e os PDFs anexados serão apagados deste aparelho.' });
      if (!ok) return;
    }
    await descartarArquivosNaoSalvos();
    await DB.metaGravar(CH_RASCUNHO, null);
    const fam = est ? est.entrada.familia : 'cabos';
    est = novoEstado(fam); itemEdit = null;
    render();
  }

  async function excluirLancamento() {
    const e = est.entrada;
    if (e.status === 'confirmado' && !AUTH.ehAdmin()) return;
    const ok = await A().confirmar({ titulo: 'Excluir lançamento', perigo: true, ok: 'Excluir lançamento',
      mensagem: 'Excluir o lançamento da NF ' + e.nf + (e.status === 'confirmado' ? ' (CONFIRMADO - o saldo será reduzido)' : ' (rascunho)') + '? Itens e anexos saem das listas e tudo fica registrado no histórico.' });
    if (!ok) return;
    const ext = { projeto_id: e.projeto_id, lote: e.lote };
    for (const i of est.itens) if (await DB.obter('entrada_itens', i.id)) await DB.excluir('entrada_itens', i.id, { entrada: e.id });
    for (const t of Object.keys(est.anexos)) { const a = est.anexos[t]; if (a && !a._novo && await DB.obter('anexos', a.id)) await DB.excluir('anexos', a.id, { entrada: e.id }); }
    if (await DB.obter('entrada_conferencia', e.id)) await DB.excluir('entrada_conferencia', e.id, { entrada: e.id });
    await DB.excluir('entradas', e.id, { nf: e.nf, serie: e.serie, status: e.status, familia: e.familia });
    await DB.registrarHistorico('entradas', e.id, 'exclusao_recebimento', { nf: e.nf, status: e.status }, ext);
    A().aviso('Lançamento excluído.', 'ok');
    await carregar();
    est = novoEstado(e.familia); itemEdit = null; render();
  }

  // ---------------- Eventos ----------------
  function ligar() {
    ligado = true;
    const raiz = document.getElementById('ent-conteudo');
    raiz.addEventListener('input', ev => {
      const id = ev.target.id;
      if (id && id.indexOf('en-') === 0 && ev.target.tagName !== 'SELECT') lerCampoDoc(id, ev.target.value);
    });
    raiz.addEventListener('change', ev => {
      const t = ev.target;
      if (t.id && t.id.indexOf('en-') === 0) { lerCampoDoc(t.id, t.value); if (t.id === 'en-forn' || t.id === 'en-nf' || t.id === 'en-serie') verificarDuplicada(); return; }
      if (t.dataset.conf) { est.conferencia[t.dataset.conf] = t.checked; marcarSujo(); return; }
      if (t.dataset.anexo && t.files && t.files[0]) { const f = t.files[0]; t.value = ''; anexar(t.dataset.anexo, f); return; }
      if (t.id === 'ent-arquivo-itens' && t.files[0]) { const f = t.files[0]; t.value = ''; importarItens(f); }
    });
    raiz.addEventListener('focusout', ev => { const id = ev.target.id; if (id === 'en-placa' && est && est.entrada.placa) ev.target.value = est.entrada.placa; });
    raiz.addEventListener('click', ev => {
      const fam = ev.target.closest('[data-familia]'); if (fam && !fam.disabled) { trocarFamilia(fam.dataset.familia); return; }
      const ab = ev.target.closest('[data-abrir]'); if (ab) { abrirComCuidado(ab.dataset.abrir); return; }
      const aa = ev.target.closest('[data-abrir-anexo]'); if (aa) { const a = est.anexos[aa.dataset.abrirAnexo]; if (a) ANEXOS.abrir(a); return; }
      const ra = ev.target.closest('[data-remover-anexo]'); if (ra) { removerAnexo(ra.dataset.removerAnexo); return; }
      const ei = ev.target.closest('[data-editar-item]'); if (ei) { itemEdit = ei.dataset.editarItem; renderItens(); const d = document.getElementById('ni-desc'); if (d) { d.scrollIntoView({ block: 'center' }); d.focus(); } return; }
      const ri = ev.target.closest('[data-remover-item]'); if (ri) { removerItem(ri.dataset.removerItem); return; }
      const b = ev.target.closest('[data-acao]'); if (!b) return;
      const ac = b.dataset.acao;
      if (ac === 'rascunho') salvar(false);
      else if (ac === 'confirmar') salvar(true);
      else if (ac === 'cancelar') cancelar();
      else if (ac === 'cancelar-item') { itemEdit = null; renderItens(); }
      else if (ac === 'importar-itens') document.getElementById('ent-arquivo-itens').click();
      else if (ac === 'modelo-itens') baixarModelo();
      else if (ac === 'excluir-lanc') excluirLancamento();
    });
    raiz.addEventListener('submit', ev => { ev.preventDefault(); if (ev.target.id === 'form-item') salvarItem(); });
    // arrastar PDF
    raiz.addEventListener('dragover', ev => { const z = ev.target.closest('[data-zona]'); if (z) { ev.preventDefault(); z.classList.add('sobre'); } });
    raiz.addEventListener('dragleave', ev => { const z = ev.target.closest('[data-zona]'); if (z) z.classList.remove('sobre'); });
    raiz.addEventListener('drop', ev => { const z = ev.target.closest('[data-zona]'); if (!z) return; ev.preventDefault(); z.classList.remove('sobre'); const f = ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) anexar(z.dataset.zona, f); });
  }

  async function abrirComCuidado(id) {
    if (est && est.sujo && !somenteLeitura() && est.entrada.id !== id) {
      const ok = await A().confirmar({ titulo: 'Abrir outro lançamento', perigo: true, ok: 'Descartar e abrir', mensagem: 'Há alterações não salvas neste recebimento. Descartar e abrir o lançamento selecionado?' });
      if (!ok) return;
      await descartarArquivosNaoSalvos();
    }
    await abrirExistente(id);
  }

  return { montar, calcularItem, abrir: abrirExistente, estado: () => est };
})();
window.ENTRADA = ENTRADA;

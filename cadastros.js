/* =====================================================================
   cadastros.js - Cadastros de contexto: Empresas | Projetos | Lotes |
   Usuários e acessos (etapa 1). Locais de estoque ficam no projeto.
   Só o administrador grava; demais perfis consultam.
   ===================================================================== */
const CAD = (function () {
  const A = () => window.APP;
  let aba = 'empresas';
  const sel = { empresas: null, projetos: null, lotes: null, usuarios: null };
  let dados = { empresas: [], projetos: [], lotes: [], locais: [], usuarios: [] };
  let ligado = false;

  const ABAS = [
    { id: 'empresas', t: 'Empresas' },
    { id: 'projetos', t: 'Projetos' },
    { id: 'lotes', t: 'Lotes' },
    { id: 'usuarios', t: 'Usuários e acessos' }
  ];

  function esc(s) { return A().esc(s); }
  function opt(v, t, s) { return '<option value="' + esc(v) + '"' + (s ? ' selected' : '') + '>' + esc(t) + '</option>'; }
  function porNome(a, b, c) { return String(a[c] || '').localeCompare(String(b[c] || ''), 'pt-BR'); }

  async function carregar() {
    const [empresas, projetos, lotes, locais, usuarios] = await Promise.all([
      DB.listar('empresas'), DB.listar('projetos'), DB.listar('lotes'), DB.listar('locais'),
      DB.db.usuarios.toArray()]);
    dados = {
      empresas: empresas.sort((a, b) => porNome(a, b, 'razao_social')),
      projetos: projetos.sort((a, b) => porNome(a, b, 'nome')),
      lotes: lotes.sort((a, b) => porNome(a, b, 'codigo')),
      locais: locais.sort((a, b) => porNome(a, b, 'nome')),
      usuarios: usuarios.filter(u => !u.excluido_em)
    };
  }

  const empresa = id => dados.empresas.find(e => e.id === id);
  const projeto = id => dados.projetos.find(p => p.id === id);
  const local = id => dados.locais.find(l => l.id === id);
  function lotesDoContexto() {
    const c = A().CTX.get();
    return dados.lotes.filter(l => !c.projeto || l.projeto_id === c.projeto);
  }

  // ---------------- Montagem ----------------
  async function montar() {
    await carregar();
    const admin = AUTH.ehAdmin();
    document.getElementById('ctxcad-acoes').hidden = !admin;
    if (!admin && aba === 'usuarios') sel.usuarios = AUTH.uid();
    const pendentes = dados.usuarios.filter(u => u.status === 'pendente').length;
    const cont = {
      empresas: dados.empresas.length, projetos: dados.projetos.length,
      lotes: lotesDoContexto().length, usuarios: admin ? dados.usuarios.length : 1
    };
    document.getElementById('ctxcad-abas').innerHTML = ABAS.map(t =>
      '<button type="button" role="tab" class="aba" id="aba-' + t.id + '" aria-controls="ctxcad-painel" aria-selected="' + (t.id === aba) + '" data-aba="' + t.id + '">' +
      esc(t.t) + ' <span class="cont">' + cont[t.id] + '</span>' +
      (t.id === 'usuarios' && admin && pendentes ? ' <span class="status st-pendente">' + pendentes + (pendentes === 1 ? ' pendente' : ' pendentes') + '</span>' : '') +
      '</button>').join('');
    const painel = document.getElementById('ctxcad-painel');
    painel.setAttribute('aria-labelledby', 'aba-' + aba);
    painel.innerHTML = ({ empresas: htmlEmpresas, projetos: htmlProjetos, lotes: htmlLotes, usuarios: htmlUsuarios })[aba]();
    posMontagem();
    if (!ligado) ligar();
  }

  function grade(cardHtml, formHtml) {
    return '<div class="grade-lateral">' + cardHtml + '<aside>' + formHtml + '</aside></div>';
  }
  function card(titulo, sub, cab, linhas, vazio) {
    return '<section class="card" aria-label="' + esc(titulo) + '"><div class="card-cab"><h2>' + esc(titulo) + '</h2><span>' + sub + '</span></div>' +
      '<div class="tabela-wrap"><table class="tabela"><thead><tr>' + cab.map(c => '<th scope="col"' + (c.ctr ? ' class="ctr"' : '') + '>' + esc(c.t) + '</th>').join('') + '</tr></thead><tbody>' +
      (linhas.length ? linhas.join('') : '<tr><td colspan="' + cab.length + '" class="tabela-vazia">' + esc(vazio) + '</td></tr>') +
      '</tbody></table></div></section>';
  }
  function linha(tipo, id, cels, extraClasse) {
    const s = sel[tipo] === id;
    return '<tr class="clicavel' + (s ? ' selecionada' : '') + (extraClasse ? ' ' + extraClasse : '') + '" data-sel="' + tipo + '" data-id="' + esc(id) + '" tabindex="0" aria-selected="' + s + '">' + cels.join('') + '</tr>';
  }
  function td(v, cls) { return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</td>'; }
  function stAtivo(ativo, fem) { return ativo === false ? '<span class="status st-neutro">' + (fem ? 'Inativa' : 'Inativo') + '</span>' : '<span class="status st-ok">' + (fem ? 'Ativa' : 'Ativo') + '</span>'; }
  function campo(id, rotulo, html, obrig, ajuda) {
    return '<div class="campo' + (obrig ? ' obrig' : '') + '" id="c-' + id + '"><label for="' + id + '">' + esc(rotulo) + (obrig ? ' *' : '') + '</label>' + html +
      (ajuda ? '<span class="ajuda">' + esc(ajuda) + '</span>' : '') + '</div>';
  }
  function inp(id, valor, extra) { return '<input id="' + id + '" type="text" value="' + esc(valor == null ? '' : valor) + '"' + (extra || '') + '>'; }
  function somenteLeitura(titulo) {
    return '<section class="card"><div class="card-cab"><h2>' + esc(titulo) + '</h2></div><div class="card-corpo"><p class="nota info">Somente administradores alteram estes cadastros. Seu perfil permite consulta.</p></div></section>';
  }
  function botoesForm(tipo, rotulo, reg) {
    return '<div class="form-acoes"><button type="submit" class="btn btn-primario">' + esc(rotulo) + '</button>' +
      (reg ? '<button type="button" class="btn" data-acao="novo">Novo</button><button type="button" class="btn btn-perigo" data-acao="excluir" data-tipo="' + tipo + '">Excluir</button>' : '') + '</div>';
  }

  // ---------------- Empresas ----------------
  function htmlEmpresas() {
    const linhas = dados.empresas.map(e => {
      const pj = dados.projetos.filter(p => p.empresa_id === e.id || dados.lotes.some(l => l.projeto_id === p.id && l.empresa_executora_id === e.id));
      const lt = e.tipo === 'concessionaria'
        ? dados.lotes.filter(l => pj.some(p => p.id === l.projeto_id))
        : dados.lotes.filter(l => l.empresa_executora_id === e.id);
      return linha('empresas', e.id, [
        td(esc(e.razao_social) + A().marcaSync(e)),
        td(e.cnpj ? esc(e.cnpj) : '<span class="muted">a informar</span>', 'mono'),
        td(esc(A().rotuloTipoEmpresa(e.tipo))),
        td(esc(pj.map(p => p.nome).join(' - ') || '-')),
        td(esc(lt.map(l => l.codigo).sort().join(' - ') || '-')),
        td(stAtivo(e.ativo, true), 'ctr')]);
    });
    const tab = card('Empresas', 'Concessionária, executoras, transportadoras e fornecedores · <button type="button" class="link-btn" data-acao="modelo-empresas">Baixar modelo de planilha</button>',
      [{ t: 'Razão social' }, { t: 'CNPJ' }, { t: 'Tipo' }, { t: 'Projeto' }, { t: 'Lotes' }, { t: 'Status', ctr: 1 }], linhas, 'Nenhuma empresa cadastrada.');
    if (!AUTH.ehAdmin()) return grade(tab, somenteLeitura('Empresa'));
    const e = empresa(sel.empresas) || {};
    const form = '<section class="card"><form class="card-corpo form-grid" id="form-empresas" novalidate><h2>' + (e.id ? 'Editar empresa' : 'Nova empresa') + '</h2>' +
      campo('emp-razao', 'Razão social', inp('emp-razao', e.razao_social, ' placeholder="Como no CNPJ" autocomplete="off"'), true) +
      campo('emp-fant', 'Nome fantasia', inp('emp-fant', e.fantasia, ' placeholder="Nome curto exibido no sistema"')) +
      campo('emp-cnpj', 'CNPJ', inp('emp-cnpj', e.cnpj, ' placeholder="00.000.000/0000-00" inputmode="numeric" class="mono"'), true) +
      campo('emp-tipo', 'Tipo', '<select id="emp-tipo">' + CONFIG.tiposEmpresa.map(t => opt(t.v, t.t, (e.tipo || 'executora') === t.v)).join('') + '</select>', true) +
      campo('emp-contato', 'Contato', inp('emp-contato', e.contato, ' placeholder="Nome - e-mail - telefone"')) +
      (e.id ? '<label class="campo" style="flex-direction:row;align-items:center;gap:8px;min-height:44px"><input type="checkbox" id="emp-ativo"' + (e.ativo !== false ? ' checked' : '') + ' style="width:20px;height:20px"> Empresa ativa</label>' : '') +
      botoesForm('empresas', 'Salvar empresa', e.id) + '</form></section>';
    return grade(tab, form);
  }

  async function salvarEmpresa() {
    const e = Object.assign({}, empresa(sel.empresas) || {});
    const razao = val('emp-razao').trim(), cnpj = val('emp-cnpj').trim(), tipo = val('emp-tipo');
    limparErros();
    let ok = true;
    if (razao.length < 3) ok = erro('emp-razao', 'Informe a razão social.') && false;
    if (!A().validarCNPJ(cnpj)) ok = erro('emp-cnpj', 'CNPJ inválido. Confira os 14 dígitos.') && false;
    else if (dados.empresas.some(x => x.id !== e.id && A().soDigitos(x.cnpj) === A().soDigitos(cnpj))) ok = erro('emp-cnpj', 'Já existe empresa com este CNPJ.') && false;
    if (!CONFIG.tiposEmpresa.some(t => t.v === tipo)) ok = erro('emp-tipo', 'Escolha o tipo.') && false;
    if (!ok) { A().aviso('Corrija os campos destacados.', 'erro'); return; }
    Object.assign(e, { razao_social: razao, fantasia: val('emp-fant').trim() || null, cnpj: A().formatarCNPJ(cnpj), tipo: tipo,
      contato: val('emp-contato').trim() || null, ativo: document.getElementById('emp-ativo') ? document.getElementById('emp-ativo').checked : true });
    const r = await DB.salvar('empresas', e);
    sel.empresas = r.id;
    A().aviso('Empresa salva.', 'ok');
    await atualizarTudo();
  }

  // ---------------- Projetos (+ locais de estoque) ----------------
  function htmlProjetos() {
    const linhas = dados.projetos.map(p => linha('projetos', p.id, [
      td(esc(p.nome) + A().marcaSync(p)),
      td(esc(p.leilao_contrato || '-')),
      td(esc((empresa(p.empresa_id) || {}).razao_social || '-')),
      td(esc(dados.lotes.filter(l => l.projeto_id === p.id).map(l => l.codigo).join(' - ') || '-')),
      td(esc(dados.locais.filter(l => l.projeto_id === p.id).map(l => l.nome).join(' - ') || '-')),
      td(stAtivo(p.ativo, false), 'ctr')]));
    const tab = card('Projetos', 'Cada projeto reúne seus lotes e locais de estoque',
      [{ t: 'Projeto' }, { t: 'Leilão / contrato' }, { t: 'Empresa' }, { t: 'Lotes' }, { t: 'Locais de estoque' }, { t: 'Status', ctr: 1 }], linhas, 'Nenhum projeto cadastrado.');
    if (!AUTH.ehAdmin()) return grade(tab, somenteLeitura('Projeto'));
    const p = projeto(sel.projetos) || {};
    const locs = p.id ? dados.locais.filter(l => l.projeto_id === p.id) : [];
    const form = '<section class="card"><form class="card-corpo form-grid" id="form-projetos" novalidate><h2>' + (p.id ? 'Editar projeto' : 'Novo projeto') + '</h2>' +
      campo('pj-nome', 'Nome do projeto', inp('pj-nome', p.nome, ' placeholder="Ex.: LT 500 kV Colinas–Ribeiro Gonçalves C3"'), true) +
      campo('pj-leilao', 'Leilão / contrato', inp('pj-leilao', p.leilao_contrato, ' placeholder="Ex.: Leilão ANEEL 01/2024"')) +
      campo('pj-emp', 'Empresa', '<select id="pj-emp"><option value="">Selecione</option>' + dados.empresas.filter(e => e.ativo !== false || e.id === p.empresa_id).map(e => opt(e.id, e.razao_social, e.id === p.empresa_id)).join('') + '</select>', true) +
      '<div class="linha-2">' + campo('pj-kv', 'Tensão (kV)', inp('pj-kv', p.tensao_kv, ' inputmode="decimal" placeholder="500"')) +
      campo('pj-uf', 'UF(s)', inp('pj-uf', p.ufs, ' placeholder="PI / MA / TO"')) + '</div>' +
      '<div class="linha-2">' + campo('pj-ini', 'Início', inp('pj-ini', A().dataBR(p.inicio), ' inputmode="numeric" placeholder="dd/mm/aaaa"')) +
      campo('pj-fim', 'Previsão de término', inp('pj-fim', A().dataBR(p.termino_previsto), ' inputmode="numeric" placeholder="dd/mm/aaaa"')) + '</div>' +
      botoesForm('projetos', 'Salvar projeto', p.id) + '</form>' +
      (p.id ? '<div class="card-corpo form-grid" style="border-top:1px solid var(--line)"><h2>Locais de estoque</h2>' +
        (locs.length ? '<ul style="margin:0;padding-left:18px">' + locs.map(l => '<li>' + esc(l.nome) + A().marcaSync(l) + '</li>').join('') + '</ul>' : '<p class="muted">Nenhum local cadastrado.</p>') +
        '<form id="form-local" class="form-grid" novalidate>' + campo('loc-nome', 'Novo local', inp('loc-nome', '', ' placeholder="Ex.: HUB RBG"'), false) +
        '<button type="submit" class="btn">Adicionar local</button></form></div>' : '<div class="card-corpo"><p class="nota">Depois de salvar o projeto, cadastre aqui os locais de estoque.</p></div>') +
      '</section>';
    return grade(tab, form);
  }

  async function salvarProjeto() {
    const p = Object.assign({}, projeto(sel.projetos) || {});
    limparErros();
    const nome = val('pj-nome').trim(), emp = val('pj-emp');
    const kvTxt = val('pj-kv').trim(), kv = kvTxt ? A().parseNum(kvTxt) : null;
    const iniTxt = val('pj-ini').trim(), fimTxt = val('pj-fim').trim();
    const ini = iniTxt ? A().dataISO(iniTxt) : null, fim = fimTxt ? A().dataISO(fimTxt) : null;
    let ok = true;
    if (nome.length < 3) ok = erro('pj-nome', 'Informe o nome do projeto.') && false;
    else if (dados.projetos.some(x => x.id !== p.id && A().normalizar(x.nome) === A().normalizar(nome))) ok = erro('pj-nome', 'Já existe projeto com este nome.') && false;
    if (!emp) ok = erro('pj-emp', 'Escolha a empresa.') && false;
    if (kvTxt && (isNaN(kv) || kv <= 0)) ok = erro('pj-kv', 'Informe a tensão em kV (número positivo).') && false;
    if (iniTxt && !ini) ok = erro('pj-ini', 'Data inválida. Use dd/mm/aaaa.') && false;
    if (fimTxt && !fim) ok = erro('pj-fim', 'Data inválida. Use dd/mm/aaaa.') && false;
    if (ini && fim && fim < ini) ok = erro('pj-fim', 'O término não pode ser antes do início.') && false;
    if (!ok) { A().aviso('Corrija os campos destacados.', 'erro'); return; }
    Object.assign(p, { nome: nome, leilao_contrato: val('pj-leilao').trim() || null, empresa_id: emp, tensao_kv: kv,
      ufs: val('pj-uf').trim().toUpperCase() || null, inicio: ini, termino_previsto: fim, ativo: p.ativo !== false });
    const r = await DB.salvar('projetos', p);
    sel.projetos = r.id;
    A().aviso('Projeto salvo.', 'ok');
    await atualizarTudo();
  }

  async function salvarLocal() {
    const p = projeto(sel.projetos);
    const nome = val('loc-nome').trim();
    limparErros();
    if (!p) return;
    if (nome.length < 2) { erro('loc-nome', 'Informe o nome do local.'); return; }
    if (dados.locais.some(l => l.projeto_id === p.id && A().normalizar(l.nome) === A().normalizar(nome))) { erro('loc-nome', 'Este local já existe no projeto.'); return; }
    await DB.salvar('locais', { id: DB.uuid(), nome: nome, projeto_id: p.id, ativo: true });
    A().aviso('Local de estoque adicionado.', 'ok');
    await atualizarTudo();
  }

  // ---------------- Lotes ----------------
  function htmlLotes() {
    const c = A().CTX.get();
    const lista = lotesDoContexto();
    const linhas = lista.map(l => linha('lotes', l.id, [
      td('<strong>' + esc(l.codigo) + '</strong>' + A().marcaSync(l)),
      td(esc((projeto(l.projeto_id) || {}).nome || '-')),
      td(esc((empresa(l.empresa_executora_id) || {}).razao_social || '-')),
      td(esc(l.trecho || '-')),
      td(esc((local(l.local_id) || {}).nome || '-')),
      td(esc(l.uf || '-'), 'ctr'),
      td(stAtivo(l.ativo, false), 'ctr')]));
    const tab = card('Lotes', 'Lotes aparecem no seletor do topo e nos portais' + (c.projeto ? ' · projeto do contexto' : ''),
      [{ t: 'Lote' }, { t: 'Projeto' }, { t: 'Empresa executora' }, { t: 'Trecho' }, { t: 'Local de estoque' }, { t: 'UF', ctr: 1 }, { t: 'Status', ctr: 1 }], linhas, 'Nenhum lote cadastrado neste projeto.');
    if (!AUTH.ehAdmin()) return grade(tab, somenteLeitura('Lote'));
    const l = dados.lotes.find(x => x.id === sel.lotes) || {};
    const pjId = l.projeto_id || c.projeto || (dados.projetos[0] || {}).id;
    const execs = dados.empresas.filter(e => e.tipo === 'executora' && (e.ativo !== false || e.id === l.empresa_executora_id));
    const locs = dados.locais.filter(x => x.projeto_id === pjId);
    const form = '<section class="card"><form class="card-corpo form-grid" id="form-lotes" novalidate><h2>' + (l.id ? 'Editar lote' : 'Novo lote') + '</h2>' +
      campo('lt-cod', 'Código do lote', inp('lt-cod', l.codigo, ' placeholder="Ex.: TN13" class="mono" autocapitalize="characters"'), true) +
      campo('lt-proj', 'Projeto', '<select id="lt-proj">' + dados.projetos.map(p => opt(p.id, p.nome, p.id === pjId)).join('') + '</select>', true) +
      campo('lt-emp', 'Empresa executora', '<select id="lt-emp"><option value="">Selecione</option>' + execs.map(e => opt(e.id, e.razao_social, e.id === l.empresa_executora_id)).join('') + '</select>', true,
        execs.length ? '' : 'Cadastre a executora na aba Empresas (tipo Executora).') +
      campo('lt-trecho', 'Trecho', inp('lt-trecho', l.trecho, ' placeholder="Torre inicial – final"')) +
      '<div class="linha-2">' + campo('lt-local', 'Local de estoque', '<select id="lt-local"><option value="">Selecione</option>' + locs.map(x => opt(x.id, x.nome, x.id === l.local_id)).join('') + '</select>', true,
        locs.length ? '' : 'Cadastre o local na aba Projetos.') +
      campo('lt-uf', 'UF', '<select id="lt-uf"><option value="">-</option>' + CONFIG.ufs.map(u => opt(u, u, u === l.uf)).join('') + '</select>') + '</div>' +
      botoesForm('lotes', 'Salvar lote', l.id) + '</form></section>';
    return grade(tab, form);
  }

  async function salvarLote() {
    const l = Object.assign({}, dados.lotes.find(x => x.id === sel.lotes) || {});
    limparErros();
    const cod = val('lt-cod').trim().toUpperCase().replace(/\s+/g, ''), pj = val('lt-proj'), emp = val('lt-emp'), loc = val('lt-local');
    let ok = true;
    if (!/^[A-Z0-9\-_.]{2,20}$/.test(cod)) ok = erro('lt-cod', 'Use de 2 a 20 letras/números, sem espaços (ex.: TN13).') && false;
    else if (dados.lotes.some(x => x.id !== l.id && x.projeto_id === pj && x.codigo.toUpperCase() === cod)) ok = erro('lt-cod', 'Este lote já existe no projeto.') && false;
    if (!pj) ok = erro('lt-proj', 'Escolha o projeto.') && false;
    if (!emp) ok = erro('lt-emp', 'Escolha a empresa executora.') && false;
    if (!loc) ok = erro('lt-local', 'Escolha o local de estoque.') && false;
    else if ((local(loc) || {}).projeto_id !== pj) ok = erro('lt-local', 'O local precisa ser do mesmo projeto.') && false;
    if (!ok) { A().aviso('Corrija os campos destacados.', 'erro'); return; }
    Object.assign(l, { codigo: cod, projeto_id: pj, empresa_executora_id: emp, trecho: val('lt-trecho').trim() || null,
      local_id: loc, uf: val('lt-uf') || null, ativo: l.ativo !== false });
    const r = await DB.salvar('lotes', l);
    sel.lotes = r.id;
    A().aviso('Lote salvo.', 'ok');
    await atualizarTudo();
  }

  // ---------------- Usuários e acessos ----------------
  function stUsuario(u) {
    if (u.status === 'ativo') return '<span class="status st-ok">Ativo</span>';
    if (u.status === 'bloqueado') return '<span class="status st-neutro">Bloqueado</span>';
    return '<span class="status st-pendente">Pendente</span>';
  }
  function htmlUsuarios() {
    const admin = AUTH.ehAdmin();
    const ordem = { pendente: 0, ativo: 1, bloqueado: 2 };
    const lista = (admin ? dados.usuarios : dados.usuarios.filter(u => u.id === AUTH.uid()))
      .slice().sort((a, b) => (ordem[a.status] - ordem[b.status]) || porNome(a, b, 'nome'));
    const linhas = lista.map(u => linha('usuarios', u.id, [
      td('<strong>' + esc(u.nome || '-') + '</strong>' + A().marcaSync(u) + '<br><span class="muted">' + esc(u.email || '') + '</span>'),
      td(esc(A().rotuloPerfil(u.perfil))),
      td(esc((empresa(u.empresa_id) || {}).razao_social || '-')),
      td(esc(u.perfil === 'admin' ? 'Todos' : ((u.projetos || []).map(id => (projeto(id) || {}).nome || 'projeto não visível').join(' - ') || '-'))),
      td(esc(u.perfil === 'admin' ? 'Todos' : ((u.lotes || []).join(' - ') || '-'))),
      td(esc(u.perfil === 'admin' || !(u.locais || []).length ? 'Todos' : u.locais.map(id => (local(id) || {}).nome || '?').join(' - '))),
      td(stUsuario(u), 'ctr')], u.status === 'pendente' ? 'pendente' : ''));
    const tab = card('Usuários e acessos', 'Defina perfil, empresa, projetos, lotes e locais de cada usuário',
      [{ t: 'Usuário' }, { t: 'Perfil' }, { t: 'Empresa' }, { t: 'Projeto' }, { t: 'Lotes' }, { t: 'Local' }, { t: 'Status', ctr: 1 }], linhas, 'Nenhum usuário.');
    if (!admin) return grade(tab, '<section class="card"><div class="card-cab"><h2>Seu acesso</h2></div><div class="card-corpo"><p class="nota info">Para alterar perfil, lotes ou locais, procure um administrador.</p></div></section>');
    const u = dados.usuarios.find(x => x.id === sel.usuarios);
    if (!u) return grade(tab, '<section class="card"><div class="card-cab"><h2>Acesso do usuário</h2></div><div class="card-corpo"><p class="nota">Selecione um usuário na lista para liberar ou alterar o acesso. Cadastros novos entram como <strong>Pendente</strong>.</p></div></section>');
    const proprio = u.id === AUTH.uid();
    const projs = u.projetos || [];
    const checks = (nome, itens, marcados, vazio) => '<div class="checks" role="group" aria-label="' + esc(nome) + '">' +
      (itens.length ? itens.map(i => '<label><input type="checkbox" name="' + esc(nome) + '" value="' + esc(i.v) + '"' + (marcados.indexOf(i.v) >= 0 ? ' checked' : '') + '> ' + esc(i.t) + '</label>').join('') : '<div class="vazio">' + esc(vazio) + '</div>') + '</div>';
    const lotesDisp = uniq(dados.lotes.filter(l => projs.indexOf(l.projeto_id) >= 0).map(l => l.codigo)).sort();
    const locsDisp = dados.locais.filter(l => projs.indexOf(l.projeto_id) >= 0);
    const form = '<section class="card"><form class="card-corpo form-grid" id="form-usuarios" novalidate><h2>Acesso do usuário</h2>' +
      '<div><strong>' + esc(u.nome || '-') + '</strong><br><span class="muted">' + esc(u.email || '') + '</span><br>' + stUsuario(u) + '</div>' +
      (proprio ? '<p class="nota info">Este é o seu usuário. Você não pode alterar o próprio perfil nem bloquear a si mesmo.</p>' : '') +
      campo('us-perfil', 'Perfil', '<select id="us-perfil"' + (proprio ? ' disabled' : '') + '>' + CONFIG.perfis.map(p => opt(p.v, p.t, p.v === u.perfil)).join('') + '</select>', true) +
      campo('us-emp', 'Empresa', '<select id="us-emp"><option value="">-</option>' + dados.empresas.map(e => opt(e.id, e.razao_social, e.id === u.empresa_id)).join('') + '</select>') +
      '<div class="campo"><span class="rotulo">Projetos *</span>' + checks('us-proj', dados.projetos.map(p => ({ v: p.id, t: p.nome })), projs, 'Nenhum projeto cadastrado.') + '</div>' +
      '<div class="campo"><span class="rotulo">Lotes *</span>' + checks('us-lote', lotesDisp.map(c => ({ v: c, t: c })), u.lotes || [], 'Marque um projeto para ver os lotes.') + '</div>' +
      '<div class="campo"><span class="rotulo">Locais</span>' + checks('us-local', locsDisp.map(l => ({ v: l.id, t: l.nome })), u.locais || [], 'Marque um projeto para ver os locais.') +
      '<span class="ajuda">Nenhum marcado = todos os locais dos projetos liberados.</span></div>' +
      '<div class="form-acoes">' +
      (u.status !== 'ativo' ? '<button type="button" class="btn btn-ok" data-acao="liberar">Liberar acesso</button>' : '<button type="submit" class="btn btn-primario">Salvar alterações</button>') +
      (u.status === 'pendente' && !proprio ? '<button type="button" class="btn btn-perigo" data-acao="recusar">Recusar</button>' : '') +
      (u.status === 'ativo' && !proprio ? '<button type="button" class="btn btn-perigo" data-acao="bloquear">Bloquear</button>' : '') +
      '</div></form></section>';
    return grade(tab, form);
  }
  function uniq(a) { return Array.from(new Set(a)); }
  function marcados(nome) { return Array.from(document.querySelectorAll('input[name="' + nome + '"]:checked')).map(i => i.value); }

  function lerAcesso(u) {
    const perfil = u.id === AUTH.uid() ? u.perfil : val('us-perfil');
    const projetos = marcados('us-proj');
    const lotesOk = new Set(dados.lotes.filter(l => projetos.indexOf(l.projeto_id) >= 0).map(l => l.codigo));
    const locaisOk = new Set(dados.locais.filter(l => projetos.indexOf(l.projeto_id) >= 0).map(l => l.id));
    return { perfil: perfil, empresa_id: val('us-emp') || null, projetos: projetos,
      lotes: marcados('us-lote').filter(c => lotesOk.has(c)), locais: marcados('us-local').filter(id => locaisOk.has(id)) };
  }

  async function salvarUsuario(novoStatus) {
    const u = Object.assign({}, dados.usuarios.find(x => x.id === sel.usuarios) || {});
    if (!u.id) return;
    const ac = lerAcesso(u);
    const status = novoStatus || u.status;
    if (status === 'ativo' && ac.perfil !== 'admin' && (!ac.projetos.length || !ac.lotes.length)) {
      A().aviso('Marque pelo menos um projeto e um lote antes de liberar o acesso.', 'erro'); return;
    }
    if (u.id === AUTH.uid() && (status !== 'ativo' || ac.perfil !== 'admin')) { A().aviso('Você não pode reduzir o próprio acesso.', 'erro'); return; }
    const antes = { perfil: u.perfil, status: u.status, projetos: u.projetos, lotes: u.lotes, locais: u.locais };
    Object.assign(u, ac, { status: status });
    await DB.salvar('usuarios', u);
    await DB.registrarHistorico('usuarios', u.id, novoStatus === 'ativo' && antes.status !== 'ativo' ? 'liberacao' : 'alteracao_acesso',
      { antes: antes, depois: { perfil: u.perfil, status: u.status, projetos: u.projetos, lotes: u.lotes, locais: u.locais }, email: u.email });
    A().aviso(novoStatus === 'ativo' && antes.status !== 'ativo' ? 'Acesso liberado para ' + (u.nome || u.email) + '.' : 'Acesso atualizado.', 'ok');
    await atualizarTudo();
  }

  async function mudarStatus(status) {
    const u = Object.assign({}, dados.usuarios.find(x => x.id === sel.usuarios) || {});
    if (!u.id || u.id === AUTH.uid()) return;
    const recusa = u.status === 'pendente';
    const ok = await A().confirmar({ titulo: recusa ? 'Recusar cadastro' : 'Bloquear usuário', perigo: true, ok: recusa ? 'Recusar' : 'Bloquear',
      mensagem: (recusa ? 'Recusar o cadastro de ' : 'Bloquear o acesso de ') + (u.nome || u.email) + '? O usuário deixa de ver os dados do sistema. A ação fica registrada no histórico e pode ser revertida liberando o acesso novamente.' });
    if (!ok) return;
    const antes = u.status;
    u.status = status;
    await DB.salvar('usuarios', u);
    await DB.registrarHistorico('usuarios', u.id, recusa ? 'recusa' : 'bloqueio', { antes: antes, email: u.email });
    A().aviso(recusa ? 'Cadastro recusado.' : 'Usuário bloqueado.', 'ok');
    await atualizarTudo();
  }

  // ---------------- Exclusão (lógica) ----------------
  async function excluir(tipo) {
    const id = sel[tipo];
    const reg = (dados[tipo] || []).find(x => x.id === id);
    if (!reg) return;
    let impede = '';
    if (tipo === 'empresas') {
      if (dados.projetos.some(p => p.empresa_id === id)) impede = 'Esta empresa é a dona de um projeto ativo.';
      else if (dados.lotes.some(l => l.empresa_executora_id === id)) impede = 'Esta empresa é executora de um lote ativo.';
    }
    if (tipo === 'projetos' && dados.lotes.some(l => l.projeto_id === id)) impede = 'O projeto tem lotes ativos. Exclua ou mova os lotes antes.';
    if (impede) { A().aviso('Exclusão não permitida. ' + impede, 'erro', 7000); return; }
    const nome = reg.razao_social || reg.nome || reg.codigo;
    const ok = await A().confirmar({ titulo: 'Excluir cadastro', perigo: true, ok: 'Excluir',
      mensagem: 'Excluir "' + nome + '"? O registro sai das listas, mas fica guardado no histórico (exclusão lógica).' });
    if (!ok) return;
    await DB.excluir(tipo, id, { nome: nome });
    sel[tipo] = null;
    A().aviso('Cadastro excluído.', 'ok');
    await atualizarTudo();
  }

  // ---------------- Importação de empresas (CSV/XLSX) ----------------
  function baixarModelo() {
    A().baixarCSV('modelo-empresas.csv', ['razao_social', 'fantasia', 'cnpj', 'tipo', 'contato'],
      [['Empresa Exemplo Ltda', 'Exemplo', '11.222.333/0001-81', 'Executora', 'Nome - e-mail - telefone']]);
  }
  async function importar(arquivo) {
    if (!window.XLSX) { A().aviso('Leitor de planilhas indisponível. Recarregue o aplicativo.', 'erro'); return; }
    let linhas;
    try {
      const buf = await arquivo.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', codepage: 65001, raw: false });
      linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    } catch (e) { A().aviso('Não foi possível ler o arquivo. Use o modelo (CSV com ";" ou XLSX).', 'erro'); return; }
    const mapaTipo = { CONCESSIONARIA: 'concessionaria', EXECUTORA: 'executora', TRANSPORTADORA: 'transportadora', FORNECEDOR: 'fornecedor' };
    const col = (l, nomes) => { for (const k of Object.keys(l)) { const n = A().normalizar(k).replace(/ /g, '_'); if (nomes.indexOf(n) >= 0) return String(l[k]).trim(); } return ''; };
    let novos = 0, atualizados = 0; const erros = [];
    const existentes = dados.empresas.slice();
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      const razao = col(l, ['RAZAO_SOCIAL', 'RAZAO', 'EMPRESA']);
      const cnpj = col(l, ['CNPJ']);
      const tipoTxt = A().normalizar(col(l, ['TIPO'])).split(' ')[0];
      if (!razao && !cnpj) continue;
      if (razao.length < 3) { erros.push('linha ' + (i + 2) + ': razão social'); continue; }
      if (!A().validarCNPJ(cnpj)) { erros.push('linha ' + (i + 2) + ': CNPJ inválido'); continue; }
      const tipo = mapaTipo[tipoTxt];
      if (!tipo) { erros.push('linha ' + (i + 2) + ': tipo'); continue; }
      const ex = existentes.find(e => A().soDigitos(e.cnpj) === A().soDigitos(cnpj));
      const reg = Object.assign({}, ex || { id: DB.uuid(), ativo: true }, {
        razao_social: razao, fantasia: col(l, ['FANTASIA', 'NOME_FANTASIA']) || (ex ? ex.fantasia : null),
        cnpj: A().formatarCNPJ(cnpj), tipo: tipo, contato: col(l, ['CONTATO']) || (ex ? ex.contato : null) });
      await DB.salvar('empresas', reg);
      if (ex) atualizados++; else { novos++; existentes.push(reg); }
    }
    A().aviso('Importação: ' + novos + ' nova(s), ' + atualizados + ' atualizada(s)' + (erros.length ? '; ' + erros.length + ' linha(s) ignorada(s) (' + erros.slice(0, 4).join('; ') + (erros.length > 4 ? '...' : '') + ')' : '') + '.', erros.length ? 'alerta' : 'ok', 10000);
    await atualizarTudo();
  }

  // ---------------- Eventos ----------------
  function val(id) { const e = document.getElementById(id); return e ? e.value : ''; }
  function erro(id, msg) {
    const c = document.getElementById('c-' + id);
    if (c) { c.classList.add('erro'); const s = document.createElement('span'); s.className = 'msg-erro'; s.textContent = msg; c.appendChild(s); const i = document.getElementById(id); if (i) i.setAttribute('aria-invalid', 'true'); }
    return true;
  }
  function limparErros() {
    document.querySelectorAll('#ctxcad-painel .campo.erro').forEach(c => c.classList.remove('erro'));
    document.querySelectorAll('#ctxcad-painel .msg-erro').forEach(s => s.remove());
    document.querySelectorAll('#ctxcad-painel [aria-invalid]').forEach(i => i.removeAttribute('aria-invalid'));
  }
  async function atualizarTudo() { await A().CTX.montar(); await montar(); }

  function posMontagem() {
    ['pj-ini', 'pj-fim'].forEach(id => { const e = document.getElementById(id); if (e) A().mascaraData(e); });
    const c = document.getElementById('emp-cnpj'); if (c) A().mascaraCNPJ(c);
    const lp = document.getElementById('lt-proj');
    if (lp) lp.addEventListener('change', () => {
      const locs = dados.locais.filter(x => x.projeto_id === lp.value);
      document.getElementById('lt-local').innerHTML = '<option value="">Selecione</option>' + locs.map(x => opt(x.id, x.nome, false)).join('');
    });
    document.querySelectorAll('input[name="us-proj"]').forEach(ch => ch.addEventListener('change', () => {
      // Atualiza lotes/locais disponíveis sem perder as marcações
      const u = dados.usuarios.find(x => x.id === sel.usuarios); if (!u) return;
      const temp = Object.assign({}, u, lerAcesso(u));
      const idx = dados.usuarios.indexOf(u);
      const original = dados.usuarios[idx];
      dados.usuarios[idx] = temp;
      const perfilSel = val('us-perfil'), empSel = val('us-emp');
      document.getElementById('ctxcad-painel').innerHTML = htmlUsuarios();
      dados.usuarios[idx] = original;
      if (document.getElementById('us-perfil')) document.getElementById('us-perfil').value = perfilSel;
      if (document.getElementById('us-emp')) document.getElementById('us-emp').value = empSel;
      posMontagem();
    }));
  }

  function ligar() {
    ligado = true;
    document.getElementById('ctxcad-abas').addEventListener('click', ev => {
      const b = ev.target.closest('[data-aba]'); if (!b) return;
      aba = b.dataset.aba; montar().then(() => { const t = document.getElementById('aba-' + aba); if (t) t.focus(); });
    });
    document.getElementById('ctxcad-abas').addEventListener('keydown', ev => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const i = ABAS.findIndex(t => t.id === aba);
      aba = ABAS[(i + (ev.key === 'ArrowRight' ? 1 : ABAS.length - 1)) % ABAS.length].id;
      montar().then(() => document.getElementById('aba-' + aba).focus());
    });
    const painel = document.getElementById('ctxcad-painel');
    const escolher = tr => { sel[tr.dataset.sel] = tr.dataset.id; montar().then(() => { const f = document.querySelector('#ctxcad-painel aside input:not([readonly]), #ctxcad-painel aside select'); if (f && window.innerWidth < 1100) f.scrollIntoView({ block: 'center' }); }); };
    painel.addEventListener('click', ev => {
      const tr = ev.target.closest('tr[data-sel]'); if (tr) { escolher(tr); return; }
      const b = ev.target.closest('[data-acao]'); if (!b) return;
      const ac = b.dataset.acao;
      if (ac === 'novo') { sel[aba] = null; montar(); }
      else if (ac === 'excluir') excluir(b.dataset.tipo);
      else if (ac === 'liberar') salvarUsuario('ativo');
      else if (ac === 'bloquear' || ac === 'recusar') mudarStatus('bloqueado');
      else if (ac === 'modelo-empresas') baixarModelo();
    });
    painel.addEventListener('keydown', ev => {
      const tr = ev.target.closest('tr[data-sel]');
      if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); escolher(tr); }
    });
    painel.addEventListener('submit', ev => {
      ev.preventDefault();
      const id = ev.target.id;
      if (id === 'form-empresas') salvarEmpresa();
      else if (id === 'form-projetos') salvarProjeto();
      else if (id === 'form-local') salvarLocal();
      else if (id === 'form-lotes') salvarLote();
      else if (id === 'form-usuarios') salvarUsuario();
    });
    document.getElementById('ctxcad-novo').addEventListener('click', () => {
      if (aba === 'usuarios') { A().aviso('Usuários se cadastram pela tela de entrada ("Criar conta"). Depois, libere o acesso aqui.', 'info', 7000); return; }
      sel[aba] = null; montar().then(() => { const f = document.querySelector('#ctxcad-painel aside input'); if (f) f.focus(); });
    });
    document.getElementById('ctxcad-importar').addEventListener('click', () => {
      if (aba !== 'empresas') { A().aviso('A importação por planilha está disponível na aba Empresas. Selecione a aba e tente novamente.', 'info', 6000); return; }
      document.getElementById('ctxcad-arquivo').click();
    });
    document.getElementById('ctxcad-arquivo').addEventListener('change', ev => {
      const f = ev.target.files && ev.target.files[0]; ev.target.value = '';
      if (f) importar(f);
    });
  }

  return { montar, abrirAba: id => { aba = id; return montar(); } };
})();
window.CAD = CAD;

/* =====================================================================
   CADM - Cadastros da etapa 2: Materiais (+ preços de referência),
   Fornecedores e Frentes de serviço. Admin e almoxarife gravam
   (preços: só admin); consulta só lê.
   ===================================================================== */
const CADM = (function () {
  const A = () => window.APP;
  let dados = { materiais: [], fornecedores: [], empresas: [], precos: [], frentes: [], entradas: [], itens: [], lotes: [] };
  const sel = { materiais: null, fornecedores: null, frentes: null };
  const filtro = { mBusca: '', mFam: '', fBusca: '', fFam: '' };
  let famForm = 'cabos';
  let novoFornecedor = false;
  let ligado = {};

  function esc(s) { return A().esc(s); }
  function opt(v, t, s) { return '<option value="' + esc(v) + '"' + (s ? ' selected' : '') + '>' + esc(t) + '</option>'; }
  function campo(id, rotulo, html, obrig, ajuda) {
    return '<div class="campo' + (obrig ? ' obrig' : '') + '" id="c-' + id + '"><label for="' + id + '">' + esc(rotulo) + (obrig ? ' *' : '') + '</label>' + html +
      (ajuda ? '<span class="ajuda">' + esc(ajuda) + '</span>' : '') + '</div>';
  }
  function inp(id, v, extra) { return '<input id="' + id + '" type="text" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '>'; }
  function val(id) { const e = document.getElementById(id); return e ? e.value : ''; }
  function erro(id, msg) {
    const c = document.getElementById('c-' + id);
    if (c) { c.classList.add('erro'); const s = document.createElement('span'); s.className = 'msg-erro'; s.textContent = msg; c.appendChild(s); }
    return false;
  }
  function limparErros(raiz) {
    raiz.querySelectorAll('.campo.erro').forEach(c => c.classList.remove('erro'));
    raiz.querySelectorAll('.msg-erro').forEach(s => s.remove());
  }
  function numOuNulo(txt) { const t = String(txt || '').trim(); if (!t) return null; const n = A().parseNum(t); return isNaN(n) ? NaN : n; }
  const empresa = id => dados.empresas.find(e => e.id === id);
  const fornecedor = id => dados.fornecedores.find(f => f.id === id);
  function nomeFornecedor(f) { const e = f && empresa(f.empresa_id); return e ? (e.fantasia || e.razao_social) : '-'; }

  async function carregar() {
    const c = A().CTX.get();
    const [materiais, fornecedores, empresas, precos, frentes, entradas, lotes] = await Promise.all([
      DB.listar('materiais'), DB.listar('fornecedores'), DB.listar('empresas'),
      DB.listar('precos_referencia', p => p.projeto_id === c.projeto),
      DB.listar('frentes_servico', f => f.projeto_id === c.projeto && (!c.lote || f.lote === c.lote)),
      DB.listar('entradas', e => e.status === 'confirmado'),
      DB.listar('lotes', l => l.projeto_id === c.projeto)]);
    dados = { materiais: materiais.sort((a, b) => (a.familia + a.descricao).localeCompare(b.familia + b.descricao, 'pt-BR')),
      fornecedores, empresas, precos: precos.sort((a, b) => String(b.vigencia_inicio).localeCompare(String(a.vigencia_inicio))),
      frentes: frentes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), entradas, lotes };
  }

  /** Preço vigente (R$/kg) da família numa data ISO, a partir de uma lista de preços (padrão: projeto do contexto). */
  function precoVigente(familia, dataIso, lista) {
    const d = dataIso || new Date().toISOString().slice(0, 10);
    const p = (lista || dados.precos).filter(x => !x.excluido_em && x.familia === familia && String(x.vigencia_inicio) <= d)
      .sort((a, b) => String(b.vigencia_inicio).localeCompare(String(a.vigencia_inicio)) || String(b.criado_em || '').localeCompare(String(a.criado_em || '')))[0];
    return p ? Number(p.preco) : null;
  }
  function pendenciaMaterial(m) {
    if ((m.familia === 'fixadores' || m.familia === 'ferragem') && (m.peso_unit == null || m.peso_unit === '')) return 'Sem peso unitário';
    if (m.familia === 'isoladores' && (m.preco_unit == null || m.preco_unit === '')) return 'Sem preço unitário';
    return '';
  }

  async function montar(tela) {
    await carregar();
    if (tela === 'materiais') montarMateriais();
    if (tela === 'fornecedores') montarFornecedores();
    if (tela === 'frentes') montarFrentes();
  }

  // ============================ MATERIAIS ============================
  function montarMateriais() {
    const pode = AUTH.podeGravar();
    document.getElementById('mat-acoes').hidden = !pode;
    const b = A().normalizar(filtro.mBusca);
    const lista = dados.materiais.filter(m => (!filtro.mFam || m.familia === filtro.mFam) &&
      (!b || A().normalizar((m.codigo || '') + ' ' + m.descricao + ' ' + (m.tipo_categoria_torre || '')).indexOf(b) >= 0));
    const linhas = lista.map(m => {
      const pend = pendenciaMaterial(m);
      const preco = m.familia === 'isoladores' ? (m.preco_unit != null ? A().fmtMoeda(m.preco_unit) + '/un' : '-')
        : (precoVigente(m.familia) != null ? 'R$ ' + A().fmtNum(precoVigente(m.familia), m.familia === 'cabos' ? 8 : 3) + '/kg' : '-');
      return '<tr class="clicavel' + (pend ? ' pendente' : '') + (sel.materiais === m.id ? ' selecionada' : '') + '" data-mat="' + m.id + '" tabindex="0">' +
        '<td class="mono">' + esc(m.codigo || '-') + '</td><td>' + esc(m.descricao) + A().marcaSync(m) + '</td><td>' + esc(A().rotuloFamilia(m.familia)) + '</td>' +
        '<td>' + esc(m.tipo_categoria_torre || '-') + '</td><td class="ctr">' + esc(m.unidade || '-') + '</td>' +
        '<td class="num">' + (m.familia === 'cabos' ? 'informado' : (m.peso_unit != null ? A().fmtNum(m.peso_unit, 3) : '-')) + '</td>' +
        '<td class="num">' + esc(preco) + '</td>' +
        '<td class="ctr">' + (pend ? '<span class="status st-pendente">Pendente</span><br><small>' + esc(pend) + '</small>' : (m.ativo === false ? '<span class="status st-neutro">Inativo</span>' : '<span class="status st-ok">Completo</span>')) + '</td></tr>';
    });
    const nPend = dados.materiais.filter(pendenciaMaterial).length;
    const tabela = '<section class="card" aria-label="Catálogo de materiais"><div class="card-corpo filtros">' +
      '<div class="campo"><label for="mat-busca">Buscar</label><input id="mat-busca" type="search" placeholder="Código ou descrição" value="' + esc(filtro.mBusca) + '"></div>' +
      '<div class="campo"><label for="mat-fam">Família</label><select id="mat-fam"><option value="">Todas</option>' + CONFIG.familias.map(f => opt(f.v, f.t, f.v === filtro.mFam)).join('') + '</select></div></div>' +
      '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Código</th><th>Descrição</th><th>Família</th><th>Tipo / categoria / torre</th><th class="ctr">Unid.</th><th class="num">Peso unit. (kg)</th><th class="num">Preço ref.</th><th class="ctr">Status</th></tr></thead><tbody>' +
      (linhas.length ? linhas.join('') : '<tr><td colspan="8" class="tabela-vazia">' + (dados.materiais.length ? 'Nenhum material encontrado com esses filtros.' : 'Nenhum material cadastrado. Use "+ Novo material" ou "Importar planilha".') + '</td></tr>') +
      '</tbody></table></div><div class="card-corpo"><p class="nota">' + lista.length + ' de ' + dados.materiais.length + ' materiais. ' +
      (nPend ? nPend + ' em rosa (Pendente): sem peso unitário ou sem preço; entram nos recebimentos com valor 0 até o cadastro ser completado.' : 'Todos os materiais estão completos.') + '</p></div></section>';
    document.getElementById('mat-conteudo').innerHTML = '<div class="grade-lateral">' + tabela + '<aside>' + formMaterial(pode) + '</aside></div>' + htmlPrecos();
    posMateriais();
  }

  function formMaterial(pode) {
    if (!pode) return '<section class="card"><div class="card-cab"><h2>Material</h2></div><div class="card-corpo"><p class="nota info">Seu perfil permite consulta. Cadastro de materiais: administrador ou almoxarife.</p></div></section>';
    const m = dados.materiais.find(x => x.id === sel.materiais) || {};
    const fam = m.familia || famForm;
    const famInfo = CONFIG.familias.find(f => f.v === fam);
    const rotTipo = fam === 'cabos' ? 'Tipo de carretel' : fam === 'fixadores' ? 'Categoria' : fam === 'ferragem' ? 'Torre' : 'Tipo';
    const phTipo = fam === 'cabos' ? 'Ex.: 190/100' : fam === 'fixadores' ? 'Parafusos, Porca, Arruela, Calço' : fam === 'ferragem' ? 'Ex.: CRL, SL5, AT5' : 'Ex.: FXBW-500/210-4160';
    return '<section class="card"><form class="card-corpo form-grid" id="form-material" novalidate><h2>' + (m.id ? 'Editar material' : 'Novo material') + '</h2>' +
      '<div class="campo obrig"><span class="rotulo">Família *</span><div class="segmentado" role="radiogroup" aria-label="Família">' +
      CONFIG.familias.map(f => '<button type="button" role="radio" aria-checked="' + (f.v === fam) + '" data-fam="' + f.v + '"' + (m.id ? ' disabled' : '') + '>' + esc(f.t) + '</button>').join('') + '</div></div>' +
      campo('mt-cod', 'Código', inp('mt-cod', m.codigo, ' class="mono" placeholder="Código do fabricante"')) +
      campo('mt-desc', 'Descrição', inp('mt-desc', m.descricao, ' placeholder="Como consta na NF"'), true) +
      campo('mt-tipo', rotTipo, inp('mt-tipo', m.tipo_categoria_torre, ' placeholder="' + esc(phTipo) + '"' + (fam === 'fixadores' ? ' list="lista-categorias"' : '')), fam !== 'cabos') +
      '<datalist id="lista-categorias">' + CONFIG.categoriasFixadores.map(c => '<option value="' + esc(c.toUpperCase()) + '">').join('') + '</datalist>' +
      '<div class="linha-2">' + campo('mt-un', 'Unidade', inp('mt-un', m.unidade || famInfo.unidade, ' placeholder="un, pç, m"'), true) +
      (fam === 'cabos' ? '<div class="campo"><span class="rotulo">Peso</span><span class="ajuda">Informado por carretel no recebimento.</span></div>'
        : campo('mt-peso', 'Peso unit. (kg)', inp('mt-peso', m.peso_unit != null ? A().fmtNum(m.peso_unit, 3) : '', ' inputmode="decimal" placeholder="0,000"'), fam !== 'isoladores', fam === 'isoladores' ? 'Opcional: o peso do isolador vem da NF.' : 'Sem peso, o item fica Pendente.')) + '</div>' +
      (fam === 'isoladores' ? campo('mt-preco', 'Preço unitário (R$)', inp('mt-preco', m.preco_unit != null ? A().fmtNum(m.preco_unit, 2) : '', ' inputmode="decimal" placeholder="0,00"'), true, 'Valor do isolador = quantidade x preço unitário.')
        : '<p class="nota">Preço de referência da família: ' + (precoVigente(fam) != null ? '<strong>R$ ' + A().fmtNum(precoVigente(fam), fam === 'cabos' ? 8 : 3) + '/kg</strong>' : '<strong>não cadastrado</strong>') + ' (quadro "Preços de referência").</p>') +
      campo('mt-forn', 'Fornecedor padrão', '<select id="mt-forn"><option value="">-</option>' + dados.fornecedores.filter(f => f.ativo !== false || f.id === m.fornecedor_padrao_id).map(f => opt(f.id, nomeFornecedor(f), f.id === m.fornecedor_padrao_id)).join('') + '</select>') +
      campo('mt-min', 'Saldo mínimo (crítico)', inp('mt-min', m.estoque_minimo != null ? A().fmtNum(m.estoque_minimo, 3) : '', ' inputmode="decimal" placeholder="Padrão: 5% da entrada ou 3 un"')) +
      (m.id ? '<label class="check-linha"><input type="checkbox" id="mt-ativo"' + (m.ativo !== false ? ' checked' : '') + '> Material ativo</label>' : '') +
      '<div class="form-acoes"><button type="submit" class="btn btn-primario">Salvar material</button>' +
      (m.id ? '<button type="button" class="btn" data-acao="mat-novo">Novo</button><button type="button" class="btn btn-perigo" data-acao="mat-excluir">Excluir</button>' : '') +
      '</div></form></section>';
  }

  function htmlPrecos() {
    const admin = AUTH.ehAdmin();
    const c = A().CTX.get();
    const hoje = new Date().toISOString().slice(0, 10);
    const vigentes = {};
    CONFIG.familias.forEach(f => { const p = dados.precos.filter(x => x.familia === f.v && String(x.vigencia_inicio) <= hoje)[0]; if (p) vigentes[p.id] = true; });
    const linhas = dados.precos.map(p => '<tr><td>' + esc(A().rotuloFamilia(p.familia)) + A().marcaSync(p) + '</td><td class="num">R$ ' + A().fmtNum(p.preco, p.familia === 'cabos' ? 8 : 3) + '</td><td class="ctr">' + (p.base === 'kg' ? 'por kg' : 'por un') + '</td>' +
      '<td class="ctr">' + esc(A().dataBR(p.vigencia_inicio)) + '</td><td>' + esc(p.observacao || '') + '</td><td class="ctr">' + (vigentes[p.id] ? '<span class="status st-ok">Vigente</span>' : (String(p.vigencia_inicio) > hoje ? '<span class="status st-info">Futuro</span>' : '<span class="status st-neutro">Substituído</span>')) + '</td>' +
      (admin ? '<td class="ctr"><button type="button" class="btn btn-peq btn-perigo" data-acao="preco-excluir" data-id="' + p.id + '" aria-label="Excluir preço">Excluir</button></td>' : '') + '</tr>');
    return '<section class="card" style="margin-top:24px" aria-label="Preços de referência"><div class="card-cab"><h2>Preços de referência</h2><span>Por projeto, família e vigência - usados no cálculo do valor (R$). Isoladores usam o preço unitário de cada material.</span></div>' +
      '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Família</th><th class="num">Preço</th><th class="ctr">Base</th><th class="ctr">Vigência a partir de</th><th>Observação</th><th class="ctr">Situação</th>' + (admin ? '<th class="ctr">Ação</th>' : '') + '</tr></thead><tbody>' +
      (linhas.length ? linhas.join('') : '<tr><td colspan="7" class="tabela-vazia">' + (c.projeto ? 'Nenhum preço cadastrado para este projeto.' : 'Selecione um projeto no topo.') + '</td></tr>') + '</tbody></table></div>' +
      (admin && c.projeto ? '<form class="card-corpo grade-form" id="form-preco" novalidate>' +
        campo('pr-fam', 'Família', '<select id="pr-fam">' + CONFIG.familias.filter(f => f.v !== 'isoladores').map(f => opt(f.v, f.t, false)).join('') + '</select>', true) +
        campo('pr-preco', 'Preço (R$/kg)', inp('pr-preco', '', ' inputmode="decimal" placeholder="0,00"'), true) +
        campo('pr-vig', 'Vigência a partir de', inp('pr-vig', A().dataBR(hoje), ' inputmode="numeric" placeholder="dd/mm/aaaa"'), true) +
        campo('pr-obs', 'Observação', inp('pr-obs', '', ' placeholder="Ex.: reajuste contratual"')) +
        '<div class="campo"><span class="rotulo">&nbsp;</span><button type="submit" class="btn btn-primario">Incluir preço</button></div></form>' : '') +
      '</section>';
  }

  function posMateriais() {
    const busca = document.getElementById('mat-busca');
    busca.addEventListener('input', () => { filtro.mBusca = busca.value; clearTimeout(busca._t); busca._t = setTimeout(() => { const p = busca.selectionStart; montarMateriais(); const b2 = document.getElementById('mat-busca'); b2.focus(); b2.setSelectionRange(p, p); }, 250); });
    document.getElementById('mat-fam').addEventListener('change', e => { filtro.mFam = e.target.value; montarMateriais(); });
    const v = document.getElementById('pr-vig'); if (v) A().mascaraData(v);
    if (ligado.mat) return;
    ligado.mat = true;
    const raiz = document.getElementById('mat-conteudo');
    raiz.addEventListener('click', async ev => {
      const tr = ev.target.closest('tr[data-mat]');
      if (tr) { sel.materiais = tr.dataset.mat; montarMateriais(); return; }
      const f = ev.target.closest('[data-fam]');
      if (f && !f.disabled) { famForm = f.dataset.fam; montarMateriais(); return; }
      const b = ev.target.closest('[data-acao]'); if (!b) return;
      if (b.dataset.acao === 'mat-novo') { sel.materiais = null; montarMateriais(); }
      if (b.dataset.acao === 'mat-excluir') excluirMaterial();
      if (b.dataset.acao === 'preco-excluir') excluirPreco(b.dataset.id);
    });
    raiz.addEventListener('keydown', ev => { const tr = ev.target.closest('tr[data-mat]'); if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); sel.materiais = tr.dataset.mat; montarMateriais(); } });
    raiz.addEventListener('submit', ev => { ev.preventDefault(); if (ev.target.id === 'form-material') salvarMaterial(); if (ev.target.id === 'form-preco') salvarPreco(); });
    document.getElementById('mat-novo').addEventListener('click', () => { sel.materiais = null; montarMateriais(); const d = document.getElementById('mt-desc'); if (d) d.focus(); });
    document.getElementById('mat-importar').addEventListener('click', () => document.getElementById('mat-arquivo').click());
    document.getElementById('mat-modelo').addEventListener('click', () => A().baixarCSV('modelo-materiais.csv',
      ['familia', 'codigo', 'descricao', 'tipo_categoria_torre', 'unidade', 'peso_unit', 'preco_unit'],
      [['Cabos', '', 'CABO AL NU CAL LIGA 1120-838', '190/100', 'm', '', ''],
       ['Isoladores', '2574023-1', 'ISOLADOR - 210KN', 'FXBW-500/210-4160', 'un', '17,523', '412,50'],
       ['Fixadores', '', 'PARAF SEXT M16 X 50', 'PARAFUSOS', 'un', '0,107', ''],
       ['Ferragem', '', 'TORRE BASICA - SL5 (VOL.9/9)', 'SL5', 'pç', '305,774', '']]));
    document.getElementById('mat-arquivo').addEventListener('change', ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) importarMateriais(f); });
  }

  /** Cria/atualiza material. Usado pelo formulário, pela importação e pelo Portal de Entrada. */
  async function gravarMaterial(m) { const r = await DB.salvar('materiais', m); return r; }
  function materialPorDescricao(familia, descricao) {
    const n = A().normalizar(descricao);
    return dados.materiais.find(m => m.familia === familia && A().normalizar(m.descricao) === n);
  }

  async function salvarMaterial() {
    const raiz = document.getElementById('form-material'); limparErros(raiz);
    const m = Object.assign({}, dados.materiais.find(x => x.id === sel.materiais) || {});
    const fam = m.familia || famForm;
    const desc = val('mt-desc').trim().replace(/\s+/g, ' ');
    const tipo = val('mt-tipo').trim();
    const un = val('mt-un').trim();
    const peso = document.getElementById('mt-peso') ? numOuNulo(val('mt-peso')) : null;
    const preco = document.getElementById('mt-preco') ? numOuNulo(val('mt-preco')) : null;
    const min = numOuNulo(val('mt-min'));
    let ok = true;
    if (desc.length < 3) ok = erro('mt-desc', 'Informe a descrição como consta na NF.');
    else { const dup = materialPorDescricao(fam, desc); if (dup && dup.id !== m.id) ok = erro('mt-desc', 'Já existe material com esta descrição em ' + A().rotuloFamilia(fam) + '.'); }
    if (fam !== 'cabos' && !tipo) ok = erro('mt-tipo', 'Informe o tipo, categoria ou torre.');
    if (!un) ok = erro('mt-un', 'Informe a unidade.');
    if (Number.isNaN(peso) || (peso != null && peso < 0)) ok = erro('mt-peso', 'Peso inválido. Use o formato 1.234,567.');
    if (Number.isNaN(preco) || (preco != null && preco < 0)) ok = erro('mt-preco', 'Preço inválido. Use o formato 1.234,56.');
    if (Number.isNaN(min) || (min != null && min < 0)) ok = erro('mt-min', 'Valor inválido.');
    if (!ok) { A().aviso('Corrija os campos destacados.', 'erro'); return; }
    Object.assign(m, { familia: fam, codigo: val('mt-cod').trim() || null, descricao: desc.toUpperCase(), tipo_categoria_torre: tipo ? tipo.toUpperCase() : null,
      unidade: un, peso_unit: fam === 'cabos' ? null : (peso == null ? null : A().arred(peso, 3)), preco_unit: fam === 'isoladores' ? (preco == null ? null : A().arred(preco, 2)) : null,
      fornecedor_padrao_id: val('mt-forn') || null, estoque_minimo: min == null ? null : A().arred(min, 3),
      ativo: document.getElementById('mt-ativo') ? document.getElementById('mt-ativo').checked : true });
    const r = await gravarMaterial(m);
    sel.materiais = r.id;
    A().aviso(pendenciaMaterial(m) ? 'Material salvo como Pendente (' + pendenciaMaterial(m).toLowerCase() + ').' : 'Material salvo.', pendenciaMaterial(m) ? 'alerta' : 'ok');
    await montar('materiais');
  }

  async function excluirMaterial() {
    const m = dados.materiais.find(x => x.id === sel.materiais); if (!m) return;
    const usado = (await DB.listar('entrada_itens', i => i.material_id === m.id)).length;
    if (usado) { A().aviso('Exclusão não permitida: o material já tem ' + usado + ' lançamento(s) de entrada. Marque como inativo.', 'erro', 7000); return; }
    const ok = await A().confirmar({ titulo: 'Excluir material', perigo: true, ok: 'Excluir', mensagem: 'Excluir "' + m.descricao + '" do catálogo? A exclusão fica registrada no histórico.' });
    if (!ok) return;
    await DB.excluir('materiais', m.id, { descricao: m.descricao, familia: m.familia });
    sel.materiais = null; A().aviso('Material excluído.', 'ok'); await montar('materiais');
  }

  async function importarMateriais(file) {
    let linhas;
    try { linhas = await A().lerPlanilha(file); } catch (e) { A().aviso(e.message, 'erro'); return; }
    const mapa = { CABOS: 'cabos', CABO: 'cabos', ISOLADORES: 'isoladores', ISOLADOR: 'isoladores', FIXADORES: 'fixadores', FIXADOR: 'fixadores', FERRAGEM: 'ferragem', FERRAGENS: 'ferragem' };
    let novos = 0, atual = 0; const erros = [];
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      const desc = (l.DESCRICAO || l.DESCRICAO_PECA_VOLUME || l.TIPO_DE_CABO || '').replace(/\s+/g, ' ').trim();
      if (!desc) continue;
      const fam = mapa[A().normalizar(l.FAMILIA || '')];
      if (!fam) { erros.push('linha ' + (i + 2) + ': família'); continue; }
      const peso = numOuNulo(l.PESO_UNIT || l.PESO_UNITARIO || l.PESO_UNIT_KG);
      const preco = numOuNulo(l.PRECO_UNIT || l.PRECO_UNITARIO);
      if (Number.isNaN(peso) || Number.isNaN(preco)) { erros.push('linha ' + (i + 2) + ': número inválido'); continue; }
      const ex = materialPorDescricao(fam, desc);
      const fi = CONFIG.familias.find(f => f.v === fam);
      const m = Object.assign({}, ex || { id: DB.uuid(), ativo: true }, {
        familia: fam, descricao: desc.toUpperCase(), codigo: l.CODIGO || (ex ? ex.codigo : null),
        tipo_categoria_torre: (l.TIPO_CATEGORIA_TORRE || l.TIPO || l.CATEGORIA || l.TORRE || (ex ? ex.tipo_categoria_torre : '') || '').toUpperCase() || null,
        unidade: l.UNIDADE || (ex ? ex.unidade : fi.unidade),
        peso_unit: fam === 'cabos' ? null : (peso != null ? A().arred(peso, 3) : (ex ? ex.peso_unit : null)),
        preco_unit: fam === 'isoladores' ? (preco != null ? A().arred(preco, 2) : (ex ? ex.preco_unit : null)) : null });
      await gravarMaterial(m);
      if (ex) atual++; else { novos++; dados.materiais.push(m); }
    }
    A().aviso('Importação de materiais: ' + novos + ' novo(s), ' + atual + ' atualizado(s)' + (erros.length ? '; ' + erros.length + ' linha(s) ignorada(s) (' + erros.slice(0, 4).join('; ') + ')' : '') + '.', erros.length ? 'alerta' : 'ok', 9000);
    await montar('materiais');
  }

  async function salvarPreco() {
    const raiz = document.getElementById('form-preco'); limparErros(raiz);
    const c = A().CTX.get();
    const fam = val('pr-fam'); const preco = numOuNulo(val('pr-preco')); const vig = A().dataISO(val('pr-vig'));
    let ok = true;
    if (preco == null || Number.isNaN(preco) || preco <= 0) ok = erro('pr-preco', 'Informe o preço (número positivo).');
    if (!vig) ok = erro('pr-vig', 'Data inválida. Use dd/mm/aaaa.');
    else if (dados.precos.some(p => p.familia === fam && p.vigencia_inicio === vig)) ok = erro('pr-vig', 'Já existe preço desta família com esta vigência.');
    if (!ok) { A().aviso('Corrija os campos destacados.', 'erro'); return; }
    await DB.salvar('precos_referencia', { id: DB.uuid(), projeto_id: c.projeto, familia: fam, preco: preco, base: 'kg', vigencia_inicio: vig, observacao: val('pr-obs').trim() || null });
    A().aviso('Preço de referência incluído.', 'ok');
    await montar('materiais');
  }
  async function excluirPreco(id) {
    const p = dados.precos.find(x => x.id === id); if (!p) return;
    const ok = await A().confirmar({ titulo: 'Excluir preço de referência', perigo: true, ok: 'Excluir',
      mensagem: 'Excluir o preço de ' + A().rotuloFamilia(p.familia) + ' (R$ ' + A().fmtNum(p.preco, 3) + '/kg, vigência ' + A().dataBR(p.vigencia_inicio) + ')? Recebimentos já gravados mantêm o valor calculado.' });
    if (!ok) return;
    await DB.excluir('precos_referencia', id, { familia: p.familia, preco: p.preco, vigencia: p.vigencia_inicio });
    A().aviso('Preço excluído.', 'ok'); await montar('materiais');
  }

  // ============================ FORNECEDORES ============================
  function statsFornecedor(f) {
    const ents = dados.entradas.filter(e => e.fornecedor_id === f.id).sort((a, b) => String(b.data_recebimento).localeCompare(String(a.data_recebimento)));
    return { qtd: ents.length, nfs: ents.map(e => e.nf), ultimo: ents[0] ? ents[0].data_recebimento : null };
  }
  function montarFornecedores() {
    const pode = AUTH.podeGravar();
    document.getElementById('forn-novo').hidden = !pode;
    const b = A().normalizar(filtro.fBusca);
    const lista = dados.fornecedores.filter(f => {
      const e = empresa(f.empresa_id) || {};
      const dig = A().soDigitos(filtro.fBusca);
      const casa = !b || A().normalizar((e.razao_social || '') + ' ' + (e.fantasia || '')).indexOf(b) >= 0 || (dig.length >= 3 && A().soDigitos(e.cnpj).indexOf(dig) >= 0);
      return (!filtro.fFam || (f.familias || []).indexOf(filtro.fFam) >= 0) && casa;
    }).sort((x, y) => nomeFornecedor(x).localeCompare(nomeFornecedor(y), 'pt-BR'));
    const cards = lista.map(f => {
      const e = empresa(f.empresa_id) || {};
      const s = statsFornecedor(f);
      return '<article class="card card-forn' + (sel.fornecedores === f.id ? ' selecionado' : '') + '"><div class="card-forn-cab"><h2>' + esc(e.fantasia || e.razao_social || '-') + '</h2>' +
        (f.ativo === false ? '<span class="status st-neutro">Inativo</span>' : '<span class="status st-ok">Ativo</span>') + '</div><div class="card-corpo">' +
        '<div class="chips">' + (f.familias || []).map(x => '<span class="status st-info">' + esc(A().rotuloFamilia(x)) + '</span>').join(' ') + A().marcaSync(f) + '</div>' +
        '<dl class="dl-forn"><dt>Razão social</dt><dd>' + esc(e.razao_social || '-') + '</dd><dt>CNPJ</dt><dd class="mono">' + esc(e.cnpj || '-') + '</dd><dt>Contato</dt><dd>' + esc(e.contato || '-') + '</dd>' +
        '<dt>Último recebimento</dt><dd>' + esc(s.ultimo ? A().dataBR(s.ultimo) : '-') + '</dd><dt>NFs recebidas</dt><dd>' + s.qtd + '</dd></dl>' +
        (s.nfs.length ? '<div class="chips">' + s.nfs.slice(0, 10).map(n => '<span class="chip-nf mono">' + esc(n) + '</span>').join('') + (s.nfs.length > 10 ? '<span class="muted">+' + (s.nfs.length - 10) + '</span>' : '') + '</div>' : '') +
        (pode ? '<div class="form-acoes"><button type="button" class="btn" data-acao="forn-editar" data-id="' + f.id + '">Editar</button></div>' : '') + '</div></article>';
    });
    const f = fornecedor(sel.fornecedores);
    const e = f ? (empresa(f.empresa_id) || {}) : {};
    const mostrarForm = pode && (novoFornecedor || f || !dados.fornecedores.length);
    const form = mostrarForm ? '<section class="card card-tracejado"><form class="card-corpo form-grid" id="form-fornecedor" novalidate><h2>' + (f ? 'Editar fornecedor' : 'Novo fornecedor') + '</h2>' +
      campo('fo-razao', 'Razão social', inp('fo-razao', e.razao_social, ' placeholder="Nome do fornecedor"'), true) +
      campo('fo-fant', 'Nome curto', inp('fo-fant', e.fantasia, ' placeholder="Ex.: ALUBAR"')) +
      campo('fo-cnpj', 'CNPJ', inp('fo-cnpj', e.cnpj, ' class="mono" inputmode="numeric" placeholder="00.000.000/0000-00"' + (f ? ' readonly' : '')), true) +
      '<div class="campo obrig" id="c-fo-fam"><span class="rotulo">Famílias fornecidas *</span><div class="checks checks-linha">' +
      CONFIG.familias.map(x => '<label><input type="checkbox" name="fo-fam" value="' + x.v + '"' + ((f && (f.familias || []).indexOf(x.v) >= 0) ? ' checked' : '') + '> ' + esc(x.t) + '</label>').join('') + '</div></div>' +
      campo('fo-contato', 'Contato', inp('fo-contato', e.contato, ' placeholder="Nome - e-mail - telefone"')) +
      (f ? '<label class="check-linha"><input type="checkbox" id="fo-ativo"' + (f.ativo !== false ? ' checked' : '') + '> Fornecedor ativo</label>' : '') +
      '<div class="form-acoes"><button type="submit" class="btn btn-primario">Salvar fornecedor</button><button type="button" class="btn" data-acao="forn-cancelar">Cancelar</button></div></form></section>' : '';
    document.getElementById('forn-conteudo').innerHTML = '<div class="filtros-linha card-corpo"><div class="campo"><label for="fo-busca">Buscar fornecedor</label><input id="fo-busca" type="search" placeholder="Razão social ou CNPJ" value="' + esc(filtro.fBusca) + '"></div>' +
      '<div class="campo"><label for="fo-ffam">Família fornecida</label><select id="fo-ffam"><option value="">Todas</option>' + CONFIG.familias.map(x => opt(x.v, x.t, x.v === filtro.fFam)).join('') + '</select></div></div>' +
      '<div class="grade-forn">' + cards.join('') + form + (!cards.length && !form ? '<p class="nota">Nenhum fornecedor cadastrado.</p>' : '') + '</div>';
    const c = document.getElementById('fo-cnpj'); if (c && !f) A().mascaraCNPJ(c);
    const busca = document.getElementById('fo-busca');
    busca.addEventListener('input', () => { filtro.fBusca = busca.value; clearTimeout(busca._t); busca._t = setTimeout(() => { const p = busca.selectionStart; montarFornecedores(); const b2 = document.getElementById('fo-busca'); b2.focus(); b2.setSelectionRange(p, p); }, 250); });
    document.getElementById('fo-ffam').addEventListener('change', ev => { filtro.fFam = ev.target.value; montarFornecedores(); });
    if (ligado.forn) return;
    ligado.forn = true;
    const raiz = document.getElementById('forn-conteudo');
    raiz.addEventListener('click', ev => {
      const b = ev.target.closest('[data-acao]'); if (!b) return;
      if (b.dataset.acao === 'forn-editar') { sel.fornecedores = b.dataset.id; novoFornecedor = false; montarFornecedores(); const r = document.getElementById('fo-razao'); if (r) { r.scrollIntoView({ block: 'center' }); r.focus(); } }
      if (b.dataset.acao === 'forn-cancelar') { sel.fornecedores = null; novoFornecedor = false; montarFornecedores(); }
    });
    raiz.addEventListener('submit', ev => { ev.preventDefault(); if (ev.target.id === 'form-fornecedor') salvarFornecedor(); });
    document.getElementById('forn-novo').addEventListener('click', () => { sel.fornecedores = null; novoFornecedor = true; montarFornecedores(); const r = document.getElementById('fo-razao'); if (r) { r.scrollIntoView({ block: 'center' }); r.focus(); } });
  }

  async function salvarFornecedor() {
    const raiz = document.getElementById('form-fornecedor'); limparErros(raiz);
    const f = Object.assign({}, fornecedor(sel.fornecedores) || {});
    const razao = val('fo-razao').trim(), cnpj = val('fo-cnpj').trim();
    const fams = Array.from(document.querySelectorAll('input[name="fo-fam"]:checked')).map(i => i.value);
    let ok = true;
    if (razao.length < 3) ok = erro('fo-razao', 'Informe a razão social.');
    if (!A().validarCNPJ(cnpj)) ok = erro('fo-cnpj', 'CNPJ inválido. Confira os 14 dígitos.');
    if (!fams.length) ok = erro('fo-fam', 'Marque ao menos uma família.');
    let emp = f.empresa_id ? empresa(f.empresa_id) : dados.empresas.find(e => A().soDigitos(e.cnpj) === A().soDigitos(cnpj));
    if (ok && !f.id && emp && dados.fornecedores.some(x => x.empresa_id === emp.id)) ok = erro('fo-cnpj', 'Este CNPJ já está cadastrado como fornecedor.');
    if (ok && emp && emp.tipo !== 'fornecedor' && !AUTH.ehAdmin()) { ok = erro('fo-cnpj', 'Este CNPJ pertence a uma empresa do tipo ' + A().rotuloTipoEmpresa(emp.tipo) + '. Peça ao administrador para vinculá-la.'); }
    if (!ok) { A().aviso('Corrija os campos destacados.', 'erro'); return; }
    const empReg = Object.assign({}, emp || { id: DB.uuid(), tipo: 'fornecedor', ativo: true, cnpj: A().formatarCNPJ(cnpj) },
      { razao_social: razao, fantasia: val('fo-fant').trim() || (emp ? emp.fantasia : null), contato: val('fo-contato').trim() || null });
    await DB.salvar('empresas', empReg);
    const r = await DB.salvar('fornecedores', Object.assign(f, { empresa_id: empReg.id, familias: fams, ativo: document.getElementById('fo-ativo') ? document.getElementById('fo-ativo').checked : true }));
    sel.fornecedores = null; novoFornecedor = false;
    A().aviso('Fornecedor salvo.', 'ok');
    await montar('fornecedores');
    return r;
  }

  // ============================ FRENTES ============================
  function montarFrentes() {
    const pode = AUTH.podeGravar();
    const c = A().CTX.get();
    document.getElementById('frt-novo').hidden = !pode;
    const u = AUTH.usuario() || {};
    const lotesUsu = dados.lotes.filter(l => AUTH.ehAdmin() || (u.lotes || []).map(x => x.toUpperCase()).indexOf(l.codigo.toUpperCase()) >= 0);
    const st = s => s === 'ativa' ? '<span class="status st-ok">Ativa</span>' : s === 'planejada' ? '<span class="status st-info">Planejada</span>' : '<span class="status st-neutro">Encerrada</span>';
    const linhas = dados.frentes.map(f => '<tr class="clicavel' + (sel.frentes === f.id ? ' selecionada' : '') + '" data-frt="' + f.id + '" tabindex="0"><td>' + esc(f.nome) + A().marcaSync(f) + '</td><td>' + esc((empresa(f.empresa_executora_id) || {}).razao_social || '-') + '</td>' +
      '<td>' + esc(f.trecho || '-') + '</td><td>' + esc(f.local_entrega || '-') + '</td><td class="ctr">' + esc(f.uf || '-') + '</td><td>' + esc(f.responsavel || '-') + '</td><td class="ctr mono">' + esc(f.lote) + '</td>' +
      '<td class="ctr">' + st(f.status) + '</td><td>' + esc((f.materiais_previstos || []).map(A().rotuloFamilia).join(' - ') || '-') + '</td></tr>');
    const f = dados.frentes.find(x => x.id === sel.frentes) || {};
    const execs = dados.empresas.filter(e => e.tipo === 'executora' && (e.ativo !== false || e.id === f.empresa_executora_id));
    const form = pode ? '<section class="card" style="margin-top:24px"><form class="card-corpo" id="form-frente" novalidate><h2 style="margin-bottom:12px">' + (f.id ? 'Editar frente de serviço' : 'Nova frente de serviço') + '</h2><div class="grade-form">' +
      campo('fr-nome', 'Frente de serviço', inp('fr-nome', f.nome, ' placeholder="Ex.: Montagem de torres"'), true) +
      campo('fr-emp', 'Empresa executora', '<select id="fr-emp"><option value="">Selecione</option>' + execs.map(e => opt(e.id, e.razao_social, e.id === f.empresa_executora_id)).join('') + '</select>', true, execs.length ? '' : 'Cadastre a executora em Empresas, projetos e lotes.') +
      campo('fr-trecho', 'Trecho', inp('fr-trecho', f.trecho, ' placeholder="Torre inicial – final"'), true) +
      campo('fr-local', 'Local de entrega', inp('fr-local', f.local_entrega, ' placeholder="Canteiro / praça"'), true) +
      campo('fr-uf', 'UF', '<select id="fr-uf"><option value="">-</option>' + CONFIG.ufs.map(x => opt(x, x, x === f.uf)).join('') + '</select>', true) +
      campo('fr-resp', 'Responsável', inp('fr-resp', f.responsavel, ' placeholder="Nome de quem recebe"'), true) +
      campo('fr-lote', 'Lote', '<select id="fr-lote"><option value="">Selecione</option>' + lotesUsu.map(l => opt(l.codigo, l.codigo, l.codigo === (f.lote || c.lote))).join('') + '</select>', true) +
      campo('fr-status', 'Status', '<select id="fr-status">' + CONFIG.statusFrente.map(x => opt(x.v, x.t, x.v === (f.status || 'ativa'))).join('') + '</select>', true) +
      '<div class="campo" id="c-fr-mat"><span class="rotulo">Materiais previstos</span><div class="checks checks-linha">' + CONFIG.familias.map(x => '<label><input type="checkbox" name="fr-mat" value="' + x.v + '"' + ((f.materiais_previstos || []).indexOf(x.v) >= 0 ? ' checked' : '') + '> ' + esc(x.t) + '</label>').join('') + '</div></div>' +
      '</div><div class="form-acoes" style="margin-top:12px;max-width:520px"><button type="submit" class="btn btn-primario">Salvar frente</button>' +
      (f.id ? '<button type="button" class="btn" data-acao="frt-novo">Novo</button><button type="button" class="btn btn-perigo" data-acao="frt-excluir">Excluir</button>' : '') + '</div></form></section>'
      : '<p class="nota info" style="margin-top:16px">Seu perfil permite consulta. Cadastro de frentes: administrador ou almoxarife.</p>';
    document.getElementById('frt-conteudo').innerHTML = '<section class="card"><div class="card-cab"><h2>Frentes cadastradas</h2><span>Destinos disponíveis no Portal de Saída' + (c.lote ? ' - lote ' + esc(c.lote) : '') + '</span></div>' +
      '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Frente de serviço</th><th>Empresa executora</th><th>Trecho</th><th>Local de entrega</th><th class="ctr">UF</th><th>Responsável</th><th class="ctr">Lote</th><th class="ctr">Status</th><th>Materiais</th></tr></thead><tbody>' +
      (linhas.length ? linhas.join('') : '<tr><td colspan="9" class="tabela-vazia">Nenhuma frente cadastrada neste contexto.</td></tr>') + '</tbody></table></div></section>' + form;
    if (ligado.frt) return;
    ligado.frt = true;
    const raiz = document.getElementById('frt-conteudo');
    raiz.addEventListener('click', ev => {
      const tr = ev.target.closest('tr[data-frt]'); if (tr) { sel.frentes = tr.dataset.frt; montarFrentes(); const n = document.getElementById('fr-nome'); if (n) n.scrollIntoView({ block: 'center' }); return; }
      const b = ev.target.closest('[data-acao]'); if (!b) return;
      if (b.dataset.acao === 'frt-novo') { sel.frentes = null; montarFrentes(); }
      if (b.dataset.acao === 'frt-excluir') excluirFrente();
    });
    raiz.addEventListener('keydown', ev => { const tr = ev.target.closest('tr[data-frt]'); if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); sel.frentes = tr.dataset.frt; montarFrentes(); } });
    raiz.addEventListener('submit', ev => { ev.preventDefault(); if (ev.target.id === 'form-frente') salvarFrente(); });
    document.getElementById('frt-novo').addEventListener('click', () => { sel.frentes = null; montarFrentes(); const n = document.getElementById('fr-nome'); if (n) { n.scrollIntoView({ block: 'center' }); n.focus(); } });
  }

  async function salvarFrente() {
    const raiz = document.getElementById('form-frente'); limparErros(raiz);
    const c = A().CTX.get();
    const f = Object.assign({}, dados.frentes.find(x => x.id === sel.frentes) || {});
    const v = { nome: val('fr-nome').trim(), emp: val('fr-emp'), trecho: val('fr-trecho').trim(), local: val('fr-local').trim(), uf: val('fr-uf'), resp: val('fr-resp').trim(), lote: val('fr-lote') };
    let ok = true;
    if (v.nome.length < 3) ok = erro('fr-nome', 'Informe o nome da frente.');
    if (!v.emp) ok = erro('fr-emp', 'Escolha a empresa executora.');
    if (!v.trecho) ok = erro('fr-trecho', 'Informe o trecho.');
    if (!v.local) ok = erro('fr-local', 'Informe o local de entrega.');
    if (!v.uf) ok = erro('fr-uf', 'Escolha a UF.');
    if (!v.resp) ok = erro('fr-resp', 'Informe o responsável.');
    if (!v.lote) ok = erro('fr-lote', 'Escolha o lote.');
    if (ok && dados.frentes.some(x => x.id !== f.id && x.lote === v.lote && A().normalizar(x.nome) === A().normalizar(v.nome) && A().normalizar(x.trecho) === A().normalizar(v.trecho))) ok = erro('fr-nome', 'Já existe esta frente no mesmo lote e trecho.');
    if (!ok) { A().aviso('Corrija os campos destacados.', 'erro'); return; }
    Object.assign(f, { projeto_id: f.projeto_id || c.projeto, lote: v.lote, nome: v.nome, empresa_executora_id: v.emp, trecho: v.trecho, local_entrega: v.local, uf: v.uf, responsavel: v.resp,
      status: val('fr-status'), materiais_previstos: Array.from(document.querySelectorAll('input[name="fr-mat"]:checked')).map(i => i.value) });
    const r = await DB.salvar('frentes_servico', f);
    sel.frentes = r.id; A().aviso('Frente de serviço salva.', 'ok'); await montar('frentes');
  }
  async function excluirFrente() {
    const f = dados.frentes.find(x => x.id === sel.frentes); if (!f) return;
    const ok = await A().confirmar({ titulo: 'Excluir frente de serviço', perigo: true, ok: 'Excluir', mensagem: 'Excluir a frente "' + f.nome + '"? Ela deixa de aparecer no Portal de Saída. A exclusão fica no histórico.' });
    if (!ok) return;
    await DB.excluir('frentes_servico', f.id, { nome: f.nome, lote: f.lote }, { projeto_id: f.projeto_id, lote: f.lote });
    sel.frentes = null; A().aviso('Frente excluída.', 'ok'); await montar('frentes');
  }

  return { montar, carregar, precoVigente, pendenciaMaterial, materialPorDescricao, nomeFornecedor,
    dados: () => dados };
})();
window.CADM = CADM;

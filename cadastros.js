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

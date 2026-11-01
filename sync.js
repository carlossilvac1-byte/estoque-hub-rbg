/* =====================================================================
   sync.js - fila de envio, recebimento por cursor e tempo real
   - Envio: a cada 30 s, ao esconder a página, ao voltar a conexão e por
     Background Sync. Upsert por id; versão mais antiga é ignorada no servidor.
   - Recebimento: cursor (recebido_em, id), paginado. Edição local pendente
     nunca é sobrescrita.
   - Tabela ainda sem script (404/PGRST205): guarda local, avisa, envia depois.
   - Tempo real: websocket Phoenix, heartbeat 25 s, renovação do token.
   ===================================================================== */
const SYNC = (function () {
  // Ordem importa: pais antes de filhos; anexos antes das entradas (a confirmação exige os PDFs no servidor).
  const TABELAS = [
    { nome: 'empresas' }, { nome: 'projetos' }, { nome: 'locais' }, { nome: 'lotes' },
    { nome: 'usuarios' },
    { nome: 'fornecedores' }, { nome: 'materiais' }, { nome: 'precos_referencia' }, { nome: 'frentes_servico' },
    { nome: 'anexos', arquivo: true }, { nome: 'entradas' }, { nome: 'entrada_itens' }, { nome: 'entrada_conferencia' },
    { nome: 'historico', somenteInsercao: true }
  ];
  let rodando = false, deNovo = false, timer = null, agendado = null;
  const semTabela = new Set();
  const avisadas = new Set();
  let ultimoErro = null;

  // ---------------- REST ----------------
  async function rest(metodo, caminho, corpo, prefer) {
    const extra = prefer ? { Prefer: prefer } : {};
    let h = await AUTH.cabecalhos(extra);
    const url = AUTH.base() + '/rest/v1/' + caminho;
    const op = { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined };
    let r = await fetch(url, op);
    if (r.status === 401) {
      await AUTH.renovar(true);
      op.headers = await AUTH.cabecalhos(extra);
      r = await fetch(url, op);
    }
    let j = null;
    const txt = await r.text();
    try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
    return { ok: r.ok, status: r.status, corpo: j };
  }

  function tabelaFaltando(res) {
    return res.status === 404 || (res.corpo && (res.corpo.code === 'PGRST205' || res.corpo.code === '42P01'));
  }

  function avisarSemTabela(t) {
    semTabela.add(t);
    if (avisadas.has(t)) return;
    avisadas.add(t);
    if (window.APP) APP.aviso('A tabela "' + t + '" ainda não existe na base central. Os dados ficam guardados neste aparelho e serão enviados depois que o script SQL for executado.', 'alerta', 9000);
  }

  function limpo(r) {
    const o = {};
    Object.keys(r).forEach(k => { if (k.charAt(0) !== '_') o[k] = r[k]; });
    delete o.recebido_em;
    return o;
  }

  function msgErro(res) {
    const c = res.corpo || {};
    if (c.code === '23505') return 'Registro duplicado na base central (já existe outro com o mesmo código/CNPJ).';
    if (c.code === '42501' || res.status === 403) return 'Sem permissão para gravar este registro com o seu perfil.';
    if (c.code === '23503') return 'Registro vinculado a outro que ainda não existe na base central.';
    if (c.code === '23514') return 'Valor fora do permitido: ' + (c.message || '');
    return (c.message || ('Erro ' + res.status));
  }

  // ---------------- Envio ----------------
  async function enviarTabela(def) {
    const t = def.nome;
    let pend = await DB.db[t].where('_sync').anyOf('pendente', 'erro').toArray();
    if (!pend.length) return 0;
    if (def.arquivo) pend = await enviarArquivos(pend);
    if (!pend.length) return 0;
    let enviados = 0;
    for (let i = 0; i < pend.length; i += CONFIG.loteEnvio) {
      const lote = pend.slice(i, i + CONFIG.loteEnvio);
      const res = await enviarLote(def, lote);
      if (res === 'sem-tabela') return enviados;
      if (res === 'rede') throw new Error('rede');
      if (res === 'falhou') {
        for (const reg of lote) { await enviarLote(def, [reg], true); }
      }
      enviados += lote.length;
    }
    return enviados;
  }

  /** Envia os PDFs ao Storage antes das linhas de "anexos". Devolve só os prontos para gravar. */
  async function enviarArquivos(pend) {
    const prontos = [];
    for (const reg of pend) {
      if (reg._arquivo_enviado || reg.excluido_em) { prontos.push(reg); continue; }
      const r = await ANEXOS.enviarArquivo(reg);
      if (r.rede) throw new Error('rede');
      const atual = await DB.db.anexos.get(reg.id);
      if (!atual) continue;
      if (r.ok) {
        semTabela.delete('storage:estoque');
        atual._arquivo_enviado = true;
        await DB.db.anexos.put(atual);
        prontos.push(Object.assign({}, reg, { _arquivo_enviado: true }));
      } else {
        if (r.semBucket) avisarSemTabela('storage:estoque');
        if (atual.atualizado_em === reg.atualizado_em) { atual._sync = 'erro'; atual._erro = r.msg; await DB.db.anexos.put(atual); }
        ultimoErro = r.msg;
      }
    }
    return prontos;
  }

  async function enviarLote(def, lote, individual) {
    const t = def.nome;
    const prefer = (def.somenteInsercao ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates') + ',return=representation';
    let res;
    try { res = await rest('POST', t + '?on_conflict=id', lote.map(limpo), prefer); }
    catch (e) { return 'rede'; }
    if (tabelaFaltando(res)) { avisarSemTabela(t); return 'sem-tabela'; }
    semTabela.delete(t);
    if (!res.ok) {
      if (!individual && lote.length > 1) return 'falhou';
      const m = msgErro(res);
      for (const reg of lote) await marcar(t, reg, 'erro', m);
      ultimoErro = m;
      return 'erro';
    }
    const devolvidos = Array.isArray(res.corpo) ? res.corpo : [];
    const ids = new Set(devolvidos.map(r => r.id));
    for (const srv of devolvidos) {
      const enviado = lote.find(r => r.id === srv.id);
      await aplicarDoServidor(t, srv, enviado);
    }
    // Não devolvidos: versão do servidor é mais nova (ou já existia). Busca e aplica.
    const faltam = lote.filter(r => !ids.has(r.id));
    if (faltam.length) {
      const q = t + '?select=*&id=in.(' + faltam.map(r => r.id).join(',') + ')';
      const r2 = await rest('GET', q).catch(() => null);
      if (r2 && r2.ok && Array.isArray(r2.corpo)) {
        const vistos = new Set();
        for (const srv of r2.corpo) { vistos.add(srv.id); await aplicarDoServidor(t, srv, lote.find(x => x.id === srv.id)); }
        for (const reg of faltam) if (!vistos.has(reg.id)) await marcar(t, reg, 'erro', 'A base central não aceitou o registro (sem permissão de leitura após gravar).');
      }
    }
    return 'ok';
  }

  async function marcar(t, reg, status, msg) {
    const atual = await DB.db[t].get(reg.id);
    if (!atual || atual.atualizado_em !== reg.atualizado_em) return;
    atual._sync = status;
    if (msg) atual._erro = msg; else delete atual._erro;
    await DB.db[t].put(atual);
  }

  /** Aplica versão do servidor, sem perder edição feita durante o envio. */
  async function aplicarDoServidor(t, srv, enviado) {
    const atual = await DB.db[t].get(srv.id);
    if (atual && atual._sync === 'pendente' && enviado && atual.atualizado_em !== enviado.atualizado_em) return;
    await DB.db[t].put(Object.assign({}, srv, { _sync: 'sincronizado' }));
    if (t === 'usuarios' && srv.id === AUTH.uid()) AUTH.definirUsuario(srv);
  }

  // ---------------- Recebimento ----------------
  async function receberTabela(def) {
    const t = def.nome;
    let cursor = (await DB.metaObter('cursor_' + t)) || null;
    let total = 0;
    for (let guarda = 0; guarda < 200; guarda++) {
      let q = t + '?select=*&order=recebido_em.asc,id.asc&limit=' + CONFIG.paginaRecebimento;
      if (cursor) {
        q += '&or=' + encodeURIComponent('(recebido_em.gt."' + cursor.ts + '",and(recebido_em.eq."' + cursor.ts + '",id.gt.' + cursor.id + '))');
      }
      const res = await rest('GET', q);
      if (tabelaFaltando(res)) { avisarSemTabela(t); return total; }
      if (!res.ok) throw new Error(msgErro(res));
      semTabela.delete(t);
      const linhas = res.corpo || [];
      for (const srv of linhas) {
        const local = await DB.db[t].get(srv.id);
        if (local && local._sync !== 'sincronizado' && local._sync !== undefined) continue; // pendente/erro local prevalece
        await DB.db[t].put(Object.assign({}, srv, { _sync: 'sincronizado' }));
        if (t === 'usuarios' && srv.id === AUTH.uid()) AUTH.definirUsuario(srv);
      }
      total += linhas.length;
      if (linhas.length) {
        const u = linhas[linhas.length - 1];
        cursor = { ts: u.recebido_em, id: u.id };
        await DB.metaGravar('cursor_' + t, cursor);
      }
      if (linhas.length < CONFIG.paginaRecebimento) break;
    }
    return total;
  }

  // ---------------- Ciclo ----------------
  async function sincronizar(opcoes) {
    opcoes = opcoes || {};
    if (!AUTH.configurado() || !AUTH.temSessao() || !navigator.onLine) { atualizarFaixa(); return; }
    if (rodando) { deNovo = true; return; }
    rodando = true; ultimoErro = null;
    let recebidos = 0;
    try {
      const tabelas = opcoes.tabelas ? TABELAS.filter(d => opcoes.tabelas.indexOf(d.nome) >= 0) : TABELAS;
      const estadoUsuario = AUTH.estado();
      for (const def of tabelas) {
        if (estadoUsuario !== 'ativo' && def.nome !== 'usuarios') continue;
        try { await enviarTabela(def); } catch (e) { if (e.message === 'rede') break; console.warn('[sync] envio', def.nome, e); }
      }
      for (const def of tabelas) {
        if (estadoUsuario !== 'ativo' && def.nome !== 'usuarios') continue;
        try { recebidos += await receberTabela(def); } catch (e) { console.warn('[sync] recebimento', def.nome, e); ultimoErro = e.message; }
      }
      // Módulos das próximas etapas entram aqui, cada um no seu try/catch.
      await DB.metaGravar('ultima_sync', new Date().toISOString());
    } finally {
      rodando = false;
      await atualizarFaixa();
      if (recebidos) document.dispatchEvent(new CustomEvent('sync:recebido', { detail: { total: recebidos } }));
      if (deNovo) { deNovo = false; setTimeout(sincronizar, 300); }
    }
  }

  /** Chamado após cada gravação local. */
  function agendar() {
    atualizarFaixa();
    clearTimeout(agendado);
    agendado = setTimeout(() => sincronizar(), 1200);
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => { if (reg.sync) reg.sync.register('estoque-sync').catch(() => {}); }).catch(() => {});
    }
  }

  async function atualizarFaixa() {
    const f = document.getElementById('faixa-sync');
    const off = document.getElementById('faixa-offline');
    if (off) off.hidden = navigator.onLine;
    if (!f) return;
    const c = await DB.contarPendentes();
    const txt = document.getElementById('faixa-sync-texto');
    if (!c.pendentes && !c.erros) { f.hidden = true; return; }
    f.hidden = false;
    f.classList.toggle('erro', c.erros > 0);
    let s = c.pendentes ? ('Aguardando envio: ' + c.pendentes + (c.pendentes === 1 ? ' registro' : ' registros')) : '';
    if (c.erros) s += (s ? ' · ' : '') + c.erros + (c.erros === 1 ? ' registro com erro' : ' registros com erro') + (ultimoErro ? ' (' + ultimoErro + ')' : '');
    if (semTabela.size) s += ' · aguardando script SQL: ' + Array.from(semTabela).join(', ');
    txt.textContent = s;
  }

  /** Mudou o escopo do usuário: recarrega tudo que estava sincronizado. */
  async function recomecar() {
    await DB.limparSincronizados();
    await sincronizar();
  }

  // ---------------- Tempo real (Phoenix) ----------------
  let ws = null, hb = null, ref = 0, tentativa = 0, reconectar = null, tokenEnviado = null, joinRef = null;
  const TOPICO = 'realtime:estoque-app';
  let debounce = {};

  function conectarRT() {
    if (!AUTH.configurado() || !AUTH.temSessao() || AUTH.estado() === 'sem-sessao') return;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    const url = AUTH.base().replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(CONFIG.supabaseAnon) + '&vsn=1.0.0';
    try { ws = new WebSocket(url); } catch (e) { agendarReconexao(); return; }
    ws.onopen = function () {
      tentativa = 0;
      tokenEnviado = AUTH.token();
      joinRef = String(++ref);
      enviarRT({ topic: TOPICO, event: 'phx_join', ref: joinRef, join_ref: joinRef, payload: {
        config: { broadcast: { self: false }, presence: { key: '' },
          postgres_changes: CONFIG.realtime.map(t => ({ event: '*', schema: 'public', table: t })) },
        access_token: tokenEnviado } });
      clearInterval(hb);
      hb = setInterval(async function () {
        enviarRT({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) });
        await AUTH.renovar(false);
        const tk = AUTH.token();
        if (tk && tk !== tokenEnviado) { tokenEnviado = tk; enviarRT({ topic: TOPICO, event: 'access_token', payload: { access_token: tk }, ref: String(++ref) }); }
      }, CONFIG.heartbeatMs);
    };
    ws.onmessage = function (ev) {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.event === 'postgres_changes' && m.payload && m.payload.data) {
        const t = m.payload.data.table;
        if (!t) return;
        clearTimeout(debounce[t]);
        debounce[t] = setTimeout(() => sincronizar({ tabelas: [t] }), 400);
      }
    };
    ws.onclose = function () { clearInterval(hb); ws = null; agendarReconexao(); };
    ws.onerror = function () { try { ws.close(); } catch (e) { /* segue */ } };
  }
  function enviarRT(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function agendarReconexao() {
    clearTimeout(reconectar);
    if (!AUTH.temSessao()) return;
    const atraso = Math.min(60000, 3000 * Math.pow(2, tentativa++));
    reconectar = setTimeout(conectarRT, atraso);
  }
  function desconectarRT() {
    clearTimeout(reconectar); clearInterval(hb);
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) { /* segue */ } ws = null; }
  }

  // ---------------- Início ----------------
  let ouvintes = false;
  function iniciar() {
    if (!timer) timer = setInterval(sincronizar, CONFIG.intervaloSyncMs);
    if (!ouvintes) {
      ouvintes = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sincronizar(); });
      window.addEventListener('online', () => { atualizarFaixa(); sincronizar(); conectarRT(); });
      window.addEventListener('offline', atualizarFaixa);
      document.addEventListener('auth:token', () => {
        const tk = AUTH.token();
        if (ws && ws.readyState === 1 && tk && tk !== tokenEnviado) { tokenEnviado = tk; enviarRT({ topic: TOPICO, event: 'access_token', payload: { access_token: tk }, ref: String(++ref) }); }
      });
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.tipo === 'sync') sincronizar(); });
      }
    }
    conectarRT();
    return sincronizar();
  }
  function parar() { clearInterval(timer); timer = null; desconectarRT(); }

  return { iniciar, parar, sincronizar, agendar, atualizarFaixa, recomecar, conectarRT, desconectarRT,
           tabelasSemScript: () => Array.from(semTabela) };
})();
window.SYNC = SYNC;

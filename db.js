/* =====================================================================
   db.js - base local (Dexie/IndexedDB), offline primeiro
   Cada mudança de estrutura = nova db.version(n+1) com as tabelas novas.
   Campos locais começam com "_" e não são enviados ao servidor:
     _sync: 'pendente' | 'sincronizado' | 'erro'   _erro: mensagem
   ===================================================================== */
const DB = (function () {
  const TABELAS = ['empresas', 'projetos', 'locais', 'lotes', 'usuarios', 'historico'];

  const db = new Dexie('estoque_hub_rbg');
  db.version(1).stores({
    empresas: 'id, _sync, recebido_em, tipo',
    projetos: 'id, _sync, recebido_em, empresa_id',
    locais: 'id, _sync, recebido_em, projeto_id',
    lotes: 'id, _sync, recebido_em, projeto_id',
    usuarios: 'id, _sync, recebido_em',
    historico: 'id, _sync, recebido_em, registro_id',
    meta: 'chave'
  });

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function agora() { return new Date().toISOString(); }

  /** Grava localmente como pendente e agenda o envio. */
  async function salvar(tabela, registro) {
    const r = Object.assign({}, registro);
    if (!r.id) r.id = uuid();
    const atual = await db[tabela].get(r.id);
    if (!atual) r.criado_em = r.criado_em || agora();
    r.atualizado_em = agora();
    r._sync = 'pendente';
    delete r._erro;
    await db[tabela].put(Object.assign({}, atual || {}, r));
    if (window.SYNC) SYNC.agendar();
    return r;
  }

  /** Exclusão lógica (excluido_em) + histórico. Não há DELETE físico. */
  async function excluir(tabela, id, detalhe) {
    const atual = await db[tabela].get(id);
    if (!atual) return;
    await salvar(tabela, Object.assign({}, atual, { excluido_em: agora() }));
    await registrarHistorico(tabela, id, 'exclusao', detalhe || {});
  }

  async function registrarHistorico(tabela, registroId, acao, detalhe, extra) {
    const uid = window.AUTH ? AUTH.uid() : null;
    return salvar('historico', Object.assign({
      id: uuid(), tabela: tabela, registro_id: registroId || null, acao: acao,
      detalhe: detalhe || null, usuario_id: uid
    }, extra || {}));
  }

  /** Lista registros ativos (sem excluido_em). */
  async function listar(tabela, filtro) {
    const todos = await db[tabela].toArray();
    return todos.filter(r => !r.excluido_em && (!filtro || filtro(r)));
  }
  async function obter(tabela, id) { return id ? db[tabela].get(id) : null; }

  async function contarPendentes() {
    let n = 0, erros = 0;
    for (const t of TABELAS) {
      n += await db[t].where('_sync').equals('pendente').count();
      erros += await db[t].where('_sync').equals('erro').count();
    }
    return { pendentes: n, erros: erros };
  }

  async function metaObter(chave) { const m = await db.meta.get(chave); return m ? m.valor : null; }
  async function metaGravar(chave, valor) { await db.meta.put({ chave: chave, valor: valor }); }

  /** Remove o que já está sincronizado (mantém pendências) e zera cursores. */
  async function limparSincronizados() {
    for (const t of TABELAS) {
      await db[t].where('_sync').equals('sincronizado').delete();
      await db.meta.delete('cursor_' + t);
    }
  }
  async function limparTudo() {
    for (const t of TABELAS) await db[t].clear();
    await db.meta.clear();
  }

  return { db, TABELAS, uuid, agora, salvar, excluir, registrarHistorico, listar, obter,
           contarPendentes, metaObter, metaGravar, limparSincronizados, limparTudo };
})();
window.DB = DB;

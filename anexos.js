/* =====================================================================
   anexos.js - arquivos PDF (NF, relatório fotográfico, romaneio, COX)
   Regras:
   - grava no IndexedDB como ArrayBuffer + tipo (nunca Blob); o Blob é
     recriado na leitura;
   - valida a assinatura %PDF antes de gravar e antes de enviar; limite 20 MB;
   - envia ao Storage como new Uint8Array(bytes) no caminho
     anexos/<projeto>/<lote>/<tipo_doc>/<id_documento>/<arquivo>.pdf
   ===================================================================== */
const ANEXOS = (function () {
  const TIPOS = {
    nf: 'Nota fiscal',
    relatorio_fotografico: 'Relatório fotográfico',
    romaneio: 'Romaneio',
    nf_remessa: 'NF de remessa',
    solicitacao_cox: 'Solicitação de Material COX'
  };

  function ehPdf(bytes) {
    const b = new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength));
    // %PDF pode vir após poucos bytes de lixo (alguns geradores); procura no primeiro 1 KB
    for (let i = 0; i + 3 < b.length; i++) {
      if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46) return true;
    }
    return false;
  }

  function contarPaginas(bytes) {
    try {
      const txt = new TextDecoder('latin1').decode(new Uint8Array(bytes));
      const m = txt.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
      return m ? m.length : null;
    } catch (e) { return null; }
  }

  function nomeSeguro(nome) {
    let n = String(nome || 'arquivo.pdf').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (!/\.pdf$/i.test(n)) n += '.pdf';
    return n.slice(-120);
  }

  function caminho(projetoId, lote, docTipo, docId, tipo, nome) {
    return ['anexos', projetoId, lote, docTipo, docId, tipo + '_' + nomeSeguro(nome)].join('/');
  }

  /**
   * Lê e valida um File. Retorna { bytes, nome, tamanho, paginas } ou lança Error com mensagem em português.
   */
  async function lerArquivo(file) {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    if (file.size > CONFIG.limitePdfMB * 1024 * 1024) throw new Error('O arquivo "' + file.name + '" tem mais de ' + CONFIG.limitePdfMB + ' MB. Reduza o PDF e tente de novo.');
    if (file.size === 0) throw new Error('O arquivo "' + file.name + '" está vazio.');
    const bytes = await file.arrayBuffer();
    if (!ehPdf(bytes)) throw new Error('O arquivo "' + file.name + '" não é um PDF válido. Anexe somente arquivos PDF.');
    return { bytes: bytes, nome: file.name, tamanho: file.size, paginas: contarPaginas(bytes) };
  }

  /** Grava os bytes no aparelho e confere a releitura. */
  async function gravarBytes(id, bytes) {
    if (!ehPdf(bytes)) throw new Error('Conteúdo inválido: não é PDF.');
    await DB.db.arquivos.put({ id: id, bytes: bytes, tipo: 'application/pdf', gravado_em: DB.agora() });
    const rel = await DB.db.arquivos.get(id);
    if (!rel || !rel.bytes || rel.bytes.byteLength !== bytes.byteLength) throw new Error('Não foi possível guardar o PDF neste aparelho. Libere espaço e tente de novo.');
  }

  /** Recria o Blob a partir dos bytes locais ou baixa da base central. */
  async function obterBlob(anexo) {
    const loc = await DB.db.arquivos.get(anexo.id);
    if (loc && loc.bytes) {
      const b = loc.bytes instanceof ArrayBuffer ? loc.bytes : (loc.bytes.buffer || loc.bytes);
      return new Blob([b], { type: loc.tipo || 'application/pdf' });
    }
    if (!navigator.onLine || !AUTH.configurado()) throw new Error('PDF indisponível neste aparelho. Conecte-se para baixar da base central.');
    const r = await fetch(AUTH.base() + '/storage/v1/object/authenticated/' + CONFIG.bucket + '/' + anexo.caminho_storage.split('/').map(encodeURIComponent).join('/'),
      { headers: await AUTH.cabecalhos() });
    if (!r.ok) throw new Error('Não foi possível baixar o PDF (' + r.status + ').');
    const bytes = await r.arrayBuffer();
    if (ehPdf(bytes)) { try { await gravarBytes(anexo.id, bytes); } catch (e) { /* segue sem cache */ } }
    return new Blob([bytes], { type: 'application/pdf' });
  }

  async function abrir(anexo) {
    try {
      const blob = await obterBlob(anexo);
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) APP.baixarArquivo(blob, anexo.nome_arquivo || 'anexo.pdf');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { APP.aviso(e.message, 'erro'); }
  }

  /** Envia o PDF ao Storage (usado pelo SYNC antes de gravar a linha em "anexos"). */
  async function enviarArquivo(anexo) {
    const loc = await DB.db.arquivos.get(anexo.id);
    if (!loc || !loc.bytes) return { ok: false, msg: 'PDF indisponível neste aparelho. Anexe o arquivo novamente.' };
    const bytes = loc.bytes instanceof ArrayBuffer ? loc.bytes : (loc.bytes.buffer || loc.bytes);
    if (!ehPdf(bytes)) return { ok: false, msg: 'O arquivo guardado não é um PDF válido. Anexe novamente.' };
    const url = AUTH.base() + '/storage/v1/object/' + CONFIG.bucket + '/' + anexo.caminho_storage.split('/').map(encodeURIComponent).join('/');
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: await AUTH.cabecalhos({ 'Content-Type': 'application/pdf', 'x-upsert': 'true' }), body: new Uint8Array(bytes) });
      if (r.status === 401) { await AUTH.renovar(true); r = await fetch(url, { method: 'POST', headers: await AUTH.cabecalhos({ 'Content-Type': 'application/pdf', 'x-upsert': 'true' }), body: new Uint8Array(bytes) }); }
    } catch (e) { return { ok: false, rede: true, msg: 'Sem conexão para enviar o PDF.' }; }
    if (r.ok) return { ok: true };
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    const m = (j && (j.message || j.error)) || '';
    if (r.status === 404 && /bucket/i.test(m)) return { ok: false, semBucket: true, msg: 'O bucket "estoque" ainda não existe na base central (rode o 03-storage.sql).' };
    if (r.status === 403 || /policy|row-level/i.test(m)) return { ok: false, msg: 'Sem permissão para enviar o PDF deste lote.' };
    if (r.status === 413) return { ok: false, msg: 'PDF acima do limite da base central.' };
    return { ok: false, msg: 'Falha ao enviar o PDF (' + r.status + (m ? ': ' + m : '') + ').' };
  }

  function rotulo(tipo) { return TIPOS[tipo] || tipo; }
  function tamanhoTxt(bytes) {
    if (!bytes) return '';
    return bytes > 1048576 ? APP.fmtNum(bytes / 1048576, 1) + ' MB' : APP.fmtNum(Math.max(1, Math.round(bytes / 1024))) + ' KB';
  }

  return { TIPOS, ehPdf, contarPaginas, nomeSeguro, caminho, lerArquivo, gravarBytes, obterBlob, abrir, enviarArquivo, rotulo, tamanhoTxt };
})();
window.ANEXOS = ANEXOS;

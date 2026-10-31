/* =====================================================================
   auth.js - sessão (Supabase Auth), perfil e aprovação de acesso
   Usa somente a chave anon. Sessão guardada no aparelho para uso offline.
   ===================================================================== */
const AUTH = (function () {
  const CH_SESSAO = 'estoque_sessao';
  const CH_USUARIO = 'estoque_usuario';
  let sessao = ler(CH_SESSAO);
  let usuario = ler(CH_USUARIO);
  let renovando = null;

  function ler(ch) { try { return JSON.parse(localStorage.getItem(ch) || 'null'); } catch (e) { return null; } }
  function gravar(ch, v) { try { if (v) localStorage.setItem(ch, JSON.stringify(v)); else localStorage.removeItem(ch); } catch (e) { /* armazenamento indisponível */ } }

  function configurado() { return !!(CONFIG.supabaseUrl && CONFIG.supabaseAnon); }
  function base() { return CONFIG.supabaseUrl.replace(/\/+$/, ''); }
  function urlApp() { return location.origin + location.pathname.replace(/index\.html$/, ''); }

  function mensagemErro(corpo, status) {
    const m = (corpo && (corpo.error_description || corpo.msg || corpo.message || corpo.error)) || '';
    if (/invalid login|invalid_grant|credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Abra o link enviado para o seu e-mail.';
    if (/already registered|already exists/i.test(m)) return 'Este e-mail já tem cadastro. Use "Entrar" ou "Esqueci a senha".';
    if (/password.*(short|least|characters)/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    if (status >= 500) return 'A base central não respondeu. Tente novamente em instantes.';
    return m ? ('Não foi possível concluir: ' + m) : 'Não foi possível concluir a operação. Verifique a conexão e tente de novo.';
  }

  async function reqAuth(caminho, corpo, token) {
    const h = { apikey: CONFIG.supabaseAnon, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    const r = await fetch(base() + '/auth/v1/' + caminho, {
      method: corpo === undefined ? 'GET' : 'POST', headers: h,
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok) { const e = new Error(mensagemErro(j, r.status)); e.status = r.status; throw e; }
    return j;
  }

  function guardarSessao(j) {
    if (!j || !j.access_token) return;
    sessao = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000,
      user: j.user || (sessao && sessao.user) || null
    };
    gravar(CH_SESSAO, sessao);
    document.dispatchEvent(new CustomEvent('auth:token'));
  }

  /** Lê o retorno do link de confirmação/recuperação (#access_token=...). */
  async function lerRetornoUrl() {
    if (!location.hash || location.hash.indexOf('access_token=') < 0) return null;
    const p = new URLSearchParams(location.hash.slice(1));
    const j = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'),
                expires_in: Number(p.get('expires_in') || 3600), expires_at: Number(p.get('expires_at') || 0) || null };
    history.replaceState(null, '', location.pathname + location.search);
    try { j.user = await reqAuth('user', undefined, j.access_token); } catch (e) { return null; }
    guardarSessao(j);
    return p.get('type');
  }

  async function entrar(email, senha) {
    const j = await reqAuth('token?grant_type=password', { email: email, password: senha });
    guardarSessao(j);
    return carregarUsuario();
  }

  async function cadastrar(nome, email, senha) {
    const j = await reqAuth('signup?redirect_to=' + encodeURIComponent(urlApp()),
      { email: email, password: senha, data: { nome: nome } });
    if (j && j.access_token) { guardarSessao(j); await carregarUsuario(); return { confirmado: true }; }
    return { confirmado: false };
  }

  async function recuperar(email) {
    await reqAuth('recover?redirect_to=' + encodeURIComponent(urlApp()), { email: email });
  }

  async function sair() {
    try { if (sessao && navigator.onLine) await reqAuth('logout', {}, sessao.access_token); } catch (e) { /* segue */ }
    sessao = null; usuario = null;
    gravar(CH_SESSAO, null); gravar(CH_USUARIO, null);
    try { await DB.limparTudo(); } catch (e) { /* segue */ }
  }

  /** Renova o token quando faltar menos de 2 minutos. */
  async function renovar(forcar) {
    if (!sessao || !sessao.refresh_token) return false;
    if (!forcar && sessao.expires_at - Date.now() > 120000) return true;
    if (!navigator.onLine) return false;
    if (renovando) return renovando;
    renovando = (async () => {
      try {
        const j = await reqAuth('token?grant_type=refresh_token', { refresh_token: sessao.refresh_token });
        guardarSessao(j); return true;
      } catch (e) {
        if (e.status === 400 || e.status === 401) {
          sessao = null; gravar(CH_SESSAO, null);
          document.dispatchEvent(new CustomEvent('auth:expirou'));
        }
        return false;
      } finally { renovando = null; }
    })();
    return renovando;
  }

  async function cabecalhos(extra) {
    await renovar(false);
    const h = { apikey: CONFIG.supabaseAnon, 'Content-Type': 'application/json' };
    if (sessao) h.Authorization = 'Bearer ' + sessao.access_token;
    return Object.assign(h, extra || {});
  }

  /** Busca o próprio registro em "usuarios" (cria pendente se faltar). */
  async function carregarUsuario() {
    if (!sessao || !sessao.user) return usuario;
    const uid = sessao.user.id;
    const h = await cabecalhos();
    let r = await fetch(base() + '/rest/v1/usuarios?select=*&id=eq.' + uid, { headers: h });
    if (r.status === 401) { await renovar(true); r = await fetch(base() + '/rest/v1/usuarios?select=*&id=eq.' + uid, { headers: await cabecalhos() }); }
    if (!r.ok) {
      let j = null; try { j = await r.json(); } catch (e) { j = null; }
      const e = new Error(r.status === 404 || (j && j.code === 'PGRST205')
        ? 'A base central ainda não tem as tabelas do sistema. Rode os scripts da pasta banco (ver ATIVAR-BASE-CENTRAL.md).'
        : 'Não foi possível ler o seu cadastro (' + r.status + ').');
      e.status = r.status; throw e;
    }
    let lista = await r.json();
    if (!lista.length) {
      const novo = { id: uid, email: sessao.user.email,
        nome: (sessao.user.user_metadata && sessao.user.user_metadata.nome) || String(sessao.user.email || '').split('@')[0],
        atualizado_em: new Date().toISOString() };
      const p = await fetch(base() + '/rest/v1/usuarios?on_conflict=id', {
        method: 'POST', headers: await cabecalhos({ Prefer: 'resolution=merge-duplicates,return=representation' }),
        body: JSON.stringify([novo]) });
      lista = p.ok ? await p.json() : [Object.assign({ perfil: 'consulta', status: 'pendente' }, novo)];
    }
    definirUsuario(lista[0]);
    return usuario;
  }

  function definirUsuario(u) {
    const antes = usuario;
    usuario = u ? Object.assign({}, u) : null;
    if (usuario) { delete usuario._sync; delete usuario._erro; }
    gravar(CH_USUARIO, usuario);
    if (antes && usuario && escopo(antes) !== escopo(usuario)) {
      document.dispatchEvent(new CustomEvent('auth:escopo', { detail: { antes: antes, depois: usuario } }));
    }
  }
  function escopo(u) {
    return JSON.stringify([u.perfil, u.status, u.empresa_id, (u.projetos || []).slice().sort(),
      (u.lotes || []).slice().sort(), (u.locais || []).slice().sort(), u.excluido_em || null]);
  }

  function estado() {
    if (!sessao) return 'sem-sessao';
    if (!usuario) return 'carregando';
    if (usuario.excluido_em || usuario.status === 'bloqueado') return 'bloqueado';
    if (usuario.status !== 'ativo') return 'pendente';
    return 'ativo';
  }

  return {
    configurado, lerRetornoUrl, entrar, cadastrar, recuperar, sair, renovar, cabecalhos,
    carregarUsuario, definirUsuario, estado,
    base: () => base(),
    temSessao: () => !!sessao,
    token: () => (sessao ? sessao.access_token : null),
    uid: () => (sessao && sessao.user ? sessao.user.id : (usuario ? usuario.id : null)),
    email: () => (sessao && sessao.user ? sessao.user.email : (usuario ? usuario.email : '')),
    usuario: () => usuario,
    ehAdmin: () => !!usuario && usuario.status === 'ativo' && usuario.perfil === 'admin',
    podeGravar: () => !!usuario && usuario.status === 'ativo' && (usuario.perfil === 'admin' || usuario.perfil === 'almoxarife')
  };
})();
window.AUTH = AUTH;

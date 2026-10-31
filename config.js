/* =====================================================================
   config.js - versão, base central (Supabase) e parâmetros do sistema
   Preencha supabaseUrl e supabaseAnon conforme banco/ATIVAR-BASE-CENTRAL.md.
   Use SOMENTE a chave anon (nunca a service_role).
   ===================================================================== */
const CONFIG = (function () {
  return {
    versao: '1.0.0',
    etapa: 1,
    nomeApp: 'Estoque de Materiais – HUB RBG',
    empresaApp: 'EDP Transmissão Norte Nordeste 2 S.A.',

    // Base central
    supabaseUrl: '',      // ex.: 'https://abcdefghij.supabase.co'
    supabaseAnon: '',     // chave "anon public" do projeto
    bucket: 'estoque',

    // Sincronização
    intervaloSyncMs: 30000,
    heartbeatMs: 25000,
    paginaRecebimento: 500,
    loteEnvio: 200,
    realtime: ['empresas', 'projetos', 'locais', 'lotes', 'usuarios'],

    // Anexos
    limitePdfMB: 20,

    // Listas
    ufs: ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'],
    tiposEmpresa: [
      { v: 'concessionaria', t: 'Concessionária' },
      { v: 'executora', t: 'Executora' },
      { v: 'transportadora', t: 'Transportadora' },
      { v: 'fornecedor', t: 'Fornecedor' }
    ],
    perfis: [
      { v: 'admin', t: 'Administrador' },
      { v: 'almoxarife', t: 'Almoxarife' },
      { v: 'consulta', t: 'Consulta' }
    ]
  };
})();
window.CONFIG = CONFIG;

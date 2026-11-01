# Decisões tomadas sem consulta

Registro das decisões de implementação. Cada etapa acrescenta as suas.

## Etapa 1 – Base, acesso e cadastros de contexto (v1.0.0)

1. **Entrega por etapas.** Esta entrega contém somente a Etapa 1. Os itens de menu das etapas seguintes já aparecem (com a indicação "etapa N") e abrem uma tela informativa, para o usuário conhecer a navegação final.
2. **Painel do estoque provisório.** Até a Etapa 7, o Painel mostra projeto, lotes, locais, pendências de liberação/sincronização e o andamento da implantação.
3. **Escopo de lote por código.** `usuarios.lotes` guarda os códigos (TN13…) e `usuarios.projetos` os ids dos projetos. O acesso a um lote exige as duas coisas (projeto liberado **e** código do lote liberado), o que mantém o sistema multiprojeto mesmo que dois projetos usem o mesmo código.
4. **Locais vazios = todos.** Usuário sem locais marcados acessa todos os locais dos projetos liberados (`pode_no_local`).
5. **Funções extras de acesso.** Além de `eh_admin()`, `usuario_ativo()` e `pode_no_lote(lote)`, foram criadas `pode_gravar()`, `pode_no_projeto(projeto)`, `pode_no_local(projeto, local)` e `pode_no_caminho(nome, gravar)` (Storage).
6. **Empresas visíveis a todo usuário ativo.** São usadas nos seletores e não são dados sensíveis; somente o admin grava.
7. **Proteção do próprio cadastro.** Gatilho impede que um não-admin altere perfil, status ou escopo (nem o próprio). Cadastro pelo Auth entra sempre como `consulta / pendente`.
8. **Versão mais antiga é ignorada sem erro** (o gatilho devolve o registro do servidor). O app, ao enviar, relê o que não voltou e aplica a versão do servidor, para nunca ficar divergente.
9. **DELETE físico bloqueado por gatilho** em todas as tabelas (inclusive para o painel do Supabase). Exclusão é lógica e fica no `historico`.
10. **Locais de estoque** são cadastrados dentro do projeto (aba Projetos → editar projeto → "Locais de estoque"). No lote, o local é escolhido numa lista, garantindo vínculo correto. Exclusão de local ficará para quando houver movimentos (para validar que está vazio).
11. **Empresa executora do lote** é escolhida entre as empresas do tipo Executora (lista), em vez de texto livre, para manter a integridade.
12. **"Projetos vinculados" da empresa** é calculado (dono do projeto ou executora de lote) e não digitado.
13. **CNPJ obrigatório e validado** (dígitos verificadores) no formulário e na importação; CNPJ duplicado é recusado. A EDP vem do script inicial sem CNPJ ("a informar") – complete pelo app.
14. **"Importar planilha" na Etapa 1** importa empresas (CSV com ";" ou XLSX) pelo modelo baixado na própria aba; empresa com CNPJ já cadastrado é atualizada.
15. **Usuários não são criados pelo admin**: cada pessoa cria a própria conta (e-mail confirmado) e o admin libera, recusa ou bloqueia. Recusar = status bloqueado (reversível).
16. **Liberação exige** pelo menos um projeto e um lote (exceto perfil admin). O admin não pode reduzir o próprio acesso.
17. **Seletores do topo**: Lote e Local oferecem "Todos" quando o usuário tem mais de um; com apenas um, ele fica fixo.
18. **Sincronização em segundo plano não redesenha formulário em edição**, para não perder o que está sendo digitado.
19. **Cursor de recebimento** usa (`recebido_em`, `id`) para não perder registros com o mesmo instante.
20. **Mudança de acesso pelo admin** faz o aparelho do usuário recarregar os dados (limpa o que já estava sincronizado e baixa de novo, preservando pendências).
21. **Tempo real na Etapa 1** cobre empresas, projetos, locais, lotes e usuarios (liberação e bloqueio chegam na hora). `entradas`, `saidas`, `montagens` e `lc_revisoes` entram nas suas etapas.
22. **SheetJS 0.18.5** (versão disponível no registro npm) em `vendor/`. Recomenda-se trocar pela 0.20.3 do site oficial (cdn.sheetjs.com) quando possível; a 0.18.5 tem alerta de segurança para arquivos maliciosos, risco baixo aqui porque só lê planilhas da própria equipe.
23. **Ícone de instalação** gerado a partir do símbolo da EDP sobre o verde-petróleo do cabeçalho; o logotipo completo fica no menu lateral (versão branca) e, para os PDFs, há a versão escura `icons/logo-edp.png`.
24. **Sem e-mails da equipe nos scripts.** O primeiro admin é definido por um comando avulso descrito no ATIVAR-BASE-CENTRAL.md.

## Etapas 2 e 3 – Cadastros e Portal de Entrada (v1.1.0)

25. **Etapas 2 e 3 entregues juntas**, a pedido do usuário, porque o Portal de Entrada depende dos cadastros de materiais, preços e fornecedores.
26. **Catálogo de materiais comum a todos os projetos** (sem `projeto_id`); os **preços de referência** são por projeto, família e vigência. A chave do material é família + descrição normalizada (maiúsculas, sem acentos, espaços/hífens unificados), que é o que vem na NF.
27. **Quem grava**: materiais, fornecedores e frentes – admin e almoxarife; preços de referência – só admin; consulta só lê. Para cadastrar um fornecedor novo, o almoxarife pode criar empresas do tipo **fornecedor** (as demais empresas continuam só com o admin).
28. **Preços iniciais** do projeto C3 com vigência 01/01/2024: cabos 20,98640209; fixadores 9,35; ferragem 9,352 (R$/kg). Isoladores não têm preço de família: usam o preço unitário de cada material.
29. **Pendente**: fixador/ferragem sem peso unitário, isolador sem preço unitário ou família sem preço vigente. O item entra com valor 0, em rosa, e o recebimento pode ser confirmado (o aviso aparece na confirmação).
30. **Cálculo no servidor** pelo gatilho `tg_entrada_item_calcula`: o valor enviado pelo app é sempre recalculado. Preço usado = vigente na **data de recebimento**.
31. **Material novo no lançamento**: se a descrição não está no catálogo, o sistema oferece cadastrar na hora (sem peso/preço = Pendente). Na importação de itens por planilha, materiais novos são criados automaticamente (com o peso unitário da planilha, se houver).
32. **Carretel único no projeto** (índice no banco + checagem na tela), preparando a saída por carretel inteiro da etapa 4.
33. **NF duplicada** = mesma NF + série + fornecedor, inclusive rascunhos. O sistema avisa e oferece abrir o lançamento existente.
34. **Confirmação no servidor exige NF e relatório fotográfico anexados**; por isso os anexos sobem antes da entrada na sincronização. A exigência de itens com quantidade é feita no app.
35. **Recebimento confirmado** só é alterado ou excluído pelo admin. Edições feitas antes da confirmação (offline) ainda são aceitas quando chegam depois.
36. **Rascunho**: "Salvar rascunho" grava e sincroniza o lançamento (aparece em "Rascunhos" para todos do lote). Enquanto não salva, o que foi digitado fica guardado no aparelho e volta se o app for recarregado.
37. **Status "Aguardando"** do item fica reservado (o banco aceita); nesta etapa os itens entram como Conferido ou Pendente.
38. **Cartões de família no Portal de Entrada** mostram o valor recebido confirmado no contexto; até a etapa 4 (saídas) ele é igual ao valor em estoque.
39. **Transportadora** é texto livre com sugestões das empresas do tipo Transportadora.
40. **Placa** é gravada sem hífen e em maiúsculas (AAA0000 ou AAA0A00).
41. **Saldo mínimo (crítico)** já pode ser informado no material; o uso fica para a tela de Saldo (etapa 4).
42. **Menu**: o rótulo "etapa N" passou para baixo do nome, em letra menor, para não quebrar o texto.

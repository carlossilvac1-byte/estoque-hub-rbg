# Ativar a base central (Supabase) – Estoque de Materiais HUB RBG

Etapa 1 – versão 1.0.0. Siga na ordem. Nenhum passo usa a chave `service_role`.

## 1. Criar o projeto no Supabase
1. Acesse https://supabase.com e entre com a conta corporativa.
2. **New project** → nome `estoque-hub-rbg`, região **South America (São Paulo)**, defina e guarde a senha do banco.
3. Aguarde o projeto ficar pronto (1 a 2 minutos).

## 2. Rodar os scripts SQL (SQL Editor → New query → colar → Run)
Rode **um por vez, nesta ordem**. Todos podem ser executados de novo sem erro.

| Ordem | Arquivo | O que faz |
|---|---|---|
| 1 | `01-estrutura.sql` | Tabelas empresas, projetos, locais, lotes, usuarios, historico e gatilhos |
| 2 | `02-acesso-rls.sql` | Funções de acesso, RLS, cadastro automático de usuário pendente e tempo real |
| 3 | `03-storage.sql` | Bucket privado `estoque` e políticas dos arquivos |
| 4 | `04-dados-iniciais.sql` | EDP, projeto LT 500 kV Colinas–Ribeiro Gonçalves C3, lotes TN02/TN05/TN07/TN13 e local HUB RBG |

Se o `03-storage.sql` acusar que o bucket não pode ser criado por SQL, crie em **Storage → New bucket**: nome `estoque`, **Public desligado**, limite 20 MB, e rode o script de novo (as políticas serão criadas).

## 3. Configurar o Auth
1. **Authentication → Sign In / Providers → Email**: deixe **Enable Email provider** e **Confirm email** ligados.
2. **Authentication → URL Configuration**:
   - **Site URL**: endereço do GitHub Pages (ex.: `https://SEU-USUARIO.github.io/estoque-hub-rbg/`);
   - **Redirect URLs**: adicione o mesmo endereço.
3. (Opcional) **Authentication → Emails**: traduza os textos dos e-mails de confirmação e de nova senha.

## 4. Tempo real
O `02-acesso-rls.sql` já inclui as tabelas na publicação `supabase_realtime`. Confira em **Database → Publications → supabase_realtime**: devem aparecer empresas, projetos, locais, lotes e usuarios.

## 5. Ligar o aplicativo à base
1. **Project Settings → API**: copie a **Project URL** e a chave **anon public**.
2. No arquivo `config.js`, preencha:
   ```js
   supabaseUrl: 'https://xxxxxxxx.supabase.co',
   supabaseAnon: 'eyJhbGciOi...',
   ```
3. Envie o `config.js` ao GitHub.

## 6. Cadastrar o primeiro administrador
1. Abra o aplicativo publicado, toque em **Criar conta**, informe nome, e-mail e senha.
2. Confirme o e-mail pelo link recebido.
3. No **SQL Editor**, rode (troque pelo seu e-mail; **não salve este comando em arquivo do repositório**):
   ```sql
   update public.usuarios
      set perfil = 'admin', status = 'ativo'
    where email = 'SEU-EMAIL@exemplo.com';
   ```
4. Toque em **Verificar agora** no aplicativo. A partir daí, os demais usuários são liberados pelo próprio app em **Cadastros → Empresas, projetos e lotes → Usuários e acessos**.

## 7. Conferência rápida
- Um usuário recém-cadastrado aparece como **Pendente** na aba Usuários e acessos.
- Ao liberar com projeto e lote, a tela dele muda sozinha para o Painel.
- Um almoxarife do TN13 vê somente o lote TN13 no seletor do topo.

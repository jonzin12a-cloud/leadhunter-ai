# LeadHunter AI

Plataforma de descoberta e organização de leads empresariais, com foco em oportunidades de presença digital.

## O que está implementado

- Pesquisa de estabelecimentos por cidade e segmento usando a API pública Overpass do OpenStreetMap.
- Exibição da origem de cada resultado e link para o objeto de origem.
- Identificação de websites cadastrados na fonte. Quando não há URL, o produto informa **“website não identificado”** — nunca afirma que a empresa não possui site.
- Enriquecimento dos dados disponíveis no OpenStreetMap: telefone, WhatsApp, e-mail, redes sociais, endereço, coordenadas e horário de funcionamento.
- Sinalização de possíveis duplicidades por nome combinado com telefone ou proximidade geográfica; filiais não são removidas automaticamente.
- Pontuação heurística com fatores explicados na interface.
- Importação manual de resultados para a carteira.
- Pipeline comercial (Novo, Contatado, Interessado, Convertido), pesquisa por dados de contato, filtro de possíveis duplicidades, abertura de WhatsApp e exclusão com confirmação.
- Exportação CSV com contatos, coordenadas, pontuação e evidências, protegida contra fórmulas de planilha.
- Autenticação por e-mail e senha com Firebase Authentication (cadastro, login, logout e recuperação de senha).
- Carteira sincronizada por usuário no Cloud Firestore, com isolamento por UID e regras de segurança.
- Migração única da carteira legada do navegador para a primeira conta autenticada.
- API server-side em `/api/discover`, com validação de parâmetros, timeout e respostas de erro.
- CI no GitHub Actions para executar TypeScript e build de produção.

## Stack

- React + TypeScript + Vite
- Vercel Functions (API em `/api`)
- OpenStreetMap / Overpass API
- Firebase Authentication + Cloud Firestore

## Desenvolvimento

```bash
npm install
npm run dev
```

A interface pode ser desenvolvida localmente com Vite. Para testar a função serverless localmente, use o ambiente da Vercel (`vercel dev`) com a CLI instalada e autenticada.

## Configuração do Firebase (necessária para ativar login e sincronização)

1. Acesse o [Firebase Console](https://console.firebase.google.com/) e crie um projeto exclusivo para o LeadHunter AI.
2. Em **Configurações do projeto > Geral**, registre um aplicativo Web e copie os valores de configuração.
3. Em **Authentication > Sign-in method**, habilite o provedor **E-mail/senha**.
4. Em **Firestore Database**, crie o banco de dados. A coleção `users/{uid}/leads` será criada automaticamente quando o primeiro lead for salvo.
5. Publique as regras de `firestore.rules` na aba **Firestore Database > Rules**. Elas restringem cada carteira ao usuário autenticado correspondente.
6. Copie `.env.example` para `.env.local` e preencha os valores do aplicativo Web.
7. Cadastre as mesmas seis variáveis no projeto Vercel, em **Settings > Environment Variables**, para Production, Preview e Development:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
8. Faça um novo deploy na Vercel após salvar as variáveis.

Para publicar as regras usando a Firebase CLI, selecione o projeto correto e execute:

```bash
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

O arquivo `.env.local` não deve ser enviado ao Git. As configurações do Firebase Web são identificadores do aplicativo, não credenciais administrativas; a proteção dos dados é feita pelas regras do Firestore. Nunca coloque chaves de conta de serviço ou credenciais administrativas no frontend.

## Publicação

O projeto está preparado para deploy na Vercel como aplicação Vite com funções serverless no diretório `api`. Importe o repositório no painel da Vercel e mantenha o diretório raiz na raiz do projeto. O login só fica operacional depois de configurar o Firebase e publicar as regras do Firestore.

## Limitações e uso responsável

- A cobertura do OpenStreetMap varia por cidade e segmento. Resultados ausentes não provam que uma empresa inexiste.
- “Website não identificado” significa apenas que não foi encontrada uma URL nos dados consultados. A confirmação exige pesquisa adicional.
- Telefones e endereços são dados fornecidos por colaboradores do OpenStreetMap e podem estar desatualizados. Valide-os antes de qualquer contato.
- A carteira é armazenada no Cloud Firestore e vinculada ao UID autenticado. A disponibilidade e os limites dependem do projeto e do plano Firebase configurado.
- O score é heurístico e serve apenas para ordenar a análise; não é uma previsão validada de conversão.
- A fonte deve ser atribuída como © OpenStreetMap contributors. Revise os termos e políticas da instância Overpass escolhida antes de aumentar o volume ou comercializar o serviço.

## Próximas etapas recomendadas

1. Concluir a configuração do projeto Firebase e validar cadastro, login, recuperação de senha e sincronização em produção.
2. Adicionar uma segunda fonte empresarial licenciada e deduplicação entre provedores.
3. Implementar verificação de website com evidências, data e estados separados.
4. Adicionar limites de uso, observabilidade, política de privacidade e controles de exclusão de dados.

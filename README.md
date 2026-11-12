# LeadHunter AI

Plataforma de descoberta e organização de leads empresariais, com foco em oportunidades de presença digital.

## O que está implementado

- Pesquisa de estabelecimentos por cidade e segmento usando a API pública Overpass do OpenStreetMap.
- Exibição da origem de cada resultado e link para o objeto de origem.
- Identificação de websites cadastrados na fonte. Quando não há URL, o produto informa **“website não identificado”** — nunca afirma que a empresa não possui site.
- Importação manual de resultados para a carteira.
- Pipeline comercial (Novo, Contatado, Interessado, Convertido).
- Persistência local no navegador e exportação CSV.
- API server-side em `/api/discover`, com validação de parâmetros, timeout e respostas de erro.
- CI no GitHub Actions para executar TypeScript e build de produção.

## Stack

- React + TypeScript + Vite
- Vercel Functions (API em `/api`)
- OpenStreetMap / Overpass API

## Desenvolvimento

```bash
npm install
npm run dev
```

A interface pode ser desenvolvida localmente com Vite. Para testar a função serverless localmente, use o ambiente da Vercel (`vercel dev`) com a CLI instalada e autenticada.

## Publicação

O projeto está preparado para deploy na Vercel como aplicação Vite com funções serverless no diretório `api`. Importe o repositório no painel da Vercel e mantenha o diretório raiz na raiz do projeto. Nenhuma chave secreta é necessária para a consulta pública do MVP.

## Limitações e uso responsável

- A cobertura do OpenStreetMap varia por cidade e segmento. Resultados ausentes não provam que uma empresa inexiste.
- “Website não identificado” significa apenas que não foi encontrada uma URL nos dados consultados. A confirmação exige pesquisa adicional.
- Telefones e endereços são dados fornecidos por colaboradores do OpenStreetMap e podem estar desatualizados. Valide-os antes de qualquer contato.
- Os dados da carteira ficam no armazenamento local do navegador. Não há sincronização entre dispositivos, login, banco de dados ou backup em nuvem nesta versão.
- O score é heurístico e serve apenas para ordenar a análise; não é uma previsão validada de conversão.
- A fonte deve ser atribuída como © OpenStreetMap contributors. Revise os termos e políticas da instância Overpass escolhida antes de aumentar o volume ou comercializar o serviço.

## Próximas etapas recomendadas

1. Adicionar autenticação e banco de dados para carteira multiusuário.
2. Adicionar uma segunda fonte empresarial licenciada e deduplicação entre provedores.
3. Implementar verificação de website com evidências, data e estados separados.
4. Adicionar limites de uso, observabilidade, política de privacidade e controles de exclusão de dados.

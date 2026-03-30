# Cadastro para Admissão - fluxo de teste

Aplicação web em HTML, CSS e JavaScript com backend Node.js para:

- receber o preenchimento do colaborador;
- converter os dados para a planilha-base oficial sem perder a estrutura;
- enviar a planilha por e-mail para um endereço de teste;
- enviar uma confirmação simples ao colaborador.

## Cenário atual

Esta versão está preparada **apenas para testes**.

- destino interno de teste: `douglasbritto416@gmail.com`
- confirmação ao colaborador: habilitada por padrão

Quando o colaborador envia o formulário:
1. o sistema preenche a planilha oficial;
2. envia a planilha para o e-mail de teste configurado;
3. envia uma mensagem de confirmação para o e-mail informado no formulário.

## Como rodar no GitHub Codespaces

Entre na pasta do projeto:

```bash
cd admissoes_form_resend_testflow
```

Instale as dependências:

```bash
npm install
```

Crie o arquivo `.env` a partir do modelo:

```bash
cp .env.example .env
```

Edite o arquivo `.env` e informe sua chave da Resend.

Exemplo:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
RESEND_FROM=onboarding@resend.dev
EMAIL_TO=douglasbritto416@gmail.com
EMAIL_CONFIRMATION_ENABLED=true
```

Depois execute:

```bash
npm start
```

Abra a porta `3000` no Codespaces.

## Configuração da Resend

No painel da Resend, gere uma API Key e cole no `.env`:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
```

Para demonstração, o remetente padrão `onboarding@resend.dev` costuma funcionar bem.

## Fluxo de teste

- o colaborador abre o link do formulário;
- preenche os dados;
- marca a declaração;
- clica em **Enviar formulário**;
- o sistema gera a planilha oficial;
- envia a planilha para o e-mail de teste;
- envia uma confirmação para o colaborador.

## Estrutura principal

- `public/index.html` → formulário voltado ao colaborador
- `public/styles.css` → estilos
- `public/app.js` → comportamento do frontend
- `server.js` → geração da planilha e envio por e-mail
- `.env.example` → modelo de configuração
- `config/mapeamento-campos.json` → mapeamento de campos
- `FOR 33 RH - Solicitação de Cadastro e Admissão Rev 05.xlsx` → template base


## Atualizações visuais
- Logo da SEMEP no topo
- Texto institucional revisado
- Declaração e consentimento LGPD
- Rodapé institucional
# formulario-admissao-semep

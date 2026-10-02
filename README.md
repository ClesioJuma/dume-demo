# Dume

Este repositório público mostra o código do protótipo Dume. Não é uma instância online: para experimentar a geração de apresentações é necessário executar também o motor Presenton, conforme as instruções abaixo.

Interface independente para estudantes, com o motor de apresentações do [Presenton](https://github.com/presenton/presenton). O Dume não mostra a marca nem o dashboard do Presenton. O backend FastAPI continua responsável pelo upload, outline, geração, slides e exportação. O Next.js do Presenton serve apenas como renderer usado pelo exportador.

## Executar localmente

É preciso ter o backend FastAPI e o renderer Next.js do Presenton em execução e configurados com um provider de IA válido. O repositório Dume contém apenas a interface e o servidor de integração; não inclui o motor. Para isolamento, usar o mesmo `APP_DATA_DIRECTORY` no FastAPI e no Dume, na mesma máquina ou volume partilhado. O Dume precisa de `pdftoppm` para as miniaturas dos slides. No backend, `USER_CONFIG_PATH` deve apontar para a configuração escolhida, `NEXT_PUBLIC_URL` para o renderer Next.js e `EXPORT_PACKAGE_ROOT` para um runtime de exportação válido. `PUPPETEER_EXECUTABLE_PATH` pode apontar para o Chrome instalado.

```bash
APP_DATA_DIRECTORY=/caminho/para/dados DUME_CORE_URL=http://127.0.0.1:8767 npm start
```

Abrir `http://127.0.0.1:3020`. O servidor escuta apenas em `127.0.0.1` e encaminha `/core/api/v1/ppt/*` ao FastAPI.

## Publicação

Este repositório pode ser publicado no GitHub, mas o Dume não funciona como site estático: o servidor Node faz proxy para o FastAPI, gera prévias com `pdftoppm` e lê os ficheiros exportados. Para um piloto online, instalar o Presenton e o Dume num servidor com Node.js, Python, Chromium/Puppeteer e Poppler; configurar o provider de IA apenas no backend; partilhar `APP_DATA_DIRECTORY` entre FastAPI e Dume; e colocar um proxy HTTPS com controlo de acesso à frente do Dume. O servidor Dume escuta em `127.0.0.1`, pelo que o proxy deve correr na mesma máquina. Não expor o Dume diretamente à Internet: ainda não há autenticação ou isolamento entre utilizadores.

## Fluxo integrado

1. Prompt, PDF ou DOCX (ou outro formato aceite por `/files/upload`), com instrução opcional.
2. As opções académicas são transformadas por `academic-adapter.js` no contrato de `/presentation/create`.
3. O estudante revê o outline real e escolhe um template devolvido pelo backend.
4. O Presenton prepara e gera slides; o Dume mostra os eventos SSE e as páginas renderizadas do PDF.
5. Texto, regeneração e estrutura dos slides são gravados no backend. PDF e PPTX são exportações reais.

As prévias são atualizadas após edições e guardadas temporariamente em `APP_DATA_DIRECTORY/dume-previews`. A URL `/?id=<uuid>` reabre uma apresentação existente.

## Limites atuais

- A geração de imagens depende da quota do provider configurado. Na validação local foi desativada porque a quota Gemini para imagens devolveu 429; texto, slides e exportação continuam a funcionar.
- O botão de novo slide usa um slide existente como estrutura inicial e depois chama a regeneração real do Presenton. Isso preserva o layout escolhido sem recriar o gerador no Dume.
- O Dume é uma validação local do produto: não inclui contas nem acesso partilhado entre utilizadores.

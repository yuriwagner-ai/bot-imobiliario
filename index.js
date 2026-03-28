const express = require('express');
const app = express();
app.use(express.json());

const ZAPI_INSTANCE = '3F0D146F6BE3E2AFA5A932CA3B3481D4';
const ZAPI_TOKEN = '6244344FDB02B92DE450C071';
const ZAPI_CLIENT_TOKEN = 'F68392bc7b7944ba29b0877c64cacf377S';
const TYPEBOT_ID = 'bot-imobiliario-qualificacao-kh44hmk';
const TYPEBOT_TOKEN = '9J5QPUpOEYuMntaFIw3q52UB';

const sessoes = {};

async function enviarMensagem(telefone, mensagem) {
  try {
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({ phone: telefone, message: mensagem }),
    });
    const data = await response.json();
    console.log('Enviado:', JSON.stringify(data));
  } catch (err) {
    console.error('Erro ao enviar:', err.message);
  }
}

function extrairTexto(richText) {
  if (!richText) return '';
  return richText
    .map(bloco => (bloco.children || []).map(c => c.text || '').join(''))
    .join('\n')
    .trim();
}

async function processarResposta(telefone, data) {
  const mensagens = data.messages || [];
  const input = data.input;

  // Coleta todos os textos de uma vez para enviar juntos
  const textos = [];
  for (const msg of mensagens) {
    if (msg.type === 'text' && msg.content?.richText) {
      const texto = extrairTexto(msg.content.richText);
      if (texto) textos.push(texto);
    }
  }

  // Se tem opções, adiciona junto com a última mensagem
  if (input && input.type === 'choice input' && input.items?.length) {
    const opcoes = input.items
      .map((item, i) => `${i + 1}. ${item.content}`)
      .join('\n');
    const ultimoTexto = textos.pop() || 'Escolha uma opcao:';
    textos.push(`${ultimoTexto}\n\n${opcoes}`);
  }

  // Envia cada mensagem com delay
  for (const texto of textos) {
    await enviarMensagem(telefone, texto);
    await new Promise(r => setTimeout(r, 3000));
  }
}

// Converte resposta numérica para o conteúdo da opção
function resolverResposta(mensagem, input) {
  if (!input || input.type !== 'choice input') return mensagem;
  const num = parseInt(mensagem.trim());
  if (num > 0 && input.items && input.items[num - 1]) {
    return input.items[num - 1].content;
  }
  return mensagem;
}

// Armazena o último input de cada sessão para resolver respostas numéricas
const ultimoInput = {};

async function iniciarChat(telefone) {
  console.log('Iniciando chat:', telefone);
  const response = await fetch(
    `https://typebot.co/api/v1/typebots/${TYPEBOT_ID}/startChat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TYPEBOT_TOKEN}`,
      },
      body: JSON.stringify({}),
    }
  );
  const data = await response.json();
  if (data.sessionId) {
    sessoes[telefone] = data.sessionId;
    if (data.input) ultimoInput[telefone] = data.input;
    console.log('Sessao criada:', data.sessionId);
    await processarResposta(telefone, data);
  } else {
    console.error('Erro startChat:', JSON.stringify(data));
    await enviarMensagem(telefone, 'Ola! Em breve um especialista entrara em contato.');
  }
}

async function continuarChat(telefone, sessionId, mensagemUsuario) {
  // Resolve resposta numérica para o texto da opção
  const msgResolvida = resolverResposta(mensagemUsuario, ultimoInput[telefone]);
  console.log('Continuando:', sessionId, '| original:', mensagemUsuario, '| resolvida:', msgResolvida);

  const response = await fetch(
    `https://typebot.co/api/v1/sessions/${sessionId}/continueChat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TYPEBOT_TOKEN}`,
      },
      body: JSON.stringify({ message: msgResolvida }),
    }
  );
  const data = await response.json();
  console.log('Status:', data.status);

  if (data.input) ultimoInput[telefone] = data.input;
  if (data.status === 'ended') {
    delete sessoes[telefone];
    delete ultimoInput[telefone];
  }
  await processarResposta(telefone, data);
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const payload = req.body;
  if (payload.fromMe || payload.isGroup) return;
  const telefone = payload.phone || payload.from;
  const mensagem = payload.text?.message || (typeof payload.text === 'string' ? payload.text : '');
  console.log('MSG de', telefone, ':', mensagem);
  if (!telefone || !mensagem) return;
  try {
    const sessionId = sessoes[telefone];
    if (!sessionId) {
      await iniciarChat(telefone);
    } else {
      await continuarChat(telefone, sessionId, mensagem);
    }
  } catch (err) {
    console.error('Erro:', err.message);
    await enviarMensagem(telefone, 'Desculpe, ocorreu um problema. Um atendente entrara em contato!');
    delete sessoes[telefone];
    delete ultimoInput[telefone];
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'Bot rodando!', sessoes: Object.keys(sessoes).length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot rodando na porta ${PORT}`));

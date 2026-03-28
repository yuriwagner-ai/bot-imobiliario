const express = require('express');
const app = express();
app.use(express.json());

const ZAPI_INSTANCE = '3F0D146F6BE3E2AFA5A932CA3B3481D4';
const ZAPI_TOKEN = '6244344FDB02B92DE450C071';
const TYPEBOT_ID = 'bot-imobiliario-qualificacao-kh44hmk';
const TYPEBOT_TOKEN = '9J5QPUpOEYuMntaFIw3q52UB';

const sessoes = {};

async function enviarMensagem(telefone, mensagem) {
  try {
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: telefone, message: mensagem }),
    });
    const data = await response.json();
    console.log('Mensagem enviada:', JSON.stringify(data));
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err.message);
  }
}

async function processarResposta(telefone, data) {
  // Processa mensagens de texto
  if (data.messages && data.messages.length > 0) {
    for (const msg of data.messages) {
      if (msg.type === 'text' && msg.content && msg.content.richText) {
        let texto = '';
        for (const bloco of msg.content.richText) {
          if (bloco.children) {
            for (const filho of bloco.children) {
              if (filho.text) texto += filho.text;
            }
          }
          texto += '\n';
        }
        texto = texto.trim();
        if (texto) {
          await enviarMensagem(telefone, texto);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  // Processa input de escolha (botões)
  if (data.input && data.input.type === 'choice input' && data.input.items) {
    const opcoes = data.input.items
      .map((item, i) => `${i + 1}. ${item.content}`)
      .join('\n');
    await enviarMensagem(telefone, `Escolha uma opção:\n\n${opcoes}`);
  }
}

async function iniciarChat(telefone) {
  console.log('Iniciando chat para:', telefone);
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
  console.log('startChat response:', JSON.stringify(data).substring(0, 300));

  if (data.sessionId) {
    sessoes[telefone] = data.sessionId;
    await processarResposta(telefone, data);
  } else {
    console.error('Sem sessionId:', JSON.stringify(data));
    await enviarMensagem(telefone, 'Olá! Em breve um especialista entrará em contato.');
  }
}

async function continuarChat(telefone, sessionId, mensagem) {
  console.log('Continuando chat:', telefone, 'sessao:', sessionId, 'msg:', mensagem);
  const response = await fetch(
    `https://typebot.co/api/v1/sessions/${sessionId}/continueChat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TYPEBOT_TOKEN}`,
      },
      body: JSON.stringify({ message: mensagem }),
    }
  );
  const data = await response.json();
  console.log('continueChat response:', JSON.stringify(data).substring(0, 300));

  if (data.status === 'ended') {
    console.log('Chat encerrado para:', telefone);
    delete sessoes[telefone];
  }
  await processarResposta(telefone, data);
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  console.log('Webhook recebido:', JSON.stringify(req.body).substring(0, 200));

  const payload = req.body;
  if (payload.fromMe) { console.log('Ignorando mensagem propria'); return; }
  if (payload.isGroup) { console.log('Ignorando grupo'); return; }

  const telefone = payload.phone || payload.from;
  const mensagem = (payload.text && payload.text.message)
    ? payload.text.message
    : (typeof payload.text === 'string' ? payload.text : '');

  console.log('Telefone:', telefone, '| Mensagem:', mensagem);

  if (!telefone || !mensagem) {
    console.log('Telefone ou mensagem vazio, ignorando');
    return;
  }

  try {
    const sessionId = sessoes[telefone];
    if (!sessionId) {
      await iniciarChat(telefone);
    } else {
      await continuarChat(telefone, sessionId, mensagem);
    }
  } catch (err) {
    console.error('Erro geral:', err.message);
    await enviarMensagem(telefone, 'Desculpe, ocorreu um problema. Um atendente entrará em contato em breve!');
    delete sessoes[telefone];
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'Bot rodando!', sessoes: Object.keys(sessoes).length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot rodando na porta ${PORT}`));

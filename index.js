const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const CONFIG = {
  ZAPI_INSTANCE: '3F0D146F6BE3E2AFA5A932CA3B3481D4',
  ZAPI_TOKEN: '6244344FDB02B92DE450C071',
  ZAPI_URL: 'https://api.z-api.io/instances',
  TYPEBOT_PUBLIC_ID: 'bot-imobiliario-qualificacao-kh44hmk',
  TYPEBOT_API_TOKEN: '9J5QPUpOEYuMntaFIw3q52UB',
  TYPEBOT_API_URL: 'https://typebot.co/api/v1',
  MEU_NUMERO: '5582991053056',
};

const sessoes = {};

async function enviarMensagem(telefone, mensagem) {
  const url = `${CONFIG.ZAPI_URL}/${CONFIG.ZAPI_INSTANCE}/token/${CONFIG.ZAPI_TOKEN}/send-text`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: telefone, message: mensagem }),
  });
}

async function processarMensagens(telefone, messages, input) {
  for (const msg of messages) {
    if (msg.type === 'text' && msg.content?.richText) {
      const texto = msg.content.richText
        .map(p => p.children?.map(c => c.text).join('') || '')
        .join('\n')
        .trim();
      if (texto) {
        await enviarMensagem(telefone, texto);
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }
  if (input && input.type === 'choice input' && input.items?.length) {
    const opcoes = input.items.map((item, i) => `${i + 1}. ${item.content}`).join('\n');
    await enviarMensagem(telefone, `Escolha uma opcao:\n\n${opcoes}`);
  }
}

async function iniciarChat(telefone) {
  const res = await fetch(
    `${CONFIG.TYPEBOT_API_URL}/typebots/${CONFIG.TYPEBOT_PUBLIC_ID}/startChat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.TYPEBOT_API_TOKEN}`,
      },
      body: JSON.stringify({}),
    }
  );
  const data = await res.json();
  if (data.sessionId) {
    sessoes[telefone] = data.sessionId;
    await processarMensagens(telefone, data.messages || [], data.input);
  } else {
    await enviarMensagem(telefone, 'Ola! Um momento, conectando voce ao nosso atendimento...');
  }
}

async function continuarChat(telefone, sessionId, mensagemUsuario) {
  const res = await fetch(
    `${CONFIG.TYPEBOT_API_URL}/sessions/${sessionId}/continueChat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.TYPEBOT_API_TOKEN}`,
      },
      body: JSON.stringify({ message: mensagemUsuario }),
    }
  );
  const data = await res.json();
  if (data.status === 'ended') {
    delete sessoes[telefone];
    await processarMensagens(telefone, data.messages || [], null);
    return;
  }
  await processarMensagens(telefone, data.messages || [], data.input);
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const payload = req.body;
  if (payload.fromMe || payload.isGroup) return;
  const telefone = payload.phone || payload.from;
  const mensagem = payload.text?.message || payload.text || '';
  if (!telefone || !mensagem) return;
  console.log(`Mensagem de ${telefone}: ${mensagem}`);
  try {
    const sessionId = sessoes[telefone];
    if (!sessionId) {
      await iniciarChat(telefone);
    } else {
      await continuarChat(telefone, sessionId, mensagem);
    }
  } catch (err) {
    console.error('Erro:', err.message);
    await enviarMensagem(telefone, 'Desculpe, ocorreu um problema. Um atendente entrara em contato em breve!');
    delete sessoes[telefone];
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'Bot Imobiliario rodando!', sessoes_ativas: Object.keys(sessoes).length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot rodando na porta ${PORT}`));

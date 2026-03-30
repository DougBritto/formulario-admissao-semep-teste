require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const XlsxPopulate = require('xlsx-populate');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;
const TEMPLATE_FILENAME = process.env.TEMPLATE_FILENAME || 'FOR 33 RH - Solicitação de Cadastro e Admissão Rev 05.xlsx';
const TEMPLATE_PATH = path.join(__dirname, TEMPLATE_FILENAME);

const EMAIL_TO = process.env.EMAIL_TO || 'douglasbritto416@gmail.com';
const EMAIL_CONFIRMATION_ENABLED = String(process.env.EMAIL_CONFIRMATION_ENABLED || 'true').toLowerCase() === 'true';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const MAX_DEPENDENTES = 5;
const SHEET_NAME = 'SCA';

const cellMap = {
  nome: 'J7',
  sexo_funcionario: 'AJ7',
  estado_civil: 'AL7',
  naturalidade: 'F10',
  uf_naturalidade: 'U10',
  nome_mae: 'W10',
  nome_pai: 'F13',
  data_nascimento: 'Y13',
  grau_instrucao: 'AD13',
  email: 'F16',
  contato_emergencia: 'W16',
  raca: 'F19',
  banco: 'X19',
  agencia: 'Z19',
  conta_pagto: 'AC19',
  cpf: 'F26',
  pis_pasep: 'L26',
  rg_numero: 'R26',
  rg_data_emissao: 'W26',
  ctps_numero: 'AA26',
  ctps_serie: 'AE26',
  ctps_uf: 'AH26',
  ctps_data_emissao: 'AJ26',
  cnh_numero: 'F29',
  cnh_categoria: 'N29',
  reservista: 'Q29',
  titulo_eleitor: 'Y29',
  titulo_zona: 'AF29',
  titulo_secao: 'AJ29',
  orgao_emissor_cnh: 'H32',
  cnh_data_emissao: 'M32',
  cnh_data_vencimento: 'R32',
  cnh_categoria_outros: 'V32',
  cnh_uf: 'Y32',
  orgao_emissor_rg: 'AA32',
  endereco: 'F38',
  numero: 'Y38',
  complemento: 'AB38',
  bairro: 'AF38',
  uf_endereco: 'F41',
  cidade: 'H41',
  cep: 'X41',
  ddd_celular: 'AH41',
  celular: 'AJ41',
  conjuge_nome: 'F44',
  conjuge_data_nascimento: 'Q44',
  conjuge_sexo: 'T44',
  conjuge_grau_parentesco: 'U44',
  conjuge_ir: 'V44',
  conjuge_local_nascimento: 'W44',
  conjuge_cpf: 'AD44',
  conjuge_data_casamento: 'AI44',
  plano_saude_dependentes: 'F65',
  plano_odonto_dependentes: 'F66'
};

const dependenteRows = [48, 50, 52, 54, 56].map((row) => ({
  nome: `F${row}`,
  data_nascimento: `Q${row}`,
  sexo: `T${row}`,
  grau_parentesco: `U${row}`,
  ir: `V${row}`,
  local_nascimento: `W${row}`,
  cpf: `AD${row}`,
  dnv: `AI${row}`
}));

function normalizeText(value, { uppercase = true } = {}) {
  if (value === undefined || value === null) return '';
  let text = String(value).trim();
  if (!text) return '';
  text = text.replace(/\s+/g, ' ');
  return uppercase ? text.toUpperCase() : text;
}

function normalizeDate(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  return text;
}

function normalizeCpf(value) {
  return normalizeText(value, { uppercase: false });
}

function normalizePhone(value) {
  return normalizeText(value, { uppercase: false });
}

function setCellValue(sheet, address, value) {
  if (!address) return;
  sheet.cell(address).value(value ?? '');
}

function joinPlanoDependentes(dependentes, flag) {
  return dependentes
    .filter((dep) => dep && dep[flag] && dep.nome)
    .map((dep) => normalizeText(dep.nome))
    .join(' | ');
}

function buildOutputFilename(nome) {
  const base = normalizeText(nome || 'colaborador')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'COLABORADOR';
  const stamp = new Date().toISOString().slice(0, 10);
  return `SCA_${base}_${stamp}.xlsx`;
}

function validatePayload(payload) {
  const required = [
    ['nome', 'Nome'],
    ['sexo_funcionario', 'Sexo'],
    ['estado_civil', 'Estado civil'],
    ['data_nascimento', 'Data de nascimento'],
    ['cpf', 'CPF'],
    ['email', 'E-mail'],
    ['celular', 'Celular']
  ];

  const missing = required
    .filter(([key]) => !payload[key] || !String(payload[key]).trim())
    .map(([, label]) => label);

  if (missing.length) {
    return `Campos obrigatórios ausentes: ${missing.join(', ')}`;
  }

  if (Array.isArray(payload.dependentes) && payload.dependentes.length > MAX_DEPENDENTES) {
    return `A planilha base comporta no máximo ${MAX_DEPENDENTES} dependentes.`;
  }

  if (!RESEND_API_KEY) {
    return 'Configuração de envio incompleta. Defina RESEND_API_KEY no arquivo .env.';
  }

  return null;
}

function buildInternalEmailHtml(payload, fileName) {
  const dependentes = Array.isArray(payload.dependentes) ? payload.dependentes : [];
  const dependentesHtml = dependentes.length
    ? `<ul>${dependentes.map((dep) => `<li>${normalizeText(dep.nome, { uppercase: false }) || 'Dependente sem nome'}${dep.plano_saude ? ' | Plano Saúde' : ''}${dep.plano_odonto ? ' | Plano Odonto' : ''}</li>`).join('')}</ul>`
    : '<p>Nenhum dependente informado.</p>';

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1a2433;">
      <h2>Novo formulário de admissão recebido</h2>
      <p>Os dados enviados pelo colaborador foram convertidos para a planilha oficial. O arquivo segue em anexo.</p>
      <p><strong>Arquivo:</strong> ${fileName}</p>
      <p><strong>Colaborador:</strong> ${normalizeText(payload.nome, { uppercase: false })}</p>
      <p><strong>CPF:</strong> ${payload.cpf || ''}</p>
      <p><strong>E-mail informado:</strong> ${payload.email || ''}</p>
      <p><strong>Celular:</strong> ${payload.celular || ''}</p>
      <h3>Dependentes</h3>
      ${dependentesHtml}
    </div>
  `;
}

function buildCollaboratorEmailHtml(payload) {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1a2433;">
      <h2>Recebemos seus dados</h2>
      <p>Olá, ${normalizeText(payload.nome, { uppercase: false })}.</p>
      <p>Seu formulário de admissão foi recebido com sucesso para teste.</p>
      <p>Os dados foram encaminhados para análise e conferência.</p>
      <p>Se for necessário complementar alguma informação, você será contatado posteriormente.</p>
      <p style="margin-top: 20px; color: #667085;">Mensagem automática de teste.</p>
    </div>
  `;
}

async function buildWorkbookBuffer(payload) {
  const workbook = await XlsxPopulate.fromFileAsync(TEMPLATE_PATH);
  const sheet = workbook.sheet(SHEET_NAME);

  const transformed = {
    ...payload,
    nome: normalizeText(payload.nome),
    sexo_funcionario: normalizeText(payload.sexo_funcionario),
    estado_civil: normalizeText(payload.estado_civil),
    naturalidade: normalizeText(payload.naturalidade),
    uf_naturalidade: normalizeText(payload.uf_naturalidade),
    nome_mae: normalizeText(payload.nome_mae),
    nome_pai: normalizeText(payload.nome_pai),
    data_nascimento: normalizeDate(payload.data_nascimento),
    grau_instrucao: normalizeText(payload.grau_instrucao),
    email: normalizeText(payload.email, { uppercase: false }),
    contato_emergencia: normalizeText(payload.contato_emergencia),
    raca: normalizeText(payload.raca),
    banco: normalizeText(payload.banco),
    agencia: normalizeText(payload.agencia, { uppercase: false }),
    conta_pagto: normalizeText(payload.conta_pagto, { uppercase: false }),
    cpf: normalizeCpf(payload.cpf),
    pis_pasep: normalizeText(payload.pis_pasep, { uppercase: false }),
    rg_numero: normalizeText(payload.rg_numero, { uppercase: false }),
    rg_data_emissao: normalizeDate(payload.rg_data_emissao),
    ctps_numero: normalizeText(payload.ctps_numero, { uppercase: false }),
    ctps_serie: normalizeText(payload.ctps_serie, { uppercase: false }),
    ctps_uf: normalizeText(payload.ctps_uf),
    ctps_data_emissao: normalizeDate(payload.ctps_data_emissao),
    cnh_numero: normalizeText(payload.cnh_numero, { uppercase: false }),
    cnh_categoria: normalizeText(payload.cnh_categoria),
    reservista: normalizeText(payload.reservista, { uppercase: false }),
    titulo_eleitor: normalizeText(payload.titulo_eleitor, { uppercase: false }),
    titulo_zona: normalizeText(payload.titulo_zona, { uppercase: false }),
    titulo_secao: normalizeText(payload.titulo_secao, { uppercase: false }),
    orgao_emissor_cnh: normalizeText(payload.orgao_emissor_cnh),
    cnh_data_emissao: normalizeDate(payload.cnh_data_emissao),
    cnh_data_vencimento: normalizeDate(payload.cnh_data_vencimento),
    cnh_categoria_outros: normalizeText(payload.cnh_categoria_outros),
    cnh_uf: normalizeText(payload.cnh_uf),
    orgao_emissor_rg: normalizeText(payload.orgao_emissor_rg),
    endereco: normalizeText(payload.endereco),
    numero: normalizeText(payload.numero, { uppercase: false }),
    complemento: normalizeText(payload.complemento),
    bairro: normalizeText(payload.bairro),
    uf_endereco: normalizeText(payload.uf_endereco),
    cidade: normalizeText(payload.cidade),
    cep: normalizeText(payload.cep, { uppercase: false }),
    ddd_celular: normalizeText(payload.ddd_celular, { uppercase: false }),
    celular: normalizePhone(payload.celular),
    conjuge_nome: normalizeText(payload.conjuge_nome),
    conjuge_data_nascimento: normalizeDate(payload.conjuge_data_nascimento),
    conjuge_sexo: normalizeText(payload.conjuge_sexo),
    conjuge_grau_parentesco: normalizeText(payload.conjuge_grau_parentesco),
    conjuge_ir: normalizeText(payload.conjuge_ir),
    conjuge_local_nascimento: normalizeText(payload.conjuge_local_nascimento),
    conjuge_cpf: normalizeCpf(payload.conjuge_cpf),
    conjuge_data_casamento: normalizeDate(payload.conjuge_data_casamento)
  };

  Object.entries(cellMap).forEach(([key, address]) => {
    if (key === 'plano_saude_dependentes' || key === 'plano_odonto_dependentes') return;
    setCellValue(sheet, address, transformed[key] ?? '');
  });

  const dependentes = Array.isArray(payload.dependentes) ? payload.dependentes.slice(0, MAX_DEPENDENTES) : [];
  dependenteRows.forEach((mapping, index) => {
    const dep = dependentes[index] || {};
    setCellValue(sheet, mapping.nome, normalizeText(dep.nome));
    setCellValue(sheet, mapping.data_nascimento, normalizeDate(dep.data_nascimento));
    setCellValue(sheet, mapping.sexo, normalizeText(dep.sexo));
    setCellValue(sheet, mapping.grau_parentesco, normalizeText(dep.grau_parentesco));
    setCellValue(sheet, mapping.ir, normalizeText(dep.ir));
    setCellValue(sheet, mapping.local_nascimento, normalizeText(dep.local_nascimento));
    setCellValue(sheet, mapping.cpf, normalizeCpf(dep.cpf));
    setCellValue(sheet, mapping.dnv, normalizeText(dep.dnv, { uppercase: false }));
  });

  setCellValue(sheet, cellMap.plano_saude_dependentes, joinPlanoDependentes(dependentes, 'plano_saude'));
  setCellValue(sheet, cellMap.plano_odonto_dependentes, joinPlanoDependentes(dependentes, 'plano_odonto'));

  return workbook.outputAsync();
}

async function sendInternalEmail({ payload, fileBuffer, filename }) {
  const resend = new Resend(RESEND_API_KEY);
  return resend.emails.send({
    from: RESEND_FROM,
    to: EMAIL_TO,
    replyTo: payload.email || undefined,
    subject: `Formulário de admissão - ${normalizeText(payload.nome, { uppercase: false })}`,
    html: buildInternalEmailHtml(payload, filename),
    attachments: [
      {
        filename,
        content: Buffer.from(fileBuffer).toString('base64')
      }
    ]
  });
}

async function sendCollaboratorConfirmation(payload) {
  if (!EMAIL_CONFIRMATION_ENABLED || !payload.email) return null;
  const resend = new Resend(RESEND_API_KEY);
  return resend.emails.send({
    from: RESEND_FROM,
    to: payload.email,
    subject: 'Recebemos seu formulário de admissão',
    html: buildCollaboratorEmailHtml(payload)
  });
}

app.get('/api/config', (req, res) => {
  res.json({
    templateFilename: TEMPLATE_FILENAME,
    templateFound: fs.existsSync(TEMPLATE_PATH),
    maxDependentes: MAX_DEPENDENTES,
    emailTo: EMAIL_TO,
    emailConfigured: Boolean(RESEND_API_KEY),
    confirmationEnabled: EMAIL_CONFIRMATION_ENABLED
  });
});

app.post('/api/generate', async (req, res) => {
  try {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      return res.status(400).json({
        error: `Template não encontrado. Coloque o arquivo ${TEMPLATE_FILENAME} na raiz do projeto.`
      });
    }

    const payload = req.body || {};
    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const fileBuffer = await buildWorkbookBuffer(payload);
    const filename = buildOutputFilename(payload.nome);

    await sendInternalEmail({ payload, fileBuffer, filename });
    await sendCollaboratorConfirmation(payload);

    return res.json({
      success: true,
      message: `Formulário enviado com sucesso. Para teste, os dados foram encaminhados para ${EMAIL_TO}.`,
      emailTo: EMAIL_TO,
      fileName: filename,
      confirmationSent: EMAIL_CONFIRMATION_ENABLED && Boolean(payload.email)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Não foi possível gerar a planilha e enviar os e-mails de teste. Verifique a configuração da Resend.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado em http://localhost:${PORT}`);
});

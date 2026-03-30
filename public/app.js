const form = document.getElementById('admissionForm');
const feedback = document.getElementById('feedback');
const submitBtn = document.getElementById('submitBtn');
const clearBtn = document.getElementById('clearBtn');
const templateStatus = document.getElementById('templateStatus');
const addDependentBtn = document.getElementById('addDependentBtn');
const dependentsContainer = document.getElementById('dependentsContainer');
const dependentTemplate = document.getElementById('dependentTemplate');
const emailTarget = document.getElementById('emailTarget');

const MAX_DEPENDENTES = 5;

function setFeedback(message = '', type = '') {
  feedback.textContent = message;
  feedback.className = `feedback ${type}`.trim();
}

function digitsOnly(value) {
  return (value || '').replace(/\D/g, '');
}

function applyMask(value, type) {
  const digits = digitsOnly(value);

  if (type === 'cpf') {
    return digits
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  if (type === 'cep') {
    return digits.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  }

  if (type === 'ddd') {
    return digits.slice(0, 2);
  }

  if (type === 'phone') {
    return digits
      .slice(0, 11)
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  }

  if (type === 'date') {
    return digits
      .slice(0, 8)
      .replace(/(\d{2})(\d)/, '$1/$2')
      .replace(/(\d{2})(\d)/, '$1/$2');
  }

  return value;
}

function applyMasks(root = document) {
  root.querySelectorAll('[data-mask]').forEach((input) => {
    input.addEventListener('input', (event) => {
      event.target.value = applyMask(event.target.value, event.target.dataset.mask);
    });
  });
}

function dependentCount() {
  return dependentsContainer.querySelectorAll('.dependent-card').length;
}

function refreshDependentIndexes() {
  dependentsContainer.querySelectorAll('.dependent-card').forEach((card, index) => {
    card.querySelector('.dependent-index').textContent = String(index + 1);
  });

  addDependentBtn.disabled = dependentCount() >= MAX_DEPENDENTES;
}

function addDependent(initialData = {}) {
  if (dependentCount() >= MAX_DEPENDENTES) return;

  const fragment = dependentTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.dependent-card');

  card.querySelectorAll('[data-field]').forEach((field) => {
    const key = field.dataset.field;
    if (field.type === 'checkbox') {
      field.checked = Boolean(initialData[key]);
    } else {
      field.value = initialData[key] || '';
    }
  });

  card.querySelector('.remove-dependent').addEventListener('click', () => {
    card.remove();
    refreshDependentIndexes();
  });

  dependentsContainer.appendChild(card);
  applyMasks(card);
  refreshDependentIndexes();
}

function serializeDependents() {
  return Array.from(dependentsContainer.querySelectorAll('.dependent-card')).map((card) => {
    const result = {};
    card.querySelectorAll('[data-field]').forEach((field) => {
      const key = field.dataset.field;
      result[key] = field.type === 'checkbox' ? field.checked : field.value.trim();
    });
    return result;
  });
}

function serializeForm() {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.dependentes = serializeDependents();
  return payload;
}

async function fetchConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    templateStatus.textContent = config.templateFound
      ? `Template OK | E-mail ${config.emailConfigured ? 'OK' : 'pendente'} `
      : `Ausente: ${config.templateFilename}`;
    templateStatus.style.color = config.templateFound && config.emailConfigured ? '#027a48' : '#b42318';
    emailTarget.textContent = config.emailTo || '-';
  } catch (error) {
    templateStatus.textContent = 'Não foi possível validar o template.';
    templateStatus.style.color = '#b42318';
    emailTarget.textContent = '-';
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  setFeedback('');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando formulário...';

  try {
    const payload = serializeForm();
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível enviar os dados.');
    }

    setFeedback(data.message || 'Seus dados foram enviados com sucesso. O setor de Recursos Humanos realizará a conferência e entrará em contato caso necessário.', 'success');
  } catch (error) {
    setFeedback(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar formulário';
  }
}

clearBtn.addEventListener('click', () => {
  form.reset();
  dependentsContainer.innerHTML = '';
  setFeedback('');
  refreshDependentIndexes();
});

addDependentBtn.addEventListener('click', () => addDependent());
form.addEventListener('submit', handleSubmit);

applyMasks();
fetchConfig();
refreshDependentIndexes();

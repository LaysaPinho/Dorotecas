// ============================================================
//  CLUBE DAS DOROTECAS — app.js
//  Firebase Auth + Firestore
// ============================================================
 
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
 
// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
  apiKey:            "AIzaSyCmWibI_M3mw6Sezq6jXsStGiMBgwvVXXI",
  authDomain:        "dorotecas-82794.firebaseapp.com",
  projectId:         "dorotecas-82794",
  storageBucket:     "dorotecas-82794.firebasestorage.app",
  messagingSenderId: "789805763862",
  appId:             "1:789805763862:web:197a72e318b0e580109437",
  measurementId:     "G-XSGHXLZLKS"
};
 
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
 
// ---------- CONSTANTES ----------
const COLORS = ['#FF6B6B','#06D6A0','#4CC9F0','#FFD166','#A8DADC','#7B5EA7','#FF9F1C','#CBFF8C','#FF4D6D','#00B4D8'];
const LIGHT_COLORS = ['#06D6A0','#FFD166','#FF9F1C','#CBFF8C'];
 
// ---------- ESTADO ----------
let state         = null;
let currentUid    = null;
let currentSalaId = null;
let viewMode      = 'grid';
let pendingPhotoStudentId = null;
let pendingPhotoDataUrl   = null;
let unsubscribeSnapshot   = null;
 
// ---------- FIRESTORE REF ----------
function userDocRef(uid) { return doc(db, 'professoras', uid, 'dados', 'main'); }
 
// ---------- CRITÉRIOS GLOBAIS PADRÃO ----------
function defaultReasons() {
  return {
    earn: [
      { id: 1, text: 'Participou da aula',       coins: 2 },
      { id: 2, text: 'Ajudou um colega',         coins: 3 },
      { id: 3, text: 'Entregou tarefa no prazo', coins: 1 },
      { id: 4, text: 'Comportamento exemplar',   coins: 5 },
    ],
    lose: [
      { id: 5, text: 'Atrasou a tarefa',           coins: 1 },
      { id: 6, text: 'Ficou sem prestar atenção',  coins: 2 },
      { id: 7, text: 'Desobedeceu as regras',      coins: 3 },
    ]
  };
}
 
// ---------- SALA PADRÃO (sem critérios próprios) ----------
function defaultSala(name) {
  return {
    id: Date.now().toString(),
    name,
    students: [],
    colorIdx: 0,
    selectedStudents: []
  };
}
 
function defaultMainState(teacherName) {
  const sala = defaultSala('Minha Turma');
  return {
    teacherName,
    salas: [sala],
    currentSalaId: sala.id,
    reasons: defaultReasons()   // critérios GLOBAIS, fora das salas
  };
}
 
// ---------- SALA ATIVA ----------
function getSala() {
  if (!state || !state.salas) return null;
  return state.salas.find(s => s.id === currentSalaId) || state.salas[0];
}
 
// ---------- CRITÉRIOS GLOBAIS ----------
function getReasons() {
  return state?.reasons || defaultReasons();
}
 
// ============================================================
//  AUTH — TELAS
// ============================================================
function hideAllCards() {
  ['cardLogin','cardRegister','cardForgot'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
}
 
window.showRegister  = function() { hideAllCards(); document.getElementById('cardRegister').style.display = 'block'; };
window.showForgot    = function() { hideAllCards(); document.getElementById('cardForgot').style.display   = 'block'; };
window.showLoginCard = function() { hideAllCards(); document.getElementById('cardLogin').style.display    = 'block'; };
 
// LOGIN
window.doLogin = async function() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const loadEl   = document.getElementById('loginLoading');
  const btn      = document.getElementById('loginBtn');
  errEl.style.display = 'none';
  if (!email || !password) { showErrEl(errEl,'Preencha e-mail e senha.'); return; }
  btn.disabled = true; loadEl.style.display = 'inline';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch(err) {
    btn.disabled = false; loadEl.style.display = 'none';
    showErrEl(errEl, friendlyAuthError(err.code));
  }
};
 
// CADASTRO
window.doRegister = async function() {
  const name     = document.getElementById('registerName').value.trim();
  const email    = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const errEl    = document.getElementById('registerError');
  const okEl     = document.getElementById('registerSuccess');
  const loadEl   = document.getElementById('registerLoading');
  const btn      = document.getElementById('registerBtn');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  if (!name)             { showErrEl(errEl,'Informe seu nome.');                         return; }
  if (!email)            { showErrEl(errEl,'Informe o e-mail.');                         return; }
  if (password.length<6) { showErrEl(errEl,'Senha precisa ter ao menos 6 caracteres.'); return; }
  btn.disabled = true; loadEl.style.display = 'inline';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    currentUid = cred.user.uid;
    state = defaultMainState(name);
    currentSalaId = state.currentSalaId;
    await saveToFirestore();
    okEl.textContent = `Conta criada! Bem-vinda, ${name}!`;
    okEl.style.display = 'block';
  } catch(err) {
    btn.disabled = false; loadEl.style.display = 'none';
    showErrEl(errEl, friendlyAuthError(err.code));
  }
};
 
// REDEFINIR SENHA
window.doForgot = async function() {
  const email  = document.getElementById('forgotEmail').value.trim();
  const errEl  = document.getElementById('forgotError');
  const okEl   = document.getElementById('forgotSuccess');
  const loadEl = document.getElementById('forgotLoading');
  const btn    = document.getElementById('forgotBtn');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  if (!email) { showErrEl(errEl,'Informe o e-mail.'); return; }
  btn.disabled = true; loadEl.style.display = 'inline';
  try {
    await sendPasswordResetEmail(auth, email);
    okEl.textContent = 'Link enviado! Verifique sua caixa de entrada.';
    okEl.style.display = 'block';
    btn.disabled = false; loadEl.style.display = 'none';
  } catch(err) {
    btn.disabled = false; loadEl.style.display = 'none';
    showErrEl(errEl, friendlyAuthError(err.code));
  }
};
 
window.doLogout = async function() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  await signOut(auth);
};
 
function showErrEl(el, msg) { el.textContent = msg; el.style.display = 'block'; }
 
function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email':          'E-mail inválido.',
    'auth/user-not-found':         'Conta não encontrada.',
    'auth/wrong-password':         'Senha incorreta.',
    'auth/invalid-credential':     'E-mail ou senha incorretos.',
    'auth/email-already-in-use':   'Este e-mail já está cadastrado.',
    'auth/too-many-requests':      'Muitas tentativas. Aguarde um momento.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
  };
  return map[code] || 'Erro ao processar. Tente novamente.';
}
 
// ---------- AUTH STATE ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    await loadOrInitState(user.uid);
    showApp(user);
    startRealtimeSync(user.uid);
  } else {
    currentUid = null; state = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display   = 'none';
    window.showLoginCard();
  }
});
 
// ============================================================
//  FIRESTORE
// ============================================================
async function loadOrInitState(uid) {
  const snap = await getDoc(userDocRef(uid));
  if (snap.exists()) {
    state = snap.data();
 
    // Migração: se as salas ainda tiverem critérios próprios, move para o global
    if (!state.reasons) {
      const firstSalaWithReasons = state.salas?.find(s => s.reasons);
      state.reasons = firstSalaWithReasons?.reasons || defaultReasons();
    }
 
    // Garante que salas não tenham critérios próprios (limpa legado)
    if (state.salas) {
      state.salas.forEach(s => { delete s.reasons; });
    }
 
    if (!state.salas || !state.salas.length) {
      const sala = defaultSala('Minha Turma');
      state.salas = [sala];
      state.currentSalaId = sala.id;
    }
 
    currentSalaId = state.currentSalaId || state.salas[0].id;
    state.salas.forEach(s => { if (!s.selectedStudents) s.selectedStudents = []; });
  } else {
    state = defaultMainState(auth.currentUser?.displayName || 'Professora');
    currentSalaId = state.currentSalaId;
    await saveToFirestore();
  }
}
 
async function saveToFirestore() {
  if (!currentUid || !state) return;
  state.currentSalaId = currentSalaId;
  await setDoc(userDocRef(currentUid), state);
}
 
function startRealtimeSync(uid) {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  unsubscribeSnapshot = onSnapshot(userDocRef(uid), snap => {
    if (snap.exists()) {
      state = snap.data();
      if (!state.reasons) state.reasons = defaultReasons();
      if (!state.salas || !state.salas.length) {
        const sala = defaultSala('Minha Turma');
        state.salas = [sala]; state.currentSalaId = sala.id;
      }
      currentSalaId = state.currentSalaId || state.salas[0].id;
      state.salas.forEach(s => { if (!s.selectedStudents) s.selectedStudents = []; });
      renderSalaSelector();
      renderStudents();
      renderReasons();
      updateHeader();
    }
  });
}
 
async function save() { await saveToFirestore(); }
 
// ============================================================
//  APP — TELA PRINCIPAL
// ============================================================
function showApp(user) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display   = 'block';
  const name = user?.displayName || state?.teacherName || '';
  document.getElementById('headerTeacherName').textContent = name.split(' ')[0];
  renderSalaSelector();
  renderStudents();
  renderReasons();
  updateHeader();
}
 
// ============================================================
//  RENOMEAR SALA
// ============================================================
window.renameSala = async function() {
  const sala = getSala();
  if (!sala) return;
  const novo = prompt('Novo nome para a sala:', sala.name);
  if (!novo || !novo.trim() || novo.trim() === sala.name) return;
  sala.name = novo.trim();
  await save();
  renderSalaSelector();
  showToast('Sala renomeada!', '#06D6A0');
};
 
// ============================================================
//  SALAS
// ============================================================
function renderSalaSelector() {
  const sel = document.getElementById('salaSelect');
  if (!sel || !state?.salas) return;
  sel.innerHTML = state.salas.map(s =>
    `<option value="${s.id}" ${s.id === currentSalaId ? 'selected' : ''}>${s.name}</option>`
  ).join('');
  const selMobile = document.getElementById('salaSelectMobile');
  if (selMobile) selMobile.innerHTML = sel.innerHTML;
}
 
window.switchSala = function(id) {
  currentSalaId = id;
  state.currentSalaId = id;
  save();
  renderStudents();
  updateHeader();
};
 
window.openNewSalaModal = function() {
  document.getElementById('newSalaName').value = '';
  document.getElementById('newSalaOverlay').classList.add('open');
};
 
window.closeNewSalaModal = function(e) {
  if (e.target.id === 'newSalaOverlay') closeNewSalaModalDirect();
};
 
window.closeNewSalaModalDirect = function() {
  document.getElementById('newSalaOverlay').classList.remove('open');
};
 
window.createSala = async function() {
  const name = document.getElementById('newSalaName').value.trim();
  if (!name) { showToast('Digite o nome da sala!', '#FF9F1C'); return; }
  const nova = defaultSala(name);
  state.salas.push(nova);
  currentSalaId = nova.id;
  await save();
  renderSalaSelector();
  renderStudents();
  updateHeader();
  closeNewSalaModalDirect();
  showToast(`Sala "${name}" criada!`, '#06D6A0');
};
 
// ============================================================
//  UTILITÁRIOS
// ============================================================
function getInitials(name) {
  return name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
}
 
function updateHeader() {
  const sala = getSala();
  document.getElementById('hStudents').textContent = sala?.students?.length || 0;
}
 
function showToast(msg, color = '#2D3047') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = color;
  t.style.color = LIGHT_COLORS.includes(color) ? '#0F0E17' : 'white';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
 
window.setView = function(mode) {
  viewMode = mode;
  document.getElementById('btnViewGrid').classList.toggle('active', mode === 'grid');
  document.getElementById('btnViewList').classList.toggle('active', mode === 'list');
  renderStudents();
};
 
window.switchTab = function(name) {
  const tabNames = ['alunos','ranking','motivos'];
  document.querySelectorAll('.tab').forEach((tab,i) => tab.classList.toggle('active', tabNames[i] === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
  if (name === 'ranking') renderRanking();
  if (name === 'motivos') renderReasons();
};
 
// ============================================================
//  ALUNOS
// ============================================================
window.addStudent = async function() {
  const sala  = getSala();
  const input = document.getElementById('newName');
  const name  = input.value.trim();
  if (!name) return;
  if (sala.students.find(s => s.name.toLowerCase() === name.toLowerCase())) {
    showToast('Aluno já cadastrado!', '#FF9F1C'); return;
  }
  const color = COLORS[sala.colorIdx % COLORS.length];
  sala.colorIdx++;
  sala.students.push({ id: Date.now(), name, coins: 0, color, photo: null, history: [] });
  await save();
  renderStudents();
  input.value = '';
  showToast(`${name} cadastrado(a)!`, '#06D6A0');
};
 
window.removeStudent = async function(id) {
  const sala    = getSala();
  const student = sala.students.find(s => s.id === id);
  if (!confirm(`Remover ${student.name}?`)) return;
  sala.students = sala.students.filter(s => s.id !== id);
  sala.selectedStudents = (sala.selectedStudents||[]).filter(sid => sid !== id);
  await save();
  renderStudents();
};
 
window.toggleStudentSelection = async function(id) {
  const sala = getSala();
  if (!sala.selectedStudents) sala.selectedStudents = [];
  if (sala.selectedStudents.includes(id)) {
    sala.selectedStudents = sala.selectedStudents.filter(sid => sid !== id);
  } else {
    sala.selectedStudents.push(id);
  }
  await save();
  renderStudents();
};
 
window.selectAllStudents = async function() {
  const sala = getSala();
  sala.selectedStudents = sala.students.map(s => s.id);
  await save(); renderStudents();
};
 
window.clearSelectedStudents = async function() {
  const sala = getSala();
  sala.selectedStudents = [];
  await save(); renderStudents();
};
 
function buildOptions() {
  const reasons = getReasons();
  const earnOpts = reasons.earn.map(r => `<option value="earn:${r.id}">${r.text} (+${r.coins})</option>`).join('');
  const loseOpts = reasons.lose.map(r => `<option value="lose:${r.id}">${r.text} (-${r.coins})</option>`).join('');
  return `<option value="">Selecione o motivo</option><optgroup label="CRÉDITO">${earnOpts}</optgroup><optgroup label="DÉBITO">${loseOpts}</optgroup>`;
}
 
window.applyReason = async function(id, type) {
  const sala    = getSala();
  const reasons = getReasons();
  const student = sala.students.find(s => s.id === id);
  const select  = document.getElementById(`reason-${id}`);
  if (!select.value) { showToast('Selecione um motivo!', '#FF9F1C'); return; }
  const [rType, rId] = select.value.split(':');
  if (type === 'earn' && rType === 'lose') { showToast('Selecione um motivo de GANHAR!', '#FF9F1C'); return; }
  if (type === 'lose' && rType === 'earn') { showToast('Selecione um motivo de PERDER!', '#FF9F1C'); return; }
  const reason = reasons[rType].find(r => r.id == rId);
  if (!reason) return;
  if (type === 'lose' && student.coins < reason.coins) { showToast('Moedas insuficientes!', '#FF9F1C'); return; }
  const delta = type === 'earn' ? reason.coins : -reason.coins;
  student.coins += delta;
  student.history.unshift({ type, reason: reason.text, coins: reason.coins, delta, date: new Date().toLocaleString('pt-BR') });
  await save();
  const coinEl = document.querySelector(`[data-coin="${id}"]`);
  if (coinEl) {
    coinEl.textContent = student.coins;
    coinEl.classList.remove('bump'); void coinEl.offsetWidth; coinEl.classList.add('bump');
  }
  updateHeader();
  select.value = '';
  showToast(type === 'earn' ? `+${reason.coins} para ${student.name}` : `-${reason.coins} de ${student.name}`, type === 'earn' ? '#06D6A0' : '#FF6B6B');
};
 
window.applyReasonAuto = async function(id) {
  const select = document.getElementById(`reason-${id}`);
  if (!select.value) { showToast('Selecione um motivo!', '#FF9F1C'); return; }
  const [rType] = select.value.split(':');
  await window.applyReason(id, rType);
};
 
window.applyReasonToSelected = async function() {
  const sala        = getSala();
  const reasons     = getReasons();
  const selectedIds = sala.selectedStudents || [];
  const select      = document.getElementById('bulkReason');
  if (!selectedIds.length) { showToast('Selecione pelo menos um aluno!', '#FF9F1C'); return; }
  if (!select?.value)       { showToast('Selecione um motivo!', '#FF9F1C'); return; }
  const [rType, rId] = select.value.split(':');
  const type = rType;
  const reason = reasons[rType].find(r => r.id == rId);
  if (!reason) return;
  let count = 0;
  selectedIds.forEach(id => {
    const s = sala.students.find(s => s.id === id);
    if (!s) return;
    if (type === 'lose' && s.coins < reason.coins) return;
    const delta = type === 'earn' ? reason.coins : -reason.coins;
    s.coins += delta;
    if (!s.history) s.history = [];
    s.history.unshift({ type, reason: reason.text, coins: reason.coins, delta, date: new Date().toLocaleString('pt-BR') });
    count++;
  });
  sala.selectedStudents = [];
  await save();
  renderStudents(); updateHeader();
  select.value = '';
  showToast(`${count} aluno(s) atualizado(s)!`, type === 'earn' ? '#06D6A0' : '#FF6B6B');
};
 
function getFilteredStudents() {
  const sala  = getSala();
  if (!sala) return [];
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase();
  return query ? sala.students.filter(s => s.name.toLowerCase().includes(query)) : sala.students;
}
 
function renderStudents() {
  const grid = document.getElementById('studentsGrid');
  if (!grid || !state) return;
  const sala     = getSala();
  const students = getFilteredStudents();
 
  if (!sala || sala.students.length === 0) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="e-icon"></div><p>Esta sala ainda não tem alunos. Adicione o primeiro!</p></div>`;
    updateHeader(); return;
  }
 
  const bulkBar = `
    <div class="bulk-actions" style="grid-column:1/-1">
      <button class="btn btn-sm" onclick="selectAllStudents()">Selecionar todos</button>
      <button class="btn btn-sm" onclick="clearSelectedStudents()">Limpar seleção</button>
      <select id="bulkReason" style="min-width:200px;">${buildOptions()}</select>
      <button class="btn btn-primary btn-sm" onclick="applyReasonToSelected()">Aplicar</button>
    </div>`;
 
  if (viewMode === 'list') {
    grid.className = 'students-list-view';
    grid.innerHTML = bulkBar + `
      <table class="students-table">
        <thead>
          <tr>
            <th style="width:36px"></th>
            <th style="width:48px"></th>
            <th>Nome</th>
            <th style="width:80px;text-align:center">Moedas</th>
            <th style="width:180px">Critérios</th>
            <th style="width:160px">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${students.map(s => `
            <tr class="student-row ${(sala.selectedStudents||[]).includes(s.id) ? 'selected' : ''}">
              <td><input type="checkbox" ${(sala.selectedStudents||[]).includes(s.id) ? 'checked' : ''}
                onchange="toggleStudentSelection(${s.id})" style="accent-color:var(--blue);width:16px;height:16px;cursor:pointer"></td>
              <td>${s.photo
                ? `<img src="${s.photo}" class="s-avatar-sm" style="border-radius:50%;width:36px;height:36px;object-fit:cover;cursor:pointer" onclick="openPhotoModal(${s.id})" />`
                : `<div class="s-avatar-sm" style="background:${s.color};cursor:pointer" onclick="openPhotoModal(${s.id})">${getInitials(s.name)}</div>`
              }</td>
              <td><span class="s-name-row">${s.name}</span></td>
              <td style="text-align:center"><span class="s-coins-sm" data-coin="${s.id}">${s.coins}</span></td>
              <td><select id="reason-${s.id}" style="font-size:0.78rem;padding:6px 8px">${buildOptions()}</select></td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-primary btn-sm" onclick="applyReasonAuto(${s.id})">Aplicar</button>
                  <button class="btn btn-sm btn-hist" onclick="openHistory(${s.id})">Hist.</button>
                  <button class="btn-row-del" onclick="removeStudent(${s.id})" title="Remover">&times;</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } else {
    grid.className = 'students-grid';
    grid.innerHTML = bulkBar + students.map(s => `
      <div class="student-card ${(sala.selectedStudents||[]).includes(s.id) ? 'selected' : ''}">
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <input type="checkbox" ${(sala.selectedStudents||[]).includes(s.id) ? 'checked' : ''}
            onchange="toggleStudentSelection(${s.id})">
          <span style="font-size:0.85rem;color:var(--text-muted);">Selecionar</span>
        </label>
        <button class="s-remove" onclick="removeStudent(${s.id})">X</button>
        ${s.photo
          ? `<img src="${s.photo}" class="s-avatar" style="object-fit:cover;cursor:pointer" onclick="openPhotoModal(${s.id})" />`
          : `<div class="s-avatar" style="background:${s.color};cursor:pointer" onclick="openPhotoModal(${s.id})">${getInitials(s.name)}</div>`
        }
        <div class="s-name">${s.name}</div>
        <div class="s-coins" data-coin="${s.id}">${s.coins}</div>
        <div class="s-controls">
          <select id="reason-${s.id}">${buildOptions()}</select>
          <div class="s-actions">
            <button class="btn btn-primary btn-sm" onclick="applyReasonAuto(${s.id})">Aplicar</button>
          </div>
          <button class="s-history-btn" onclick="openHistory(${s.id})">Ver histórico</button>
        </div>
      </div>
    `).join('');
  }
 
  updateHeader();
}
 
// ============================================================
//  FOTO DO ALUNO
// ============================================================
window.openPhotoModal = function(id) {
  const sala    = getSala();
  const student = sala.students.find(s => s.id === id);
  pendingPhotoStudentId = id;
  pendingPhotoDataUrl   = null;
  document.getElementById('photoModalTitle').textContent = `Foto — ${student.name}`;
  const preview = document.getElementById('photoPreview');
  preview.innerHTML = student.photo
    ? `<img src="${student.photo}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;" />`
    : `<div style="width:120px;height:120px;border-radius:50%;background:${student.color};display:flex;align-items:center;justify-content:center;font-family:'Fredoka One',cursive;font-size:2.5rem;color:#0F0E17">${getInitials(student.name)}</div>`;
  document.getElementById('photoOverlay').classList.add('open');
};
 
window.handlePhotoFile = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    pendingPhotoDataUrl = ev.target.result;
    document.getElementById('photoPreview').innerHTML =
      `<img src="${pendingPhotoDataUrl}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;" />`;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
};
 
window.savePhoto = async function() {
  if (!pendingPhotoDataUrl) { closePhotoModalDirect(); return; }
  const sala    = getSala();
  const student = sala.students.find(s => s.id === pendingPhotoStudentId);
  if (!student) return;
  student.photo = pendingPhotoDataUrl;
  await save();
  renderStudents();
  closePhotoModalDirect();
  showToast('Foto salva!', '#06D6A0');
};
 
window.closePhotoModal       = function(e) { if (e.target.id === 'photoOverlay') closePhotoModalDirect(); };
window.closePhotoModalDirect = function()  { document.getElementById('photoOverlay').classList.remove('open'); };
 
// ============================================================
//  RANKING GERAL — todos os alunos de todas as salas
// ============================================================
function renderRanking() {
  const list = document.getElementById('rankingList');
  if (!list || !state) return;
  const panel = document.getElementById('panel-ranking');
  if (!panel || !panel.classList.contains('active')) return;
 
  // Junta todos os alunos de todas as salas
  const allStudents = (state.salas || []).flatMap(sala =>
    sala.students.map(s => ({ ...s, salaNome: sala.name }))
  );
 
  if (allStudents.length === 0) {
    list.innerHTML = '<div class="empty"><div class="e-icon">🏅</div><p>Cadastre um aluno e veja tudo acontecer!</p></div>';
    return;
  }
 
  const sorted  = [...allStudents].sort((a, b) => b.coins - a.coins);
  const max     = sorted[0].coins || 1;
  const medals  = ['🥇','🥈','🥉'];
  const classes = ['gold-rank','silver-rank','bronze-rank'];
 
  let html = '';
  let rankPos = 1;
  sorted.forEach((s, i) => {
    if (i > 0 && sorted[i].coins < sorted[i-1].coins) rankPos = i + 1;
    const posLabel = medals[rankPos-1] || '#' + rankPos;
    const cls      = classes[rankPos-1] || '';
    html += `
    <div class="rank-item ${cls}" style="animation-delay:${i*0.04}s">
      <div class="rank-pos">${posLabel}</div>
      ${s.photo
        ? `<img src="${s.photo}" class="rank-avatar" style="object-fit:cover" />`
        : `<div class="rank-avatar" style="background:${s.color}">${getInitials(s.name)}</div>`
      }
      <div class="rank-info">
        <div class="rank-name">${s.name} <span style="font-size:0.72rem;color:var(--text-muted);font-family:'Nunito',sans-serif;font-weight:600;">${s.salaNome}</span></div>
        <div class="rank-bar-wrap">
          <div class="rank-bar-fill" style="width:${Math.max(4,(s.coins/max)*100)}%"></div>
        </div>
      </div>
      <div class="rank-coins">${s.coins}</div>
    </div>`;
  });
  list.innerHTML = html;
}
 
// ============================================================
//  CRITÉRIOS GLOBAIS
// ============================================================
function renderReasons() {
  const reasons = getReasons();
  ['earn','lose'].forEach(type => {
    const container = document.getElementById(`${type}List`);
    if (!container) return;
    const list = reasons[type];
    if (!list.length) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:8px 4px">Nenhum motivo cadastrado.</div>';
      return;
    }
    container.innerHTML = list.map(r => `
      <div class="reason-item">
        <div class="reason-text">${r.text}</div>
        <div class="reason-coins ${type}">${r.coins}</div>
        <button class="reason-del" onclick="deleteReason('${type}',${r.id})">X</button>
      </div>`).join('');
  });
}
 
window.addReason = async function(type) {
  const reasons = getReasons();
  const textEl  = document.getElementById(`${type}Text`);
  const coinsEl = document.getElementById(`${type}Coins`);
  const text    = textEl.value.trim();
  const coins   = parseInt(coinsEl.value);
  if (!text || !coins || coins < 1) { showToast('Preencha o motivo e a quantidade!', '#FF9F1C'); return; }
  reasons[type].push({ id: Date.now(), text, coins });
  await save();
  renderReasons();
  renderStudents();
  textEl.value = ''; coinsEl.value = '';
  showToast('Critério adicionado para todas as salas!', '#06D6A0');
};
 
window.deleteReason = async function(type, id) {
  const reasons = getReasons();
  reasons[type] = reasons[type].filter(r => r.id != id);
  await save();
  renderReasons();
  renderStudents();
};
 
// ============================================================
//  HISTÓRICO
// ============================================================
window.openHistory = function(id) {
  const sala    = getSala();
  const student = sala.students.find(s => s.id === id);
  document.getElementById('modalTitle').textContent = `Histórico — ${student.name}`;
  const body = document.getElementById('modalBody');
  if (!student.history?.length) {
    body.innerHTML = '<div class="empty" style="padding:32px"><p>Nenhuma transação ainda.</p></div>';
  } else {
    body.innerHTML = student.history.map(h => `
      <div class="history-item">
        <div class="hist-dot ${h.type}"></div>
        <div class="hist-info">
          <div class="hist-reason">${h.reason}</div>
          <div class="hist-date">${h.date}</div>
        </div>
        <div class="hist-val ${h.type}">${h.type === 'earn' ? '+' : '-'}${h.coins}</div>
      </div>`).join('');
  }
  document.getElementById('modalOverlay').classList.add('open');
};
 
window.closeModal       = function(e) { if (e.target.id === 'modalOverlay') closeModalDirect(); };
window.closeModalDirect = function()  { document.getElementById('modalOverlay').classList.remove('open'); };
 
// ============================================================
//  TECLADO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginPassword')?.addEventListener('keydown',    e => { if (e.key==='Enter') window.doLogin(); });
  document.getElementById('registerPassword')?.addEventListener('keydown', e => { if (e.key==='Enter') window.doRegister(); });
  document.getElementById('forgotEmail')?.addEventListener('keydown',      e => { if (e.key==='Enter') window.doForgot(); });
  document.getElementById('newName')?.addEventListener('keydown',          e => { if (e.key==='Enter') window.addStudent(); });
  document.getElementById('newSalaName')?.addEventListener('keydown',      e => { if (e.key==='Enter') window.createSala(); });
  ['earn','lose'].forEach(type => {
    document.getElementById(`${type}Text`)?.addEventListener('keydown', e => { if (e.key==='Enter') window.addReason(type); });
  });
});
/* ============================================================
   GhostChat v1.2.1 — Multi-user Mesh Chat
   ============================================================ */

'use strict';

const $ = id => document.getElementById(id);

// ─── State ─────────────────────────────────────────────────────
const state = {
  peer: null,
  profile: null,
  myPeerId: '',
  isHost: false,
  roomCode: '',
  groupKey: null,
  participants: {},
  activeChat: 'group',
  groupMessages: [],
  replyingTo: null,
  connected: false,
  typingPeers: new Set(),
};

// ─── DOM Refs ───────────────────────────────────────────────────
const DOM = {
  screenProfile:    $('screen-profile'),
  profileName:      $('profile-name'),
  btnSaveProfile:   $('btn-save-profile'),
  screenSetup:      $('screen-setup'),
  screenChat:       $('screen-chat'),
  btnCreate:        $('btn-create-room'),
  btnJoin:          $('btn-join-room'),
  joinCode:         $('join-code'),
  roomCodeDisplay:  $('room-code-display'),
  roomCodeValue:    $('room-code-value'),
  participantsList: $('participants-list'),
  participantCount: $('participant-count'),
  messagesContainer: $('messages-container'),
  msgInput:         $('msg-input'),
  btnSend:          $('btn-send'),
  replyPreview:     $('reply-preview'),
  replyUser:        $('reply-user'),
  replyText:        $('reply-text'),
  btnCancelReply:   $('btn-cancel-reply'),
  activeName:       $('topbar-active-name'),
  activeStatus:     $('topbar-active-status'),
  activeLetter:     $('topbar-active-letter'),
  activeAvatar:     $('topbar-active-avatar'),
  btnDisconnect:    $('btn-disconnect'),
  contactGroup:     $('contact-group'),
  btnMinimize:      $('btn-minimize'),
  btnMaximize:      $('btn-maximize'),
  btnClose:         $('btn-close'),
  typingIndicator:  $('typing-indicator'),
  myDisplayName:    $('my-display-name'),
  myAvatarLetter:   $('my-avatar-letter'),
  roomCodeSidebar:  $('sidebar-room-code'),
  btnCopySidebar:   $('btn-copy-sidebar'),
};

// ─── Profile Management ──────────────────────────────────────────
function loadProfile() {
  const saved = localStorage.getItem('gc-profile');
  if (saved) {
    state.profile = JSON.parse(saved);
    updateProfileUI();
    showScreen('screen-setup');
    $('welcome-msg').textContent = `¡Hola de nuevo, ${state.profile.name}!`;
  } else {
    showScreen('screen-profile');
  }
}

function updateProfileUI() {
  if (!state.profile) return;
  DOM.myDisplayName.textContent = state.profile.name;
  DOM.myAvatarLetter.textContent = state.profile.name[0].toUpperCase();
}

function saveProfile(name) {
  const profile = {
    id: state.profile?.id || crypto.randomUUID(),
    name: name
  };
  localStorage.setItem('gc-profile', JSON.stringify(profile));
  state.profile = profile;
  updateProfileUI();
  showScreen('screen-setup');
  if (state.connected) {
    broadcast({ type: 'profile-update', profile: state.profile });
  }
}

function showScreen(screenId) {
  DOM.screenProfile.classList.toggle('active', screenId === 'screen-profile');
  DOM.screenSetup.classList.toggle('active', screenId === 'screen-setup');
  DOM.screenChat.classList.toggle('active', screenId === 'screen-chat');
}

DOM.btnSaveProfile.onclick = () => {
  const name = DOM.profileName.value.trim();
  if (name) saveProfile(name);
  else showToast('Ingresa un nombre', 'error');
};

// ─── Window Controls & Updates ──────────────────────────────────
DOM.btnMinimize.onclick = () => window.electronAPI.minimize();
DOM.btnMaximize.onclick = () => window.electronAPI.maximize();
DOM.btnClose.onclick    = () => window.electronAPI.close();

if (window.electronAPI.onUpdateAvailable) {
  window.electronAPI.onUpdateAvailable((ver) => showToast(`v${ver} disponible`, 'info'));
  window.electronAPI.onUpdateReady(() => {
    if (confirm("Actualización lista. ¿Reiniciar?")) window.electronAPI.restartApp();
  });
}

// ─── Crypto ─────────────────────────────────────────────────────
async function deriveKey(seed, salt = 'ghostchat-salt-v1') {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(seed), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(text, key) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0); combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(b64, key) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return new TextDecoder().decode(plaintext);
}

// ─── Peer Utilities ──────────────────────────────────────────────
const hostPeerId = code => 'gc-' + code.replace(/-/g, '').toLowerCase();

const PEERJS_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ],
    iceCandidatePoolSize: 10,
  }
};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const gen = () => Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${gen()}-${gen()}-${gen()}`;
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type} animate-pop`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── Tab Switching ──────────────────────────────────────────────
$('tab-host').onclick = () => {
  $('tab-host').classList.add('active'); $('tab-join').classList.remove('active');
  $('panel-host').classList.add('active'); $('panel-join').classList.remove('active');
};
$('tab-join').onclick = () => {
  $('tab-join').classList.add('active'); $('tab-host').classList.remove('active');
  $('panel-join').classList.add('active'); $('panel-host').classList.remove('active');
};

// ─── Setup ──────────────────────────────────────────────────────
DOM.btnCreate.addEventListener('click', async () => {
  const code = generateRoomCode();
  DOM.btnCreate.disabled = true;
  state.isHost = true;
  state.roomCode = code;
  state.groupKey = await deriveKey(code);
  initPeer(hostPeerId(code));
});

DOM.btnJoin.addEventListener('click', async () => {
  const code = DOM.joinCode.value.trim().toUpperCase();
  if (!code || code.length < 5) return showToast('Código inválido', 'error');
  DOM.btnJoin.disabled = true;
  state.isHost = false;
  state.roomCode = code;
  state.groupKey = await deriveKey(code);
  initPeer(null);
});

function initPeer(id) {
  state.peer = new Peer(id, PEERJS_CONFIG);
  state.peer.on('open', (myId) => {
    state.myPeerId = myId;
    if (state.isHost) {
      DOM.roomCodeValue.textContent = state.roomCode;
      DOM.roomCodeDisplay.classList.remove('hidden');
      enterChat();
    } else {
      const conn = state.peer.connect(hostPeerId(state.roomCode), { 
        metadata: { profile: state.profile },
        reliable: true
      });
      setupConnection(conn);
    }
  });
  state.peer.on('error', (err) => {
    DOM.btnJoin.disabled = false; DOM.btnCreate.disabled = false;
    showToast('Error de red', 'error');
  });
  state.peer.on('connection', (conn) => setupConnection(conn));
}

function setupConnection(conn) {
  conn.on('open', () => {
    conn.send({ type: 'handshake', profile: state.profile });
  });

  conn.on('data', async (data) => {
    const pId = conn.peer;

    if (data.type === 'handshake') {
      const profile = data.profile || { id: pId, name: 'Anónimo' };
      const existing = Object.entries(state.participants).find(([_, p]) => p.id === profile.id);
      if (existing) {
        existing[1].conn.close();
        delete state.participants[existing[0]];
      }
      const keySeed = [state.myPeerId, pId].sort().join('-') + state.roomCode;
      const pKey = await deriveKey(keySeed);
      state.participants[pId] = { ...profile, conn, privateKey: pKey, messages: [] };
      receiveMessage('group', 'system', `${profile.name} se unió`);
      updateParticipantsUI();
      if (state.isHost) broadcast({ type: 'peer-list', peers: [state.myPeerId, ...Object.keys(state.participants)] });
      if (!state.connected) enterChat();
    }

    if (data.type === 'peer-list') {
      data.peers.forEach(peerId => {
        if (peerId !== state.myPeerId && !state.participants[peerId]) {
          const newConn = state.peer.connect(peerId, { metadata: { profile: state.profile } });
          setupConnection(newConn);
        }
      });
    }

    if (data.type === 'typing') {
      const p = state.participants[pId];
      if (p) {
        if (data.isTyping) state.typingPeers.add(p.name);
        else state.typingPeers.delete(p.name);
        updateTypingUI();
      }
    }

    if (data.type === 'msg-group') {
      const text = await decrypt(data.payload, state.groupKey);
      receiveMessage('group', pId, text, data.replyTo, data.id);
    }

    if (data.type === 'msg-private') {
      const p = state.participants[pId];
      if (p) {
        const text = await decrypt(data.payload, p.privateKey);
        receiveMessage(pId, pId, text, data.replyTo, data.id);
      }
    }

    if (data.type === 'profile-update') {
      const p = state.participants[pId];
      if (p) {
        const oldName = p.name;
        p.name = data.profile.name;
        receiveMessage('group', 'system', `${oldName} -> ${p.name}`);
        updateParticipantsUI();
      }
    }
  });

  conn.on('close', () => {
    const p = state.participants[conn.peer];
    if (p) {
      receiveMessage('group', 'system', `${p.name} se fue`);
      if (state.activeChat === conn.peer) selectChat('group');
      delete state.participants[conn.peer];
      updateParticipantsUI();
    }
  });
}

function broadcast(data) {
  Object.values(state.participants).forEach(p => {
    if (p.conn && p.conn.open) p.conn.send(data);
  });
}

// ─── Chat Logic ─────────────────────────────────────────────────
function enterChat() {
  state.connected = true;
  showScreen('screen-chat');
  DOM.roomCodeSidebar.textContent = state.roomCode;
  DOM.btnCopySidebar.onclick = () => {
    navigator.clipboard.writeText(state.roomCode);
    showToast('Copiado', 'success');
  };
  DOM.msgInput.disabled = false;
  DOM.btnSend.disabled = false;
  DOM.msgInput.focus();
}

async function sendMessage() {
  const text = DOM.msgInput.value.trim();
  if (!text) return;
  const msgId = 'm-' + Date.now();
  const replyTo = state.replyingTo;

  if (state.activeChat === 'group') {
    const payload = await encrypt(text, state.groupKey);
    broadcast({ type: 'msg-group', payload, id: msgId, replyTo });
    receiveMessage('group', 'me', text, replyTo, msgId);
  } else {
    const p = state.participants[state.activeChat];
    if (p) {
      const payload = await encrypt(text, p.privateKey);
      p.conn.send({ type: 'msg-private', payload, id: msgId, replyTo });
      receiveMessage(state.activeChat, 'me', text, replyTo, msgId);
    }
  }
  DOM.msgInput.value = '';
  cancelReply();
}

function receiveMessage(chatId, senderId, text, replyTo, msgId) {
  const msgObj = { id: msgId, senderId, text, replyTo, timestamp: new Date() };
  if (chatId === 'group') state.groupMessages.push(msgObj);
  else if (state.participants[chatId]) state.participants[chatId].messages.push(msgObj);

  if (state.activeChat === chatId) {
    appendMessageUI(msgObj);
    DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
  } else if (senderId !== 'system' && senderId !== 'me') {
    showToast(`Nuevo mensaje de ${state.participants[senderId]?.name || 'Alguien'}`, 'info');
    updateParticipantsUI();
  }
}

function appendMessageUI(msg) {
  const el = document.createElement('div');
  if (msg.senderId === 'system') {
    el.className = 'msg-system animate-pop';
    el.textContent = msg.text;
  } else {
    const isMe = msg.senderId === 'me';
    const sender = isMe ? state.profile : state.participants[msg.senderId];
    el.className = `msg-wrapper ${isMe ? 'outgoing' : 'incoming'} animate-pop`;
    
    let replyHTML = '';
    if (msg.replyTo) {
      replyHTML = `<div class="msg-reply-container"><span class="msg-reply-user">${msg.replyTo.senderName}</span><p class="msg-reply-text">${msg.replyTo.text}</p></div>`;
    }

    const time = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const name = isMe ? 'Tú' : (sender?.name || 'Anónimo');

    el.innerHTML = `
      <div class="msg-bubble">
        ${!isMe && state.activeChat === 'group' ? `<span class="msg-sender-name" style="color:var(--purple-400);font-size:11px;font-weight:700;display:block;margin-bottom:4px">${name}</span>` : ''}
        ${replyHTML}
        <div class="msg-text">${msg.text}</div>
      </div>
      <span class="msg-meta">${time}</span>
    `;
    el.oncontextmenu = (e) => { e.preventDefault(); setReply(msg.id, name, msg.text); };
  }
  DOM.messagesContainer.appendChild(el);
}

function updateParticipantsUI() {
  DOM.participantCount.textContent = Object.keys(state.participants).length + 1;
  DOM.participantsList.innerHTML = '';
  Object.entries(state.participants).forEach(([id, p]) => {
    const el = document.createElement('div');
    el.className = `participant-item ${state.activeChat === id ? 'active' : ''}`;
    el.innerHTML = `<div class="participant-avatar">${p.name[0]}</div><div class="participant-info"><span class="participant-name">${p.name}</span><span class="participant-status">Online</span></div>`;
    el.onclick = () => selectChat(id);
    DOM.participantsList.appendChild(el);
  });
}

function selectChat(id) {
  state.activeChat = id;
  document.querySelectorAll('.participant-item, .chat-contact').forEach(el => el.classList.remove('active'));
  if (id === 'group') DOM.contactGroup.classList.add('active');
  
  if (id === 'group') {
    DOM.activeName.textContent = 'Chat del Grupo';
    DOM.activeStatus.textContent = 'Mensajes para todos';
    DOM.activeLetter.textContent = 'G';
    DOM.activeAvatar.classList.add('group-avatar');
    renderMessages(state.groupMessages);
  } else {
    const p = state.participants[id];
    DOM.activeName.textContent = p.name;
    DOM.activeStatus.textContent = 'Chat Privado';
    DOM.activeLetter.textContent = p.name[0];
    DOM.activeAvatar.classList.remove('group-avatar');
    renderMessages(p.messages);
  }
}

function renderMessages(messages) {
  DOM.messagesContainer.innerHTML = messages.length ? '' : '<div class="messages-start"><p>No hay mensajes</p></div>';
  messages.forEach(appendMessageUI);
  DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

function updateTypingUI() {
  const peers = Array.from(state.typingPeers);
  DOM.typingIndicator.textContent = peers.length ? `${peers.join(', ')} escribiendo...` : '';
  DOM.typingIndicator.classList.toggle('hidden', !peers.length);
}

function setReply(msgId, senderName, text) {
  state.replyingTo = { msgId, senderName, text };
  DOM.replyUser.textContent = `Respondiendo a ${senderName}`;
  DOM.replyText.textContent = text;
  DOM.replyPreview.classList.remove('hidden');
  DOM.msgInput.focus();
}

function cancelReply() {
  state.replyingTo = null;
  DOM.replyPreview.classList.add('hidden');
}

// ─── Events ─────────────────────────────────────────────────────
DOM.msgInput.addEventListener('input', () => {
  if (!state.connected) return;
  broadcast({ type: 'typing', isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => broadcast({ type: 'typing', isTyping: false }), 2000);
});

DOM.btnSend.onclick = sendMessage;
DOM.msgInput.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
DOM.btnDisconnect.onclick = () => location.reload();
DOM.btnCancelReply.onclick = cancelReply;
$('my-avatar').onclick = () => {
  const n = prompt("Nuevo nombre:", state.profile.name);
  if (n && n.trim()) saveProfile(n.trim());
};

// ─── Init ───────────────────────────────────────────────────────
loadProfile();

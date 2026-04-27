/* ============================================================
   GhostChat — Multi-user Mesh Chat with Private Sub-chats
   - PeerJS (WebRTC) Mesh Network
   - AES-256-GCM Encryption
   - Context Menu for Private Chats
   - Message Reply System
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

// ... inside DOM Refs ...
Object.assign(DOM, {
  // ... existing ...
  typingIndicator:  $('typing-indicator'),
  myDisplayName:    $('my-display-name'),
  myAvatarLetter:   $('my-avatar-letter'),
});

// ─── Profile Management ──────────────────────────────────────────
function loadProfile() {
  const saved = localStorage.getItem('gc-profile');
  if (saved) {
    state.profile = JSON.parse(saved);
    updateProfileUI();
    showScreen('screen-setup');
    $('welcome-msg').textContent = `¡Bienvenido, ${state.profile.name}!`;
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
  // If already connected, broadcast name change
  if (state.connected) {
    broadcast({ type: 'profile-update', profile: state.profile });
  }
}

// ─── Typing Indicator ───────────────────────────────────────────
let typingTimeout;
DOM.msgInput.addEventListener('input', () => {
  if (!state.connected) return;
  broadcast({ type: 'typing', isTyping: true });
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    broadcast({ type: 'typing', isTyping: false });
  }, 2000);
});

function broadcast(data) {
  Object.values(state.participants).forEach(p => {
    if (p.conn && p.conn.open) p.conn.send(data);
  });
}

// ─── Setup & Handshake ───────────────────────────────────────────
function setupConnection(conn) {
  conn.on('open', () => {
    conn.send({ type: 'handshake', profile: state.profile });
  });

  conn.on('data', async (data) => {
    const pId = conn.peer;

    if (data.type === 'handshake') {
      const profile = data.profile || { id: pId, name: 'Anónimo' };
      
      // Prevent duplicates by checking profile ID
      const existing = Object.entries(state.participants).find(([_, p]) => p.id === profile.id);
      if (existing) {
        // Clean up old connection if same user reconnects
        existing[1].conn.close();
        delete state.participants[existing[0]];
      }

      const keySeed = [state.myPeerId, pId].sort().join('-') + state.roomCode;
      const pKey = await deriveKey(keySeed);
      
      state.participants[pId] = { ...profile, conn, privateKey: pKey, messages: [] };
      receiveMessage('group', 'system', `${profile.name} se unió a la sala`);
      
      updateParticipantsUI();
      if (state.isHost) broadcastPeerList();
      if (!state.connected) enterChat();
    }

    if (data.type === 'typing') {
      const p = state.participants[pId];
      if (p) {
        if (data.isTyping) state.typingPeers.add(p.name);
        else state.typingPeers.delete(p.name);
        updateTypingUI();
      }
    }

    if (data.type === 'profile-update') {
      const p = state.participants[pId];
      if (p) {
        const oldName = p.name;
        p.name = data.profile.name;
        receiveMessage('group', 'system', `${oldName} ahora se llama ${p.name}`);
        updateParticipantsUI();
      }
    }
    // ... rest of msg types ...

// ─── DOM Refs ───────────────────────────────────────────────────
const DOM = {
  screenProfile:    $('screen-profile'),
  profileName:      $('profile-name'),
  btnSaveProfile:   $('btn-save-profile'),
  screenSetup:      $('screen-setup'),
  screenChat:       $('screen-chat'),
  // ... rest of DOM refs
};

// Update DOM refs initialization
Object.assign(DOM, {
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
});

// ─── Profile Management ──────────────────────────────────────────
function loadProfile() {
  const saved = localStorage.getItem('gc-profile');
  if (saved) {
    state.profile = JSON.parse(saved);
    showScreen('screen-setup');
    $('welcome-msg').textContent = `¡Hola de nuevo, ${state.profile.name}!`;
  } else {
    showScreen('screen-profile');
  }
}

function saveProfile(name) {
  const profile = {
    id: crypto.randomUUID(), // Unique persistent identity
    name: name
  };
  localStorage.setItem('gc-profile', JSON.stringify(profile));
  state.profile = profile;
  showScreen('screen-setup');
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

// Initialize
loadProfile();

// ─── Window Controls & Updates ──────────────────────────────────
DOM.btnMinimize.onclick = () => window.electronAPI.minimize();
DOM.btnMaximize.onclick = () => window.electronAPI.maximize();
DOM.btnClose.onclick    = () => window.electronAPI.close();

// Update Handlers
if (window.electronAPI.onUpdateMessage) {
  window.electronAPI.onUpdateMessage((msg) => console.log('Update:', msg));
  
  window.electronAPI.onUpdateAvailable((ver) => {
    showToast(`Nueva versión v${ver} disponible. Descargando...`, 'info');
  });

  window.electronAPI.onUpdateDownloading((percent) => {
    // Optional: show progress
    console.log(`Descargando actualización: ${percent}%`);
  });

  window.electronAPI.onUpdateReady(() => {
    const confirmUpdate = confirm("¡Actualización lista! ¿Quieres reiniciar GhostChat ahora para aplicar los cambios?");
    if (confirmUpdate) window.electronAPI.restartApp();
  });

  window.electronAPI.onUpdateError((err) => {
    console.error(err);
    showToast("Error al buscar actualización", "error");
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
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.anyfirewall.com:3478' },
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
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} animate-pop`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
  DOM.btnCreate.textContent = 'Iniciando...';
  state.isHost = true;
  state.roomCode = code;
  state.groupKey = await deriveKey(code);
  initPeer(hostPeerId(code));
});

DOM.btnJoin.addEventListener('click', async () => {
  const code = DOM.joinCode.value.trim().toUpperCase();
  if (!code || code.length < 5) return showToast('Código inválido', 'error');
  DOM.btnJoin.disabled = true;
  DOM.btnJoin.textContent = 'Conectando...';
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
    DOM.btnJoin.disabled = false; DOM.btnJoin.textContent = 'Conectarse';
    DOM.btnCreate.disabled = false; DOM.btnCreate.textContent = 'Generar Sala Privada';
    showToast('Error de red', 'error');
  });
  state.peer.on('connection', (conn) => setupConnection(conn));
}

function setupConnection(conn) {
  conn.on('open', () => {
    conn.send({ type: 'handshake', profile: state.profile });
  });

  conn.on('data', async (data) => {
    if (data.type === 'handshake') {
      const pId = conn.peer;
      const profile = data.profile || { id: pId, name: 'Anónimo' };
      const keySeed = [state.myPeerId, pId].sort().join('-') + state.roomCode;
      const pKey = await deriveKey(keySeed);
      state.participants[pId] = { ...profile, conn, privateKey: pKey, messages: [] };
      updateParticipantsUI();
      if (state.isHost) broadcastPeerList();
      if (!state.connected) enterChat();
    }
    // ... handling other types (msg-group, msg-private, peer-list)
    if (data.type === 'peer-list') {
      data.peers.forEach(peerId => {
        if (peerId !== state.myPeerId && !state.participants[peerId]) {
          const newConn = state.peer.connect(peerId, { metadata: { profile: state.profile } });
          setupConnection(newConn);
        }
      });
    }
    if (data.type === 'msg-group') {
      const text = await decrypt(data.payload, state.groupKey);
      receiveMessage('group', conn.peer, text, data.replyTo, data.id);
    }
    if (data.type === 'msg-private') {
      try {
        const pKey = state.participants[conn.peer].privateKey;
        const text = await decrypt(data.payload, pKey);
        receiveMessage(conn.peer, conn.peer, text, data.replyTo, data.id);
      } catch (e) { showToast("Error de cifrado", "error"); }
    }
  });

  conn.on('close', () => {
    const p = state.participants[conn.peer];
    if (p) {
      showToast(`${p.name} se desconectó`, 'error');
      // Presence Logic: Close private chat if open
      if (state.activeChat === conn.peer) {
        selectChat('group');
        showToast(`Chat privado cerrado: ${p.name} salió`, 'error');
      }
      delete state.participants[conn.peer];
      updateParticipantsUI();
    }
  });
}

function broadcastPeerList() {
  const ids = [state.myPeerId, ...Object.keys(state.participants)];
  Object.values(state.participants).forEach(p => {
    p.conn.send({ type: 'peer-list', peers: ids });
  });
}

// ─── Chat Logic ─────────────────────────────────────────────────
function enterChat() {
  state.connected = true;
  DOM.screenSetup.classList.remove('active');
  DOM.screenChat.classList.add('active');

  // Set sidebar room code
  $('sidebar-room-code').textContent = state.roomCode;
  $('btn-copy-sidebar').onclick = () => {
    navigator.clipboard.writeText(state.roomCode);
    showToast('Código copiado', 'success');
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
    Object.values(state.participants).forEach(p => {
      p.conn.send({ type: 'msg-group', payload, id: msgId, replyTo });
    });
    receiveMessage('group', 'me', text, replyTo, msgId);
  } else {
    const p = state.participants[state.activeChat];
    if (!p) return showToast("Usuario no encontrado", "error");
    const payload = await encrypt(text, p.privateKey);
    p.conn.send({ type: 'msg-private', payload, id: msgId, replyTo });
    receiveMessage(state.activeChat, 'me', text, replyTo, msgId);
  }

  DOM.msgInput.value = '';
  cancelReply();
}

function updateTypingUI() {
  const peers = Array.from(state.typingPeers);
  if (peers.length === 0) {
    DOM.typingIndicator.textContent = '';
    DOM.typingIndicator.classList.add('hidden');
  } else {
    const text = peers.length === 1 
      ? `${peers[0]} está escribiendo...` 
      : `${peers.slice(0, -1).join(', ')} y ${peers.slice(-1)} están escribiendo...`;
    DOM.typingIndicator.textContent = text;
    DOM.typingIndicator.classList.remove('hidden');
  }
}

function scrollToBottom() {
  DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

function receiveMessage(chatId, senderId, text, replyTo, msgId) {
  const msgObj = { id: msgId, senderId, text, replyTo, timestamp: new Date() };

  if (chatId === 'group') {
    state.groupMessages.push(msgObj);
  } else if (state.participants[chatId]) {
    state.participants[chatId].messages.push(msgObj);
  }

  if (state.activeChat === chatId) {
    appendMessageUI(msgObj);
    scrollToBottom();
  } else if (senderId !== 'system' && senderId !== 'me') {
    showToast(`Nuevo mensaje de ${state.participants[senderId]?.name || 'Alguien'}`, 'info');
    updateParticipantsUI();
  }
}

function appendMessageUI(msg) {
  if (msg.senderId === 'system') {
    const el = document.createElement('div');
    el.className = 'msg-system animate-pop';
    el.textContent = msg.text;
    DOM.messagesContainer.appendChild(el);
    return;
  }

  const isMe = msg.senderId === 'me';
  const sender = isMe ? state.profile : state.participants[msg.senderId];
  if (!sender && !isMe) return;

  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${isMe ? 'outgoing' : 'incoming'} animate-pop`;
  
  let replyHTML = '';
  if (msg.replyTo) {
    replyHTML = `
      <div class="msg-reply-container">
        <span class="msg-reply-user">${msg.replyTo.senderName}</span>
        <p class="msg-reply-text">${msg.replyTo.text}</p>
      </div>
    `;
  }

  const time = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const senderName = isMe ? 'Tú' : (sender?.name || 'Anónimo');

  wrapper.innerHTML = `
    <div class="msg-bubble" title="${msg.timestamp.toLocaleString()}">
      ${!isMe && state.activeChat === 'group' ? `<span class="msg-sender-name">${senderName}</span>` : ''}
      ${replyHTML}
      <div class="msg-text">${msg.text}</div>
    </div>
    <span class="msg-meta">${time}</span>
  `;

  // Right click to reply
  wrapper.oncontextmenu = (e) => {
    e.preventDefault();
    setReply(msgId, senderName, msg.text);
  };

  DOM.messagesContainer.appendChild(wrapper);
}

function renderMessages(messages) {
  DOM.messagesContainer.innerHTML = '';
  if (messages.length === 0) {
    DOM.messagesContainer.innerHTML = `
      <div class="messages-start">
        <p>No hay mensajes todavía. ¡Sé el primero en escribir!</p>
      </div>
    `;
    return;
  }
  messages.forEach(appendMessageUI);
  scrollToBottom();
}

function selectChat(id) {
  state.activeChat = id;
  
  // Highlight in sidebar
  document.querySelectorAll('.participant-item, .chat-contact').forEach(el => el.classList.remove('active'));
  if (id === 'group') DOM.contactGroup.classList.add('active');
  else {
    const el = document.querySelector(`.participant-item[data-id="${id}"]`);
    if (el) el.classList.add('active');
  }

  if (id === 'group') {
    DOM.activeName.textContent = 'Chat del Grupo';
    DOM.activeStatus.textContent = 'Mensajes para todos';
    DOM.activeLetter.textContent = 'G';
    DOM.activeAvatar.classList.add('group-avatar');
    renderMessages(state.groupMessages);
  } else {
    const p = state.participants[id];
    DOM.activeName.textContent = p.name;
    DOM.activeStatus.textContent = 'Chat Privado E2E';
    DOM.activeLetter.textContent = p.name[0];
    DOM.activeAvatar.classList.remove('group-avatar');
    renderMessages(p.messages);
  }
}

function updateParticipantsUI() {
  DOM.participantCount.textContent = Object.keys(state.participants).length + 1;
  DOM.participantsList.innerHTML = '';

  Object.entries(state.participants).forEach(([id, p]) => {
    const el = document.createElement('div');
    el.className = `participant-item ${state.activeChat === id ? 'active' : ''}`;
    el.setAttribute('data-id', id);
    el.innerHTML = `
      <div class="participant-avatar">${p.name[0]}</div>
      <div class="participant-info">
        <span class="participant-name">${p.name}</span>
        <span class="participant-status">P2P Conectado</span>
      </div>
    `;
    el.onclick = () => selectChat(id);
    el.oncontextmenu = (e) => {
      e.preventDefault();
      showContextMenu(e.pageX, e.pageY, id);
    };
    DOM.participantsList.appendChild(el);
  });
}

// ─── Replies ───────────────────────────────────────────────────
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

// ─── Auto-Update & Controls ──────────────────────────────────────
DOM.btnSend.onclick = sendMessage;
DOM.msgInput.onkeydown = (e) => { 
  if (e.key === 'Enter' && !e.shiftKey) { 
    e.preventDefault(); 
    sendMessage(); 
  } 
};
DOM.btnDisconnect.onclick = () => location.reload();
DOM.btnCancelReply.onclick = cancelReply;

if (window.electronAPI) {
  window.electronAPI.onUpdateAvailable((ver) => showToast(`v${ver} lista para instalar`, 'info'));
  window.electronAPI.onUpdateReady(() => {
    if (confirm("Actualización lista. ¿Reiniciar ahora?")) window.electronAPI.restartApp();
  });
}

// Edit Profile Button
$('my-avatar').onclick = () => {
  const newName = prompt("Cambiar nombre de usuario:", state.profile.name);
  if (newName && newName.trim()) saveProfile(newName.trim());
};

let socket;
let username = '';

// Add this variable to store online users
let onlineUsers = [];

const show = (id) => document.getElementById(id).style.display = 'block';
const hide = (id) => document.getElementById(id).style.display = 'none';

// Registration
document.getElementById('register-form').onsubmit = async (e) => {
  e.preventDefault();
  username = document.getElementById('reg-username').value;
  const password = document.getElementById('reg-password').value;
  const res = await fetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  document.getElementById('reg-msg').innerText = data.msg;
  if (res.ok) {
    location.reload();
  }
};

// Login
document.getElementById('login-form').onsubmit = async (e) => {
  e.preventDefault();
  username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  document.getElementById('login-msg').innerText = data.msg;
  if (res.ok) {
    location.reload();
  }
};

// Logout
document.getElementById('logout-btn').onclick = async () => {
  await fetch('/auth/logout', { method: 'POST' });
  location.reload();
};

// Chat options
document.getElementById('private-btn').onclick = () => {
  hide('chat-options');
  show('private-chat');
  fetchUsers();
};
document.getElementById('group-btn').onclick = () => {
  hide('chat-options');
  show('group-chat');
  socket.emit('new user', username);
};
document.getElementById('back-private').onclick = () => {
  hide('private-chat');
  show('chat-options');
};
document.getElementById('back-group').onclick = () => {
  hide('group-chat');
  show('chat-options');
  clearGroupChat();
};

let privateChats = {}; // { username: [msg1, msg2, ...] }
let currentPrivateUser = '';

// Fetch user list for private chat
async function fetchUsers() {
  const res = await fetch('/users', { credentials: 'include' });
  const users = await res.json();
  const userList = document.getElementById('user-list');
  userList.innerHTML = '';
  users.forEach(u => {
    const option = document.createElement('option');
    option.value = u;
    // Show green dot if user is online
    option.textContent = `${onlineUsers.includes(u) ? '🟢 ' : ''}${u}`;
    userList.appendChild(option);
  });
  // Set current user and show chat
  if (userList.options.length > 0) {
    currentPrivateUser = userList.options[0].value;
    loadPrivateHistory(currentPrivateUser);
  }
}

// Load private chat history
async function loadPrivateHistory(withUser) {
  const res = await fetch(`/private-history?user=${withUser}`, { credentials: 'include' });
  const messages = await res.json();
  privateChats[withUser] = messages.map(
    m => (m.from === username ? `Me: ${m.msg}` : `${m.from}: ${m.msg}`)
  );
  showPrivateChat(withUser);
}

// When user changes selection, load history for that user
document.getElementById('user-list').onchange = function() {
  currentPrivateUser = this.value;
  loadPrivateHistory(currentPrivateUser);
};

function showPrivateChat(user) {
  const ul = document.getElementById('private-messages');
  ul.innerHTML = '';
  (privateChats[user] || []).forEach((text, index) => {
    const li = document.createElement('li');
    const isMe = text.startsWith('Me:');
    let name = isMe ? username : user;
    let msg = text.replace(/^Me: |^[^:]+: /, '');
    const initial = name ? name[0].toUpperCase() : '?';
    const msgId = `private-${name}-${index}-${msg}`.replace(/\s+/g, '-');

    li.className = isMe ? 'me' : '';
    li.innerHTML = `
      ${!isMe ? `<div class="avatar">${initial}</div>` : ''}
      <div class="bubble">${msg}</div>
      <div class="reactions-row" id="reactions-${msgId}"></div>
      <button class="react-btn" data-msgid="${msgId}" title="React">😊</button>
      ${isMe ? `<div class="avatar">${initial}</div>` : ''}
    `;
    ul.appendChild(li);
  });

  scrollToBottom('private-messages');
}


// Private chat send
document.getElementById('private-form').onsubmit = (e) => {
  e.preventDefault();
  const to = document.getElementById('user-list').value;
  const msg = document.getElementById('private-input').value;
  if (!to || !msg) return;
  socket.emit('private message', { to, msg });
  document.getElementById('private-input').value = '';
};

// Group chat send
document.getElementById('group-form').onsubmit = (e) => {
  e.preventDefault();
  const msg = document.getElementById('group-input').value;
  if (!msg) return;
  socket.emit('chat message', { name: username, msg });
  document.getElementById('group-input').value = '';
  stopTyping();
};

// --- Typing Indicator for Group Chat ---
const groupInput = document.getElementById('group-input');
let groupTyping = false;
let groupTypingTimeout;

if (groupInput) {
  groupInput.addEventListener('input', () => {
    if (!groupTyping) {
      groupTyping = true;
      socket.emit('typing', { isPrivate: false });
    }
    clearTimeout(groupTypingTimeout);
    groupTypingTimeout = setTimeout(stopGroupTyping, 1000);
  });
}

function stopGroupTyping() {
  if (groupTyping) {
    groupTyping = false;
    socket.emit('stop typing', { isPrivate: false });
  }
}

// --- Typing Indicator for Private Chat ---
const privateInput = document.getElementById('private-input');
let privateTyping = false;
let privateTypingTimeout;

if (privateInput) {
  privateInput.addEventListener('input', () => {
    if (!privateTyping) {
      privateTyping = true;
      socket.emit('typing', { isPrivate: true, to: currentPrivateUser });
    }
    clearTimeout(privateTypingTimeout);
    privateTypingTimeout = setTimeout(stopPrivateTyping, 1000);
  });
}

function stopPrivateTyping() {
  if (privateTyping) {
    privateTyping = false;
    socket.emit('stop typing', { isPrivate: true, to: currentPrivateUser });
  }
}

// --- Show/Remove Typing Indicator ---
let typingDotInterval;

function showTyping(user) {
  const createTypingHTML = (id) => {
    let typingIndicator = document.getElementById(id);
    if (!typingIndicator) {
      typingIndicator = document.createElement('li');
      typingIndicator.id = id;
      typingIndicator.className = 'system';
      typingIndicator.innerHTML = `
        <span class="typing-text">${user} is typing</span>
        <span class="typing-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </span>
      `;
      return typingIndicator;
    }
    return typingIndicator;
  };

  // Group chat
  if (document.getElementById('group-chat').style.display !== 'none') {
    const ul = document.getElementById('group-messages');
    const typingIndicator = createTypingHTML('typing-indicator');
    if (!document.getElementById('typing-indicator')) ul.appendChild(typingIndicator);
    scrollToBottom('group-messages');
  }

  // Private chat
  if (document.getElementById('private-chat').style.display !== 'none') {
    const ul = document.getElementById('private-messages');
    const typingIndicator = createTypingHTML('private-typing-indicator');
    if (!document.getElementById('private-typing-indicator')) ul.appendChild(typingIndicator);
    scrollToBottom('private-messages');
  }
}



function removeTyping() {
  const typingIndicator = document.getElementById('typing-indicator');
  if (typingIndicator) typingIndicator.remove();
  scrollToBottom('group-messages');

  const privateTypingIndicator = document.getElementById('private-typing-indicator');
  if (privateTypingIndicator) privateTypingIndicator.remove();
  scrollToBottom('private-messages');
}



// Socket.io listeners
function setupSocket() {
  // Private message
  socket.on('private message', ({ from, msg }) => {
    if (currentPrivateUser) loadPrivateHistory(currentPrivateUser);
  });

  // Group chat history and messages
  socket.on('chat message', ({ name, msg, timestamp, createdAt }) => {
    addGroupMessage({ name, msg, timestamp, createdAt });
  });

  // Typing indicator
  socket.on('typing', (user) => showTyping(user));
  socket.on('stop typing', () => removeTyping());

  // Online users
  socket.on('online-users', (users) => {
    onlineUsers = users.filter(u => u !== username);
    // Refresh the dropdown to show green dots
    fetchUsers();
  });

  // Message reactions
  socket.on('message reaction', ({ msgId, reactions }) => {
  const reactionsSpan = document.getElementById(`reactions-${msgId}`);
  if (reactionsSpan) {
    reactionsSpan.innerHTML = Object.entries(reactions)
      .map(([emoji, users]) => `<span class="reaction-badge">${emoji} ${users.length}</span>`)
      .join('');
  }
});

}

let lastGroupMessageDate = null;

function addGroupMessage({ name, msg, timestamp, createdAt }) {
  const ul = document.getElementById('group-messages');
  const messageDateObj = createdAt ? new Date(createdAt) : new Date();
  const dateString = messageDateObj.toLocaleDateString();

  if (lastGroupMessageDate !== dateString) {
    const dateLi = document.createElement('li');
    dateLi.innerHTML = `<span class="bubble">${dateString}</span>`;
    dateLi.className = 'system';
    ul.appendChild(dateLi);
    lastGroupMessageDate = dateString;
  }

  // Use renderMessage for avatars and timestamp
  renderMessage({ name, msg, timestamp, createdAt });
}

function resetGroupMessageDate() {
  lastGroupMessageDate = null;
}

function clearGroupChat() {
  document.getElementById('group-messages').innerHTML = '';
  removeTyping();
}

// Typing indicator helpers
function showTyping(user) {
  const createTypingHTML = (id) => {
    let typingIndicator = document.getElementById(id);
    if (!typingIndicator) {
      typingIndicator = document.createElement('li');
      typingIndicator.id = id;
      typingIndicator.className = 'system';
      typingIndicator.innerHTML = `
        <span class="typing-text">${user} is typing</span>
        <span class="typing-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </span>
      `;
    }
    return typingIndicator;
  };

  // Group chat
  if (document.getElementById('group-chat').style.display !== 'none') {
    const ul = document.getElementById('group-messages');
    const typingIndicator = createTypingHTML('typing-indicator');
    if (!document.getElementById('typing-indicator')) ul.appendChild(typingIndicator);
    scrollToBottom('group-messages');
  }

  // Private chat
  if (document.getElementById('private-chat').style.display !== 'none') {
    const ul = document.getElementById('private-messages');
    const typingIndicator = createTypingHTML('private-typing-indicator');
    if (!document.getElementById('private-typing-indicator')) ul.appendChild(typingIndicator);
    scrollToBottom('private-messages');
  }
}


function removeTyping() {
  const typingIndicator = document.getElementById('typing-indicator');
  if (typingIndicator) typingIndicator.remove();
  scrollToBottom('group-messages');
  const privateTypingIndicator = document.getElementById('private-typing-indicator');
  if (privateTypingIndicator) privateTypingIndicator.remove();
  scrollToBottom('private-messages');
}

async function fetchCurrentUsername() {
  const res = await fetch('/auth/me', { credentials: 'include' });
  if (res.ok) {
    const data = await res.json();
    username = data.username;
  }
}

window.onload = async function() {
  document.getElementById('reg-username').value = '';
  document.getElementById('reg-password').value = '';
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';

  // 🔄 Add toggle between login/register forms
  document.getElementById("show-register").addEventListener("click", () => {
    document.getElementById("login-form").style.display = "none";
    document.getElementById("register-form").style.display = "flex";
  });

  document.getElementById("show-login").addEventListener("click", () => {
    document.getElementById("register-form").style.display = "none";
    document.getElementById("login-form").style.display = "flex";
  });

  // 🔒 Auth check
  const res = await fetch('/users', { credentials: 'include' });
  if (res.ok) {
    await fetchCurrentUsername();
    hide('auth-container');
    show('chat-options');
    socket = io();
    setupSocket();
  } else {
    show('auth-container');
    hide('chat-options');
    hide('private-chat');
    hide('group-chat');
  }

 // --- Emoji Picker Logic ---

  // Private Chat Emoji Picker
  const privateEmojiBtn = document.getElementById('private-emoji-btn');
  const privateEmojiPicker = document.getElementById('private-emoji-picker');
  const privateInput = document.getElementById('private-input');

  privateEmojiBtn.onclick = (e) => {
    e.preventDefault();
    privateEmojiPicker.style.display =
      privateEmojiPicker.style.display === 'none' ? 'block' : 'none';

    // Set positioning relative to parent container
    privateEmojiPicker.style.position = 'absolute';
    privateEmojiPicker.style.left = `${privateEmojiBtn.offsetLeft}px`;
    privateEmojiPicker.style.top = `${privateEmojiBtn.offsetTop + privateEmojiBtn.offsetHeight + 8}px`;
  };

  privateEmojiPicker.addEventListener('emoji-click', (event) => {
    privateInput.value += event.detail.unicode;
    privateEmojiPicker.style.display = 'none';
    privateInput.focus();
  });

  // Group Chat Emoji Picker
  const groupEmojiBtn = document.getElementById('group-emoji-btn');
  const groupEmojiPicker = document.getElementById('group-emoji-picker');
  const groupInput = document.getElementById('group-input');

  groupEmojiBtn.onclick = (e) => {
    e.preventDefault();
    groupEmojiPicker.style.display =
      groupEmojiPicker.style.display === 'none' ? 'block' : 'none';

    // Set positioning relative to parent container
    groupEmojiPicker.style.position = 'absolute';
    groupEmojiPicker.style.left = `${groupEmojiBtn.offsetLeft}px`;
    groupEmojiPicker.style.top = `${groupEmojiBtn.offsetTop + groupEmojiBtn.offsetHeight + 8}px`;
  };

  groupEmojiPicker.addEventListener('emoji-click', (event) => {
    groupInput.value += event.detail.unicode;
    groupEmojiPicker.style.display = 'none';
    groupInput.focus();
  });

  // --- Dark Mode Toggle ---
  const darkModeBtn = document.getElementById('dark-mode-toggle');
  darkModeBtn.onclick = () => {
    document.body.classList.toggle('dark-mode');
    // Optional: Change icon
    darkModeBtn.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
  };
  // Set correct icon on load
  if (document.body.classList.contains('dark-mode')) {
    darkModeBtn.textContent = '☀️';
  }
};

function renderMessage({ name, msg, timestamp, createdAt, reactions = {} }) {
  const ul = document.getElementById('group-messages');
  const li = document.createElement('li');
  const isMe = name === username;
  li.className = isMe ? 'me' : '';
  const initial = name ? name[0].toUpperCase() : '?';
  const msgId = `${name}-${timestamp}-${msg}`.replace(/\s+/g, '-');

  li.innerHTML = isMe
  ? `
    <div class="bubble">
      <strong>${name}</strong>: ${msg}
      <span class="timestamp">${timestamp}</span>
    </div>
    <div class="reactions-row" id="reactions-${msgId}">
      ${reactions && Object.entries(reactions).map(([emoji, users]) =>
        `<span class="reaction-badge">${emoji} ${users.length}</span>`
      ).join('')}
    </div>
    <button class="react-btn" data-msgid="${msgId}" title="React">😊</button>
    <div class="avatar">${initial}</div>
  `
  : `
    <div class="avatar">${initial}</div>
    <div class="bubble">
      <strong>${name}</strong>: ${msg}
      <span class="timestamp">${timestamp}</span>
    </div>
    <div class="reactions-row" id="reactions-${msgId}">
      ${reactions && Object.entries(reactions).map(([emoji, users]) =>
        `<span class="reaction-badge">${emoji} ${users.length}</span>`
      ).join('')}
    </div>
    <button class="react-btn" data-msgid="${msgId}" title="React">😊</button>
  `;
  ul.appendChild(li);
  ul.scrollTop = ul.scrollHeight;
}

// Listen for reaction button clicks
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('react-btn')) {
    const msgId = e.target.getAttribute('data-msgid');
    // Show a simple emoji picker (for demo, just 3 emojis)
    const emojis = ['👍', '❤️', '😂'];
    let picker = document.getElementById('reaction-picker');
    if (picker) picker.remove();
    picker = document.createElement('div');
    picker.id = 'reaction-picker';
    picker.style.position = 'absolute';
    picker.style.zIndex = 1000;
    picker.style.background = '#fff';
    picker.style.border = '1px solid #ccc';
    picker.style.borderRadius = '8px';
    picker.style.padding = '4px 8px';
    picker.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.textContent = emoji;
      btn.style.fontSize = '1.2em';
      btn.style.margin = '2px';
      btn.onclick = function(ev) {
        ev.stopPropagation();
        socket.emit('react message', { msgId, emoji });
        picker.remove();
      };
      picker.appendChild(btn);
    });
    document.body.appendChild(picker);
    // Position picker near the button
    const rect = e.target.getBoundingClientRect();
    picker.style.left = rect.left + 'px';
    picker.style.top = (rect.bottom + window.scrollY) + 'px';
    // Remove picker on click elsewhere
    document.addEventListener('click', function handler() {
      picker.remove();
      document.removeEventListener('click', handler);
    });
  }
});

function scrollToBottom(ulId) {
  const ul = document.getElementById(ulId);
  if (ul) ul.scrollTop = ul.scrollHeight;
}
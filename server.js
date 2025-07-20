require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const Message = require('./models/Message');
const User = require('./models/User');
const authRoutes = require('./routes/auth');
const path = require('path');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// Middleware
app.use(express.json());
app.use(express.static('public'));
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
});

app.use(sessionMiddleware);

// Auth routes
app.use('/auth', authRoutes);

// Get all users (for private chat selection)
app.get('/users', async (req, res) => {
  const current = req.session.username;
  if (!current) return res.status(401).json([]);
  const users = await User.find({}, 'username');
  res.json(users.map(u => u.username).filter(u => u !== current));
});

// Private chat history
app.get('/private-history', async (req, res) => {
  const user1 = req.session.username;
  const user2 = req.query.user;
  if (!user1 || !user2) return res.json([]);
  const messages = await Message.find({
    isPrivate: true,
    $or: [
      { from: user1, to: user2 },
      { from: user2, to: user1 }
    ]
  }).sort({ createdAt: 1 });
  res.json(messages);
});

// Serve index.html for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

console.log("All routes loaded!");

// --- SOCKET.IO LOGIC ---

const userSockets = {};
const onlineUsers = new Set();
const messageReactions = {}; // { msgId: { emoji: [user1, user2, ...] } }

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  // Set username from session
  const req = socket.request;
  const username = req.session?.username;
  if (username) {
    socket.username = username;
    userSockets[username] = socket.id;
    onlineUsers.add(username);
    io.emit('online-users', Array.from(onlineUsers));
    console.log('Emitted online users:', Array.from(onlineUsers));
  }

  // --- PRIVATE CHAT ---
  socket.on('private message', async ({ to, msg }) => {
    const from = socket.username || 'Anonymous';
    const timestamp = new Date().toLocaleTimeString();
    const newMessage = new Message({
      name: from,
      msg,
      timestamp,
      to,
      from,
      isPrivate: true
    });
    await newMessage.save();

    if (userSockets[to]) {
      io.to(userSockets[to]).emit('private message', { from, msg, timestamp, createdAt: newMessage.createdAt });
    }
    socket.emit('private message', { from, msg, timestamp, createdAt: newMessage.createdAt });
  });

  // --- GROUP CHAT (with history, typing, join/leave, etc.) ---
  socket.on('new user', async () => {
    // Do NOT overwrite socket.username here!
    const username = socket.username || "Anonymous";
    socket.data.username = username;

    let user = await User.findOne({ username });
    if (user) {
      // Only send group messages
      const messages = await Message.find({
        isPrivate: false,
        createdAt: { $gte: user.joinedAt }
      }).sort({ createdAt: 1 });
      messages.forEach(msg => {
        socket.emit('chat message', {
          name: msg.name,
          msg: msg.msg,
          timestamp: msg.timestamp,
          createdAt: msg.createdAt
        });
      });
    }

    socket.broadcast.emit('chat message', {
      name: 'System',
      msg: `🚪 ${username} joined the chat`,
      timestamp: new Date().toLocaleTimeString()
    });

    socket.emit('chat message', {
      name: 'System',
      msg: `You joined the chat`,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  socket.on('chat message', async (data) => {
    const msg = data.msg || '';
    const username = socket.username || 'Anonymous';
    const timestamp = new Date().toLocaleTimeString();

    // Only save as group message
    const newMessage = new Message({ name: username, msg, timestamp, isPrivate: false });
    await newMessage.save();

    io.emit('chat message', {
      name: username,
      msg,
      timestamp,
      createdAt: newMessage.createdAt
    });
  });

  // Typing indicator
  socket.on('typing', (data) => {
    if (data && data.isPrivate && data.to && userSockets[data.to]) {
      // Private chat typing
      io.to(userSockets[data.to]).emit('typing', socket.username);
    } else {
      // Group chat typing
      socket.broadcast.emit('typing', socket.username);
    }
  });

  socket.on('stop typing', (data) => {
    if (data && data.isPrivate && data.to && userSockets[data.to]) {
      io.to(userSockets[data.to]).emit('stop typing');
    } else {
      socket.broadcast.emit('stop typing');
    }
  });

  socket.on('react message', ({ msgId, emoji }) => {
    if (!messageReactions[msgId]) messageReactions[msgId] = {};
    if (!messageReactions[msgId][emoji]) messageReactions[msgId][emoji] = [];
    // Toggle reaction for this user
    const userList = messageReactions[msgId][emoji];
    const idx = userList.indexOf(socket.username);
    if (idx === -1) userList.push(socket.username);
    else userList.splice(idx, 1);
    io.emit('message reaction', { msgId, reactions: messageReactions[msgId] });
  });

  socket.on('disconnect', () => {
    const username = socket.data.username || socket.username;
    if (username) {
      io.emit('chat message', {
        name: 'System',
        msg: `❌ ${username} left the chat`,
        timestamp: new Date().toLocaleTimeString()
      });
      delete userSockets[username];
      onlineUsers.delete(username);
      io.emit('online-users', Array.from(onlineUsers));
    }
  });
});

http.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ msg: 'All fields required' });
  const existing = await User.findOne({ username });
  if (existing) return res.status(400).json({ msg: 'Username taken' });
  const hash = await bcrypt.hash(password, 10);
  await User.create({ username, password: hash, joinedAt: new Date() });
  res.status(201).json({ msg: 'User registered' });
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ msg: 'Invalid credentials' });
  req.session.userId = user._id;
  req.session.username = user.username;
  res.json({ msg: 'Logged in', username: user.username });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ msg: 'Logged out' });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.session.username) return res.status(401).json({ msg: 'Not logged in' });
  res.json({ username: req.session.username });
});

module.exports = router;
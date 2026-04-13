const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'linkly-secret-key-change-in-prod';

// JSON file database
const dbFile = 'linkly.json';
let db = { users: [], links: [], clicks: [] };

try {
  if (fs.existsSync(dbFile)) {
    db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  }
} catch (e) {}

const saveDb = () => fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
app.use(cors());
app.use(express.json());

// Serve landing page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing'));
});

// Serve static app at /dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'public')));

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Auth
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already exists' });
  
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  db.users.push({ id, email, password_hash: passwordHash, created_at: new Date().toISOString() });
  saveDb();
  
  const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id, email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email } });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.users.find(u => u.id === req.userId);
  res.json(user);
});

// Links
app.get('/api/links', authenticate, (req, res) => {
  const links = db.links.filter(l => l.user_id === req.userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(links);
});

app.post('/api/links', authenticate, (req, res) => {
  const { name, targetUrl } = req.body;
  if (!name || !targetUrl) return res.status(400).json({ error: 'Name and target URL required' });
  
  const shortCode = Math.random().toString(36).substring(2, 8);
  const link = { id: uuidv4(), user_id: req.userId, name, target_url: targetUrl, short_code: shortCode, click_count: 0, created_at: new Date().toISOString() };
  db.links.push(link);
  saveDb();
  res.json(link);
});

app.delete('/api/links/:id', authenticate, (req, res) => {
   const idx = db.links.findIndex(l => l.id === req.params.id && l.user_id === req.userId);
  if (idx === -1) return res.status(404).json({ error: 'Link not found' });
  db.links.splice(idx, 1);
  saveDb();
  res.json({ success: true });
});

// Tracking
app.get('/t/:shortCode', (req, res) => {
  const { shortCode } = req.params;
  const link = db.links.find(l => l.short_code === shortCode);
  if (!link) return res.redirect('/');
  
  link.click_count = (link.click_count || 0) + 1;
  db.clicks.push({ id: uuidv4(), link_id: link.id, timestamp: new Date().toISOString() });
    saveDb();
  
  res.redirect(link.target_url);
});

app.listen(PORT, () => {
  console.log('Linkly running on port ' + PORT);
});

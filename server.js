const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'database.json');

// Helper to read DB safely
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify([]));
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data) || [];
  } catch (e) {
    console.error("DB Read Error:", e);
    return [];
  }
}

// Helper to write DB safely
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("DB Write Error:", e);
  }
}

// Body parsing with size limit for base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static assets from project root
app.use(express.static(path.join(__dirname)));

// API Endpoints
app.get('/api/cards', (req, res) => {
  const cards = readDB();
  res.json(cards);
});

app.post('/api/cards', (req, res) => {
  const cards = readDB();
  const newCard = req.body;
  if (!newCard.id) {
    newCard.id = "card-" + Date.now();
  }
  cards.push(newCard);
  writeDB(cards);
  res.status(201).json(newCard);
});

app.put('/api/cards/:id', (req, res) => {
  const cards = readDB();
  const id = req.params.id;
  const idx = cards.findIndex(c => c.id === id);
  if (idx !== -1) {
    cards[idx] = { ...cards[idx], ...req.body };
    writeDB(cards);
    res.json(cards[idx]);
  } else {
    res.status(404).json({ error: "Card not found" });
  }
});

app.delete('/api/cards/:id', (req, res) => {
  const cards = readDB();
  const id = req.params.id;
  const filtered = cards.filter(c => c.id !== id);
  writeDB(filtered);
  res.json({ success: true });
});

// Route all other requests to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'database.json');
const CLOUD_SYNC_URL = 'https://kvdb.io/Y7zQ5t9G3vW2s8X1/cardscan-global-db';

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

// Pull and Merge from Cloud Database
async function pullFromCloud() {
  try {
    const response = await fetch(CLOUD_SYNC_URL);
    if (response.ok) {
      const cloudCards = await response.json();
      if (Array.isArray(cloudCards)) {
        const localCards = readDB();
        const mergedMap = new Map();
        
        // Add local cards first
        localCards.forEach(c => mergedMap.set(c.id, c));
        // Add/overwrite with cloud cards
        cloudCards.forEach(c => {
          // Preserve local high-res image if available
          const localCard = mergedMap.get(c.id);
          if (localCard && localCard.image && localCard.image.startsWith("data:image/") && localCard.image.length > 5000) {
            c.image = localCard.image;
          }
          mergedMap.set(c.id, c);
        });
        
        const finalCards = Array.from(mergedMap.values());
        fs.writeFileSync(DB_PATH, JSON.stringify(finalCards, null, 2));
      }
    }
  } catch (e) {
    console.error("Cloud pull failed:", e.message);
  }
}

// Initial Sync from Cloud on start
pullFromCloud();

// Helper to write DB safely and push to cloud
async function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    
    // Strip large base64 images from sync payload to avoid exceeding kvdb 64KB limits
    const syncPayload = data.map(card => {
      const cleanCard = { ...card };
      if (cleanCard.image && cleanCard.image.startsWith("data:image/") && cleanCard.image.length > 5000) {
        // Replace with a lightweight fallback SVG placeholder for cloud sync
        const cName = card.company || "Business Corp";
        const dName = card.dept || "Operations";
        cleanCard.image = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='350' height='200' viewBox='0 0 350 200'><rect width='100%' height='100%' fill='%231f2937'/><text x='50%25' y='40%25' fill='%23ffffff' font-family='sans-serif' font-size='20' font-weight='bold' text-anchor='middle'>${card.name || "Card"}</text><text x='50%25' y='58%25' fill='%2300f2fe' font-family='sans-serif' font-size='14' text-anchor='middle'>${cName}</text><text x='50%25' y='74%25' fill='%239ca3af' font-family='sans-serif' font-size='12' text-anchor='middle'>${dName}</text></svg>`;
      }
      return cleanCard;
    });

    fetch(CLOUD_SYNC_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(syncPayload)
    }).then(res => {
      if (!res.ok) console.error("Cloud push failed:", res.status);
    }).catch(err => {
      console.error("Cloud push error:", err.message);
    });
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
app.get('/api/cards', async (req, res) => {
  await pullFromCloud();
  const cards = readDB();
  res.json(cards);
});

app.post('/api/cards', (req, res) => {
  const cards = readDB();
  const newCard = req.body;
  if (!newCard.id) {
    newCard.id = "card-" + Date.now();
  }
  // Convert selected to boolean
  newCard.selected = newCard.selected !== false;
  
  // Update or insert
  const idx = cards.findIndex(c => c.id === newCard.id);
  if (idx !== -1) {
    cards[idx] = { ...cards[idx], ...newCard };
  } else {
    cards.push(newCard);
  }
  
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

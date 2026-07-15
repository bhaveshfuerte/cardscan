const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const app = express();
const PORT = process.env.PORT || 3000;

// Setup MongoDB connection string (falls back to local MongoDB community server)
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cardscan";
let db = null;
let cardsCollection = null;

async function initDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    cardsCollection = db.collection('cards');
    console.log("Connected successfully to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
  }
}
initDB();

// Body parsing with size limit for base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static assets from project root
app.use(express.static(path.join(__dirname)));

// Helper middleware to ensure DB is connected before requests
app.use((req, res, next) => {
  if (!cardsCollection) {
    res.status(503).json({ error: "Database not connected yet. Please try again." });
  } else {
    next();
  }
});

// API Endpoints
app.get('/api/cards', async (req, res) => {
  try {
    const cards = await cardsCollection.find({}).toArray();
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cards', async (req, res) => {
  try {
    const c = req.body;
    if (!c.id) {
      c.id = "card-" + Date.now();
    }
    // Update or insert
    await cardsCollection.updateOne(
      { id: c.id },
      { $set: c },
      { upsert: true }
    );
    res.status(201).json(c);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cards/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const c = req.body;
    
    // Remove _id from body if exists to avoid immutable field error
    delete c._id;
    
    const result = await cardsCollection.updateOne(
      { id: id },
      { $set: c }
    );
    
    if (result.matchedCount === 0) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json({ id, ...c });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cards/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await cardsCollection.deleteOne({ id: id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route all other requests to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

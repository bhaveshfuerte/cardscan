const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err);
  } else {
    console.log('Connected to SQLite database.');
    db.run(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        name TEXT,
        company TEXT,
        dept TEXT,
        email TEXT,
        mobile TEXT,
        work TEXT,
        website TEXT,
        linkedin TEXT,
        address TEXT,
        notes TEXT,
        image TEXT,
        selected INTEGER DEFAULT 1
      )
    `);
  }
});

// Body parsing with size limit for base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static assets from project root
app.use(express.static(path.join(__dirname)));

// API Endpoints
app.get('/api/cards', (req, res) => {
  db.all('SELECT * FROM cards', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    // Convert selected from 1/0 to boolean
    const cards = rows.map(r => ({ ...r, selected: !!r.selected }));
    res.json(cards);
  });
});

app.post('/api/cards', (req, res) => {
  const c = req.body;
  if (!c.id) {
    c.id = "card-" + Date.now();
  }
  const selectedVal = c.selected === false ? 0 : 1;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cards (id, name, company, dept, email, mobile, work, website, linkedin, address, notes, image, selected)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(c.id, c.name, c.company, c.dept, c.email, c.mobile, c.work, c.website, c.linkedin, c.address, c.notes, c.image, selectedVal, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({ ...c, selected: !!selectedVal });
  });
  stmt.finalize();
});

app.put('/api/cards/:id', (req, res) => {
  const id = req.params.id;
  const c = req.body;
  
  // Build dynamic update query based on provided fields
  const fields = [];
  const values = [];
  
  Object.keys(c).forEach(key => {
    if (key === 'id') return;
    fields.push(`${key} = ?`);
    if (key === 'selected') {
      values.push(c[key] ? 1 : 0);
    } else {
      values.push(c[key]);
    }
  });
  
  if (fields.length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  
  values.push(id);
  const sql = `UPDATE cards SET ${fields.join(', ')} WHERE id = ?`;
  
  db.run(sql, values, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json({ id, ...c });
  });
});

app.delete('/api/cards/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM cards WHERE id = ?', id, function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true });
  });
});

// Route all other requests to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

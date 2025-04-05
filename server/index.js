// ~/storybox-server/index.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static(path.resolve(__dirname, '../ui/dist')));

// Simple test route
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from backend!' });
});

// Catch-all for SPA
app.use((req, res) => {
  res.sendFile(path.resolve(__dirname, '../ui/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Storybox server running at http://localhost:${PORT}`);
});

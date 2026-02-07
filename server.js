const express = require('express');
const path = require('path');

const app = express();
const PORT = 5000;

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

app.use(express.static(path.join(__dirname)));

app.get('/messaging.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'messaging.html'));
});

app.get('/creators.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'creators.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

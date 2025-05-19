import express from 'express';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(path.resolve(__dirname, './public')));

app.get('/sans', (req, res) => {
  res.status(400 + Math.floor(Math.random() * 100)).end();
});

export default app;

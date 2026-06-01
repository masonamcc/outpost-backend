const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const HOST = '0.0.0.0'; // listen on all interfaces
const PORT = 3000;

app.use(cors({ origin: '*' })); // tighten this to your frontend's IP if needed
app.use(express.json());

// Run a command and stream output back
app.post('/run', (req, res) => {
  const { command, cwd } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'command is required' });
  }

  const [cmd, ...args] = command.split(' ');

  const proc = spawn(cmd, args, {
    cwd: cwd || process.cwd(),
    shell: true, // allows built-ins like cd, echo, etc.
  });

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');

  proc.stdout.on('data', (data) => res.write(data));
  proc.stderr.on('data', (data) => res.write(data));

  proc.on('close', (code) => {
    res.write(`\n[exit code: ${code}]`);
    res.end();
  });

  proc.on('error', (err) => {
    res.write(`\n[error: ${err.message}]`);
    res.end();
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

const express = require('express');
const {spawn} = require('child_process');
const cors = require('cors');
const fs = require('fs');
const {join} = require("node:path");
const YAML = require('yaml');

const app = express();
const HOST = '0.0.0.0';
const PORT = 2749;

app.use(cors({origin: ['http://localhost:2746', 'http://localhost:2748']}));
app.use(express.json());

function determineOS() {
    console.log('OS is', process.platform)
}

determineOS()

// Host app data is bind-mounted into the container at a fixed path so it
// survives the rackie containers being removed/recreated.
const DATA_DIR = process.env.RACKIE_DATA_DIR
    || (process.platform === 'win32' ? 'C:\\Program Files\\Rackie' : '/config');

const composePath = join(DATA_DIR, 'apps', 'docker-compose.yml');

console.log(composePath);

const isDocker =
    fs.existsSync('/.dockerenv') ||
    (fs.existsSync('/proc/1/cgroup') &&
        fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));

console.log(`Running ${isDocker ? 'inside Docker' : 'on host'}`);

app.get('/apps', (req, res) => {
    console.log('Getting installed apps.');

    const file = fs.readFileSync(composePath, 'utf8');

    const compose = YAML.parse(file);

    res.json(compose);
});

app.post('/run', (req, res) => {
    const {command, cwd} = req.body;

    if (!command) {
        return res.status(400).json({error: 'command is required'});
    }

    const proc = process.platform === "win32"
        ? spawn("powershell.exe", [
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-Command",
            command
        ], cwd ? {cwd} : undefined)
        : spawn("sh", ["-c", command], cwd ? {cwd} : undefined);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    proc.stdout.on('data', data => res.write(data));
    proc.stderr.on('data', data => res.write(data));

    proc.on('close', code => {
        res.write(`\n[exit code: ${code}]`);
        res.end();
    });

    proc.on('error', err => {
        res.write(`\n[error: ${err.message}]`);
        res.end();
    });
});

app.delete('/uninstall/:app', (req, res) => {
    console.log('Uninstall endpoint reached')

    const appName = req.params.app;

    console.log('Uninstalling ', appName)

    const compose = YAML.parse(
        fs.readFileSync(composePath, 'utf8')
    );

    if (!compose.services[appName]) {
        return res.status(404).json({
            error: 'Service not found'
        });
    }

    delete compose.services[appName];

    saveFile(compose)

    res.json({
        success: true
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        docker: isDocker
    });
});

app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
});

function saveFile(compose) {
    fs.writeFileSync(composePath, YAML.stringify(compose));
}
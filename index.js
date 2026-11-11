const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const fs = require('fs');
const {homedir} = require("node:os");
const {join} = require("node:path");
const YAML = require('yaml');
const { execSync } = require('child_process');

const app = express();
const HOST = '0.0.0.0';
const PORT = 4456;

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        try {
            const { port } = new URL(origin);
            callback(null, port === '4455');
        } catch {
            callback(null, false);
        }
    }
}));
app.use(express.json());

const userHome = execSync(
    "echo /home/$(who | awk 'NR==1{print $1}')"
)
    .toString()
    .trim();

// Detect if we're running inside Docker
const composePath = '/opt/rackie/apps/docker-compose.yml';

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

function runShell(command, cwd) {
    return new Promise((resolve, reject) => {
        const proc = isDocker
            ? spawn(
                'nsenter',
                ['--target', '1', '--mount', '--uts', '--net', '--pid', '--', 'sh', '-c', command],
                { cwd: cwd || '/' }
            )
            : spawn('sh', ['-c', command], { cwd: cwd || '/' });

        let output = '';
        proc.stdout.on('data', data => { output += data; });
        proc.stderr.on('data', data => { output += data; });

        proc.on('close', code => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`exit code ${code}: ${output}`));
            }
        });

        proc.on('error', reject);
    });
}

app.post('/run', (req, res) => {
    const { command, cwd } = req.body;

    console.log('/run has been hit')

    if (!command) {
        return res.status(400).json({ error: 'command is required' });
    }

    let proc;

    if (isDocker) {
        // Execute on the host from inside the container
        proc = spawn(
            'nsenter',
            [
                '--target', '1',
                '--mount',
                '--uts',
                '--net',
                '--pid',
                '--',
                'sh',
                '-c',
                command
            ],
            { cwd: cwd || '/' }
        );
    } else {
        // Execute directly on the host during development
        proc = spawn(
            'sh',
            ['-c', command],
            { cwd: cwd || '/' }
        );
    }

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

app.delete('/uninstall/:app', async (req, res) => {
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

    try {
        await runShell(`docker stop ${appName}; docker rm -f ${appName}`);
    } catch (err) {
        console.error(`Failed to remove container ${appName}:`, err.message);
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
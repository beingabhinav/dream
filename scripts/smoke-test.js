const http = require('http');
const app = require('../server');

function request(port, path, method = 'GET', body = null, token = '') {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : '';
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
            method,
            headers
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => {
                raw += chunk;
            });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: raw ? JSON.parse(raw) : {}
                });
            });
        });

        req.on('error', reject);
        req.end(data);
    });
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const server = app.listen(0, '127.0.0.1', async () => {
    try {
        const port = server.address().port;
        const uniqueEmail = `deploy-test-${Date.now()}@example.com`;
        const password = 'password123';

        const health = await request(port, '/api/health');
        assert(health.status === 200 && health.body.status === 'ok', 'Health check failed');

        const register = await request(port, '/api/register', 'POST', {
            name: 'Deploy Test',
            email: uniqueEmail,
            password
        });
        assert(register.status === 201, 'Registration failed');

        const login = await request(port, '/api/login', 'POST', {
            email: uniqueEmail,
            password
        });
        assert(login.status === 200 && login.body.token, 'Login failed');

        const dream = await request(port, '/api/dreams', 'POST', {
            description: 'I was flying over clear water',
            sleepQuality: 'good',
            sleepHours: 7,
            feelings: 'calm'
        }, login.body.token);
        assert(dream.status === 201 && dream.body.aiResponse, 'Dream submission failed');

        console.log('Smoke test passed');
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        server.close();
    }
});

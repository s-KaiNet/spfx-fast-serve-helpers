import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import path from 'node:path';
import type { HttpsCredentials } from '../server/index.js';

export function selfSignedCertificate(folder: string): HttpsCredentials {
  const key = path.join(folder, 'key.pem');
  const cert = path.join(folder, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], {
    stdio: 'ignore',
  });
  return { key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') };
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

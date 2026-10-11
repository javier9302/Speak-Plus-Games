// Works out the address phones should use to reach this server.
import os from 'node:os';

// IPv4 addresses of this computer on the local network, most likely Wi-Fi first.
export function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) found.push(a.address);
    }
  }
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return found.sort((a, b) => rank(a) - rank(b));
}

// { ok, base, urls }: `base` is what the QR code points to.
export function createNetwork(config, port) {
  return {
    current() {
      if (config.hosted) return { ok: true, base: config.publicUrl, urls: [config.publicUrl] };
      const urls = lanAddresses().map((ip) => `http://${ip}:${port}`);
      if (!urls.length) return { ok: false, base: `http://localhost:${port}`, urls: [] };
      return { ok: true, base: urls[0], urls };
    },
  };
}

export function isLoopback(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

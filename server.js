'use strict';

require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const ipaddr = require('ipaddr.js');
const crypto = require('node:crypto');
const path = require('node:path');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Render proxies the request before it reaches this app. Adjust this setting
// when using different infrastructure; never trust arbitrary client headers.
const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
if (Number.isInteger(proxyHops) && proxyHops >= 0 && proxyHops <= 5) {
  app.set('trust proxy', proxyHops);
} else {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

// Prototype storage: in-memory, intentionally capped, and cleared on restart.
// A persistent database and a written retention policy are needed for production.
const links = new Map();
const visits = [];
const MAX_VISITS = 500;
const MAX_LINKS = 1000;

function hasValidAdminKey(value) {
  const secret = process.env.ADMIN_KEY;
  if (!secret || secret.length < 24 || typeof value !== 'string') return false;
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_KEY || process.env.ADMIN_KEY.length < 24) {
    return res.status(503).json({
      error: 'ADMIN_KEY belum disetel. Atur environment variable dengan kunci minimal 24 karakter.'
    });
  }
  if (!hasValidAdminKey(req.get('x-admin-key'))) {
    return res.status(401).json({ error: 'Kunci admin salah.' });
  }
  next();
}

const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});
const createLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});
const consentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

function getClientIp(req) {
  return String(req.ip || '').replace(/^::ffff:/i, '');
}

function isPublicIp(value) {
  try {
    const parsed = ipaddr.process(value);
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

function getBaseUrl(req) {
  const configured = process.env.BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const protocol = req.secure ? 'https' : 'http';
  return `${protocol}://${req.get('host')}`;
}

function parseHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function publicLink(id, record, req) {
  return {
    id,
    url: `${getBaseUrl(req)}/go/${id}`,
    destination: record.targetUrl,
    destinationHost: new URL(record.targetUrl).host,
    createdAt: record.createdAt
  };
}

app.get('/api/status', (req, res) => {
  res.json({
    app: 'KRAI IP TRACKER',
    status: 'online',
    consentRequired: true,
    storage: 'temporary-memory',
    geolocation: 'approximate-ip-based'
  });
});

// Public link metadata is disclosed before consent, including destination host.
app.get('/api/link/:id', (req, res) => {
  const record = links.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Link Krai tidak ditemukan.' });
  res.json({
    id: req.params.id,
    destination: record.targetUrl,
    destinationHost: new URL(record.targetUrl).host
  });
});

app.post('/api/links', requireAdmin, adminLimiter, createLimiter, (req, res) => {
  const target = parseHttpUrl(req.body && req.body.targetUrl);
  if (!target) {
    return res.status(400).json({ error: 'Masukkan URL HTTP/HTTPS yang valid, tanpa username/password.' });
  }
  if (links.size >= MAX_LINKS) {
    return res.status(429).json({ error: 'Batas link sementara tercapai. Restart server akan menghapus data prototipe.' });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const record = {
    targetUrl: target.toString(),
    createdAt: new Date().toISOString()
  };
  links.set(id, record);
  res.status(201).json(publicLink(id, record, req));
});

app.get('/go/:id', (req, res) => {
  if (!links.has(req.params.id)) {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'not-found.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'visit.html'));
});

// This endpoint records IP only after the visitor actively accepts on visit.html.
app.post('/api/consent', consentLimiter, async (req, res) => {
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  const accepted = req.body?.accepted === true;
  const link = links.get(id);
  if (!link) return res.status(404).json({ error: 'Link tidak ditemukan atau server baru saja restart.' });

  if (!accepted) {
    return res.json({ recorded: false, redirectTo: link.targetUrl });
  }

  const ip = getClientIp(req);
  let geo = {
    city: null,
    region: null,
    country: null,
    latitude: null,
    longitude: null,
    geoProvider: null
  };

  // No API key is required by this provider. The IP is sent to it for lookup,
  // which is disclosed on the visitor consent screen.
  if (isPublicIp(ip)) {
    try {
      const response = await fetch(
        `https://ipwho.is/${encodeURIComponent(ip)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success === true) {
          const lat = Number(data.latitude);
          const lon = Number(data.longitude);
          geo = {
            city: typeof data.city === 'string' ? data.city : null,
            region: typeof data.region === 'string' ? data.region : null,
            country: typeof data.country === 'string' ? data.country : null,
            latitude: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
            longitude: Number.isFinite(lon) && lon >= -180 && lon <= 180 ? lon : null,
            geoProvider: 'ipwho.is'
          };
        }
      }
    } catch (error) {
      // Preserve the user-approved IP record if geolocation times out.
      console.warn('IP geolocation unavailable:', error.message);
    }
  }

  const record = {
    visitId: crypto.randomUUID(),
    linkId: id,
    ip,
    ...geo,
    consentedAt: new Date().toISOString(),
    targetHost: new URL(link.targetUrl).host
  };
  visits.push(record);
  if (visits.length > MAX_VISITS) visits.shift();

  res.json({ recorded: true, redirectTo: link.targetUrl });
});

app.get('/api/admin/visits', requireAdmin, adminLimiter, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ visits: [...visits].reverse(), total: visits.length });
});

app.get('/api/admin/links', requireAdmin, adminLimiter, (req, res) => {
  const result = [...links.entries()].reverse().map(([id, record]) => publicLink(id, record, req));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ links: result });
});

app.delete('/api/admin/visits', requireAdmin, adminLimiter, (req, res) => {
  visits.length = 0;
  res.json({ success: true, total: 0 });
});

app.delete('/api/admin/links/:id', requireAdmin, adminLimiter, (req, res) => {
  const deleted = links.delete(req.params.id);
  res.json({ success: deleted });
});

app.use((err, req, res, next) => {
  console.error('Unhandled app error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Terjadi kesalahan server.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KRAI IP TRACKER listening on port ${PORT}`);
  if (!process.env.ADMIN_KEY || process.env.ADMIN_KEY.length < 24) {
    console.warn('ADMIN_KEY belum diatur atau kurang dari 24 karakter. API admin dinonaktifkan.');
  }
});

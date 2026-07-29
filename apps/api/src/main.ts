import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';

process.env.TZ = process.env.TZ || 'Asia/Tashkent';

const WEAK_JWT_SECRETS = new Set([
  'klinikpi_secret',
  'klinikpi_jwt_super_secret_change_in_prod_2026',
  'changeme',
  'secret',
]);

const isProd = process.env.NODE_ENV === 'production';

function assertEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(`FATAL: Missing env: ${missing.join(', ')}`);
    process.exit(1);
  }

  const secret = process.env.JWT_SECRET!.trim();
  const weak = WEAK_JWT_SECRETS.has(secret) || secret.length < 32;
  if (weak) {
    const msg = 'JWT_SECRET must be ≥32 chars and not a known default';
    if (isProd) {
      console.error(`FATAL: ${msg}`);
      process.exit(1);
    }
    console.warn(`WARNING: ${msg}`);
  }

  if (isProd && !process.env.CORS_ORIGIN?.trim()) {
    console.error('FATAL: CORS_ORIGIN required in production');
    process.exit(1);
  }

  if (isProd && process.env.SEED_WIPE === 'true') {
    console.error('FATAL: SEED_WIPE=true is forbidden in production');
    process.exit(1);
  }
}

function corsOriginDelegate(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean | string) => void,
) {
  const configured = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!origin) return cb(null, true);
  if (configured.includes('*') || configured.includes(origin)) return cb(null, origin);

  // Dev/LAN only — production must use explicit CORS_ORIGIN
  if (!isProd) {
    if (
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
      /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin) ||
      /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin) ||
      /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)
    ) {
      return cb(null, origin);
    }
  }

  return cb(new Error(`CORS blocked: ${origin}`), false);
}

/** Global rate limit — authenticated browsing needs headroom for proof thumbs */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = Number(process.env.API_RATE_LIMIT || 400);
const RATE_WINDOW_MS = 60_000;

function globalRateLimit(req: any, res: any, next: () => void) {
  const path = String(req.originalUrl || req.url || req.path || '');
  if (path.includes('/api/health') || path.includes('/health')) return next();
  // Proof file bytes — cached client-side; don't burn the shared budget as hard
  const isProofGet =
    req.method === 'GET' && /\/api\/manager-kpi\/proofs\//.test(path);
  const weight = isProofGet ? 0.25 : 1;

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown';
  const now = Date.now();
  const row = rateBuckets.get(ip);
  if (!row || row.resetAt < now) {
    rateBuckets.set(ip, { count: weight, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  row.count += weight;
  if (row.count > RATE_LIMIT) {
    res.setHeader('Retry-After', '30');
    res.status(429).json({ message: 'Juda koʻp soʻrov. Biroz kuting.' });
    return;
  }
  next();
}

async function bootstrap() {
  assertEnv();
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: isProd ? ['error', 'warn', 'log'] : undefined,
  });

  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.enableCors({ origin: corsOriginDelegate, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: isProd,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use(globalRateLimit);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port, '0.0.0.0');
  logger.log(`KliniKPI API on :${port} (TZ=${process.env.TZ}, env=${process.env.NODE_ENV || 'development'})`);

  const shutdown = async (signal: string) => {
    logger.warn(`${signal} — shutting down...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();

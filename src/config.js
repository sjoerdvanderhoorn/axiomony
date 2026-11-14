function numericEnv(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid value for ${name}`);
  }
  return value;
}

export const config = Object.freeze({
  host: process.env.PGHOST || 'host.docker.internal',
  dbPort: numericEnv('PGPORT', 5432, 1, 65535),
  database: process.env.PGDATABASE || '',
  ssl: process.env.PGSSL === 'true'
    ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
  port: numericEnv('PORT', 3000, 1, 65535),
  allowedHosts: (process.env.MCP_ALLOWED_HOSTS || 'localhost,127.0.0.1')
    .split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
  maxBodyBytes: numericEnv('MAX_BODY_BYTES', 524288, 1024, 10485760),
  planTtlMs: numericEnv('PLAN_TTL_MINUTES', 20, 1, 120) * 60000,
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5-mini',
  appHostingEnabled: process.env.APP_HOSTING_ENABLED === 'true',
  appHostingDir: process.env.APP_HOSTING_DIR || '/srv/user-sites',
  appPublicUrl: process.env.APP_PUBLIC_URL || 'http://localhost:8088',
  appMaxFileBytes: numericEnv('APP_MAX_FILE_BYTES', 1048576, 1024, 5242880),
  restEnabled: process.env.REST_ENABLED === 'true',
  restMcpToolsEnabled: process.env.REST_MCP_TOOLS === 'true',
  restPublicUrl: process.env.REST_PUBLIC_URL || 'http://localhost:3001',
  restTokenUrl: process.env.REST_TOKEN_URL || 'http://localhost:3000/auth/token',
  restSchemas: (process.env.REST_EXPOSED_SCHEMAS || 'public').split(',').map(v => v.trim()).filter(Boolean),
  restJwtSecretFile: process.env.REST_JWT_SECRET_FILE || '',
  authAllowedOrigins: (process.env.AUTH_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(v => v.trim()).filter(Boolean)
});

if (!config.database) {
  throw new Error('PGDATABASE is required. No database username or password is needed in environment variables.');
}

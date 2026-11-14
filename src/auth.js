export function readBasicAuth(value) {
  if (!value || !/^Basic\s+/i.test(value)) return null;
  const part = value.replace(/^Basic\s+/i, '').trim();
  if (!part || !/^[a-zA-Z0-9+/]+={0,2}$/.test(part)) return null;
  let text;
  try {
    text = Buffer.from(part, 'base64').toString('utf8');
  } catch { return null; }
  const index = text.indexOf(':');
  if (index < 1 || index === text.length - 1) return null;
  return { username: text.slice(0, index), password: text.slice(index + 1) };
}

export function allowedOrigin(hostHeader, originHeader, allowedHosts) {
  let host;
  try { host = new URL(`http://${hostHeader}`).hostname.toLowerCase(); }
  catch { return false; }
  if (!allowedHosts.includes(host)) return false;
  if (!originHeader) return true; // Non-browser MCP clients usually omit Origin.
  try {
    const origin = new URL(originHeader);
    return ['http:', 'https:'].includes(origin.protocol) && allowedHosts.includes(origin.hostname.toLowerCase());
  } catch { return false; }
}

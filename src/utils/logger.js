const formatMeta = (meta = {}) => {
  const entries = Object.entries(meta).filter(([, value]) => typeof value !== 'undefined' && value !== null && value !== '');

  if (entries.length === 0) {
    return '';
  }

  return ` ${JSON.stringify(Object.fromEntries(entries))}`;
};

const writeLog = (level, message, meta) => {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${level.toUpperCase()} ${message}${formatMeta(meta)}`;

  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
};

module.exports = {
  info: (message, meta) => writeLog('info', message, meta),
  warn: (message, meta) => writeLog('warn', message, meta),
  error: (message, meta) => writeLog('error', message, meta)
};

// One JSON object per line on stdout, so any log shipper can parse it. No dependency needed.
type Fields = Record<string, unknown>;
const write = (level: string, msg: string, f?: Fields) => console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...f }));
export const log = { info: (m: string, f?: Fields) => write("info", m, f), warn: (m: string, f?: Fields) => write("warn", m, f), error: (m: string, f?: Fields) => write("error", m, f) };

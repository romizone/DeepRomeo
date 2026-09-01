export const PRIMARY_HOST = "openromeo.rominur.com";
export const ALIAS_HOST = "deepromeo.rominur.com";
export const APP_HOSTS = [PRIMARY_HOST, ALIAS_HOST];

export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || `https://${PRIMARY_HOST}`;
}

export function isAppHost(host: string | null) {
  if (!host) return false;
  const h = host.split(":")[0];
  return APP_HOSTS.includes(h) || h === "localhost" || h === "127.0.0.1";
}

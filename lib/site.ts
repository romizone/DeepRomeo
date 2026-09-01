export const PRIMARY_HOST = "openromeo.rominur.com";
export const ALIAS_HOST = "deepromeo.rominur.com";
export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || `https://${PRIMARY_HOST}`;
}

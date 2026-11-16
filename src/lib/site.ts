/** Public origin without a trailing slash, e.g. https://benchdesk.net */
export const SITE_URL = (process.env.SITE_URL ?? "https://benchdesk.net").replace(/\/+$/, "");

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
/** For raw fetch()/window paths that bypass next/link. */
export const withBase = (p: string) => `${BASE_PATH}${p}`;
export const APP_NAME = "Meridian ERP";

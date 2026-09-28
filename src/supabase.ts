/**
 * Forwarding legacy supabase.ts imports to Turso client (src/turso.ts)
 * Eliminates all Supabase dependencies and redirects to Turso SQLite Cloud
 */
export * from './turso.ts';

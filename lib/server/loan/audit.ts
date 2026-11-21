import 'server-only';
// Optional evidence observer for CLI verification. Never used for authorization or recovery.
let observer: ((label: string, hash: string) => void) | undefined;
export function observeTransactions(fn: (label: string, hash: string) => void) { observer = fn; }
export function observed(label: string, hash: string) { observer?.(label, hash); }

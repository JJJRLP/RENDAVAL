import { handle } from '@/lib/server/loan/route';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const GET = (request: Request) => handle(request, 'state');

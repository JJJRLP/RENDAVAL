import { handle } from '@/lib/server/loan/route';
export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = (request: Request) => handle(request, 'collect/submit');

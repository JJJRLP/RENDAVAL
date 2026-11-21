import { handle } from '@/lib/server/loan/route';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const POST = (request: Request) => handle(request, 'price');

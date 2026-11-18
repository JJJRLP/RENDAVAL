import { handle } from '@/lib/server/route';
export const runtime = 'nodejs';
export const POST = (request: Request) => handle(request, 'start');

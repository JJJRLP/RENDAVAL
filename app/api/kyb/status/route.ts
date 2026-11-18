import { handle } from '@/lib/server/route';
export const runtime = 'nodejs';
export const GET = (request: Request) => handle(request, 'status');

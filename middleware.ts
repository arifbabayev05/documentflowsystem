import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Hələlik Firebase client-side auth istifadə etdiyimiz üçün 
    // middleware-i sadələşdiririk. Gələcəkdə session-cookie ilə gücləndirəcəyik.
    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|public).*)"],
};
import { NextResponse } from 'next/server';
import { API_ENDPOINTS } from '@/config/api';

export async function POST(req: Request) {
    try {
        const { fin, sv } = await req.json();

        if (!fin || !sv) {
            return NextResponse.json({ error: "FİN və Seriya nömrəsi daxil edilməlidir" }, { status: 400 });
        }

        const response = await fetch(API_ENDPOINTS.scrape, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fin, sv }),
            signal: AbortSignal.timeout(100000), // 100s — function itself has 90s timeout
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return NextResponse.json(
                { error: data.error || data.message || "Xidmət cavab vermir." },
                { status: response.status }
            );
        }

        return NextResponse.json(data);

    } catch (error: any) {
        if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
            return NextResponse.json({ error: "Sorğu vaxtı bitdi. Zəhmət olmasa yenidən cəhd edin." }, { status: 504 });
        }
        console.error("Scrape route error:", error);
        return NextResponse.json({ error: "Sistem xətası: " + error.message }, { status: 500 });
    }
}

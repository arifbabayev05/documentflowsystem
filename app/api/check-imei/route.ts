import { NextResponse } from 'next/server';
import { API_ENDPOINTS } from '@/config/api';

export async function POST(req: Request) {
    try {
        const { imei } = await req.json();

        if (!imei) {
            return NextResponse.json({ error: "IMEI daxil edilməlidir" }, { status: 400 });
        }

        const response = await fetch(API_ENDPOINTS.checkImei, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imei }),
            signal: AbortSignal.timeout(25000), // 25s — function itself has 20s timeout
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return NextResponse.json(
                { error: data.error || data.message || "IMEI xidməti cavab vermir." },
                { status: response.status }
            );
        }

        // Expected: { imeiFee: boolean, message: string }
        return NextResponse.json(data);

    } catch (error: any) {
        if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
            return NextResponse.json({ error: "IMEI sorğusu vaxtı bitdi. Zəhmət olmasa yenidən cəhd edin." }, { status: 504 });
        }
        console.error("IMEI check route error:", error);
        return NextResponse.json({ error: "Sistem xətası: " + error.message }, { status: 500 });
    }
}

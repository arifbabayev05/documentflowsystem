import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import axios from 'axios';

export async function POST(req: Request) {
    try {
        const { fin, sv } = await req.json();

        if (!fin || !sv) {
            return NextResponse.json({ error: "FİN və Seriya nömrəsi daxil edilməlidir" }, { status: 400 });
        }

        // 1. EXE-ni başlat
        // Qeyd: Bu yalnız yerəl (local) mühitdə və Windows-da işləyəcək
        try {
            exec('C:\\social-bot\\e-social-bot.exe', (error) => {
                if (error) {
                    console.error("EXE başlatma xətası:", error);
                }
            });
        } catch (execErr: any) {
            console.warn("EXE başlatıla bilmədi (ola bilsin artıq açıqdır):", execErr.message);
        }

        // 2. Bir neçə saniyə gözləyin ki, server ayağa qalxsın
        await new Promise(r => setTimeout(r, 2000));

        // 3. API sorğusunu göndər və datanı al
        // Bot yerli 3000 portunda işləyir (Və ya botun konfiqurasiyasına uyğun port)
        try {
            const response = await axios.post('http://127.0.0.1:3000/api/scrape', {
                fin: fin,
                sv: sv
            }, {
                timeout: 60000 // 60 saniyə gözləmə
            });

            if (response.data.success) {
                console.log("Bot-dan gələn data:", response.data.data);

                const botData = response.data.data;

                // Məlumatları təmizləyib və formatlayıb geri qaytarırıq
                const mapped = {
                    fullName: botData.fullName?.toUpperCase() || "",
                    gender: botData.gender || "",
                    birthDate: botData.birthDate || "",
                    address: botData.address || "",
                    actualAddress: botData.actualAddress || "",
                    passportSeries: botData.passportSeries || sv.toUpperCase(),
                    passportNumber: botData.passportNumber || "",
                    issueDate: botData.issueDate || "",
                    authority: botData.authority || ""
                };

                return NextResponse.json({ data: mapped });
            } else {
                return NextResponse.json({ error: response.data.message || "Məlumat tapılmadı." }, { status: 404 });
            }
        } catch (apiErr: any) {
            console.error("Sessiya Xətası:", apiErr.message);
            return NextResponse.json({
                error: "ƏMAS-a sadəcə daxil olub, yenidən məlumatları gətirməyə cəhd edin",
                details: apiErr.message
            }, { status: 401 });
        }

    } catch (error: any) {
        console.error("Scraping route error:", error);
        return NextResponse.json({ error: "Sistem xətası: " + error.message }, { status: 500 });
    }
}

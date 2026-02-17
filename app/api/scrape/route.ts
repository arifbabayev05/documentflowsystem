import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

// Global variable to track if a launch is already in progress to avoid double-launch collisions
let isLaunching = false;

export async function POST(req: Request) {
    if (isLaunching) {
        return NextResponse.json({ error: "Brauzer hazırda başladılır, zəhmət olmasa bir neçə saniyə gözləyin." }, { status: 429 });
    }

    let browser;
    let page;
    try {
        let { fin, sv } = await req.json();

        if (!fin || !sv) {
            return NextResponse.json({ error: "FİN və Seriya nömrəsi daxil edilməlidir" }, { status: 400 });
        }

        // Clean SV: if starts with AZE, remove AZE and keep only digits. 
        // If AA or other series, keep the whole thing.
        if (sv.toUpperCase().startsWith("AZE")) {
            sv = sv.toUpperCase().replace("AZE", "").trim();
        }

        // 1. Try to connect to an existing Chrome instance first (most user-friendly as it shares login)
        try {
            browser = await puppeteer.connect({
                browserURL: 'http://127.0.0.1:9222',
                defaultViewport: null
            });
        } catch (e) {
            // 2. If not found, launch a new one
            isLaunching = true;
            try {
                browser = await puppeteer.launch({
                    headless: false,
                    defaultViewport: null,
                    args: [
                        '--start-maximized',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        // This port helps subsequent requests to 'connect' instead of 'launch'
                        '--remote-debugging-port=9222'
                    ],
                    // We avoid fixed userDataDir if it's prone to locking, or we handle the lock error.
                    // For now, let's use a slightly different dir to avoid collision with manual Chrome
                    userDataDir: './user_data_legal_bot'
                });
            } catch (launchError: any) {
                isLaunching = false;
                if (launchError.message.includes('already running')) {
                    return NextResponse.json({
                        error: "Brauzer artıq açıqdır. Zəhmət olmasa digər bot pəncərəsini bağlayın."
                    }, { status: 500 });
                }
                throw launchError;
            } finally {
                isLaunching = false;
            }
        }

        // Handle "about:blank" by reusing the initial page if possible
        const pages = await browser.pages();
        page = pages.length > 0 ? pages[0] : await browser.newPage();

        const url = "https://eroom.e-social.gov.az/runApp?doc=project.AppEmploymentContractOnline&type=1&menu=AppEmploymentContractOnline_1";

        // Go to URL and wait
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // 3. ENHANCED LOGIN HANDLING
        if (page.url().includes('mygovid.gov.az') || page.url().includes('auth') || page.url().includes('login')) {
            return NextResponse.json({
                error: "LOGIN_REQUIRED",
                message: "Aşağıda açılan Google pəncərəsindən ƏMAS'a daxil olun və daha sonra Məlumatları Gətirmək üçün butona yenidən klik edin."
            }, { status: 401 });
        }

        // Modalları təmizləmək
        const clearModals = async () => {
            await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('*'));
                const modalElements = elements.filter(el => {
                    const text = ((el as HTMLElement).innerText || "").trim();
                    return text === "Bağla" || (text.includes("Bağla") && text.length < 15);
                });

                modalElements.forEach(el => {
                    let parent = el.parentElement;
                    let foundContainer = false;
                    for (let i = 0; i < 7; i++) {
                        if (parent && (parent.className.includes('modal') || parent.className.includes('popup') || parent.className.includes('dialog') || parent.className.includes('window'))) {
                            parent.remove();
                            foundContainer = true;
                            break;
                        }
                        if (parent) parent = parent.parentElement;
                    }
                    if (!foundContainer && el) (el as HTMLElement).remove();
                });

                const overlays = document.querySelectorAll('.modal-backdrop, .overlay, .mask, .ui-widget-overlay');
                overlays.forEach(o => (o as HTMLElement).remove());
                (document.body as HTMLElement).style.overflow = 'auto';
                (document.documentElement as HTMLElement).style.overflow = 'auto';
            });
        };

        await clearModals();
        await new Promise(r => setTimeout(r, 1000));

        // İlk sətiri seçmək
        await page.evaluate(() => {
            const row = document.querySelector('table tbody tr');
            if (row) {
                (row as HTMLElement).click();
                row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            }
        });

        await new Promise(r => setTimeout(r, 2000));
        await clearModals();
        await new Promise(r => setTimeout(r, 1000));

        // FİN VƏ ŞV DAXİL ETMƏK
        const searchSuccess = await page.evaluate((finVal, svVal) => {
            const finInput = document.querySelector('input[placeholder*="FİN"], input[id*="fin"], input[name*="fin"]') as HTMLInputElement;
            const svInput = document.querySelector('input[placeholder*="ŞV"], input[placeholder*="nömrəsi"], input[name*="sv"]') as HTMLInputElement;

            if (finInput) {
                finInput.value = finVal;
                finInput.dispatchEvent(new Event('input', { bubbles: true }));
                finInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (svInput) {
                svInput.value = svVal;
                svInput.dispatchEvent(new Event('input', { bubbles: true }));
                svInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            const btn = (() => {
                if (svInput) {
                    let p = svInput.parentElement;
                    for (let i = 0; i < 3; i++) {
                        if (p) {
                            const b = p.querySelector('button, .q-btn, [role="button"]') as HTMLElement;
                            if (b) return b;
                            p = p.parentElement;
                        }
                    }
                }
                const icons = Array.from(document.querySelectorAll('i, svg'));
                for (const icon of icons) {
                    const isSearch = (icon.className && (typeof icon.className === 'string') && (icon.className.includes('search') || icon.className.includes('lupa')));
                    if (isSearch || (icon.tagName === 'SVG' && icon.closest('.q-btn'))) return (icon.closest('button, [role="button"]') || icon) as HTMLElement;
                }
                return Array.from(document.querySelectorAll('button, .q-btn')).find(b => {
                    const s = window.getComputedStyle(b);
                    return s.backgroundColor.includes('rgb(0, 51, 153)') || s.backgroundColor.includes('rgb(0, 41, 114)');
                }) as HTMLElement;
            })();

            if (btn) {
                btn.click();
                return true;
            }
            return false;
        }, fin, sv);

        if (!searchSuccess) {
            return NextResponse.json({ error: "Axtarış düyməsi tapılmadı. Zəhmət olmasa səhifənin tam yükləndiyindən əmin olun." }, { status: 404 });
        }

        // Wait for results
        await new Promise(r => setTimeout(r, 5000));

        const resultData = await page.evaluate(() => {
            const data: Record<string, string> = {};

            const cleanText = (t: string) => t.trim().toLowerCase().replace(/:$/, "").trim();

            // STRATEGY 1: Standard Field Mapping
            const fields = document.querySelectorAll('.q-field, .form-group, .row > div');
            fields.forEach(field => {
                const labelEl = field.querySelector('.q-field__label, label, .q-field__messages, .q-field__prefix') as HTMLElement;
                if (!labelEl) return;

                const label = cleanText(labelEl.innerText);
                if (!label || label.length > 50) return;

                const input = field.querySelector('input, select, textarea') as HTMLInputElement;
                const nativeValue = field.querySelector('.q-field__native');
                const controlText = field.querySelector('.q-field__control-container');

                let value = "";
                if (input && input.value && input.value.trim() !== "...") {
                    value = input.value;
                } else if (nativeValue) {
                    value = (nativeValue as HTMLElement).innerText;
                } else if (controlText) {
                    const clone = controlText.cloneNode(true) as HTMLElement;
                    const l = clone.querySelector('.q-field__label, label');
                    if (l) l.remove();
                    value = clone.innerText;
                }

                value = value.trim();
                if (value && value !== "..." && !data[label]) {
                    data[label] = value;
                }
            });

            // STRATEGY 2: Global Keyword Search (Fallback for Birth Date and Gender)
            const targetKeywords = ["doğum tarixi", "cinsi", "soyadı", "adı", "ata adı", "ünvan"];
            const allPossibleLabels = Array.from(document.querySelectorAll('.q-field__label, label, span, b, p'));

            targetKeywords.forEach(kw => {
                const foundLabel = allPossibleLabels.find(el => cleanText((el as HTMLElement).innerText) === kw);
                if (foundLabel) {
                    const parent = foundLabel.closest('.q-field, div');
                    if (parent) {
                        const valEl = parent.querySelector('input, .q-field__native, .q-field__control');
                        if (valEl) {
                            const val = (valEl as HTMLInputElement).value || (valEl as HTMLElement).innerText;
                            if (val && val.trim() !== "..." && !data[kw]) {
                                data[kw] = val.trim();
                            }
                        }
                    }
                }
            });

            return data;
        });

        // Debug log to terminal
        console.log("Scraped Raw Data:", resultData);

        // Map the data with higher precision
        const mapped: any = {};
        const findVal = (keywords: string[]) => {
            for (const kw of keywords) {
                const exact = resultData[kw.toLowerCase()];
                if (exact) return exact;
            }
            const key = Object.keys(resultData).find(k => keywords.some(kw => k.includes(kw.toLowerCase())));
            return key ? resultData[key] : null;
        };

        const ad = findVal(["adı", "ad"]);
        const soyad = findVal(["soyadı", "soyad"]);
        const ata = findVal(["ata adı", "atasının"]);
        const unvan = findVal(["ünvan", "yaşayış yeri", "qeydiyyat"]);
        const rawCins = findVal(["cinsi", "cins"]);
        const dogum = findVal(["doğum tarixi", "tarixi", "dogum"]);

        if (ad || soyad) {
            // Processing Father's Name and Gender Suffix
            const rawAta = ata || "";
            const cleanAta = rawAta.split(' ')[0].trim();
            const ataUpper = rawAta.toUpperCase();

            mapped.fullName = `${soyad || ""} ${ad || ""} ${cleanAta}`.trim().toUpperCase();

            // Gender detection:
            // 1. Check from portal's 'Cinsi' field
            // 2. Check from Father's Name suffix (oğlu/qızı)
            let detectedGender = "";
            const cinsLow = (rawCins || "").toLowerCase();

            if (cinsLow.includes("kişi") || cinsLow.includes("kisi")) {
                detectedGender = "Kişi";
            } else if (cinsLow.includes("qadın") || cinsLow.includes("qadin") || cinsLow.includes("kadın")) {
                detectedGender = "Qadın";
            } else {
                // Suffix check if field is ambiguous
                if (ataUpper.includes("OĞLU")) detectedGender = "Kişi";
                else if (ataUpper.includes("QIZI")) detectedGender = "Qadın";
                else detectedGender = rawCins || "";
            }

            mapped.gender = detectedGender;
            mapped.address = unvan || "";
            mapped.birthDate = dogum || "";

            if (browser) await browser.close();
            return NextResponse.json({ data: mapped });
        } else {
            if (browser) await browser.close();
            return NextResponse.json({ error: "Məlumat tapılmadı. FİN və ŞV nömrəsini düzgün daxil etdiyinizdən əmin olun." }, { status: 404 });
        }

    } catch (error: any) {
        if (browser) await browser.close();
        console.error("Scraping error:", error);
        return NextResponse.json({ error: "Sistem xətası: " + error.message }, { status: 500 });
    }
}

/**
 * Converts a numerical amount to Azerbaijani words for Manats and keeps qepiks as numbers.
 * Example: 683.20 -> "altı yüz səksən üç manat 20 qəpik"
 */
export function numberToAzerbaijaniFinancialWords(amount: number | string): string {
    const value = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : amount;
    if (isNaN(value)) return "";

    const manat = Math.floor(value);
    const qepik = Math.round((value - manat) * 100);

    const units = ["", "bir", "iki", "üç", "dörd", "beş", "altı", "yeddi", "səkkiz", "doqquz"];
    const tens = ["", "on", "iyirmi", "otuz", "qırx", "əlli", "altmış", "yetmiş", "səksən", "doxsan"];
    const hundreds = ["", "yüz", "iki yüz", "üç yüz", "dörd yüz", "beş yüz", "altı yüz", "yeddi yüz", "səkkiz yüz", "doqquz yüz"];

    function convertGroup(n: number): string {
        let res = "";
        const h = Math.floor(n / 100);
        const t = Math.floor((n % 100) / 10);
        const u = n % 10;

        if (h > 0) res += hundreds[h] + " ";
        if (t > 0) res += tens[t] + " ";
        if (u > 0) res += units[u] + " ";

        return res.trim();
    }

    function convertLargeNumber(n: number): string {
        if (n === 0) return "sıfır";

        const millions = Math.floor(n / 1000000);
        const thousands = Math.floor((n % 1000000) / 1000);
        const remainder = n % 1000;

        let res = "";

        if (millions > 0) {
            res += convertGroup(millions) + " milyon ";
        }

        if (thousands > 0) {
            if (thousands === 1) {
                res += "min ";
            } else {
                res += convertGroup(thousands) + " min ";
            }
        }

        if (remainder > 0) {
            res += convertGroup(remainder);
        }

        return res.trim();
    }

    const manatWords = convertLargeNumber(manat);
    const formattedQepik = qepik < 10 ? `0${qepik}` : qepik;

    return `${manatWords} manat ${formattedQepik} qəpik`;
}

/**
 * Formats a date string as DD.MM.YYYY as the user types.
 * Logic ensures that it doesn't get stuck on dots during deletion.
 */
export function formatDateInput(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    let res = "";

    if (digits.length > 0) {
        res = digits.slice(0, 2);
        if (digits.length >= 3) {
            res += "." + digits.slice(2, 4);
            if (digits.length >= 5) {
                res += "." + digits.slice(4, 8);
            }
        }
    }

    return res;
}

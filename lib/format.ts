import { Timestamp } from "firebase/firestore";

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

/**
 * Formats a phone number as (XXX) XXX-XX-XX as the user types.
 */
export function formatPhoneInput(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    let res = "";

    if (digits.length > 0) {
        if (digits.length <= 3) {
            res = `(${digits}`;
        } else if (digits.length <= 6) {
            res = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        } else if (digits.length <= 8) {
            res = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        } else {
            res = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
        }
    }

    return res;
}

/** 
 * Safely parses any date/timestamp value into a Date object.
 * Handles ISO strings, Firestore Timestamps, and Azerbaijani date format (DD.MM.YYYY).
 */
export const parseDate = (dateVal: any): Date | null => {
    if (!dateVal) return null;
    if (dateVal instanceof Timestamp) return dateVal.toDate();
    if (dateVal.toDate && typeof dateVal.toDate === 'function') return dateVal.toDate();

    if (typeof dateVal === 'string') {
        const trimmed = dateVal.trim();
        // Handle Azerbaijani dots format DD.MM.YYYY
        if (trimmed.includes('.') && !trimmed.includes('T') && !trimmed.includes('-')) {
            const parts = trimmed.split(' ');
            const dateParts = parts[0].split('.');
            if (dateParts.length === 3) {
                const [d, m, y] = dateParts.map(Number);
                const year = y < 100 ? 2000 + y : y;
                const date = new Date(year, m - 1, d);
                if (parts.length > 1) {
                    const timeParts = parts[1].split(':');
                    if (timeParts.length >= 2) {
                        date.setHours(Number(timeParts[0]), Number(timeParts[1]));
                        if (timeParts.length === 3) date.setSeconds(Number(timeParts[2]));
                    }
                }
                return date;
            }
        }
    }
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
};

export const calculateWorkingHours = (startDate: any, endDate: any) => {
    const s = parseDate(startDate);
    const e = parseDate(endDate);
    if (!s || !e || e <= s) return 0;

    const startH = 9;
    const endH = 18;
    let totalMs = 0;

    let curr = new Date(s.getTime());
    if (curr.getHours() < startH) curr.setHours(startH, 0, 0, 0);
    if (curr.getHours() >= endH) {
        curr.setDate(curr.getDate() + 1);
        curr.setHours(startH, 0, 0, 0);
    }

    while (curr < e) {
        const day = curr.getDay();
        if (day === 0 || day === 6) {
            curr.setDate(curr.getDate() + 1);
            curr.setHours(startH, 0, 0, 0);
            continue;
        }

        const dayEnd = new Date(curr.getTime());
        dayEnd.setHours(endH, 0, 0, 0);

        if (e <= dayEnd) {
            totalMs += Math.max(0, e.getTime() - curr.getTime());
            break;
        } else {
            totalMs += Math.max(0, dayEnd.getTime() - curr.getTime());
            curr.setDate(curr.getDate() + 1);
            curr.setHours(startH, 0, 0, 0);
        }
    }
    return totalMs / (1000 * 60 * 60);
};

export const formatDetailedTime = (hours: number) => {
    const totalMinutes = Math.round(hours * 60);
    if (totalMinutes === 0) return "0 dəq";
    if (totalMinutes < 60) return `${totalMinutes} dəq`;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h < 24) return m > 0 ? `${h} saat ${m} dəq` : `${h} saat`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d} gün ${rh > 0 ? rh + ' saat ' : ''}${m > 0 ? m + ' dəq' : ''}`.trim();
};

export const formatWorkTime = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    const workDays = Math.floor(h / 9);
    const remainingH = h % 9;
    let parts = [];
    if (workDays > 0) parts.push(`${workDays} iş günü`);
    if (remainingH > 0) parts.push(`${remainingH} saat`);
    if (m > 0) parts.push(`${m} dəq`);
    return parts.length > 0 ? parts.join(' ') : "0 saat";
};

/**
 * Formats a string to Title Case, correctly handling Azerbaijani locale (Ə, İ, I, etc).
 * Example: "BABAYEV ARİF RƏŞAD" -> "Babayev Arif Rəşad"
 */
export function toTitleCase(str: string): string {
    if (!str) return "";
    return str.trim()
        .toLocaleLowerCase('az-AZ')
        .split(/\s+/)
        .map(word => {
            if (!word) return "";
            return word.charAt(0).toLocaleUpperCase('az-AZ') + word.slice(1);
        })
        .join(" ");
}

/**
 * Formats a date into DD.MM.YYYY
 */
export function formatAZDate(val: any): string {
    if (!val) return "";
    const d = parseDate(val);
    if (!d || isNaN(d.getTime())) return "";
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

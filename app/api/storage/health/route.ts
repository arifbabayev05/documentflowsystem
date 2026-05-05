import { NextResponse } from 'next/server';
import net from 'node:net';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STORAGE_HEALTH_VERSION = 'storage-health-2026-05-05';
const DEFAULT_STORAGE_BASE_URL = 'http://10.10.10.127:11133/api/Storage';
const STORAGE_BASE_URL = process.env.STORAGE_API_BASE_URL || DEFAULT_STORAGE_BASE_URL;

function timeout<T>(promise: Promise<T>, ms: number, message: string) {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
    });
}

async function tcpProbe(host: string, port: number) {
    return timeout(new Promise<{ ok: boolean; ms: number }>((resolve, reject) => {
        const startedAt = Date.now();
        const socket = net.createConnection({ host, port });
        socket.once('connect', () => {
            socket.destroy();
            resolve({ ok: true, ms: Date.now() - startedAt });
        });
        socket.once('error', reject);
    }), 5000, 'tcp timeout');
}

async function httpProbe(url: string) {
    const startedAt = Date.now();
    const response = await timeout(fetch(url, { headers: { accept: '*/*' } }), 7000, 'http timeout');
    return {
        ok: response.ok,
        status: response.status,
        ms: Date.now() - startedAt,
        server: response.headers.get('server'),
    };
}

export async function GET() {
    const baseUrl = STORAGE_BASE_URL.replace(/\/+$/, '');
    const origin = new URL(baseUrl).origin;
    const host = new URL(baseUrl).hostname;
    const port = Number(new URL(baseUrl).port || 80);

    const checks: Record<string, any> = {};

    try {
        checks.tcp = await tcpProbe(host, port);
    } catch (error: any) {
        checks.tcp = { ok: false, error: error?.message || String(error) };
    }

    try {
        checks.swagger = await httpProbe(`${origin}/swagger`);
    } catch (error: any) {
        checks.swagger = { ok: false, error: error?.message || String(error) };
    }

    try {
        checks.openapi = await httpProbe(`${origin}/openapi/v1.json`);
    } catch (error: any) {
        checks.openapi = { ok: false, error: error?.message || String(error) };
    }

    return NextResponse.json({
        version: STORAGE_HEALTH_VERSION,
        baseUrl,
        checks,
    }, {
        headers: {
            'Cache-Control': 'no-store',
            'x-legal12-storage-health': STORAGE_HEALTH_VERSION,
        }
    });
}

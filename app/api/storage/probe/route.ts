import { NextResponse } from 'next/server';
import http from 'node:http';
import net from 'node:net';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_STORAGE_BASE_URL = 'http://10.10.10.127:11133/api/Storage';
const STORAGE_BASE_URL = process.env.STORAGE_API_BASE_URL || DEFAULT_STORAGE_BASE_URL;
const STORAGE_AUTH_TOKEN = process.env.STORAGE_API_TOKEN || 'uUotdJmwm132zjbb202dFKZkkoCf67n6mr6HgLyOvmUVK5oplN ';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        promise.then(resolve).catch(reject).finally(() => clearTimeout(timer));
    });
}

function tcpCheck(host: string, port: number) {
    return withTimeout(new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const socket = net.createConnection({ host, port });
        socket.once('connect', () => {
            socket.destroy();
            resolve({ ok: true, ms: Date.now() - startedAt });
        });
        socket.once('error', (error: any) => {
            socket.destroy();
            reject(error);
        });
    }), 5000, 'tcp');
}

function httpCheck(url: URL, headers: Record<string, string> = {}) {
    return withTimeout(new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const request = http.request(url, { method: 'GET', headers, timeout: 7000 }, (response) => {
            response.resume();
            response.once('end', () => {
                resolve({
                    ok: (response.statusCode || 0) >= 200 && (response.statusCode || 0) < 500,
                    status: response.statusCode,
                    ms: Date.now() - startedAt,
                    server: response.headers.server,
                });
            });
        });
        request.on('timeout', () => request.destroy(new Error('http request timeout')));
        request.on('error', reject);
        request.end();
    }), 8000, 'http');
}

async function safe(name: string, check: () => Promise<any>) {
    try {
        return { name, result: await check() };
    } catch (error: any) {
        return { name, error: error?.message || String(error), code: error?.code };
    }
}

export async function GET() {
    const baseUrl = STORAGE_BASE_URL.replace(/\/+$/, '');
    const parsed = new URL(baseUrl);
    const host = parsed.hostname;
    const port = Number(parsed.port || 80);
    const origin = parsed.origin;

    const checks = await Promise.all([
        safe('tcp storage host', () => tcpCheck(host, port)),
        safe('http swagger', () => httpCheck(new URL(`${origin}/swagger`))),
        safe('http fileinfo auth', () => httpCheck(new URL(`${baseUrl}/FileInfo/probe`), {
            accept: '*/*',
            Authorization: STORAGE_AUTH_TOKEN,
        })),
    ]);

    return NextResponse.json({
        version: 'storage-probe-2026-05-05',
        baseUrl,
        checks,
    }, {
        headers: {
            'Cache-Control': 'no-store',
            'x-legal12-storage-probe': 'storage-probe-2026-05-05',
        }
    });
}

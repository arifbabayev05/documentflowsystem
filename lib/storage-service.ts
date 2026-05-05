import 'server-only';
import http from 'node:http';
import https from 'node:https';
import { storageProxyUrl } from './storage-shared';

const DEFAULT_STORAGE_BASE_URL = 'http://10.10.10.127:11133/api/Storage';
const DEFAULT_STORAGE_AUTH_TOKEN = 'uUotdJmwm132zjbb202dFKZkkoCf67n6mr6HgLyOvmUVK5oplN ';

const STORAGE_BASE_URL = process.env.STORAGE_API_BASE_URL || DEFAULT_STORAGE_BASE_URL;
const STORAGE_AUTH_TOKEN = process.env.STORAGE_API_TOKEN || DEFAULT_STORAGE_AUTH_TOKEN;
const STORAGE_MODULE_NAME = process.env.STORAGE_API_MODULE || 'Common';
const STORAGE_BUCKET_NAME = process.env.STORAGE_API_BUCKET || 'Documents';
const STORAGE_DIRECTORY = 'null';
const STORAGE_FETCH_TIMEOUT_MS = Number(process.env.STORAGE_FETCH_TIMEOUT_MS || 15000);

export interface StorageUploadResult {
    id: string;
    url: string;
    info: any;
}

interface StorageHttpResponse {
    status: number;
    headers: Headers;
    buffer: Buffer;
    text: string;
}

function normalizeDirectory(_directory?: string | null) {
    return STORAGE_DIRECTORY;
}

function getStorageConfig() {
    return {
        baseUrl: STORAGE_BASE_URL.replace(/\/+$/, ''),
        authToken: STORAGE_AUTH_TOKEN,
    };
}

function storageErrorPrefix(action: string) {
    const { baseUrl } = getStorageConfig();
    return `${action} failed against ${baseUrl}`;
}

function headersToWebHeaders(headers: http.IncomingHttpHeaders) {
    const webHeaders = new Headers();
    Object.entries(headers).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            webHeaders.set(key, value.join(', '));
        } else if (value !== undefined) {
            webHeaders.set(key, String(value));
        }
    });
    return webHeaders;
}

function storageRequest(url: URL, init: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer;
} = {}): Promise<StorageHttpResponse> {
    return new Promise((resolve, reject) => {
        const client = url.protocol === 'https:' ? https : http;
        const request = client.request(url, {
            method: init.method || 'GET',
            headers: init.headers,
            timeout: STORAGE_FETCH_TIMEOUT_MS,
        }, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve({
                    status: response.statusCode || 0,
                    headers: headersToWebHeaders(response.headers),
                    buffer,
                    text: buffer.toString('utf8'),
                });
            });
        });

        request.on('timeout', () => {
            request.destroy(new Error(`request timeout after ${STORAGE_FETCH_TIMEOUT_MS}ms`));
        });
        request.on('error', reject);

        if (init.body) request.write(init.body);
        request.end();
    });
}

function buildMultipartBody(fileBuffer: Buffer, fileName: string, mimeType: string) {
    const boundary = `----legal12-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const head = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="File"; filename="${fileName.replace(/"/g, '')}"\r\n` +
        `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
        'utf8'
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

    return {
        boundary,
        body: Buffer.concat([head, fileBuffer, tail]),
    };
}

export async function uploadToStorageApi(file: Blob, fileName: string, directory?: string | null): Promise<StorageUploadResult> {
    const { baseUrl, authToken } = getStorageConfig();
    const url = new URL(`${baseUrl}/File`);
    url.searchParams.set('ModuleName', STORAGE_MODULE_NAME);
    url.searchParams.set('BucketName', STORAGE_BUCKET_NAME);
    url.searchParams.set('Directory', normalizeDirectory(directory));

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { boundary, body } = buildMultipartBody(fileBuffer, fileName, file.type);

    let response: StorageHttpResponse;
    try {
        response = await storageRequest(url, {
            method: 'POST',
            headers: {
                accept: 'text/plain',
                Authorization: authToken,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': String(body.length),
            },
            body,
        });
    } catch (error: any) {
        throw new Error(`${storageErrorPrefix('Storage upload')}: ${error?.message || error}`);
    }

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Storage upload failed (${response.status}): ${response.text}`);
    }

    let info: any;
    try {
        info = JSON.parse(response.text);
    } catch {
        info = { id: response.text.trim() };
    }

    const id = info?.id || info?.Id || info?.fileId || info?.FileId;
    if (!id) {
        throw new Error(`Storage upload response does not include file id: ${response.text}`);
    }

    return { id, url: storageProxyUrl(id), info };
}

export async function getStorageFileInfo(id: string) {
    const { baseUrl, authToken } = getStorageConfig();
    const response = await storageRequest(new URL(`${baseUrl}/FileInfo/${encodeURIComponent(id)}`), {
        headers: {
            accept: '*/*',
            Authorization: authToken
        }
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Storage FileInfo failed (${response.status}): ${response.text}`);
    }

    return response.text ? JSON.parse(response.text) : null;
}

export async function downloadFromStorageApi(id: string) {
    const { baseUrl, authToken } = getStorageConfig();
    const response = await storageRequest(new URL(`${baseUrl}/File/${encodeURIComponent(id)}`), {
        headers: {
            accept: '*/*',
            Authorization: authToken
        }
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Storage download failed (${response.status}): ${response.text}`);
    }

    return new Response(new Uint8Array(response.buffer), {
        status: response.status,
        headers: response.headers,
    });
}

export async function deleteFromStorageApi(id: string) {
    const { baseUrl, authToken } = getStorageConfig();
    const response = await storageRequest(new URL(`${baseUrl}/File/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: {
            accept: '*/*',
            Authorization: authToken
        }
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Storage delete failed (${response.status}): ${response.text}`);
    }

    return true;
}

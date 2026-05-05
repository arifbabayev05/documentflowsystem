import 'server-only';
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

function normalizeDirectory(directory?: string | null) {
    if (!directory || directory === 'null') return STORAGE_DIRECTORY;
    return directory
        .replace(/\\/g, '/')
        .split('/')
        .map(part => part.trim())
        .filter(Boolean)
        .join('/') || STORAGE_DIRECTORY;
}

function storageErrorPrefix(action: string) {
    const { baseUrl } = getStorageConfig();
    return `${action} failed against ${baseUrl}`;
}

function getStorageConfig() {
    return {
        baseUrl: STORAGE_BASE_URL.replace(/\/+$/, ''),
        authToken: STORAGE_AUTH_TOKEN,
    };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STORAGE_FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export async function uploadToStorageApi(file: Blob, fileName: string, directory?: string | null): Promise<StorageUploadResult> {
    const { baseUrl, authToken } = getStorageConfig();
    const form = new FormData();
    form.append('File', file, fileName);

    const url = new URL(`${baseUrl}/File`);
    url.searchParams.set('ModuleName', STORAGE_MODULE_NAME);
    url.searchParams.set('BucketName', STORAGE_BUCKET_NAME);
    url.searchParams.set('Directory', normalizeDirectory(directory));

    let response: Response;
    try {
        response = await fetchWithTimeout(url.toString(), {
            method: 'POST',
            headers: {
                accept: 'text/plain',
                Authorization: authToken
            },
            body: form
        });
    } catch (error: any) {
        throw new Error(`${storageErrorPrefix('Storage upload')}: ${error?.message || error}`);
    }

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Storage upload failed (${response.status}): ${text}`);
    }

    let info: any;
    try {
        info = JSON.parse(text);
    } catch {
        info = { id: text.trim() };
    }

    const id = info?.id || info?.Id || info?.fileId || info?.FileId;
    if (!id) {
        throw new Error(`Storage upload response does not include file id: ${text}`);
    }

    return { id, url: storageProxyUrl(id), info };
}

export async function getStorageFileInfo(id: string) {
    const { baseUrl, authToken } = getStorageConfig();
    const response = await fetchWithTimeout(`${baseUrl}/FileInfo/${encodeURIComponent(id)}`, {
        headers: {
            accept: '*/*',
            Authorization: authToken
        }
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Storage FileInfo failed (${response.status}): ${text}`);
    }

    return text ? JSON.parse(text) : null;
}

export async function downloadFromStorageApi(id: string) {
    const { baseUrl, authToken } = getStorageConfig();
    const response = await fetchWithTimeout(`${baseUrl}/File/${encodeURIComponent(id)}`, {
        headers: {
            accept: '*/*',
            Authorization: authToken
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Storage download failed (${response.status}): ${text}`);
    }

    return response;
}

export async function deleteFromStorageApi(id: string) {
    const { baseUrl, authToken } = getStorageConfig();
    const response = await fetchWithTimeout(`${baseUrl}/File/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
            accept: '*/*',
            Authorization: authToken
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Storage delete failed (${response.status}): ${text}`);
    }

    return true;
}

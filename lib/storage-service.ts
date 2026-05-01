import 'server-only';
import { storageProxyUrl } from './storage-shared';

const STORAGE_BASE_URL = process.env.STORAGE_API_BASE_URL || 'http://10.10.10.127:11133/api/Storage';
const STORAGE_AUTH_TOKEN = process.env.STORAGE_API_TOKEN || 'uUotdJmwm132zjbb202dFKZkkoCf67n6mr6HgLyOvmUVK5oplN ';
const STORAGE_MODULE_NAME = process.env.STORAGE_API_MODULE || 'Common';
const STORAGE_BUCKET_NAME = process.env.STORAGE_API_BUCKET || 'Documents';

export interface StorageUploadResult {
    id: string;
    url: string;
    info: any;
}

function normalizeDirectory(directory?: string | null) {
    if (!directory || directory === 'null') return 'Legal12';
    return directory
        .replace(/\\/g, '/')
        .split('/')
        .map(part => part.trim())
        .filter(Boolean)
        .join('/') || 'Legal12';
}

export async function uploadToStorageApi(file: Blob, fileName: string, directory?: string | null): Promise<StorageUploadResult> {
    const form = new FormData();
    form.append('File', file, fileName);

    const url = new URL(`${STORAGE_BASE_URL}/File`);
    url.searchParams.set('ModuleName', STORAGE_MODULE_NAME);
    url.searchParams.set('BucketName', STORAGE_BUCKET_NAME);
    url.searchParams.set('Directory', normalizeDirectory(directory));

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            accept: 'text/plain',
            Authorization: STORAGE_AUTH_TOKEN
        },
        body: form
    });

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
    const response = await fetch(`${STORAGE_BASE_URL}/FileInfo/${encodeURIComponent(id)}`, {
        headers: {
            accept: '*/*',
            Authorization: STORAGE_AUTH_TOKEN
        }
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Storage FileInfo failed (${response.status}): ${text}`);
    }

    return text ? JSON.parse(text) : null;
}

export async function downloadFromStorageApi(id: string) {
    const response = await fetch(`${STORAGE_BASE_URL}/File/${encodeURIComponent(id)}`, {
        headers: {
            accept: '*/*',
            Authorization: STORAGE_AUTH_TOKEN
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Storage download failed (${response.status}): ${text}`);
    }

    return response;
}

export async function deleteFromStorageApi(id: string) {
    const response = await fetch(`${STORAGE_BASE_URL}/File/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
            accept: '*/*',
            Authorization: STORAGE_AUTH_TOKEN
        }
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Storage delete failed (${response.status}): ${text}`);
    }

    return true;
}

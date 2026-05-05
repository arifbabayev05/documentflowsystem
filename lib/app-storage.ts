import { directoryFromPath, parseStorageIdFromUrl } from './storage-shared';
import { withBasePath } from './basePath';

export interface AppUploadResult {
    url: string;
    storageId?: string;
    info?: any;
}

export async function uploadAppFile(path: string, file: Blob, fileName?: string): Promise<AppUploadResult> {
    const finalName = fileName || (file instanceof File ? file.name : path.split('/').pop()) || 'file';
    const form = new FormData();
    form.append('file', file, finalName);
    form.append('fileName', finalName);
    form.append('directory', directoryFromPath(path));

    const response = await fetch(withBasePath('/api/storage/upload'), {
        method: 'POST',
        body: form
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Storage upload failed');
    }

    return { url: data.url, storageId: data.id, info: data.info };
}

export async function deleteAppFile(pathOrUrl: string) {
    const storageId = parseStorageIdFromUrl(pathOrUrl);
    if (!storageId) return false;

    const response = await fetch(withBasePath(`/api/storage/file/${encodeURIComponent(storageId)}`), { method: 'DELETE' });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Storage delete failed');
    }

    return true;
}

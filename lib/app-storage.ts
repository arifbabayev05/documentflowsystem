import { getDBMode } from './db';
import { directoryFromPath, parseStorageIdFromUrl } from './storage-shared';
import { withBasePath } from './basePath';

export interface AppUploadResult {
    url: string;
    storageId?: string;
    info?: any;
}

export async function uploadAppFile(path: string, file: Blob, fileName?: string): Promise<AppUploadResult> {
    const mode = await getDBMode();
    const finalName = fileName || (file instanceof File ? file.name : path.split('/').pop()) || 'file';

    if (mode === 'mysql') {
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

    const [{ app }, storageFns] = await Promise.all([
        import('./firebase'),
        import('firebase/storage')
    ]);
    const storage = storageFns.getStorage(app);
    const storageRef = storageFns.ref(storage, path);
    const snapshot = await storageFns.uploadBytes(storageRef, file);
    const url = await storageFns.getDownloadURL(snapshot.ref);
    return { url };
}

export async function deleteAppFile(pathOrUrl: string) {
    const mode = await getDBMode();

    if (mode === 'mysql') {
        const storageId = parseStorageIdFromUrl(pathOrUrl);
        if (!storageId) return false;
        const response = await fetch(withBasePath(`/api/storage/file/${encodeURIComponent(storageId)}`), { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Storage delete failed');
        }
        return true;
    }

    const [{ app }, storageFns] = await Promise.all([
        import('./firebase'),
        import('firebase/storage')
    ]);
    const storage = storageFns.getStorage(app);
    const storageRef = storageFns.ref(storage, pathOrUrl);
    await storageFns.deleteObject(storageRef).catch(() => { });
    return true;
}

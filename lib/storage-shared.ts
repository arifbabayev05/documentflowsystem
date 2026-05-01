export function storageProxyUrl(id: string) {
    return `/api/storage/file/${encodeURIComponent(id)}`;
}

export function parseStorageIdFromUrl(url?: string | null) {
    if (!url) return null;
    const match = url.match(/\/api\/storage\/file\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export function directoryFromPath(path: string) {
    const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/');
    parts.pop();
    return ['Legal12', ...parts]
        .map(part => part.trim())
        .filter(Boolean)
        .join('/');
}

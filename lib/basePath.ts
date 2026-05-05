export const BASE_PATH = "/legal12";

const hasProtocol = (path: string) => /^[a-z][a-z\d+\-.]*:/i.test(path);

export function withBasePath(path: string) {
    if (
        !BASE_PATH ||
        !path ||
        hasProtocol(path) ||
        path.startsWith("//") ||
        path === BASE_PATH ||
        path.startsWith(`${BASE_PATH}/`)
    ) {
        return path;
    }

    if (path.startsWith("/")) {
        return `${BASE_PATH}${path}`;
    }

    if (path.startsWith("?") || path.startsWith("#")) {
        return `${BASE_PATH}/${path}`;
    }

    return `${BASE_PATH}/${path}`;
}

export function withoutBasePath(path: string) {
    if (!BASE_PATH || !path) return path || "/";
    if (path === BASE_PATH) return "/";
    if (path.startsWith(`${BASE_PATH}/`)) return path.slice(BASE_PATH.length) || "/";
    return path;
}

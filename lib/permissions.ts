export type PermissionID =
    | "customers_read" | "customers_create" | "customers_update" | "customers_delete"
    | "reports_read" | "reports_audit"
    | "users_manage";

export interface Permission {
    id: PermissionID;
    label: string;
    group: string;
}

export const AVAILABLE_PERMISSIONS: Permission[] = [
    // MÜŞTƏRİ MƏLUMATI
    { id: "customers_read", label: "Müştəri məlumatı (Baxış)", group: "MÜŞTƏRİ MƏLUMATI" },
    { id: "customers_create", label: "Müştəri məlumatı (Əlavə etmə)", group: "MÜŞTƏRİ MƏLUMATI" },
    { id: "customers_update", label: "Müştəri məlumatı (Düzəliş)", group: "MÜŞTƏRİ MƏLUMATI" },
    { id: "customers_delete", label: "Müştəri məlumatı (Silmə)", group: "MÜŞTƏRİ MƏLUMATI" },

    // HESABATLAR
    { id: "reports_read", label: "Hesabatlar (Baxış)", group: "HESABATLAR" },
    { id: "reports_audit", label: "Audit Loqları", group: "HESABATLAR" },

    // İSTİFADƏÇİLƏR
    { id: "users_manage", label: "İstifadəçi İdarəetməsi", group: "İSTİFADƏÇİ İDARƏETMƏSİ" },
];

/**
 * Maps dashboard paths to their required "base" or "read" permission.
 * If a user has ANY permission in the group, they should generally see the page.
 */
export const PATH_TO_PERMISSION_MAP: Record<string, PermissionID[]> = {
    "/dashboard": ["customers_read", "customers_create", "customers_update", "customers_delete"],
    "/reports": ["reports_read", "reports_audit"],
    "/settings": ["users_manage"]
};

export type PermissionID =
    | "customers_read" | "customers_create" | "customers_update" | "customers_delete"
    | "reports_read" | "reports_audit"
    | "users_manage" | "inspector_manage" | "archive_manage"
    | "action_assignment" | "action_warning" | "action_status_change"
    | "fields_personal" | "fields_address" | "fields_order" | "fields_invoice";

export interface Permission {
    id: PermissionID;
    label: string;
    group: string;
}

export const AVAILABLE_PERMISSIONS: Permission[] = [
    // MÜŞTƏRİ MƏLUMATI (SƏHİFƏLƏR)
    { id: "customers_read", label: "Müştəri məlumatı (Baxış)", group: "SƏHİFƏ İCAZƏLƏRİ" },
    { id: "customers_create", label: "Müştəri məlumatı (Əlavə etmə)", group: "SƏHİFƏ İCAZƏLƏRİ" },
    { id: "customers_update", label: "Müştəri məlumatı (Düzəliş)", group: "SƏHİFƏ İCAZƏLƏRİ" },
    { id: "customers_delete", label: "Müştəri məlumatı (Silmə)", group: "SƏHİFƏ İCAZƏLƏRİ" },
    { id: "inspector_manage", label: "Müfəttiş Paneli", group: "SƏHİFƏ İCAZƏLƏRİ" },
    { id: "archive_manage", label: "Arxiv İdarəetməsi", group: "SƏHİFƏ İCAZƏLƏRİ" },
    { id: "reports_read", label: "Hesabatlar (Baxış)", group: "SƏHİFƏ İCAZƏLƏRİ" },
    { id: "reports_audit", label: "Audit Loqları", group: "SƏHİFƏ İCAZƏLƏRİ" },
    { id: "users_manage", label: "İstifadəçi İdarəetməsi", group: "SƏHİFƏ İCAZƏLƏRİ" },

    // DASHBOARD FUNKSİYALARI
    { id: "action_assignment", label: "Təyinat Etmə", group: "FUNKSİONAL İCAZƏLƏR" },
    { id: "action_warning", label: "Xəbərdarlıq Etmə", group: "FUNKSİONAL İCAZƏLƏR" },
    { id: "action_status_change", label: "Status Dəyişmə", group: "FUNKSİONAL İCAZƏLƏR" },

    // SAHƏ İCAZƏLƏRİ (FIELDS)
    { id: "fields_personal", label: "Şəxsi Məlumatlar (Sahələr)", group: "SAHƏ (FIELD) İCAZƏLƏRİ" },
    { id: "fields_address", label: "Ünvan Məlumatları (Sahələr)", group: "SAHƏ (FIELD) İCAZƏLƏRİ" },
    { id: "fields_order", label: "Sifariş Detalları (Sahələr)", group: "SAHƏ (FIELD) İCAZƏLƏRİ" },
    { id: "fields_invoice", label: "İnvoys və Arxiv (Sahələr)", group: "SAHƏ (FIELD) İCAZƏLƏRİ" },
];

/**
 * Maps dashboard paths to their required "base" or "read" permission.
 * If a user has ANY permission in the group, they should generally see the page.
 */
export const PATH_TO_PERMISSION_MAP: Record<string, PermissionID[]> = {
    "/dashboard": ["customers_read", "customers_create", "customers_update", "customers_delete"],
    "/inspector": ["inspector_manage"],
    "/archive": ["archive_manage"],
    "/customers/archived": ["archive_manage"],
    "/reports": ["reports_read"],
    "/audit-logs": ["reports_audit"],
    "/settings": ["users_manage"]
};

export type PermissionID =
    | "page_analytics"
    | "page_customers"
    | "page_inspector"
    | "page_archive_customers"
    | "page_archiver"
    | "page_audit_logs"
    | "page_parameters"
    | "page_users"
    | "page_reports"
    | "action_assignment";

export interface Permission {
    id: PermissionID;
    label: string;
    group: string;
}

export const AVAILABLE_PERMISSIONS: Permission[] = [
    { id: "page_customers", label: "Müştəri bazası", group: "SƏHİFƏLƏR" },
    { id: "page_inspector", label: "Müfəttiş Paneli", group: "SƏHİFƏLƏR" },
    { id: "page_archive_customers", label: "Arxiv Müştərilər", group: "SƏHİFƏLƏR" },
    { id: "page_archiver", label: "Arxivçi", group: "SƏHİFƏLƏR" },
    { id: "page_audit_logs", label: "Audit Loqları", group: "SƏHİFƏLƏR" },
    { id: "page_parameters", label: "Parametrlər", group: "SƏHİFƏLƏR" },
    { id: "page_analytics", label: "Statistika", group: "SƏHİFƏLƏR" },
    { id: "page_users", label: "İstifadəçilər", group: "SƏHİFƏLƏR" },
    { id: "page_reports", label: "Hesabatlar (Şablonlar)", group: "SƏHİFƏLƏR" }
];

/**
 * Maps dashboard paths to their required "base" or "read" permission.
 * If a user has ANY permission in the group, they should generally see the page.
 */
export const PATH_TO_PERMISSION_MAP: Record<string, PermissionID[]> = {
    "/dashboard": ["page_customers"],
    "/inspector": ["page_inspector"],
    "/archive": ["page_archiver"],
    "/customers/archived": ["page_archive_customers"],
    "/reports": ["page_reports"], // Only SuperAdmin
    "/reports/generate": [], // Open to all as requested
    "/audit-logs": ["page_audit_logs"],
    "/settings": ["page_users"],
    "/parameters": ["page_parameters"],
    "/analytics": ["page_analytics"]
};

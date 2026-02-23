"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Users,
    Shield,
    UserCircle,
    RefreshCw,
    ShieldCheck,
    Check,
    X,
    Lock,
    Search,
    LayoutDashboard,
    Filter,
    ArrowLeft,
    MoreHorizontal,
    Edit,
    Trash2,
    AlertTriangle,
    Mail,
    Calendar,
    Settings,
    ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";

import { AVAILABLE_PERMISSIONS, PermissionID } from "@/lib/permissions";
import { getAllUsers, updateUserRole, getRolePermissions, deleteUser } from "@/lib/db";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface UserDoc {
    id: string;
    email: string;
    displayName: string;
    role: "SUPERADMIN" | "ADMIN" | "MANAGER" | "INSPECTOR" | "INSPECTOR_LEAD" | "ARCHIVER" | "ARCHIVE_MANAGER" | "DEP_HEAD" | "AUDIT_LEAD" | "PENDING";
    lastLogin: string;
    permissions?: string[];
}

const ROLE_LABELS: Record<UserDoc["role"], string> = {
    SUPERADMIN: "Super Admin",
    ADMIN: "İnzibatçı",
    MANAGER: "Bölmə rəhbəri",
    INSPECTOR_LEAD: "Müfəttiş rəhbəri",
    INSPECTOR: "Müfəttiş",
    ARCHIVER: "Arxivçi",
    ARCHIVE_MANAGER: "Arxiv Rəhbəri",
    DEP_HEAD: "Dep Rəhbəri",
    AUDIT_LEAD: "AUDİT",
    PENDING: "Gözləmədə"
};

export default function UsersPage() {
    const { user: currentUser, can, isLoading } = useAuth();
    const [users, setUsers] = useState<UserDoc[]>([]);

    if (!isLoading && (!currentUser || (currentUser.role !== 'SUPERADMIN' && currentUser.role !== 'MANAGER' && currentUser.role !== 'INSPECTOR_LEAD' && currentUser.role !== 'ARCHIVE_MANAGER'))) {
        return (
            <AuthGuard>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-16 w-16 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
                        <Lock size={32} className="text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Giriş Məhdudlaşdırılıb</h2>
                    <p className="text-slate-500 max-w-[300px]">Bu bölməyə daxil olmaq üçün İstifadəçi İdarəetməsi icazəniz olmalıdır.</p>
                </div>
            </AuthGuard>
        );
    }
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [permissionFilterIds, setPermissionFilterIds] = useState<string[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserDoc | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [selectedRole, setSelectedRole] = useState<UserDoc["role"]>("PENDING");
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
    const [openPermsId, setOpenPermsId] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<UserDoc | null>(null);
    const router = useRouter();

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!isLoading && !currentUser) {
            router.replace("/login");
        }
    }, [isLoading, currentUser, router]);

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const data = await getAllUsers();
            setUsers(data as UserDoc[]);
        } catch (e) {
            toast.error("İstifadəçiləri yükləmək mümkün olmadı");
        } finally {
            setLoadingUsers(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (openPermsId && !(e.target as HTMLElement).closest('.perms-cell')) {
                setOpenPermsId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openPermsId]);

    useEffect(() => {
        if (currentUser) {
            fetchUsers();
        }
    }, [currentUser]);

    if (isLoading || !currentUser) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <RefreshCw className="animate-spin text-primary" size={48} />
            </div>
        );
    }

    const handleSaveUser = async () => {
        if (!editingUser) return;
        try {
            let finalPermissions = [...selectedPermissions];
            // Auto-add action_assignment for Managers
            if (selectedRole === 'MANAGER' && !finalPermissions.includes('action_assignment' as any)) {
                finalPermissions.push('action_assignment' as any);
            }
            // Auto-add everything for SuperAdmin
            if (selectedRole === 'SUPERADMIN') {
                finalPermissions = AVAILABLE_PERMISSIONS.map(p => p.id as any);
                finalPermissions.push('action_assignment' as any);
            }

            await updateUserRole(editingUser.id, selectedRole, finalPermissions);
            toast.success("Məlumatlar yadda saxlanıldı");
            setIsModalOpen(false);
            fetchUsers();
        } catch (e) {
            toast.error("Xəta baş verdi");
        }
    };

    const handleDeleteUser = async (user: UserDoc) => {
        setUserToDelete(user);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!userToDelete) return;

        try {
            await deleteUser(userToDelete.id, currentUser?.email || "system");
            toast.success("İstifadəçi silindi");
            setIsDeleteModalOpen(false);
            setUserToDelete(null);
            fetchUsers();
        } catch (e) {
            toast.error("Silinmə zamanı xəta baş verdi");
        }
    };

    const togglePermissionFilter = (id: string) => {
        setPermissionFilterIds(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const filteredUsers = users.filter(u => {
        // Manager: ADMIN/PENDING, Inspector Lead: INSPECTOR/PENDING, Archive Manager: ARCHIVER/PENDING, SuperAdmin: all
        const canSeeUser = currentUser.role === 'SUPERADMIN' ? true :
            (currentUser.role === 'MANAGER' ? (u.role === 'PENDING' || u.role === 'ADMIN') :
                (currentUser.role === 'INSPECTOR_LEAD' ? (u.role === 'PENDING' || u.role === 'INSPECTOR') :
                    (currentUser.role === 'ARCHIVE_MANAGER' ? (u.role === 'PENDING' || u.role === 'ARCHIVER') : false)));
        if (!canSeeUser) return false;

        const matchesSearch = u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === "all" || u.role === roleFilter;

        const userPerms = u.permissions || [];
        const matchesPermissions = permissionFilterIds.length === 0 ||
            permissionFilterIds.some(id => userPerms.includes(id));

        return matchesSearch && matchesRole && matchesPermissions;
    });

    return (
        <AuthGuard>
            <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500 pb-24 px-4 sm:px-6 relative">
                {/* Breadcrumb style top nav */}
                <div className="flex items-center gap-2 text-text-soft font-bold text-sm">
                    <LayoutDashboard size={16} />
                    <span>İdarə Paneli</span>
                </div>

                {/* Header */}
                <div className="space-y-1">
                    <h1 className="text-2xl font-black text-text-main flex items-center gap-3">
                        İstifadəçi İdarəetməsi
                    </h1>
                    <p className="text-sm text-text-soft font-bold">
                        Sistem istifadəçilərini idarə edin və onlara rol təyin edin.
                    </p>
                </div>

                {/* Main Content Card */}
                <div className="bg-white rounded-[1.5rem] border border-border-soft shadow-sm overflow-hidden">
                    <div className="p-8 space-y-8">
                        {/* Card Title and Filters */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            <div>
                                <h2 className="text-xl font-black text-text-main">Bütün İstifadəçilər</h2>
                                <p className="text-xs text-text-soft font-bold mt-1">Sistemə daxil olmuş bütün istifadəçilərin siyahısı.</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                {/* Stats */}
                                <div className="flex items-center gap-3 px-6 py-3 bg-gray-50 rounded-xl border border-border-soft w-full md:w-auto">
                                    <Users size={18} className="text-text-soft" />
                                    <span className="text-sm font-bold text-text-main whitespace-nowrap">
                                        Cəm: <span className="font-black text-primary">{users.length}</span>
                                    </span>
                                </div>

                                {/* Search */}
                                <div className="relative w-full lg:min-w-[250px] lg:flex-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-soft" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Ad və ya email..."
                                        className="w-full pl-12 pr-4 py-3 bg-white border border-border-soft rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all shadow-sm"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>

                                {/* Role Dropdown */}
                                <div className="relative w-full sm:w-auto">
                                    <select
                                        className="w-full sm:w-auto appearance-none pl-4 pr-10 py-3 bg-white border border-border-soft rounded-xl text-sm font-black text-text-main outline-none focus:ring-4 focus:ring-primary/5 transition-all cursor-pointer shadow-sm"
                                        value={roleFilter}
                                        onChange={(e) => setRoleFilter(e.target.value)}
                                    >
                                        <option value="all">Bütün rollar</option>
                                        <option value="SUPERADMIN">Super Admin</option>
                                        <option value="ADMIN">İnzibatçı</option>
                                        <option value="MANAGER">Bölmə Rəhbəri</option>
                                        <option value="DEP_HEAD">Dep Rəhbəri</option>
                                        <option value="AUDIT_LEAD">AUDİT</option>
                                        <option value="INSPECTOR_LEAD">Müfəttiş Rəhbəri</option>
                                        <option value="INSPECTOR">Müfəttiş</option>
                                        <option value="ARCHIVER">Arxivçi</option>
                                        <option value="ARCHIVE_MANAGER">Arxiv Rəhbəri</option>
                                        <option value="PENDING">Gözləmədə</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-text-main pointer-events-none" size={18} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table Section */}
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="px-3 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">İstifadəçi</th>
                                    <th className="px-3 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Rol</th>
                                    <th className="px-3 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">İcazələr</th>
                                    <th className="px-3 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Son Giriş</th>
                                    <th className="px-3 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Əməliyyat</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loadingUsers ? (
                                    <tr>
                                        <td colSpan={5} className="py-32 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <RefreshCw size={40} className="animate-spin text-primary/20" />
                                                <span className="text-sm font-black text-slate-400 uppercase tracking-widest animate-pulse">İstifadəçilər yüklənir...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-32 text-center">
                                            <div className="flex flex-col items-center gap-4 opacity-20">
                                                <Search size={60} />
                                                <span className="text-sm font-black uppercase tracking-widest">İstifadəçi tapılmadı</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredUsers.map((u) => (
                                    <tr
                                        key={u.id}
                                        className={cn(
                                            "group hover:bg-slate-50/30 transition-all duration-300",
                                            openPermsId === u.id ? "relative z-[60] bg-slate-50/50" : "relative z-10"
                                        )}
                                    >
                                        <td className="px-3 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">{u.displayName}</span>
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                                        <Mail size={10} className="opacity-50" />
                                                        {u.email}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-5">
                                            <div className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm",
                                                u.role === "SUPERADMIN" ? "bg-slate-900 text-white shadow-xl shadow-slate-900/10" :
                                                    u.role === "ADMIN" ? "bg-blue-50 text-blue-600 border border-blue-100" :
                                                        u.role === "MANAGER" ? "bg-purple-50 text-purple-600 border border-purple-100" :
                                                            u.role === "INSPECTOR" ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                                                u.role === "PENDING" ? "bg-red-50 text-red-600 border border-red-100 animate-pulse" :
                                                                    u.role === "DEP_HEAD" ? "bg-cyan-50 text-cyan-600 border border-cyan-100" :
                                                                        u.role === "AUDIT_LEAD" ? "bg-rose-50 text-rose-600 border border-rose-100" :
                                                                            u.role === "ARCHIVE_MANAGER" ? "bg-indigo-50 text-indigo-600 border border-indigo-100" :
                                                                                "bg-slate-50 text-slate-500 border border-slate-200"
                                            )}>
                                                {ROLE_LABELS[u.role] || u.role}
                                            </div>
                                        </td>
                                        <td className="px-3 py-5 perms-cell">
                                            <div className="flex flex-wrap items-center gap-1.5 max-w-[300px]">
                                                {u.permissions && u.permissions.length > 0 ? (
                                                    <>
                                                        {u.permissions.slice(0, 2).map((pid) => {
                                                            const p = AVAILABLE_PERMISSIONS.find(ap => ap.id === pid);
                                                            return p ? (
                                                                <span key={pid} className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black text-slate-800 whitespace-nowrap uppercase tracking-tight">
                                                                    {p.label}
                                                                </span>
                                                            ) : null;
                                                        })}

                                                        {u.permissions.length > 2 && (
                                                            <div className="relative">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setOpenPermsId(openPermsId === u.id ? null : u.id);
                                                                    }}
                                                                    className={cn(
                                                                        "h-7 min-w-[36px] px-2.5 flex items-center justify-center rounded-lg text-[10px] font-black transition-all border",
                                                                        openPermsId === u.id
                                                                            ? "bg-slate-900 text-white border-slate-900 shadow-lg scale-105"
                                                                            : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                                                                    )}
                                                                >
                                                                    +{u.permissions.length - 2}
                                                                </button>

                                                                {/* Mini Modern Popover */}
                                                                {openPermsId === u.id && (
                                                                    <div className="absolute top-full left-0 mt-2 z-[100] animate-in fade-in slide-in-from-top-1 duration-200">
                                                                        <div className="bg-white rounded-xl p-4 shadow-2xl border border-slate-100 min-w-[280px]">
                                                                            <div className="text-[12px] text-slate-400 font-medium mb-3 pb-2 border-b border-slate-50">
                                                                                Bütün İcazələr
                                                                            </div>

                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                {u.permissions.map((pid) => {
                                                                                    const p = AVAILABLE_PERMISSIONS.find(ap => ap.id === pid);
                                                                                    return p ? (
                                                                                        <span key={pid} className="px-2.5 py-1.5 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-100/50 whitespace-nowrap">
                                                                                            {p.label}
                                                                                        </span>
                                                                                    ) : null;
                                                                                })}
                                                                            </div>

                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-[11px] font-bold text-slate-300 italic px-2">İcazə təyin olunmayıb</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-5">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-700">
                                                    <Calendar size={10} className="text-slate-400" />
                                                    {mounted && u.lastLogin ? (
                                                        (() => {
                                                            const date = new Date(u.lastLogin);
                                                            const d = String(date.getDate()).padStart(2, '0');
                                                            const m = String(date.getMonth() + 1).padStart(2, '0');
                                                            const y = String(date.getFullYear()).slice(-2);
                                                            const h = String(date.getHours()).padStart(2, '0');
                                                            const min = String(date.getMinutes()).padStart(2, '0');
                                                            return `${d}.${m}.${y} ${h}:${min}`;
                                                        })()
                                                    ) : "-"}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => {
                                                        setEditingUser(u);
                                                        setSelectedRole(u.role);
                                                        setSelectedPermissions(u.permissions || []);
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-primary hover:text-primary hover:bg-primary/5 transition-all text-[10px] font-black shadow-sm uppercase tracking-wider"
                                                >
                                                    <Edit size={12} />
                                                    <span>Düzəliş</span>
                                                </button>
                                                {(currentUser.role === 'SUPERADMIN' || currentUser.role === 'ARCHIVE_MANAGER' || currentUser.role === 'MANAGER' || currentUser.role === 'INSPECTOR_LEAD') && u.id !== currentUser.email && (
                                                    <button
                                                        onClick={() => handleDeleteUser(u)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-red-100 text-red-500 rounded-xl hover:border-red-500 hover:bg-red-50 transition-all text-[10px] font-black shadow-sm uppercase tracking-wider"
                                                    >
                                                        <Trash2 size={12} />
                                                        <span>Sil</span>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* User Edit Modal */}
                {isModalOpen && editingUser && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl border border-white flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
                            {/* Modal Header */}
                            <div className="p-8 sm:p-10 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                                <div className="space-y-1">
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">İstifadəçi İcazələri</h3>
                                    <p className="text-sm font-bold text-slate-400">
                                        <span className="text-primary">{editingUser.displayName}</span> üçün icazələri tənzimləyin.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="p-3 hover:bg-gray-100 rounded-2xl transition-all text-slate-400 hover:text-slate-900"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-8 sm:p-10 overflow-y-auto custom-scrollbar space-y-10">
                                {/* Role Section */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Sistem Rolu</h4>
                                    <div className="relative group">
                                        <Shield className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors" size={20} />
                                        <select
                                            value={selectedRole}
                                            onChange={async (e) => {
                                                const newRole = e.target.value as UserDoc["role"];
                                                setSelectedRole(newRole);
                                                const defaultPerms = await getRolePermissions(newRole);
                                                setSelectedPermissions(defaultPerms);
                                            }}
                                            className="w-full pl-14 pr-12 py-4 bg-gray-50 border border-slate-200 rounded-2xl text-[15px] font-black text-slate-900 outline-none focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer"
                                        >
                                            {Object.entries(ROLE_LABELS)
                                                .filter(([key]) => {
                                                    if (currentUser?.role === 'SUPERADMIN') return true;
                                                    if (currentUser?.role === 'MANAGER') return key === 'ADMIN' || key === 'PENDING';
                                                    if (currentUser?.role === 'INSPECTOR_LEAD') return key === 'INSPECTOR' || key === 'PENDING';
                                                    if (currentUser?.role === 'ARCHIVE_MANAGER') return key === 'ARCHIVER' || key === 'PENDING';
                                                    return false;
                                                })
                                                .map(([key, label]) => (
                                                    <option key={key} value={key}>{label}</option>
                                                ))}
                                        </select>
                                        <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                                    </div>
                                </div>

                                {/* Permissions Grid */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Səhifə Girişləri</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {AVAILABLE_PERMISSIONS
                                            .filter(p => currentUser?.role === 'SUPERADMIN' || !['page_analytics', 'page_audit_logs'].includes(p.id))
                                            .map((p) => (
                                                <label
                                                    key={p.id}
                                                    className={cn(
                                                        "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer group",
                                                        selectedPermissions.includes(p.id)
                                                            ? "bg-primary/5 border-primary/20"
                                                            : "bg-white border-slate-100 hover:border-slate-300"
                                                    )}
                                                >
                                                    <span className={cn(
                                                        "text-[13px] font-black transition-colors uppercase tracking-tight",
                                                        selectedPermissions.includes(p.id) ? "text-primary" : "text-slate-700"
                                                    )}>
                                                        {p.label}
                                                    </span>
                                                    <div className="relative flex items-center justify-center h-6 w-6">
                                                        <input
                                                            type="checkbox"
                                                            className="peer h-6 w-6 appearance-none border-2 border-slate-200 rounded-lg checked:bg-primary checked:border-primary transition-all cursor-pointer bg-white shadow-sm"
                                                            checked={selectedPermissions.includes(p.id)}
                                                            onChange={() => {
                                                                setSelectedPermissions(prev =>
                                                                    prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                                                                );
                                                            }}
                                                        />
                                                        <Check size={14} className="absolute text-white scale-0 peer-checked:scale-100 transition-transform pointer-events-none" strokeWidth={4} />
                                                    </div>
                                                </label>
                                            ))}
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-8 sm:p-10 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-8 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-500 hover:bg-gray-100 hover:text-slate-900 transition-all uppercase tracking-widest"
                                >
                                    Ləğv et
                                </button>
                                <button
                                    onClick={handleSaveUser}
                                    className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-sm font-black shadow-xl shadow-slate-900/10 hover:bg-black hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest"
                                >
                                    Yadda saxla
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {isDeleteModalOpen && userToDelete && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-white overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="p-10 text-center space-y-6">
                                <div className="mx-auto w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center animate-bounce-subtle">
                                    <AlertTriangle size={40} className="text-red-500" />
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">Əminsiniz?</h3>
                                    <p className="text-sm font-bold text-slate-500">
                                        <span className="text-red-500">{userToDelete.displayName}</span> ({userToDelete.email}) istifadəçisini silmək istədiyinizə əminsiniz? Bu əməliyyat geri qaytarıla bilməz.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-3 pt-4">
                                    <button
                                        onClick={confirmDelete}
                                        className="w-full py-4 bg-red-500 text-white rounded-2xl text-sm font-black shadow-xl shadow-red-500/20 hover:bg-red-600 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest"
                                    >
                                        Bəli, Sil
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsDeleteModalOpen(false);
                                            setUserToDelete(null);
                                        }}
                                        className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl text-sm font-black hover:bg-slate-200 transition-all uppercase tracking-widest"
                                    >
                                        Ləğv et
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard >
    );
}

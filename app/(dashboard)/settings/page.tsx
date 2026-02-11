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
    ChevronDown,
    LayoutDashboard,
    Filter,
    ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";

import { AVAILABLE_PERMISSIONS, PermissionID } from "@/lib/permissions";
import { getAllUsers, updateUserRole } from "@/lib/db";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface UserDoc {
    id: string;
    email: string;
    displayName: string;
    role: "SUPERADMIN" | "ADMIN" | "MANAGER" | "INSPECTOR" | "ARCHIVIST" | "ARCHIVER" | "USER";
    lastLogin: string;
    permissions?: string[];
}

export default function UsersPage() {
    const { user: currentUser, isSuperAdmin, isLoading } = useAuth();
    const [users, setUsers] = useState<UserDoc[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [permissionFilterIds, setPermissionFilterIds] = useState<string[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserDoc | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [selectedRole, setSelectedRole] = useState<UserDoc["role"]>("USER");
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
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
            await updateUserRole(editingUser.id, selectedRole, selectedPermissions);
            toast.success("Məlumatlar yadda saxlanıldı");
            fetchUsers();
            setIsModalOpen(false);
        } catch (e) {
            toast.error("Xəta baş verdi");
        }
    };

    const togglePermissionFilter = (id: string) => {
        setPermissionFilterIds(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const filteredUsers = users.filter(u => {
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
                                        <option value="ADMIN">Admin</option>
                                        <option value="MANAGER">Bölmə Rəhbəri</option>
                                        <option value="INSPECTOR">Müfəttiş</option>
                                        <option value="ARCHIVIST">Arxivist</option>
                                        <option value="ARCHIVER">Arxivçi</option>
                                        <option value="USER">İstifadəçi</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-text-main pointer-events-none" size={18} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto -mx-8 px-8">
                    <table className="w-full min-w-[800px]">
                        <thead>
                            <tr className="border-y border-border-soft/50">
                                <th className="px-8 py-5 text-left text-[11px] font-black text-text-soft/60 uppercase tracking-widest">İstifadəçi</th>
                                <th className="px-8 py-5 text-left text-[11px] font-black text-text-soft/60 uppercase tracking-widest">Email</th>
                                <th className="px-8 py-5 text-left text-[11px] font-black text-text-soft/60 uppercase tracking-widest">Rol</th>
                                <th className="px-8 py-5 text-left text-[11px] font-black text-text-soft/60 uppercase tracking-widest">İcazələr</th>
                                <th className="px-8 py-5 text-left text-[11px] font-black text-text-soft/60 uppercase tracking-widest">Son Giriş</th>
                                <th className="px-10 py-5 text-right text-[11px] font-black text-text-soft/60 uppercase tracking-widest">Əməliyyat</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-soft/30">
                            {loadingUsers ? (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <RefreshCw size={32} className="animate-spin text-primary/20" />
                                            <span className="text-sm font-bold text-text-soft">İstifadəçilər portalda axtarılır...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredUsers.map((u) => (
                                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 bg-gray-50 border border-border-soft rounded-full flex items-center justify-center font-black text-text-main text-xs shadow-sm">
                                                {u.displayName ? (u.displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)) : "?"}
                                            </div>
                                            <span className="font-bold text-sm text-text-main">{u.displayName}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-4 text-sm font-bold text-text-soft">{u.email}</td>
                                    <td className="px-8 py-4">
                                        <span className={cn(
                                            "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm",
                                            u.role === "SUPERADMIN" ? "bg-primary text-white" :
                                                u.role === "ADMIN" ? "bg-gray-100 text-text-main" :
                                                    "bg-gray-50 text-text-soft border border-border-soft"
                                        )}>
                                            {u.role === "SUPERADMIN" ? "Super Admin" : u.role}
                                        </span>
                                    </td>
                                    <td className="px-8 py-4">
                                        <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                                            {u.permissions && u.permissions.length > 0 ? (
                                                <>
                                                    {u.permissions.slice(0, 2).map((pid, i) => {
                                                        const p = AVAILABLE_PERMISSIONS.find(ap => ap.id === pid);
                                                        return p ? (
                                                            <span key={pid} className="px-2.5 py-1 bg-gray-50 border border-border-soft rounded-full text-[9px] font-black text-text-main whitespace-nowrap">
                                                                {p.label}
                                                            </span>
                                                        ) : null;
                                                    })}
                                                    {u.permissions.length > 2 && (
                                                        <span className="px-2 py-1 bg-white border border-border-soft rounded-full text-[9px] font-black text-text-soft">
                                                            +{u.permissions.length - 2}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-[10px] font-bold text-text-soft/40 italic">İcazə yoxdur</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-8 py-4 text-[11px] font-bold text-text-soft whitespace-nowrap">
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
                                    </td>
                                    <td className="px-10 py-4 text-right">
                                        <button
                                            onClick={() => {
                                                setEditingUser(u);
                                                setSelectedRole(u.role);
                                                setSelectedPermissions(u.permissions || []);
                                                setIsModalOpen(true);
                                            }}
                                            className="text-sm font-black text-text-main hover:text-primary transition-colors underline underline-offset-4 decoration-border-soft hover:decoration-primary whitespace-nowrap"
                                        >
                                            Düzəliş et
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* User Edit Modal */}
                {isModalOpen && editingUser && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm shadow-inner" onClick={() => setIsModalOpen(false)} />
                        <div className="relative w-full max-w-[500px] max-h-[90vh] bg-white rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden flex flex-col">
                            {/* Modal Header */}
                            <div className="px-6 sm:px-10 py-8 space-y-2 flex-shrink-0">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="absolute right-8 top-8 p-2 hover:bg-gray-50 rounded-full transition-colors text-text-soft"
                                >
                                    <X size={20} />
                                </button>
                                <h3 className="text-2xl font-black text-text-main">İstifadəçi icazələri</h3>
                                <p className="text-sm text-text-soft font-bold">
                                    {editingUser.displayName} üçün rol və səhifə icazələrini təyin edin.
                                </p>
                            </div>

                            {/* Modal Body */}
                            <div className="px-6 sm:px-10 pb-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                                {/* Role Selection */}
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-text-main uppercase tracking-widest pl-1">Sistem Rolu</label>
                                    <div className="relative">
                                        <select
                                            className="w-full appearance-none pl-4 pr-10 py-3.5 bg-white border-2 border-primary rounded-2xl text-sm font-bold text-text-main outline-none focus:ring-4 focus:ring-primary/5 transition-all cursor-pointer"
                                            value={selectedRole}
                                            onChange={(e) => setSelectedRole(e.target.value as any)}
                                        >
                                            <option value="SUPERADMIN">Super Admin</option>
                                            <option value="ADMIN">Admin</option>
                                            <option value="MANAGER">Bölmə Rəhbəri</option>
                                            <option value="INSPECTOR">Müfəttiş</option>
                                            <option value="ARCHIVIST">Arxivist</option>
                                            <option value="ARCHIVER">Arxivçi</option>
                                            <option value="USER">İstifadəçi</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-text-main pointer-events-none" size={18} />
                                    </div>
                                </div>

                                {/* Permissions Section */}
                                <div className="space-y-5">
                                    <h4 className="text-sm font-black text-text-main uppercase tracking-tight">Səhifə və Əməliyyat İcazələri</h4>

                                    <div className="space-y-8">
                                        {Array.from(new Set(AVAILABLE_PERMISSIONS.map(p => p.group))).map(group => (
                                            <div key={group}>
                                                <label className="text-[10px] font-black text-text-soft/60 uppercase tracking-[0.2em] pl-1">{group}</label>
                                                <div className="mt-4 p-6 bg-gray-50/50 border border-border-soft rounded-[1.5rem] space-y-4">
                                                    {AVAILABLE_PERMISSIONS.filter(p => p.group === group).map((p) => (
                                                        <label key={p.id} className="flex items-center gap-4 group cursor-pointer">
                                                            <div className="relative flex items-center justify-center h-5 w-5">
                                                                <input
                                                                    type="checkbox"
                                                                    className="peer h-5 w-5 appearance-none border-2 border-border-soft rounded-lg checked:bg-primary checked:border-primary transition-all cursor-pointer bg-white"
                                                                    checked={selectedPermissions.includes(p.id)}
                                                                    onChange={() => {
                                                                        setSelectedPermissions(prev =>
                                                                            prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                                                                        );
                                                                    }}
                                                                />
                                                                <Check size={14} className="absolute text-white scale-0 peer-checked:scale-100 transition-transform pointer-events-none" strokeWidth={4} />
                                                            </div>
                                                            <span className="text-sm font-bold text-text-main group-hover:text-primary transition-colors">{p.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-6 sm:p-8 bg-gray-50/50 border-t border-border-soft flex items-center justify-end gap-3 flex-shrink-0">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-8 py-3 bg-white border border-border-soft rounded-xl text-sm font-bold text-text-main hover:bg-gray-100 transition-all"
                                >
                                    Ləğv et
                                </button>
                                <button
                                    onClick={handleSaveUser}
                                    className="px-8 py-3 bg-primary text-white rounded-xl text-sm font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                                >
                                    Yadda saxla
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}

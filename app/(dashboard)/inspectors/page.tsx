"use client";

import { useState, useEffect } from "react";
import {
    UserCircle,
    Phone,
    Edit2,
    Search,
    X,
    LayoutDashboard,
    ChevronDown,
    Loader2
} from "lucide-react";
import {
    getAllUsers,
    updateUserData
} from "@/lib/db";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import { formatPhoneInput } from "@/lib/format";

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

export default function InspectorsPage() {
    const { user, can, isLoading: authLoading } = useAuth();
    const [inspectors, setInspectors] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const usersData = await getAllUsers();
            setInspectors(usersData.filter((u: any) => u.role === 'INSPECTOR' || u.role === 'INSPECTOR_LEAD'));
        } catch (error) {
            toast.error("Məlumatlar yüklənmədi");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartEdit = (inspector: any) => {
        setEditingId(inspector.id);
        setEditValue(inspector.phoneNumber || inspector.phone1 || "");
    };

    const handleSaveInline = async (id: string) => {
        try {
            await updateUserData(id, { phoneNumber: editValue }, user?.email || "system");
            setInspectors(prev => prev.map(i => i.id === id ? { ...i, phoneNumber: editValue } : i));
            toast.success("Nömrə yeniləndi");
            setEditingId(null);
        } catch (error) {
            toast.error("Xəta baş verdi");
        }
    };

    if (authLoading || isLoading) {
        return (
            <div className="h-[80vh] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Yüklənir...</p>
            </div>
        );
    }

    if (!user || (!can('page_inspectors') && user.role !== 'SUPERADMIN')) {
        return (
            <AuthGuard>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-16 w-16 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
                        <UserCircle size={32} className="text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Giriş Məhdudlaşdırılıb</h2>
                    <p className="text-slate-500 max-w-[300px]">Bu bölməyə daxil olmaq üçün Müfəttiş İdarəetməsi icazəniz olmalıdır.</p>
                </div>
            </AuthGuard>
        );
    }

    const lowerSearch = searchTerm.toLowerCase();
    const filteredInspectors = inspectors.filter(i =>
        i.displayName.toLowerCase().includes(lowerSearch) ||
        i.email.toLowerCase().includes(lowerSearch)
    );

    return (
        <AuthGuard>
            <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500 pb-24 px-4 sm:px-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-widest">
                            <LayoutDashboard size={14} />
                            <span>İdarə Paneli</span>
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic flex items-center gap-4">
                                Müfəttiş <span className="text-primary not-italic">İdarəsi</span>
                            </h1>
                        </div>
                    </div>

                    {/* Search bar */}
                    <div className="relative group w-full md:w-80">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Müfəttiş axtar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all font-bold text-sm text-slate-800 shadow-sm"
                        />
                    </div>
                </div>

                {/* Main Content */}
                <div className="bg-white rounded-[2.5rem] border border-slate-100 soft-shadow overflow-hidden">
                    <div className="p-8 lg:p-12 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm border border-amber-100">
                                <UserCircle size={24} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight text-amber-600">Siyahı</h3>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                    {searchTerm ? `Axtarış üzrə ${filteredInspectors.length} nəticə` : `Cəmi ${inspectors.length} müfəttiş`}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 lg:p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredInspectors.length === 0 ? (
                                <div className="col-span-full py-20 text-center text-slate-400">
                                    <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                                        <Search size={40} />
                                    </div>
                                    <p className="font-bold uppercase tracking-widest text-xs">Uğun müfəttiş tapılmadı</p>
                                </div>
                            ) : (
                                filteredInspectors.map((inspector) => (
                                    <div key={inspector.id} className="bg-white rounded-3xl border border-slate-100 p-6 soft-shadow hover:border-amber-200 transition-all group relative">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="h-10 w-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-amber-50 group-hover:text-amber-600 transition-colors">
                                                <UserCircle size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight truncate pr-8">{inspector.displayName}</h4>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{inspector.email}</p>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-50">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Əlaqə Nömrəsi</label>
                                                {editingId === inspector.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="relative flex-1">
                                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                                                            <input
                                                                autoFocus
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(formatPhoneInput(e.target.value))}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') handleSaveInline(inspector.id);
                                                                    if (e.key === 'Escape') setEditingId(null);
                                                                }}
                                                                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-amber-200 focus:bg-white transition-all font-black text-xs text-slate-800"
                                                                placeholder="(0XX) XXX-XX-XX"
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => handleSaveInline(inspector.id)}
                                                            className="h-8 px-3 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all"
                                                        >
                                                            OK
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingId(null)}
                                                            className="h-8 w-8 bg-slate-50 text-slate-400 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-all border border-slate-100"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between group/val">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-6 w-6 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                                                                <Phone size={12} />
                                                            </div>
                                                            <p className="text-sm font-black text-slate-700 tracking-tight">
                                                                {inspector.phoneNumber || inspector.phone1 || "—"}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleStartEdit(inspector)}
                                                            className="h-7 w-7 rounded-lg bg-slate-50 text-slate-400 hover:text-amber-600 hover:bg-amber-50 flex items-center justify-center transition-all border border-slate-100 opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </AuthGuard>
    );
}

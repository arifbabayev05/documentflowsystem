"use client";

import { useState, useEffect } from "react";
import {
    Settings,
    Building2,
    Scale,
    Plus,
    Trash2,
    Edit2,
    Save,
    X,
    Loader2,
    Phone,
    MapPin,
    Printer,
    UserCircle,
    Store
} from "lucide-react";
import {
    getCourts,
    addCourt,
    updateCourt,
    deleteCourt,
    getGlobalSettings,
    updateGlobalSettings,
    getStores,
    addStore,
    updateStore,
    deleteStore
} from "@/lib/db";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";

interface Court {
    id: string;
    name: string;
    address: string;
    phone: string;
    fax: string;
}

interface Store {
    id: string;
    name: string;
}

interface CompanyInfo {
    companyName: string;
    address: string;
    phone: string;
    fax: string;
    representative: string;
    representativeFin: string;
}

export default function ParametersPage() {
    const { user } = useAuth();
    const [courts, setCourts] = useState<Court[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
        companyName: "",
        address: "",
        phone: "",
        fax: "",
        representative: "",
        representativeFin: ""
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
    const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
    const [editingCourt, setEditingCourt] = useState<Court | null>(null);
    const [editingStore, setEditingStore] = useState<Store | null>(null);
    const [courtForm, setCourtForm] = useState({
        name: "",
        address: "",
        phone: "",
        fax: ""
    });
    const [storeForm, setStoreForm] = useState({
        name: ""
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [courtsData, storesData, settingsData] = await Promise.all([
                getCourts(),
                getStores(),
                getGlobalSettings()
            ]);
            setCourts(courtsData as Court[]);
            setStores(storesData as Store[]);
            if (settingsData) {
                setCompanyInfo(prev => ({
                    ...prev,
                    ...settingsData as CompanyInfo
                }));
            }
        } catch (error) {
            console.error(error);
            toast.error("Məlumatlar yüklənmədi");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        try {
            await updateGlobalSettings(companyInfo, user?.email || "system");
            toast.success("Şirkət məlumatları yadda saxlanıldı");
        } catch (error) {
            toast.error("Xəta baş verdi");
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleOpenCourtModal = (court?: Court) => {
        if (court) {
            setEditingCourt(court);
            setCourtForm({
                name: court.name,
                address: court.address,
                phone: court.phone,
                fax: court.fax
            });
        } else {
            setEditingCourt(null);
            setCourtForm({ name: "", address: "", phone: "", fax: "" });
        }
        setIsCourtModalOpen(true);
    };

    const handleSaveCourt = async () => {
        if (!courtForm.name) {
            toast.error("Məhkəmə adı mütləqdir");
            return;
        }

        try {
            if (editingCourt) {
                await updateCourt(editingCourt.id, courtForm, user?.email || "system");
                setCourts(prev => prev.map(c => c.id === editingCourt.id ? { ...c, ...courtForm } : c));
                toast.success("Məhkəmə yeniləndi");
            } else {
                const newCourt = await addCourt(courtForm, user?.email || "system");
                setCourts(prev => [...prev, newCourt as Court]);
                toast.success("Məhkəmə əlavə edildi");
            }
            setIsCourtModalOpen(false);
        } catch (error) {
            toast.error("Xəta baş verdi");
        }
    };

    const handleDeleteCourt = async (id: string) => {
        if (!confirm("Bu məhkəməni silmək istədiyinizə əminsiniz?")) return;
        try {
            await deleteCourt(id, user?.email || "system");
            setCourts(prev => prev.filter(c => c.id !== id));
            toast.info("Məhkəmə silindi");
        } catch (error) {
            toast.error("Silmək mümkün olmadı");
        }
    };

    const handleOpenStoreModal = (store?: Store) => {
        if (store) {
            setEditingStore(store);
            setStoreForm({ name: store.name });
        } else {
            setEditingStore(null);
            setStoreForm({ name: "" });
        }
        setIsStoreModalOpen(true);
    };

    const handleSaveStore = async () => {
        if (!storeForm.name.trim()) {
            toast.error("Mağaza adı mütləqdir");
            return;
        }

        try {
            if (editingStore) {
                await updateStore(editingStore.id, storeForm.name, user?.email || "system");
                setStores(prev => prev.map(s => s.id === editingStore.id ? { ...s, name: storeForm.name } : s));
                toast.success("Mağaza yeniləndi");
            } else {
                const newStore = await addStore(storeForm.name, user?.email || "system");
                setStores(prev => [...prev, newStore as Store]);
                toast.success("Mağaza əlavə edildi");
            }
            setIsStoreModalOpen(false);
        } catch (error) {
            toast.error("Xəta baş verdi");
        }
    };

    const handleDeleteStore = async (id: string) => {
        if (!confirm("Bu mağazanı silmək istədiyinizə əminsiniz?")) return;
        try {
            await deleteStore(id, user?.email || "system");
            setStores(prev => prev.filter(s => s.id !== id));
            toast.info("Mağaza silindi");
        } catch (error) {
            toast.error("Silmək mümkün olmadı");
        }
    };

    if (isLoading) {
        return (
            <div className="h-[80vh] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em]">Yüklənir...</p>
            </div>
        );
    }

    return (
        <AuthGuard>
            <div className="max-w-[1400px] mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-blue-100">
                    <div className="space-y-1">
                        <h1 className="text-3xl lg:text-4xl font-black text-slate-800 tracking-tight">Parametrlər</h1>
                        <p className="text-slate-500 font-medium text-sm lg:text-base italic">Sistem üzrə məlumatların və şablon dəyişənlərinin tənzimlənməsi</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

                    {/* Stores Section */}
                    <div className="lg:col-span-12">
                        <div className="bg-white rounded-[2.5rem] border border-blue-50 soft-shadow overflow-hidden">
                            <div className="p-8 lg:p-12 border-b border-blue-50 flex items-center justify-between bg-slate-50/30">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm border border-emerald-100">
                                        <Store size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Mağazalar</h3>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Cəmi {stores.length} qeydiyyat</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleOpenStoreModal()}
                                    className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                                >
                                    <Plus size={16} />
                                    Mağaza Əlavə Et
                                </button>
                            </div>

                            <div className="p-4 lg:p-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {stores.length === 0 ? (
                                        <div className="col-span-full py-20 text-center text-slate-400">
                                            <p className="font-bold uppercase tracking-widest text-xs">Heç bir mağaza tapılmadı</p>
                                        </div>
                                    ) : (
                                        stores.map((store) => (
                                            <div key={store.id} className="bg-white rounded-2xl border border-slate-100 p-5 soft-shadow hover:border-emerald-200 transition-all group relative">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                                                            <Store size={18} />
                                                        </div>
                                                        <h4 className="font-black text-slate-800 text-sm leading-tight truncate">{store.name}</h4>
                                                    </div>
                                                    <div className="flex gap-1.5 shrink-0">
                                                        <button
                                                            onClick={() => handleOpenStoreModal(store)}
                                                            className="h-7 w-7 rounded-lg bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 flex items-center justify-center transition-all border border-slate-100"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteStore(store.id)}
                                                            className="h-7 w-7 rounded-lg bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all border border-slate-100"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Courts Section */}
                    <div className="lg:col-span-12">
                        <div className="bg-white rounded-[2.5rem] border border-blue-50 soft-shadow overflow-hidden">
                            <div className="p-8 lg:p-12 border-b border-blue-50 flex items-center justify-between bg-slate-50/30">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-sm border border-primary/10">
                                        <Scale size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Məhkəmələr</h3>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Cəmi {courts.length} qeydiyyat</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleOpenCourtModal()}
                                    className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                                >
                                    <Plus size={16} />
                                    Məhkəmə Əlavə Et
                                </button>
                            </div>

                            <div className="p-4 lg:p-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {courts.length === 0 ? (
                                        <div className="col-span-full py-20 text-center text-slate-400">
                                            <p className="font-bold uppercase tracking-widest text-xs">Heç bir məhkəmə tapılmadı</p>
                                        </div>
                                    ) : (
                                        courts.map((court) => (
                                            <div key={court.id} className="bg-white rounded-[2rem] border border-slate-100 p-6 soft-shadow hover:border-primary/20 transition-all group relative">
                                                <div className="space-y-4">
                                                    <h4 className="font-black text-slate-800 text-lg leading-tight uppercase tracking-tight pr-10">{court.name}</h4>

                                                    <div className="space-y-3">
                                                        <div className="flex items-start gap-2.5">
                                                            <MapPin size={14} className="text-slate-400 mt-1 shrink-0" />
                                                            <p className="text-[11px] font-bold text-slate-600 leading-relaxed">{court.address}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2.5">
                                                            <Phone size={14} className="text-slate-400 shrink-0" />
                                                            <p className="text-[11px] font-bold text-slate-600">{court.phone}</p>
                                                        </div>
                                                        {court.fax && (
                                                            <div className="flex items-center gap-2.5">
                                                                <Printer size={14} className="text-slate-400 shrink-0" />
                                                                <p className="text-[11px] font-bold text-slate-600">{court.fax}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="absolute top-6 right-6 flex flex-col gap-2">
                                                    <button
                                                        onClick={() => handleOpenCourtModal(court)}
                                                        className="h-8 w-8 rounded-lg bg-slate-50 text-slate-400 hover:text-primary hover:bg-blue-50 flex items-center justify-center transition-all border border-slate-100"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteCourt(court.id)}
                                                        className="h-8 w-8 rounded-lg bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all border border-slate-100"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Company Info Section */}
                    <div className="lg:col-span-12">
                        <div className="bg-white rounded-[2.5rem] border border-blue-50 p-8 lg:p-12 soft-shadow relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-12 opacity-[0.02] pointer-events-none">
                                <Building2 size={240} />
                            </div>

                            <div className="flex items-center justify-between mb-10 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 bg-blue-50 text-primary rounded-2xl flex items-center justify-center shadow-sm border border-blue-50">
                                        <Building2 size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Şirkət Məlumatları</h3>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Sənədlərdə İddiaçı hissəsi üçün</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={isSavingSettings}
                                    className="flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/95 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                                >
                                    {isSavingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    Yadda Saxla
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">İddiaçının Tam Adı</label>
                                    <input
                                        value={companyInfo.companyName || ""}
                                        onChange={(e) => setCompanyInfo({ ...companyInfo, companyName: e.target.value })}
                                        placeholder="Məs: 'ABC TELECOM' Məhdud Məsuliyyətli Cəmiyyəti"
                                        className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Nümayəndə</label>
                                    <input
                                        value={companyInfo.representative || ""}
                                        onChange={(e) => setCompanyInfo({ ...companyInfo, representative: e.target.value })}
                                        placeholder="Məs: Süleymanlı Rauf Xudayar oğlu..."
                                        className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Nümayəndənin FİN Kodu</label>
                                    <input
                                        value={companyInfo.representativeFin || ""}
                                        onChange={(e) => setCompanyInfo({ ...companyInfo, representativeFin: e.target.value })}
                                        placeholder="Məs: 0WY0TVF"
                                        className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Hüquqi Ünvan</label>
                                    <input
                                        value={companyInfo.address || ""}
                                        onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Telefon</label>
                                    <input
                                        value={companyInfo.phone || ""}
                                        onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Faks</label>
                                    <input
                                        value={companyInfo.fax || ""}
                                        onChange={(e) => setCompanyInfo({ ...companyInfo, fax: e.target.value })}
                                        className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Court Add/Edit Modal */}
                {isCourtModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-xl rounded-[2.5rem] soft-shadow-lg p-8 lg:p-12 relative animate-in zoom-in-95 duration-300">
                            <button
                                onClick={() => setIsCourtModalOpen(false)}
                                className="absolute top-8 right-8 text-slate-300 hover:text-slate-600 transition-colors"
                            >
                                <X size={24} />
                            </button>

                            <div className="flex items-center gap-4 mb-10">
                                <div className="h-12 w-12 bg-blue-50 text-primary rounded-2xl flex items-center justify-center border border-blue-100">
                                    <Scale size={24} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                                        {editingCourt ? "Məhkəməni Yenilə" : "Yeni Məhkəmə"}
                                    </h3>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Məlumatları daxil edin</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Məhkəmənin Adı</label>
                                    <input
                                        value={courtForm.name}
                                        onChange={(e) => setCourtForm({ ...courtForm, name: e.target.value })}
                                        placeholder="Məs: LƏNKƏRAN RAYON"
                                        className="w-full px-6 py-4 bg-slate-50 border border-blue-50 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Ünvan</label>
                                    <textarea
                                        value={courtForm.address}
                                        onChange={(e) => setCourtForm({ ...courtForm, address: e.target.value })}
                                        placeholder="AZ-4200, Lənkəran şəhəri, Nizami küç., 3"
                                        className="w-full px-6 py-4 bg-slate-50 border border-blue-50 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 min-h-[100px] resize-none"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Telefon</label>
                                        <input
                                            value={courtForm.phone}
                                            onChange={(e) => setCourtForm({ ...courtForm, phone: e.target.value })}
                                            className="w-full px-6 py-4 bg-slate-50 border border-blue-50 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Faks</label>
                                        <input
                                            value={courtForm.fax}
                                            onChange={(e) => setCourtForm({ ...courtForm, fax: e.target.value })}
                                            className="w-full px-6 py-4 bg-slate-50 border border-blue-50 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800"
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 flex gap-4">
                                    <button
                                        onClick={() => setIsCourtModalOpen(false)}
                                        className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Ləğv Et
                                    </button>
                                    <button
                                        onClick={handleSaveCourt}
                                        className="flex-1 py-4 bg-primary hover:bg-primary/95 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20"
                                    >
                                        {editingCourt ? "Yenilə" : "Əlavə Et"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Store Add/Edit Modal */}
                {isStoreModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-md rounded-[2.5rem] soft-shadow-lg p-8 lg:p-10 relative animate-in zoom-in-95 duration-300">
                            <button
                                onClick={() => setIsStoreModalOpen(false)}
                                className="absolute top-8 right-8 text-slate-300 hover:text-slate-600 transition-colors"
                            >
                                <X size={24} />
                            </button>

                            <div className="flex items-center gap-4 mb-8">
                                <div className="h-12 w-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100">
                                    <Store size={24} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                                        {editingStore ? "Mağazanı Yenilə" : "Yeni Mağaza"}
                                    </h3>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Mağaza adını daxil edin</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Mağaza Adı</label>
                                    <input
                                        value={storeForm.name}
                                        onChange={(e) => setStoreForm({ name: e.target.value })}
                                        placeholder='Məs: Kontakt "Vurğun Residence"'
                                        className="w-full px-6 py-4 bg-slate-50 border border-emerald-50 rounded-[1.5rem] outline-none focus:border-emerald-300 focus:bg-white transition-all font-bold text-sm text-slate-800"
                                        autoFocus
                                    />
                                </div>

                                <div className="pt-4 flex gap-4">
                                    <button
                                        onClick={() => setIsStoreModalOpen(false)}
                                        className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Ləğv Et
                                    </button>
                                    <button
                                        onClick={handleSaveStore}
                                        className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20"
                                    >
                                        {editingStore ? "Yenilə" : "Əlavə Et"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}

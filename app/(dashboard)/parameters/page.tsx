"use client";

import { useState, useEffect } from "react";
import {
    Scale,
    Store,
    Building2,
    Plus,
    Edit2,
    Trash2,
    Save,
    Phone,
    MapPin,
    Printer,
    Search,
    X,
    LayoutDashboard,
    Loader2
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

/** Internal helper for conditional classes */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface Court {
    id: string;
    name: string;
    address: string;
    phone: string;
    fax?: string;
}

interface Store {
    id: string;
    name: string;
}

interface CompanyInfo {
    companyName: string;
    representative: string;
    representativeFin: string;
    address: string;
    phone: string;
    fax: string;
    dbMode?: "mysql";
}

export default function ParametersPage() {
    const { user, can } = useAuth();
    const [courts, setCourts] = useState<Court[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    const [isLoading, setIsLoading] = useState(true);
    const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
    const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
    const [editingCourt, setEditingCourt] = useState<Court | null>(null);
    const [editingStore, setEditingStore] = useState<Store | null>(null);

    const [courtForm, setCourtForm] = useState({ name: "", address: "", phone: "", fax: "" });
    const [storeForm, setStoreForm] = useState({ name: "" });
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
        companyName: "",
        representative: "",
        representativeFin: "",
        address: "",
        phone: "",
        fax: "",
        dbMode: "mysql"
    });
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user]);

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
                    ...(settingsData as any),
                    dbMode: "mysql"
                }));
            }
        } catch (error) {
            toast.error("MÉ™lumatlar yÃ¼klÉ™nmÉ™di");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenCourtModal = (court?: Court) => {
        if (court) {
            setEditingCourt(court);
            setCourtForm({ name: court.name, address: court.address, phone: court.phone, fax: court.fax || "" });
        } else {
            setEditingCourt(null);
            setCourtForm({ name: "", address: "", phone: "", fax: "" });
        }
        setIsCourtModalOpen(true);
    };

    const handleSaveCourt = async () => {
        try {
            if (editingCourt) {
                await updateCourt(editingCourt.id, courtForm);
                toast.success("MÉ™hkÉ™mÉ™ yenilÉ™ndi");
            } else {
                await addCourt(courtForm);
                toast.success("MÉ™hkÉ™mÉ™ É™lavÉ™ edildi");
            }
            setIsCourtModalOpen(false);
            fetchData();
        } catch (error) {
            toast.error("XÉ™ta baÅŸ verdi");
        }
    };

    const handleDeleteCourt = async (id: string) => {
        if (confirm("Bu mÉ™hkÉ™mÉ™ni silmÉ™k istÉ™diyinizÉ™ É™minsiniz?")) {
            try {
                await deleteCourt(id);
                toast.success("MÉ™hkÉ™mÉ™ silindi");
                fetchData();
            } catch (error) {
                toast.error("XÉ™ta baÅŸ verdi");
            }
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
        try {
            if (editingStore) {
                await updateStore(editingStore.id, storeForm.name);
                toast.success("MaÄŸaza yenilÉ™ndi");
            } else {
                await addStore(storeForm.name);
                toast.success("MaÄŸaza É™lavÉ™ edildi");
            }
            setIsStoreModalOpen(false);
            fetchData();
        } catch (error) {
            toast.error("XÉ™ta baÅŸ verdi");
        }
    };

    const handleDeleteStore = async (id: string) => {
        if (confirm("Bu maÄŸazanÄ± silmÉ™k istÉ™diyinizÉ™ É™minsiniz?")) {
            try {
                await deleteStore(id);
                toast.success("MaÄŸaza silindi");
                fetchData();
            } catch (error) {
                toast.error("XÉ™ta baÅŸ verdi");
            }
        }
    };

    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        try {
            await updateGlobalSettings({ ...companyInfo, dbMode: "mysql" });
            toast.success("ÅžirkÉ™t mÉ™lumatlarÄ± yadda saxlanÄ±ldÄ±");
        } catch (error) {
            toast.error("XÉ™ta baÅŸ verdi");
        } finally {
            setIsSavingSettings(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-[80vh] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">YÃ¼klÉ™nir...</p>
            </div>
        );
    }

    if (!user || (!can('page_parameters') && user.role !== 'SUPERADMIN')) {
        return (
            <AuthGuard>
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-16 w-16 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
                        <Building2 size={32} className="text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">GiriÅŸ MÉ™hdudlaÅŸdÄ±rÄ±lÄ±b</h2>
                    <p className="text-slate-500 max-w-[300px]">Bu bÃ¶lmÉ™yÉ™ daxil olmaq Ã¼Ã§Ã¼n ParametrlÉ™r icazÉ™niz olmalÄ±dÄ±r.</p>
                </div>
            </AuthGuard>
        );
    }

    const lowerSearch = searchTerm.toLowerCase();
    const filteredCourts = courts.filter(c =>
        c.name.toLowerCase().includes(lowerSearch) ||
        c.address.toLowerCase().includes(lowerSearch)
    );
    const filteredStores = stores.filter(s =>
        s.name.toLowerCase().includes(lowerSearch)
    );

    return (
        <AuthGuard>
            <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500 pb-24 px-4 sm:px-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-widest">
                            <LayoutDashboard size={14} />
                            <span>Ä°darÉ™ Paneli</span>
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic flex items-center gap-4 transition-all">
                                Sistem <span className="text-primary not-italic">ParametrlÉ™ri</span>
                            </h1>
                            <p className="text-sm font-bold text-slate-400 max-w-md">
                                MÉ™hkÉ™mÉ™lÉ™r, maÄŸazalar vÉ™ ÅŸirkÉ™t mÉ™lumatlarÄ±nÄ± buradan idarÉ™ edin.
                            </p>
                        </div>
                    </div>

                    {/* Search bar */}
                    <div className="relative group w-full md:w-80">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="AxtarÄ±ÅŸ..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all font-bold text-sm text-slate-800 shadow-sm"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Stores Section */}
                    {(searchTerm === "" || filteredStores.length > 0) && (
                        <div className="lg:col-span-12">
                            <div className="bg-white rounded-[2.5rem] border border-emerald-50 soft-shadow overflow-hidden">
                                <div className="p-8 lg:p-12 border-b border-emerald-50 flex items-center justify-between bg-slate-50/30">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm border border-emerald-100">
                                            <Store size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">MaÄŸazalar</h3>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                                {searchTerm ? `AxtarÄ±ÅŸ Ã¼zrÉ™ ${filteredStores.length} nÉ™ticÉ™` : `CÉ™mi ${stores.length} qeydiyyat`}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleOpenStoreModal()}
                                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                                    >
                                        <Plus size={16} />
                                        MaÄŸaza ÆlavÉ™ Et
                                    </button>
                                </div>

                                <div className="p-4 lg:p-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {filteredStores.map((store) => (
                                            <div key={store.id} className="bg-white rounded-2xl border border-slate-100 p-5 soft-shadow hover:border-emerald-200 transition-all group relative">
                                                <div className="flex items-center gap-3 pr-10">
                                                    <div className="h-4 w-4 rounded-full bg-emerald-400 shrink-0" />
                                                    <h4 className="font-bold text-slate-700 text-sm">{store.name}</h4>
                                                </div>
                                                <div className="absolute top-4 right-4 flex items-center gap-1">
                                                    <button onClick={() => handleOpenStoreModal(store)} className="p-1.5 text-slate-300 hover:text-emerald-600 transition-colors"><Edit2 size={12} /></button>
                                                    <button onClick={() => handleDeleteStore(store.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Courts Section */}
                    {(searchTerm === "" || filteredCourts.length > 0) && (
                        <div className="lg:col-span-12">
                            <div className="bg-white rounded-[2.5rem] border border-blue-50 soft-shadow overflow-hidden">
                                <div className="p-8 lg:p-12 border-b border-blue-50 flex items-center justify-between bg-slate-50/30">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-sm border border-primary/10">
                                            <Scale size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">MÉ™hkÉ™mÉ™lÉ™r</h3>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                                {searchTerm ? `AxtarÄ±ÅŸ Ã¼zrÉ™ ${filteredCourts.length} nÉ™ticÉ™` : `CÉ™mi ${courts.length} qeydiyyat`}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleOpenCourtModal()}
                                        className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                                    >
                                        <Plus size={16} />
                                        MÉ™hkÉ™mÉ™ ÆlavÉ™ Et
                                    </button>
                                </div>

                                <div className="p-4 lg:p-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {filteredCourts.map((court) => (
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
                                                    <button onClick={() => handleOpenCourtModal(court)} className="h-8 w-8 rounded-lg bg-slate-50 text-slate-400 hover:text-primary hover:bg-blue-50 flex items-center justify-center transition-all border border-slate-100"><Edit2 size={14} /></button>
                                                    <button onClick={() => handleDeleteCourt(court.id)} className="h-8 w-8 rounded-lg bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-all border border-slate-100"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {searchTerm !== "" && filteredStores.length === 0 && filteredCourts.length === 0 && (
                        <div className="lg:col-span-12 py-20 bg-white rounded-[2.5rem] border border-blue-50 text-center soft-shadow">
                            <div className="h-16 w-16 bg-slate-50 text-slate-300 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                <X size={32} />
                            </div>
                            <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">NÉ™ticÉ™ TapÄ±lmadÄ±</h4>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2 italic">"{searchTerm}" axtarÄ±ÅŸÄ±na uyÄŸun heÃ§ bir mÉ™lumat tapÄ±lmadÄ±</p>
                        </div>
                    )}

                    {searchTerm === "" && (
                        <div className="lg:col-span-12">
                            <div className="bg-white rounded-[2.5rem] border border-blue-50 p-8 lg:p-12 soft-shadow relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-12 opacity-[0.02] pointer-events-none text-primary"><Building2 size={240} /></div>
                                <div className="flex items-center justify-between mb-10 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 bg-blue-50 text-primary rounded-2xl flex items-center justify-center shadow-sm border border-blue-50"><Building2 size={24} /></div>
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">ÅžirkÉ™t MÉ™lumatlarÄ±</h3>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 italic">SÉ™nÉ™dlÉ™rdÉ™ Ä°ddiaÃ§Ä± hissÉ™si Ã¼Ã§Ã¼n</p>
                                        </div>
                                    </div>
                                    <button onClick={handleSaveSettings} disabled={isSavingSettings} className="flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/95 text-white rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20 disabled:opacity-50">
                                        {isSavingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        Yadda Saxla
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Ä°ddiaÃ§Ä±nÄ±n Tam AdÄ±</label>
                                        <input value={companyInfo.companyName || ""} onChange={(e) => setCompanyInfo({ ...companyInfo, companyName: e.target.value })} placeholder="ABC TELECOM MMC" className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">NÃ¼mayÉ™ndÉ™</label>
                                        <input value={companyInfo.representative || ""} onChange={(e) => setCompanyInfo({ ...companyInfo, representative: e.target.value })} className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">FÄ°N Kod</label>
                                        <input value={companyInfo.representativeFin || ""} onChange={(e) => setCompanyInfo({ ...companyInfo, representativeFin: e.target.value })} className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm" />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">HÃ¼quqi Ãœnvan</label>
                                        <input value={companyInfo.address || ""} onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })} className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.1em] ml-1">Telefon</label>
                                        <input value={companyInfo.phone || ""} onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })} className="w-full px-6 py-4 bg-slate-50/50 border border-blue-100 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm text-slate-800 shadow-sm" />
                                    </div>
                                </div>
                                <div className="mt-8 p-6 rounded-[2rem] bg-slate-950 text-white relative z-10 overflow-hidden border border-slate-800">
                                    <div className="flex items-start justify-between gap-4 mb-6">
                                        <div>
                                            <h4 className="text-lg font-black uppercase tracking-tight">MÉ™lumat BazasÄ± Rejimi</h4>
                                            <p className="text-[11px] font-bold text-slate-400 mt-1">Sistem tam MySQL vÉ™ daxili Storage API Ã¼zÉ™rindÉ™ iÅŸlÉ™yir.</p>
                                        </div>
                                        <div className={cn(
                                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                            companyInfo.dbMode === "mysql" ? "bg-blue-500/20 text-blue-200 border border-blue-400/30" : "bg-amber-500/20 text-amber-200 border border-amber-400/30"
                                        )}>
                                            Aktiv: MySQL
                                        </div>
                                    </div>
                                    <div className="p-5 rounded-[1.5rem] border-2 text-left bg-blue-500/20 border-blue-500 text-blue-50">
                                        <div className="flex items-center justify-between mb-2">
                                            <h5 className="font-black">MySQL / Storage API</h5>
                                            <span className="h-3 w-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                                        </div>
                                        <p className="text-xs opacity-70">Məlumat MySQL-dən, fayllar Storage API proxy-dən oxunur/yazılır.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Court Modal */}
                {isCourtModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-xl rounded-[2.5rem] soft-shadow-lg p-8 lg:p-12 relative animate-in zoom-in-95 duration-300">
                            <button onClick={() => setIsCourtModalOpen(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-600 transition-colors"><X size={24} /></button>
                            <div className="flex items-center gap-4 mb-10 text-primary">
                                <Scale size={32} />
                                <h3 className="text-2xl font-black uppercase tracking-tight text-slate-800">{editingCourt ? "YenilÉ™" : "Yeni MÉ™hkÉ™mÉ™"}</h3>
                            </div>
                            <div className="space-y-6">
                                <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">MÉ™hkÉ™mÉ™ AdÄ±</label><input value={courtForm.name} onChange={(e) => setCourtForm({ ...courtForm, name: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-blue-50 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm" /></div>
                                <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">Ãœnvan</label><textarea value={courtForm.address} onChange={(e) => setCourtForm({ ...courtForm, address: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-blue-50 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm min-h-[80px]" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">Telefon</label><input value={courtForm.phone} onChange={(e) => setCourtForm({ ...courtForm, phone: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-blue-50 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm" /></div>
                                    <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">Faks</label><input value={courtForm.fax} onChange={(e) => setCourtForm({ ...courtForm, fax: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-blue-50 rounded-[1.5rem] outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-sm" /></div>
                                </div>
                                <button onClick={handleSaveCourt} className="w-full py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest mt-4 shadow-lg">{editingCourt ? "YenilÉ™" : "ÆlavÉ™ Et"}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Store Modal */}
                {isStoreModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-md rounded-[2.5rem] soft-shadow-lg p-8 lg:p-10 relative animate-in zoom-in-95 duration-300">
                            <button onClick={() => setIsStoreModalOpen(false)} className="absolute top-8 right-8 text-slate-300 hover:text-slate-600 transition-colors"><X size={24} /></button>
                            <div className="flex items-center gap-4 mb-8 text-emerald-600">
                                <Store size={32} />
                                <h3 className="text-2xl font-black uppercase tracking-tight text-slate-800">{editingStore ? "YenilÉ™" : "Yeni MaÄŸaza"}</h3>
                            </div>
                            <div className="space-y-6">
                                <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">MaÄŸaza AdÄ±</label><input value={storeForm.name} onChange={(e) => setStoreForm({ name: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-emerald-50 rounded-[1.5rem] outline-none focus:border-emerald-300 focus:bg-white transition-all font-bold text-sm" autoFocus /></div>
                                <button onClick={handleSaveStore} className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest mt-4 shadow-lg">{editingStore ? "YenilÉ™" : "ÆlavÉ™ Et"}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthGuard>
    );
}

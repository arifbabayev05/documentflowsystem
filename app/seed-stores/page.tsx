"use client";

import { useState } from "react";
import { addStore } from "@/lib/db";
import { toast } from "sonner";
import { Loader2, Store, Check } from "lucide-react";

const STORE_NAMES = [
    "Vurğun Residence",
    "Dəniz Mall",
    "Gənclik Mall",
    "Binə",
    "Masazır",
    "Elmlər Akademiyası",
    "Sahil qəsəbəsi",
    "28 Mall",
    "Bakıxanov stansiyası",
    "3-cü mkr dairəsi",
    "Xalqlar Dostluğu metrosu",
    "Bakıxanov",
    "Azadlıq metrosu",
    "İnşaatçılar metrosu",
    "Ukrayna dairəsi",
    "Mərdəkan",
    "Nərimanov metrosu",
    "SMART Neftçilər metrosu",
    "Sahil metrosu",
    "SMART 28 may metrosu",
    "Astara",
    "Şamaxı",
    "Şəmkir",
    "İsmayıllı",
    "Salyan",
    "Sumqayıt Sülh küçəsi",
    "Ağcabədi",
    "Balakən",
    "Tovuz",
    "Qusar",
    "Xaçmaz",
    "Sabirabad",
    "İmişli",
    "Hacıqabul",
    "Oğuz",
    "Naxçıvan",
    "Ağstafa",
    "Goranboy",
    "Kürdəmir",
    "Yevlax",
    "Beyləqan",
    "Göyçay",
    "Gəncə Mall",
    "Gəncə Bayraq Meydanı",
    "Xırdalan",
    "Masallı",
    "Qəbələ",
    "Bərdə",
    "Quba",
    "Lənkəran",
    "Gəncə Grand Qafqaz",
    "Mingəçevir",
    "Zaqatala",
    "Cəlilabad",
    "Sumqayıt 10-cu mkr"
];

export default function SeedStoresPage() {
    const [isSeeding, setIsSeeding] = useState(false);
    const [progress, setProgress] = useState(0);
    const [completed, setCompleted] = useState(false);

    const handleSeed = async () => {
        setIsSeeding(true);
        setProgress(0);
        setCompleted(false);

        try {
            for (let i = 0; i < STORE_NAMES.length; i++) {
                await addStore(STORE_NAMES[i]);
                setProgress(Math.round(((i + 1) / STORE_NAMES.length) * 100));
                await new Promise(r => setTimeout(r, 100)); // Small delay to avoid rate limits
            }
            setCompleted(true);
            toast.success(`${STORE_NAMES.length} mağaza uğurla əlavə edildi!`);
        } catch (error) {
            console.error("Seed error:", error);
            toast.error("Xəta baş verdi");
        } finally {
            setIsSeeding(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 flex items-center justify-center p-6">
            <div className="max-w-2xl w-full bg-white rounded-[3rem] border border-slate-200 shadow-2xl p-12">
                <div className="flex items-center gap-4 mb-8">
                    <div className="h-16 w-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-200">
                        <Store size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Mağaza Seed</h1>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {STORE_NAMES.length} mağaza adı
                        </p>
                    </div>
                </div>

                {completed ? (
                    <div className="text-center py-12">
                        <div className="inline-flex items-center justify-center h-20 w-20 bg-emerald-50 text-emerald-600 rounded-full mb-6">
                            <Check size={40} strokeWidth={3} />
                        </div>
                        <h2 className="text-2xl font-black text-emerald-600 uppercase tracking-tight mb-2">
                            Tamamlandı!
                        </h2>
                        <p className="text-slate-500 font-bold">
                            Bütün mağazalar uğurla əlavə edildi
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="bg-slate-50 rounded-2xl p-6 mb-8 max-h-96 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-3">
                                {STORE_NAMES.map((name, idx) => (
                                    <div
                                        key={idx}
                                        className="text-xs font-bold text-slate-600 bg-white px-3 py-2 rounded-xl border border-slate-100"
                                    >
                                        {idx + 1}. {name}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {isSeeding && (
                            <div className="mb-8">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        Yüklənir...
                                    </span>
                                    <span className="text-xs font-black text-emerald-600">
                                        {progress}%
                                    </span>
                                </div>
                                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleSeed}
                            disabled={isSeeding}
                            className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 disabled:shadow-none flex items-center justify-center gap-3"
                        >
                            {isSeeding ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Əlavə edilir...
                                </>
                            ) : (
                                <>
                                    <Store size={20} />
                                    Mağazaları Əlavə Et
                                </>
                            )}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

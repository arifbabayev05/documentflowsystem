"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Plus,
    FileSpreadsheet,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Copy,
    Table as TableIcon
} from "lucide-react";
import { toast } from "sonner";
/** Internal helper for conditional classes */
const cn = (...classes: (string | boolean | undefined | null)[]) => classes.filter(Boolean).join(" ");

const customerSchema = z.object({
    customerCode: z.string().min(1, "Müştəri kodu mütləqdir"),
    fullName: z.string().min(3, "Ad Soyad Ata adı mütləqdir"),
    debtAmount: z.number().min(0, "Məbləğ düzgün daxil edilməlidir"),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

export default function CustomersPage() {
    const [activeTab, setActiveTab] = useState<"manual" | "bulk">("manual");
    const [bulkData, setBulkData] = useState<CustomerFormValues[]>([]);
    const [pasteValue, setPasteValue] = useState("");

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<CustomerFormValues>({
        resolver: zodResolver(customerSchema),
        defaultValues: {
            debtAmount: 0
        }
    });

    const onSubmitManual = async (data: CustomerFormValues) => {
        // In a real app, this would call an API
        console.log("Saving manual data:", data);
        toast("Müştəri uğurla daxil edildi!");
        reset();
    };

    const handleExcelPaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setPasteValue(value);

        if (!value) {
            setBulkData([]);
            return;
        }

        // Simple parser for Excel tab-separated values
        const lines = value.split("\n").filter(line => line.trim() !== "");
        const parsed = lines.map(line => {
            const parts = line.split("\t");
            return {
                customerCode: parts[0]?.trim() || "",
                fullName: parts[1]?.trim() || "",
                debtAmount: parseFloat(parts[2]?.replace(",", ".") || "0") || 0
            };
        }).filter(item => item.customerCode && item.fullName);

        setBulkData(parsed);
    };

    const saveBulkData = async () => {
        console.log("Saving bulk data:", bulkData);
        toast(`${bulkData.length} müştəri uğurla daxil edildi!`);
        setBulkData([]);
        setPasteValue("");
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-text-main">Müştəri Girişi</h1>
                <p className="text-text-soft">Problemli müştərilərin sistemə daxil edilməsi</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-border-soft">
                <button
                    onClick={() => setActiveTab("manual")}
                    className={cn(
                        "flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all relative border-b-2",
                        activeTab === "manual"
                            ? "border-primary text-primary"
                            : "border-transparent text-text-soft hover:text-text-main"
                    )}
                >
                    <Plus size={18} />
                    Manual Giriş
                </button>
                <button
                    onClick={() => setActiveTab("bulk")}
                    className={cn(
                        "flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all relative border-b-2",
                        activeTab === "bulk"
                            ? "border-primary text-primary"
                            : "border-transparent text-text-soft hover:text-text-main"
                    )}
                >
                    <FileSpreadsheet size={18} />
                    Toplu Giriş (Excel)
                </button>
            </div>

            <div className="mt-6">
                {activeTab === "manual" ? (
                    <div className="max-w-2xl rounded-2xl border border-border-soft bg-white p-8 soft-shadow animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <form onSubmit={handleSubmit(onSubmitManual)} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-text-main">Müştəri Kodu</label>
                                    <input
                                        {...register("customerCode")}
                                        className={cn(
                                            "w-full rounded-xl border border-border-soft bg-bg-main px-4 py-3 text-sm outline-none transition-all focus:border-primary-soft focus:ring-4 focus:ring-primary-soft/20",
                                            errors.customerCode && "border-primary ring-4 ring-primary-soft/20"
                                        )}
                                        placeholder="Məs: 123456"
                                    />
                                    {errors.customerCode && (
                                        <p className="text-xs text-primary flex items-center gap-1 mt-1">
                                            <AlertCircle size={12} /> {errors.customerCode.message}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-text-main">Borc Məbləği</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.01"
                                            {...register("debtAmount", { valueAsNumber: true })}
                                            className={cn(
                                                "w-full rounded-xl border border-border-soft bg-bg-main px-4 py-3 text-sm outline-none transition-all focus:border-primary-soft focus:ring-4 focus:ring-primary-soft/20",
                                                errors.debtAmount && "border-primary ring-4 ring-primary-soft/20"
                                            )}
                                            placeholder="0.00"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-text-soft">AZN</span>
                                    </div>
                                    {errors.debtAmount && (
                                        <p className="text-xs text-primary mt-1">{errors.debtAmount.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-sm font-medium text-text-main">Ad Soyad Ata adı</label>
                                    <input
                                        {...register("fullName")}
                                        className={cn(
                                            "w-full rounded-xl border border-border-soft bg-bg-main px-4 py-3 text-sm outline-none transition-all focus:border-primary-soft focus:ring-4 focus:ring-primary-soft/20",
                                            errors.fullName && "border-primary ring-4 ring-primary-soft/20"
                                        )}
                                        placeholder="Məs: Əliyev Vəli Həsən"
                                    />
                                    {errors.fullName && (
                                        <p className="text-xs text-primary mt-1">{errors.fullName.message}</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => reset()}
                                    className="rounded-xl px-6 py-3 text-sm font-medium text-text-soft hover:bg-bg-main transition-colors"
                                >
                                    Təmizlə
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-bold text-white transition-all hover:bg-primary-hover soft-shadow disabled:opacity-50"
                                >
                                    <CheckCircle2 size={18} />
                                    {isSubmitting ? "Yadda saxlanılır..." : "Yadda saxla"}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="rounded-2xl border border-border-soft bg-white p-8 soft-shadow">
                            <div className="mb-6 flex items-start gap-4 rounded-xl bg-orange-50 p-4 text-orange-800 border border-orange-100">
                                <AlertCircle className="shrink-0 mt-1" size={18} />
                                <div className="text-sm">
                                    <p className="font-bold">Excel-dən məlumat daxil etmə qaydası:</p>
                                    <p className="mt-1 opacity-90">Excel cədvəlindən 3 sütunu (Kod, Ad Soyad, Məbləğ) seçib kopyalayın və aşağıdakı xanaya yapışdırın.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="relative group">
                                    <textarea
                                        value={pasteValue}
                                        onChange={handleExcelPaste}
                                        placeholder="Məlumatları bura yapışdırın..."
                                        className="h-40 w-full rounded-2xl border-2 border-dashed border-border-soft bg-bg-main p-6 text-sm outline-none transition-all focus:border-primary focus:bg-white"
                                    />
                                    {!pasteValue && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-text-soft/40">
                                            <Copy size={40} className="mb-2" />
                                            <p className="text-sm font-medium">Ctrl + V</p>
                                        </div>
                                    )}
                                </div>

                                {bulkData.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-text-main">
                                                <TableIcon size={18} className="text-primary" />
                                                Pasted Data Preview ({bulkData.length} entries)
                                            </div>
                                            <button
                                                onClick={() => { setBulkData([]); setPasteValue(""); }}
                                                className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
                                            >
                                                <Trash2 size={14} /> Təmizlə
                                            </button>
                                        </div>

                                        <div className="max-h-[300px] overflow-auto rounded-xl border border-border-soft bg-bg-main">
                                            <table className="w-full text-left text-sm">
                                                <thead className="sticky top-0 bg-white border-b border-border-soft z-10">
                                                    <tr>
                                                        <th className="px-4 py-3 font-semibold text-text-soft">Kod</th>
                                                        <th className="px-4 py-3 font-semibold text-text-soft">Ad Soyad Ata adı</th>
                                                        <th className="px-4 py-3 font-semibold text-text-soft">Məbləğ (AZN)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border-soft">
                                                    {bulkData.map((item, idx) => (
                                                        <tr key={idx} className="bg-white/50 hover:bg-white transition-colors">
                                                            <td className="px-4 py-3 font-medium text-text-main">{item.customerCode}</td>
                                                            <td className="px-4 py-3 text-text-main">{item.fullName}</td>
                                                            <td className="px-4 py-3 font-bold text-primary">{item.debtAmount.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <button
                                                onClick={saveBulkData}
                                                className="flex items-center gap-2 rounded-xl bg-primary px-10 py-4 text-base font-bold text-white transition-all hover:bg-primary-hover soft-shadow"
                                            >
                                                <CheckCircle2 size={20} />
                                                Təsdiqlə və Yadda Saxla
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

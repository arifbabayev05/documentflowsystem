"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { withBasePath } from "@/lib/basePath";
import { AlertTriangle, CheckCircle2, Cloud, Database, Play, RefreshCw, ShieldCheck, Terminal } from "lucide-react";

const API_URL = withBasePath("/api/fb-mysql-prod-parity-vault-9q7x4m2");

type Report = {
    generatedAt: string;
    counts: Record<string, number>;
    totals: Record<string, number>;
    lists: Record<string, any[]>;
    listLimit: number;
};

type CommandResult = {
    ok: boolean;
    command: string;
    durationMs: number;
    stdout?: string;
    stderr?: string;
    error?: string;
};

const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

function CountCard({ label, value, tone = "slate" }: { label: string; value: number | string; tone?: "slate" | "green" | "red" | "amber" }) {
    const tones: Record<string, string> = {
        slate: "border-slate-200 bg-white text-slate-900",
        green: "border-emerald-200 bg-emerald-50 text-emerald-700",
        red: "border-rose-200 bg-rose-50 text-rose-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700"
    };

    return (
        <div className={cn("rounded-lg border p-4", tones[tone])}>
            <div className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</div>
            <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
        </div>
    );
}

function DataTable({ title, rows, emptyText, columns }: { title: string; rows: any[]; emptyText: string; columns: Array<{ key: string; label: string }> }) {
    return (
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-black text-slate-900">{title}</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">{rows.length}</span>
            </div>
            {rows.length === 0 ? (
                <div className="px-4 py-8 text-sm font-semibold text-slate-400">{emptyText}</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                            <tr>
                                {columns.map(col => <th key={col.key} className="px-4 py-3 font-black">{col.label}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((row, index) => (
                                <tr key={`${row.id || index}-${index}`} className="text-slate-700">
                                    {columns.map(col => (
                                        <td key={col.key} className="max-w-[360px] truncate px-4 py-3 font-semibold">
                                            {String(row[col.key] ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

export default function FirebaseMysqlParityVaultPage() {
    const { user } = useAuth();
    const [report, setReport] = useState<Report | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [running, setRunning] = useState<string | null>(null);
    const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const hasDiff = useMemo(() => {
        if (!report) return true;
        return Object.values(report.totals).some(value => Number(value) > 0)
            || report.counts.firebaseCustomers !== report.counts.mysqlCustomers
            || report.counts.firebaseInvoices !== report.counts.mysqlInvoices
            || report.counts.firebaseOrders !== report.counts.mysqlOrders
            || report.counts.firebaseFilledByAdmin !== report.counts.mysqlFilledByAdmin
            || report.counts.firebaseExceptions !== report.counts.mysqlExceptions
            || report.counts.remainingFirebaseStorageUrls > 0;
    }, [report]);

    const fetchReport = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("Sessiya tokeni tapılmadı");
            const response = await fetch(API_URL, {
                cache: "no-store",
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Audit yüklənmədi");
            setReport(data);
        } catch (err: any) {
            setError(err.message || "Audit yüklənmədi");
        } finally {
            setIsLoading(false);
        }
    };

    const runCommand = async (action: string) => {
        setRunning(action);
        setCommandResult(null);
        setError(null);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("Sessiya tokeni tapılmadı");
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ action })
            });
            const data = await response.json();
            setCommandResult(data);
            if (!response.ok) throw new Error(data.error || "Command uğursuz oldu");
            await fetchReport();
        } catch (err: any) {
            setError(err.message || "Command uğursuz oldu");
        } finally {
            setRunning(null);
        }
    };

    useEffect(() => {
        fetchReport();
    }, []);

    if (!user || user.role !== "SUPERADMIN") {
        return (
            <AuthGuard>
                <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
                    <ShieldCheck size={44} className="mb-4 text-slate-300" />
                    <h1 className="text-xl font-black text-slate-900">SUPERADMIN tələb olunur</h1>
                </div>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard>
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Database size={20} className="text-slate-900" />
                            <h1 className="text-xl font-black tracking-tight text-slate-900">Firebase/MySQL Parity Vault</h1>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-500">
                            Gizli production audit səhifəsi. Firebase-only, MySQL-only və storage fərqlərini göstərir.
                        </p>
                        {report && <p className="mt-1 text-xs font-bold text-slate-400">Son yoxlama: {new Date(report.generatedAt).toLocaleString("az-AZ")}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={fetchReport} disabled={isLoading || !!running} className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                            <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} /> Refresh
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                        {error}
                    </div>
                )}

                <div className={cn("rounded-lg border p-4", hasDiff ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50")}>
                    <div className="flex items-center gap-3">
                        {hasDiff ? <AlertTriangle className="text-amber-600" /> : <CheckCircle2 className="text-emerald-600" />}
                        <div>
                            <div className={cn("text-sm font-black", hasDiff ? "text-amber-800" : "text-emerald-800")}>
                                {hasDiff ? "Eynilik tam deyil" : "Firebase və MySQL eynidir"}
                            </div>
                            <div className={cn("text-xs font-bold", hasDiff ? "text-amber-700" : "text-emerald-700")}>
                                Production sonrası əsas baxacağın yer: MySQL-only customers cədvəli.
                            </div>
                        </div>
                    </div>
                </div>

                {report && (
                    <>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                            <CountCard label="Firebase customers" value={report.counts.firebaseCustomers} />
                            <CountCard label="MySQL customers" value={report.counts.mysqlCustomers} />
                            <CountCard label="Firebase invoices" value={report.counts.firebaseInvoices} />
                            <CountCard label="MySQL invoices" value={report.counts.mysqlInvoices} />
                            <CountCard label="Firebase orders" value={report.counts.firebaseOrders} />
                            <CountCard label="MySQL orders" value={report.counts.mysqlOrders} />
                            <CountCard label="Firebase-only customers" value={report.totals.firebaseOnlyCustomers} tone={report.totals.firebaseOnlyCustomers ? "red" : "green"} />
                            <CountCard label="MySQL-only customers" value={report.totals.mysqlOnlyCustomers} tone={report.totals.mysqlOnlyCustomers ? "amber" : "green"} />
                            <CountCard label="Firebase-only invoices" value={report.totals.firebaseOnlyInvoices} tone={report.totals.firebaseOnlyInvoices ? "red" : "green"} />
                            <CountCard label="MySQL-only invoices" value={report.totals.mysqlOnlyInvoices} tone={report.totals.mysqlOnlyInvoices ? "amber" : "green"} />
                            <CountCard label="Storage firebase URLs" value={report.counts.remainingFirebaseStorageUrls} tone={report.counts.remainingFirebaseStorageUrls ? "red" : "green"} />
                            <CountCard label="Storage files" value={report.counts.storageFiles} />
                        </div>

                        <section className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="mb-4 flex items-center gap-2">
                                <Terminal size={18} className="text-slate-900" />
                                <h2 className="text-sm font-black text-slate-900">Commands</h2>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => runCommand("sync")} disabled={!!running} className="flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">
                                    <Play size={14} /> sync firebase mysql
                                </button>
                                <button onClick={() => runCommand("migrateStorage")} disabled={!!running} className="flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">
                                    <Cloud size={14} /> migrate storage
                                </button>
                                <button onClick={() => runCommand("readinessAudit")} disabled={!!running} className="flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50">
                                    <ShieldCheck size={14} /> readiness audit
                                </button>
                            </div>
                            {running && <div className="mt-4 text-sm font-black text-slate-500">{running} işləyir, gözlə...</div>}
                            {commandResult && (
                                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                                    <div className="border-b border-slate-800 px-4 py-3 text-xs font-black text-slate-300">
                                        {commandResult.command} | {Math.round(commandResult.durationMs / 1000)}s | {commandResult.ok ? "OK" : "FAILED"}
                                    </div>
                                    <pre className="max-h-[420px] overflow-auto p-4 text-xs leading-relaxed text-slate-100">
                                        {(commandResult.stdout || "") + (commandResult.stderr ? `\n\nSTDERR:\n${commandResult.stderr}` : "") + (commandResult.error ? `\n\nERROR:\n${commandResult.error}` : "")}
                                    </pre>
                                </div>
                            )}
                        </section>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <DataTable
                                title="Firebase-də var, MySQL-də yoxdur"
                                rows={report.lists.firebaseOnlyCustomers || []}
                                emptyText="Firebase-only customer yoxdur."
                                columns={[
                                    { key: "id", label: "ID" },
                                    { key: "fullName", label: "Ad" },
                                    { key: "process_status", label: "Status" },
                                    { key: "updatedAt", label: "Updated" }
                                ]}
                            />
                            <DataTable
                                title="MySQL-də var, Firebase-də yoxdur"
                                rows={report.lists.mysqlOnlyCustomers || []}
                                emptyText="MySQL-only customer yoxdur."
                                columns={[
                                    { key: "id", label: "ID" },
                                    { key: "fullName", label: "Ad" },
                                    { key: "process_status", label: "Status" },
                                    { key: "updatedAt", label: "Updated" }
                                ]}
                            />
                            <DataTable
                                title="Firebase-only invoices"
                                rows={report.lists.firebaseOnlyInvoices || []}
                                emptyText="Firebase-only invoice yoxdur."
                                columns={[
                                    { key: "id", label: "Invoice ID" },
                                    { key: "customerId", label: "Customer" },
                                    { key: "invoiceNumber", label: "Number" }
                                ]}
                            />
                            <DataTable
                                title="MySQL-only invoices"
                                rows={report.lists.mysqlOnlyInvoices || []}
                                emptyText="MySQL-only invoice yoxdur."
                                columns={[
                                    { key: "id", label: "Invoice ID" },
                                    { key: "customerId", label: "Customer" },
                                    { key: "invoiceNumber", label: "Number" }
                                ]}
                            />
                            <DataTable
                                title="Firebase-only orders"
                                rows={report.lists.firebaseOnlyOrders || []}
                                emptyText="Firebase-only order yoxdur."
                                columns={[
                                    { key: "id", label: "Order ID" },
                                    { key: "invoiceId", label: "Invoice" },
                                    { key: "customerId", label: "Customer" }
                                ]}
                            />
                            <DataTable
                                title="MySQL-only orders"
                                rows={report.lists.mysqlOnlyOrders || []}
                                emptyText="MySQL-only order yoxdur."
                                columns={[
                                    { key: "id", label: "Order ID" },
                                    { key: "invoiceId", label: "Invoice" }
                                ]}
                            />
                        </div>

                        <DataTable
                            title="Customer document diff samples"
                            rows={(report.lists.customerDiffs || []).map((item: any) => ({
                                id: item.id,
                                path: item.diff?.path,
                                expected: JSON.stringify(item.diff?.expected),
                                actual: JSON.stringify(item.diff?.actual)
                            }))}
                            emptyText="Customer document diff yoxdur."
                            columns={[
                                { key: "id", label: "Customer" },
                                { key: "path", label: "Path" },
                                { key: "expected", label: "Firebase" },
                                { key: "actual", label: "MySQL" }
                            ]}
                        />
                    </>
                )}
            </div>
        </AuthGuard>
    );
}

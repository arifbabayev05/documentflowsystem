"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
    Scale,
    Gavel,
    Clock,
    Wallet,
    TrendingUp,
    Inbox,
    Users,
    ArrowUpRight,
    Package,
    RefreshCw,
    AlertTriangle,
    Info,
    CheckCircle,
    Store as StoreIcon,
    Activity,
    Map,
    ArrowRight,
    X,
    FileText,
    ExternalLink,
    ChevronRight,
    ChevronDown,
    UserCircle
} from "lucide-react";
import { getCustomers, getAuditLogs, getCourts } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import AuthGuard from "@/components/auth/AuthGuard";
import { Timestamp } from "firebase/firestore";
import {
    ResponsiveContainer,
    AreaChart, Area,
    XAxis, YAxis,
    Tooltip,
    CartesianGrid,
    PieChart, Pie, Cell,
    BarChart, Bar,
    RadarChart, PolarGrid, PolarAngleAxis, Radar
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

/** Conditional Class Helper */
const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");

interface AnalyticsData {
    // Row 1: High-Level KPIs
    totalPendingDebt: number; // Card 1: Risk Altındakı Portfel
    readyForCourtCount: number; // Card 2: Məhkəməyə Hazır Sənədlər
    avgProcessingDays: number; // Card 3: İşlərin Orta İcraat Müddəti
    legalFeesProjection: number; // Card 4: Proqnozlaşdırılan Rüsumlar (Count * 20)
    debtTrendPercent: number;

    // Row 2: Operational Workflow (The Flow)
    processFunnel: {
        new: number;      // INSPECTOR_ENTERED
        filling: number;  // ASSIGNED / FILLED
        waiting: number;  // WAITING_FOR_ARCHIVE
        ready: number;    // ARCHIVE_UPLOADED
        filed: number;    // COMPLETED
    };
    debtComposition: {
        principal: number;
        penalty: number;
        fees: number;
    };

    // Root Cause & Demographics
    topBadStores: { name: string; count: number; amount: number }[];
    productCategories: Record<string, number>;
    investigatorEfficiency: { name: string; count: number; avgSpeed: number }[];
    adminEfficiency: { name: string; count: number; avgSpeed: number }[];
    statusDwellTimes: {
        status: string;
        label: string;
        avgHours: number;
        count: number;
        riskLevel: 'low' | 'medium' | 'high';
        color: string;
    }[];
    bottleneckTimeline: {
        stage: string;
        avgHours: number;
        icon: any;
        color: string;
        action: string;
    }[];
    topBadCourts: { name: string; count: number; amount: number }[];
    regionalData: { name: string; count: number; amount: number }[];
    totalCases: number;
    demographics: {
        gender: { male: number; female: number; unknown: number };
        ageGroups: { young: number; mid: number; senior: number };
    };
    groups: Record<string, any[]>;
    trendData: { name: string; amount: number; count: number }[];
}

const FEE_PER_CASE = 20;

const parseDate = (dateVal: any): Date | null => {
    if (!dateVal) return null;
    if (dateVal instanceof Timestamp) return dateVal.toDate();
    if (dateVal.toDate && typeof dateVal.toDate === 'function') return dateVal.toDate();
    if (typeof dateVal === 'string' && dateVal.includes('.')) {
        const [d, m, y] = dateVal.split('.').map(Number);
        if (d && m && y) {
            const year = y < 100 ? 2000 + y : y;
            return new Date(year, m - 1, d);
        }
    }
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
};

export default function AnalyticsPage() {
    const { user, can } = useAuth();
    const [loading, setLoading] = useState(true);
    const [customers, setCustomers] = useState<any[]>([]);
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [timeRange, setTimeRange] = useState<string>('all');

    const [drillDown, setDrillDown] = useState<{ title: string; customers: any[] } | null>(null);
    const [selectedPerfUser, setSelectedPerfUser] = useState<string | null>(null);

    const allUsers = useMemo(() => {
        const users = new Set<string>();
        customers.forEach(c => {
            if (c.statusHistory) {
                c.statusHistory.forEach((h: any) => {
                    if (h.user && h.user.includes('@')) users.add(h.user);
                });
            }
            if (c.assignedTo && c.assignedTo.includes('@')) users.add(c.assignedTo);
            if (c.createdBy && c.createdBy.includes('@')) users.add(c.createdBy);
        });
        return Array.from(users).sort();
    }, [customers]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [custData, auditData] = await Promise.all([
                getCustomers(),
                getAuditLogs(3000)
            ]);
            setCustomers(custData);
            setAuditLogs(auditData);
        } catch (error) {
            console.error("Fetch Error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (can("page_analytics")) {
            fetchData();
        }
    }, [user, user?.role]);

    const formatAZN = (v: number) => Math.floor(v).toLocaleString('az-AZ') + " ₼";

    const formatDetailedTime = (hours: number) => {
        const totalMinutes = Math.round(hours * 60);
        if (totalMinutes < 60) return `${totalMinutes} DƏQ`;

        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;

        if (h < 24) {
            return m > 0 ? `${h} SAAT ${m} DƏQ` : `${h} SAAT`;
        }

        const d = Math.floor(h / 24);
        const rh = h % 24;

        return rh > 0 ? `${d} GÜN ${rh} SAAT` : `${d} GÜN`;
    };

    const InfoTooltip = ({ title, text, iconClass }: { title: string, text: string, iconClass?: string }) => (
        <span className="relative inline-block ml-2 align-middle group z-[100]">
            <Info size={14} className={cn("cursor-help transition-colors", iconClass || "text-slate-400 hover:text-indigo-600")} />
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-64 p-4 bg-slate-900/100 backdrop-blur-xl text-white text-[12px] rounded-3xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[999999] border border-white/10 pointer-events-none text-left font-normal">
                <span className="block font-black uppercase tracking-widest text-indigo-400 mb-2">{title}</span>
                <span className="block font-medium leading-relaxed opacity-100">{text}</span>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-[8px] border-transparent border-b-slate-900/95" />
            </span>
        </span>
    );

    const RegionalTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">{payload[0].payload.name}</p>
                    <p className="text-base font-black text-white">{formatAZN(payload[0].value as number)}</p>
                    <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase">Cəmi {payload[0].payload.count} İcraat</p>
                </div>
            );
        }
        return null;
    };

    const filteredCustomers = useMemo(() => {
        if (!customers.length) return [];
        if (timeRange === 'all') return customers;

        const now = new Date();
        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        return customers.filter(c => {
            const date = parseDate(c.createdAt || c.statusHistory?.[0]?.timestamp);
            if (!date) return timeRange === 'all';
            return date >= cutoff;
        });
    }, [customers, timeRange]);

    const stats: AnalyticsData = useMemo(() => {
        const initial: AnalyticsData = {
            totalPendingDebt: 0,
            readyForCourtCount: 0,
            avgProcessingDays: 0,
            legalFeesProjection: 0,
            debtTrendPercent: 4.2,
            processFunnel: { new: 0, filling: 0, waiting: 0, ready: 0, filed: 0 },
            debtComposition: { principal: 0, penalty: 0, fees: 0 },
            topBadStores: [],
            productCategories: {},
            investigatorEfficiency: [],
            adminEfficiency: [],
            statusDwellTimes: [
                { status: 'ASSIGN_WAITING', label: 'Təyinat Gözləmə', avgHours: 0, count: 0, riskLevel: 'low', color: 'bg-slate-500' },
                { status: 'INSPECTOR_FILL', label: 'Məlumatların Doldurulması', avgHours: 0, count: 0, riskLevel: 'low', color: 'bg-indigo-400' },
                { status: 'ARCHIVE_WAITING', label: 'Arxivdən Sənəd Gözlənilir', avgHours: 0, count: 0, riskLevel: 'low', color: 'bg-amber-400' },
                { status: 'FINAL_DOC_PREP', label: 'Yekun Sənəd Hazırlığı', avgHours: 0, count: 0, riskLevel: 'low', color: 'bg-emerald-400' }
            ],
            bottleneckTimeline: [
                { stage: "Qeydiyyat -> Təyinat", action: "ASSIGN", avgHours: 0, icon: <Users size={14} />, color: "bg-blue-500" },
                { stage: "Təyinat -> Sənəd Sorğusu", action: "ARCHIVE_REQUEST", avgHours: 0, icon: <FileText size={14} />, color: "bg-amber-500" },
                { stage: "Sorğu -> Sənəd Yüklənməsi", action: "FILE_UPLOAD", avgHours: 0, icon: <ArrowUpRight size={14} />, color: "bg-indigo-500" },
                { stage: "Yüklənmə -> Tamamlanma", action: "COMPLETED", avgHours: 0, icon: <CheckCircle size={14} />, color: "bg-emerald-500" }
            ],
            topBadCourts: [],
            regionalData: [],
            totalCases: 0,
            demographics: {
                gender: { male: 0, female: 0, unknown: 0 },
                ageGroups: { young: 0, mid: 0, senior: 0 }
            },
            groups: {},
            trendData: []
        };

        if (!filteredCustomers.length) return initial;

        const now = new Date();
        const storeMap: Record<string, { count: number; amount: number }> = {};
        const courtMap: Record<string, { count: number; amount: number }> = {};
        const inspectorMap: Record<string, { count: number; totalSpeed: number }> = {};
        const adminMap: Record<string, { count: number; totalSpeed: number }> = {};
        const regionMap: Record<string, { count: number; amount: number }> = {};
        const trendMap: Record<string, { label: string, amount: number, count: number }> = {};

        const addToGroup = (key: string, customer: any) => {
            if (!initial.groups[key]) initial.groups[key] = [];
            initial.groups[key].push(customer);
        };

        // Initialize last 6 months including current
        const AZ_MONTHS_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "İyun", "İyul", "Avq", "Sen", "Okt", "Noy", "Dek"];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            trendMap[key] = { label: AZ_MONTHS_SHORT[d.getMonth()], amount: 0, count: 0 };
        }

        // Status Dwell Analysis
        const dwellMap: Record<string, { totalHours: number; count: number }> = {
            'ASSIGN_WAITING': { totalHours: 0, count: 0 },
            'INSPECTOR_FILL': { totalHours: 0, count: 0 },
            'ARCHIVE_WAITING': { totalHours: 0, count: 0 },
            'FINAL_DOC_PREP': { totalHours: 0, count: 0 }
        };

        const stageTotals: Record<string, { totalTime: number; count: number }> = {
            "ASSIGN": { totalTime: 0, count: 0 },
            "ARCHIVE_REQUEST": { totalTime: 0, count: 0 },
            "FILE_UPLOAD": { totalTime: 0, count: 0 },
            "COMPLETED": { totalTime: 0, count: 0 }
        };

        filteredCustomers.forEach(c => {
            const status = c.process_status || "INSPECTOR_ENTERED";
            const principal = parseFloat((c.details?.unpaidAmount || "0").toString().replace(',', '.'));
            const penalty = parseFloat((c.details?.penalty || "0").toString().replace(',', '.'));
            const fees = parseFloat((c.details?.fee || "0").toString().replace(',', '.'));
            const totalUnpaid = principal + penalty + fees;

            const isCompleted = status === "COMPLETED";
            const isDocReady = ["ARCHIVE_UPLOADED", "COMPLETED"].includes(status);

            addToGroup(`status:${status}`, c);

            if (!isCompleted) {
                initial.totalPendingDebt += isNaN(totalUnpaid) ? 0 : totalUnpaid;
                initial.debtComposition.principal += isNaN(principal) ? 0 : principal;
                initial.debtComposition.penalty += isNaN(penalty) ? 0 : penalty;
                initial.debtComposition.fees += isNaN(fees) ? 0 : fees;
            }
            if (isDocReady) initial.readyForCourtCount++;

            if (status === "INSPECTOR_ENTERED") initial.processFunnel.new++;
            else if (["ASSIGNED_BY_MANAGER", "FILLED_BY_ADMIN"].includes(status)) initial.processFunnel.filling++;
            else if (status === "WAITING_FOR_ARCHIVE") initial.processFunnel.waiting++;
            else if (status === "ARCHIVE_UPLOADED") initial.processFunnel.ready++;
            else if (status === "COMPLETED") initial.processFunnel.filed++;

            initial.totalCases++;

            // Use creation date for trend analysis
            const cDate = parseDate(c.createdAt || c.statusHistory?.[0]?.timestamp);
            if (cDate) {
                const trendKey = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}`;
                if (trendMap[trendKey]) {
                    trendMap[trendKey].amount += isNaN(totalUnpaid) ? 0 : totalUnpaid;
                    trendMap[trendKey].count++;
                }
            }

            // Dwell Analysis Logic (Status History)
            if (c.statusHistory && c.statusHistory.length > 0) {
                const history = [...c.statusHistory].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                const getPhaseKey = (hItem: any) => {
                    const act = hItem.action;
                    const lbl = hItem.label || "";
                    if (act === 'CREATE' || lbl.includes('qeydə alındı')) return 'ASSIGN_WAITING';
                    if (act === 'ASSIGN' || lbl.includes('Müfəttiş təyin edildi')) return 'INSPECTOR_FILL';
                    if (act === 'ARCHIVE_REQUEST' || lbl.includes('Arxiv sorğusu')) return 'ARCHIVE_WAITING';
                    if (act === 'FILE_UPLOAD' || lbl.includes('Arxiv sənədi yükləndi')) return 'FINAL_DOC_PREP';
                    return null;
                };

                for (let i = 1; i < history.length; i++) {
                    const prev = history[i - 1];
                    const curr = history[i];
                    const diffHours = Math.max(0, (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / (1000 * 60 * 60));

                    const dwellKey = getPhaseKey(prev);
                    if (dwellKey && dwellMap[dwellKey]) {
                        // Attribute duration to the user who performed the NEXT action (the one who finished the phase)
                        if (!selectedPerfUser || curr.user === selectedPerfUser) {
                            dwellMap[dwellKey].totalHours += diffHours;
                            dwellMap[dwellKey].count++;
                        }
                    }

                    if (stageTotals[curr.action]) {
                        stageTotals[curr.action].totalTime += diffHours;
                        stageTotals[curr.action].count++;
                    }

                    if (['FILE_UPLOAD', 'ARCHIVE', 'COMPLETED', 'STATUS_CHANGE'].includes(curr.action) && curr.user && curr.user.includes('@')) {
                        const adminUser = curr.user;
                        if (!adminMap[adminUser]) adminMap[adminUser] = { count: 0, totalSpeed: 0 };
                        adminMap[adminUser].count++;
                        adminMap[adminUser].totalSpeed += diffHours;
                    }
                }

                const last = history[history.length - 1];
                const currentDwellKey = getPhaseKey(last);
                if (currentDwellKey && dwellMap[currentDwellKey] && !isCompleted) {
                    const diffHoursNow = Math.max(0, (now.getTime() - new Date(last.timestamp).getTime()) / (1000 * 60 * 60));
                    dwellMap[currentDwellKey].totalHours += diffHoursNow;
                    dwellMap[currentDwellKey].count++;
                }
            }

            // Efficiency
            const handlers = Array.from(new Set([c.assignedTo, c.createdBy].filter(u => u && u.includes('@'))));
            handlers.forEach(u => {
                if (!inspectorMap[u]) inspectorMap[u] = { count: 0, totalSpeed: 0 };
                inspectorMap[u].count++;
                if (isDocReady) {
                    const cDateVal = parseDate(c.assignedAt || c.createdAt || c.statusHistory?.[0]?.timestamp);
                    const uDateVal = parseDate(c.printedAt || c.updatedAt || c.createdAt || (c.statusHistory && c.statusHistory[c.statusHistory.length - 1]?.timestamp));
                    if (cDateVal && uDateVal) {
                        inspectorMap[u].totalSpeed += Math.max(0, (uDateVal.getTime() - cDateVal.getTime()) / (1000 * 60 * 60 * 24));
                    }
                }
            });

            // Regions & Demographics
            const g = (c.details?.gender || c.gender || "").toLowerCase();
            if (g.includes("kişi") || g === "k") {
                initial.demographics.gender.male++;
                addToGroup("gender:male", c);
            } else if (g.includes("qadın") || g === "q") {
                initial.demographics.gender.female++;
                addToGroup("gender:female", c);
            }

            const bDate = c.details?.birthDate;
            let age = 30;
            if (bDate && bDate.includes('.')) {
                const parts = bDate.split('.');
                if (parts.length === 3) {
                    const year = parseInt(parts[2]);
                    if (!isNaN(year)) age = now.getFullYear() - year;
                }
            }
            if (age < 35) {
                initial.demographics.ageGroups.young++;
                addToGroup("age:young", c);
            } else if (age < 55) {
                initial.demographics.ageGroups.mid++;
                addToGroup("age:mid", c);
            } else {
                initial.demographics.ageGroups.senior++;
                addToGroup("age:senior", c);
            }

            const store = (c.store || "Digər Mağaza").trim();
            if (!storeMap[store]) storeMap[store] = { count: 0, amount: 0 };
            storeMap[store].count++;
            storeMap[store].amount += isNaN(totalUnpaid) ? 0 : totalUnpaid;
            addToGroup(`store:${store}`, c);

            if (c.courtName) {
                const court = c.courtName.trim();
                if (!courtMap[court]) courtMap[court] = { count: 0, amount: 0 };
                courtMap[court].count++;
                courtMap[court].amount += isNaN(totalUnpaid) ? 0 : totalUnpaid;
                addToGroup(`court:${court}`, c);
            }

            const addr = ((c.details?.address || "") + " " + (c.details?.actualAddress || "") + " " + (c.store || "")).toLowerCase();
            let region = "Bakı (Digər)";

            if (addr.includes("yasamal")) region = "Yasamal";
            else if (addr.includes("nəsimi")) region = "Nəsimi";
            else if (addr.includes("nərimanov")) region = "Nərimanov";
            else if (addr.includes("binəqədi")) region = "Binəqədi";
            else if (addr.includes("nizam")) region = "Nizami";
            else if (addr.includes("xətai")) region = "Xətai";
            else if (addr.includes("sabunçu")) region = "Sabunçu";
            else if (addr.includes("suraxanı")) region = "Suraxanı";
            else if (addr.includes("qaradağ")) region = "Qaradağ";
            else if (addr.includes("sumqayıt")) region = "Sumqayıt";
            else if (addr.includes("gence") || addr.includes("gəncə")) region = "Gəncə";
            else if (addr.includes("mingəçevir") || addr.includes("mingecevir")) region = "Mingəçevir";
            else if (addr.includes("lənkəran") || addr.includes("lenkeran")) region = "Lənkəran";
            else if (addr.includes("kürdəmir") || addr.includes("kurdemir")) region = "Kürdəmir";
            else if (addr.includes("şəki") || addr.includes("seki")) region = "Şəki";
            else if (addr.includes("qəbələ") || addr.includes("qebele")) region = "Qəbələ";
            else if (addr.includes("quba")) region = "Quba";
            else if (addr.includes("xaçmaz") || addr.includes("xacmaz")) region = "Xaçmaz";
            else if (addr.includes("bərdə") || addr.includes("berde")) region = "Bərdə";
            else if (addr.includes("şamaxı") || addr.includes("samaxi")) region = "Şamaxı";

            if (!regionMap[region]) regionMap[region] = { count: 0, amount: 0 };
            regionMap[region].count++;
            regionMap[region].amount += isNaN(totalUnpaid) ? 0 : totalUnpaid;
            addToGroup(`region:${region}`, c);
        });

        initial.trendData = Object.entries(trendMap).map(([key, val]) => ({ name: val.label, amount: val.amount, count: val.count }));
        initial.avgProcessingDays = initial.totalCases > 0 ? Object.values(inspectorMap).reduce((acc, curr) => acc + curr.totalSpeed, 0) / initial.totalCases : 0;
        initial.legalFeesProjection = initial.readyForCourtCount * FEE_PER_CASE;

        initial.topBadStores = Object.entries(storeMap)
            .map(([name, val]) => ({ name, ...val }))
            .sort((a, b) => b.amount - a.amount).slice(0, 100);

        initial.investigatorEfficiency = Object.entries(inspectorMap)
            .map(([name, val]) => ({ name: name.split('@')[0], count: val.count, avgSpeed: val.totalSpeed / Math.max(1, val.count) }))
            .sort((a, b) => b.count - a.count);

        initial.adminEfficiency = Object.entries(adminMap)
            .map(([name, val]) => ({ name: name.split('@')[0], count: val.count, avgSpeed: val.totalSpeed / Math.max(1, val.count) }))
            .sort((a, b) => b.count - a.count);

        initial.statusDwellTimes = [
            { status: 'ASSIGN_WAITING', label: 'Təyinat Gözləmə', avgHours: dwellMap['ASSIGN_WAITING'].totalHours / Math.max(1, dwellMap['ASSIGN_WAITING'].count), count: dwellMap['ASSIGN_WAITING'].count, riskLevel: 'low', color: 'bg-slate-500' },
            { status: 'INSPECTOR_FILL', label: 'Məlumatların Doldurulması', avgHours: dwellMap['INSPECTOR_FILL'].totalHours / Math.max(1, dwellMap['INSPECTOR_FILL'].count), count: dwellMap['INSPECTOR_FILL'].count, riskLevel: 'low', color: 'bg-indigo-400' },
            { status: 'ARCHIVE_WAITING', label: 'Arxivdən Sənəd Gözlənilir', avgHours: dwellMap['ARCHIVE_WAITING'].totalHours / Math.max(1, dwellMap['ARCHIVE_WAITING'].count), count: dwellMap['ARCHIVE_WAITING'].count, riskLevel: 'low', color: 'bg-amber-400' },
            { status: 'FINAL_DOC_PREP', label: 'Yekun Sənəd Hazırlığı', avgHours: dwellMap['FINAL_DOC_PREP'].totalHours / Math.max(1, dwellMap['FINAL_DOC_PREP'].count), count: dwellMap['FINAL_DOC_PREP'].count, riskLevel: 'low', color: 'bg-emerald-400' }
        ];

        initial.bottleneckTimeline = initial.bottleneckTimeline.map(bt => ({
            ...bt,
            avgHours: stageTotals[bt.action]?.count > 0 ? stageTotals[bt.action].totalTime / stageTotals[bt.action].count : 0
        }));

        initial.topBadCourts = Object.entries(courtMap).map(([name, val]) => ({ name, ...val })).sort((a, b) => b.count - a.count).slice(0, 100);
        initial.regionalData = Object.entries(regionMap).map(([name, val]) => ({ name, ...val })).sort((a, b) => b.amount - a.amount).slice(0, 100);

        return initial;
    }, [filteredCustomers, auditLogs, selectedPerfUser]);


    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-4">
                <RefreshCw size={48} className="text-indigo-600 animate-spin" />
                <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Analiz Hazırlanır...</p>
            </div>
        </div>
    );

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-8 xl:p-12 space-y-10">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-4">
                            Analiz və Hesabatlar
                        </h1>
                        <p className="text-slate-500 font-medium mt-1 uppercase text-xs tracking-[0.2em] opacity-60">Problemli portfelin strateji idarəolunması</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex bg-white/50 backdrop-blur-sm p-1.5 rounded-2xl border border-slate-300">
                            {[
                                { id: '7d', label: '7G' },
                                { id: '30d', label: '30G' },
                                { id: '90d', label: '3A' },
                                { id: 'all', label: 'HAMISI' }
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTimeRange(t.id)}
                                    className={cn(
                                        "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                        timeRange === t.id ? "bg-slate-900 text-white shadow-lg" : "text-slate-500 hover:bg-white"
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <button onClick={fetchData} className="h-12 w-12 bg-white hover:bg-slate-50 border border-slate-300 rounded-2xl flex items-center justify-center transition-all shadow-sm active:scale-95 text-slate-600">
                            <RefreshCw size={18} />
                        </button>
                    </div>
                </div>

                {/* Strateji İcmal - Executive Insights */}
                {(() => {
                    const maxDwell = stats.statusDwellTimes.reduce((a, b) => a.avgHours > b.avgHours ? a : b, stats.statusDwellTimes[0]);
                    const riskScore = Math.round((stats.readyForCourtCount / Math.max(1, stats.totalCases)) * 100);
                    const trendDir = stats.trendData.length >= 2
                        ? (stats.trendData[stats.trendData.length - 1].amount > stats.trendData[stats.trendData.length - 2].amount ? "Artan" : "Azalan")
                        : "Stabil";

                    return (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <motion.div
                                whileHover={{ y: -5 }}
                                className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-[2.5rem] shadow-2xl shadow-indigo-200 text-white relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                    <TrendingUp size={100} />
                                </div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] mb-4 opacity-70 flex items-center">
                                    İcraatın Çevikliyi
                                </h4>
                                <p className="text-xl font-medium leading-relaxed mb-6">
                                    İşlərin orta icra müddəti <span className="font-black text-emerald-300">{formatDetailedTime(stats.avgProcessingDays * 24)}</span> təşkil edir.
                                    Hazırda ən çox ləngimə <span className="underline decoration-indigo-400">{maxDwell.label}</span> mərhələsində müşahidə olunur.
                                </p>
                                <div className="flex items-center gap-3">
                                    <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest">
                                        Status: {stats.avgProcessingDays < 5 ? 'Sürətli' : stats.avgProcessingDays < 15 ? 'Normal' : 'Ləng'}
                                    </span>
                                </div>
                            </motion.div>

                            <motion.div
                                whileHover={{ y: -5 }}
                                className="bg-white p-8 rounded-[2.5rem] border border-slate-300 shadow-sm relative overflow-hidden group"
                            >
                                <div className="flex justify-between items-start mb-10">
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center">
                                            İcraat Vəziyyəti
                                            <InfoTooltip title="Sənədlərin hazırlıq faizi" text="Məhkəməyə hazır işlərin ümumi işlərin sayına olan nisbətini faizlə ifadə edir." />
                                        </h4>
                                        <p className="text-3xl font-black text-slate-900 mt-2">{riskScore} <span className="text-md text-slate-400">/ 100%</span></p>
                                    </div>
                                    <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", riskScore < 40 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>
                                        {riskScore < 40 ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase">
                                        <span>Məhkəməyə Hazırlıq</span>
                                        <span className={riskScore < 40 ? "text-rose-600" : "text-emerald-600"}>
                                            {riskScore < 40 ? "Kritik" : riskScore < 70 ? "Orta" : "Yüksək"}
                                        </span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${riskScore}%` }} className={cn("h-full", riskScore < 40 ? "bg-rose-500" : "bg-emerald-500")} />
                                    </div>
                                </div>
                            </motion.div>

                            <motion.div
                                whileHover={{ y: -5 }}
                                className="bg-white p-8 rounded-[2.5rem] border border-slate-300 shadow-sm relative overflow-hidden group"
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center">
                                            Borc Portfelinin Gedişatı
                                            <InfoTooltip title="Trend Analizi" text="Son 6 ayın borc məbləğləri müqayisə olunur. Cari dövr əvvəlkindən çoxdursa “Artan”, azdırsa “Azalan” kimi qeyd edilir." />
                                        </h4>
                                        <p className="text-2xl font-black text-slate-900 mt-2">{trendDir} Trend</p>
                                    </div>
                                    <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600">
                                        <Activity size={24} />
                                    </div>                                </div>
                                <div className="h-24 w-full mt-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={stats.trendData.slice(-6)} margin={{ top: 5, right: 15, left: 15, bottom: 5 }}>
                                            <XAxis
                                                dataKey="name"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fontSize: 12, fontWeight: 800, fill: '#000000ff' }}
                                                interval={0}
                                            />
                                            <Area type="monotone" dataKey="amount" stroke="#4f46e5" fill="#eef2ff" strokeWidth={2} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </motion.div>
                        </div>
                    );
                })()}

                {/* KPI Cards Upgraded with Sparklines */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} initial="hidden" animate="show"
                        className="bg-white p-8 rounded-[2.5rem] border border-slate-300 shadow-sm relative group hover:shadow-xl transition-all"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="h-12 w-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 group-hover:rotate-12 transition-transform">
                                <Wallet size={24} />
                            </div>
                            <div className="h-12 w-24">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats.trendData.slice(-10)}>
                                        <Area type="monotone" dataKey="amount" stroke="#f43f5e" fill="#fff1f2" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center opacity-70">
                            Risk Altındakı Cəmi Borc
                            <InfoTooltip title="Riskli Portfel" text="Sistemdəki bütün aktiv icraatların ümumi qalıq borc məbləği." />
                        </div>
                        <h2 className="text-3xl font-black mt-3 text-slate-900 tracking-tight">{formatAZN(stats.totalPendingDebt)}</h2>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase text-rose-500">
                            <TrendingUp size={12} /> {stats.debtTrendPercent}% artım
                        </div>
                    </motion.div>

                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} initial="hidden" animate="show" transition={{ delay: 0.1 }}
                        className="bg-white p-8 rounded-[2.5rem] border border-slate-300 shadow-sm relative group hover:shadow-xl transition-all"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="h-12 w-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                                <CheckCircle size={24} />
                            </div>
                            <div className="h-12 w-24">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.trendData.slice(-10)}>
                                        <Bar dataKey="count" fill="#6366f1" radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center opacity-70">
                            Məhkəməyə Hazır Sənədlər
                            <InfoTooltip title="Hazır Paket" text="Sənədləri tam hazırlanan işlərin sayı." />
                        </div>
                        <h2 className="text-3xl font-black mt-3 text-slate-900 tracking-tight">{stats.readyForCourtCount} <span className="text-sm text-slate-400 font-bold uppercase ml-1">İş</span></h2>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase text-indigo-500">
                            <Activity size={12} /> {(stats.readyForCourtCount / Math.max(1, stats.totalCases) * 100).toFixed(0)}% Hazırlıq Oranı
                        </div>
                    </motion.div>

                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} initial="hidden" animate="show" transition={{ delay: 0.2 }}
                        className="bg-white p-8 rounded-[2.5rem] border border-slate-300 shadow-sm relative group hover:shadow-xl transition-all"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center", stats.avgProcessingDays < 5 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                                <Clock size={24} />
                            </div>
                            <Inbox size={24} className="opacity-10 text-slate-900" />
                        </div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center opacity-70">
                            İşlərin Orta İcra Müddəti
                            <InfoTooltip title="İcra Sürəti" text="İşin daxil olmasından sənədlərin hazır olmasına qədər keçən orta müddət." />
                        </div>
                        <h2 className="text-3xl font-black mt-3 text-slate-900 tracking-tight">{stats.avgProcessingDays.toFixed(1)} <span className="text-sm text-slate-400 font-bold uppercase ml-1">Gün</span></h2>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase text-emerald-500">
                            Status: {stats.avgProcessingDays < 5 ? 'Sürətli' : stats.avgProcessingDays < 15 ? 'Normal' : 'Ləng'}
                        </div>
                    </motion.div>

                    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} initial="hidden" animate="show" transition={{ delay: 0.3 }}
                        className="bg-white p-8 rounded-[2.5rem] border border-slate-300 shadow-sm relative group hover:shadow-xl transition-all"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="h-12 w-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                                <Wallet size={24} />
                            </div>
                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Borcun Tərkibi</div>
                        </div>
                        <div className="space-y-3">
                            {[
                                { label: "Ödənilməmiş Borc", amount: stats.debtComposition.principal, color: "bg-indigo-500" },
                                { label: "Cərimə", amount: stats.debtComposition.penalty, color: "bg-rose-500" },
                                { label: "Rüsumlar", amount: stats.debtComposition.fees, color: "bg-amber-500" }
                            ].map((item, i) => (
                                <div key={i}>
                                    <div className="flex justify-between text-[12px] font-black uppercase mb-1">
                                        <span className="text-slate-400">{item.label}</span>
                                        <span className="text-slate-900">{formatAZN(item.amount)}</span>
                                    </div>
                                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(item.amount / Math.max(1, stats.totalPendingDebt)) * 100}%` }}
                                            className={cn("h-full", item.color)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Portfel Dinamikası & Status Paylanması */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Main Trend Chart */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="lg:col-span-8 bg-white p-10 rounded-[3rem] border border-slate-300 shadow-sm relative overflow-hidden group"
                    >
                        <div className="flex items-center justify-between mb-10 relative z-10">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Portfelin Gedişatı</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Son 6 ayda borc məbləği və iş sayının müqayisəli analizi</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-indigo-500" />
                                    <span className="text-[9px] font-black text-slate-500 uppercase">Məbləğ</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-slate-300" />
                                    <span className="text-[9px] font-black text-slate-500 uppercase">Say</span>
                                </div>
                            </div>
                        </div>

                        <div className="h-[350px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }}
                                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                                    />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl">
                                                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 border-b border-white/5 pb-2">{payload[0].payload.name}</p>
                                                        <div className="space-y-1">
                                                            <p className="text-sm font-black text-white">{formatAZN(payload[0].value as number)}</p>
                                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Cəmi {payload[0].payload.count} iş qeydə alınıb</p>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="amount"
                                        stroke="#4f46e5"
                                        strokeWidth={4}
                                        fillOpacity={1}
                                        fill="url(#colorAmt)"
                                        animationDuration={2000}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>

                    {/* Donut Chart for Statuses */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="lg:col-span-4 bg-white p-10 rounded-[3rem] border border-slate-300 shadow-sm flex flex-col items-center justify-center relative overflow-hidden"
                    >
                        <div className="text-center mb-8 w-full">
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Statuslar üzrə Bölgü</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">İşlərin cari vəziyyəti</p>
                        </div>

                        <div className="h-[280px] w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={[
                                            { name: 'Yeni', value: stats.processFunnel.new, color: '#94a3b8' },
                                            { name: 'İcraatda', value: stats.processFunnel.filling, color: '#818cf8' },
                                            { name: 'Arxivdə', value: stats.processFunnel.waiting, color: '#fbbf24' },
                                            { name: 'Hazır', value: stats.processFunnel.ready, color: '#34d399' },
                                            { name: 'Tamamlanmış', value: stats.processFunnel.filed, color: '#4f46e5' }
                                        ].filter(d => d.value > 0)}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={70}
                                        outerRadius={100}
                                        paddingAngle={8}
                                        dataKey="value"
                                        strokeWidth={0}
                                        animationBegin={500}
                                        animationDuration={1500}
                                    >
                                        {[
                                            { name: 'Yeni', value: stats.processFunnel.new, color: '#94a3b8' },
                                            { name: 'İcraatda', value: stats.processFunnel.filling, color: '#818cf8' },
                                            { name: 'Arxivdə', value: stats.processFunnel.waiting, color: '#fbbf24' },
                                            { name: 'Hazır', value: stats.processFunnel.ready, color: '#34d399' },
                                            { name: 'Tamamlanmış', value: stats.processFunnel.filed, color: '#4f46e5' }
                                        ].map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-white border border-slate-300 p-3 rounded-2xl shadow-xl">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{data.name}</span>
                                                        <p className="text-lg font-black text-slate-900">{data.value} İş</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-3xl font-black text-slate-900 leading-none">{stats.totalCases}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Toplam İş Sayı</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 w-full mt-6">
                            {[
                                { label: "İcraatda", count: stats.processFunnel.filling, color: "bg-indigo-400" },
                                { label: "Arxivdə", count: stats.processFunnel.waiting, color: "bg-amber-400" },
                                { label: "Hazır", count: stats.processFunnel.ready, color: "bg-emerald-400" },
                                { label: "Tamamlanmış", count: stats.processFunnel.filed, color: "bg-indigo-600" }
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className={cn("h-2 w-2 rounded-full", item.color)} />
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-tighter truncate">{item.label}</span>
                                    <span className="text-[10px] font-bold text-slate-500 ml-auto">{item.count}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Workflow Analytics & Demographics */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-7 bg-white p-10 rounded-[3rem] border border-slate-300 shadow-sm relative group">
                        <div className="flex items-start justify-between mb-12 relative flex-wrap gap-4">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">İcraat Sürəti (Ləngimə Nöqtələri)</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Mərhələlər üzrə orta gözləmə müddəti</p>
                            </div>

                            <div className="relative group/select">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                    <UserCircle size={16} className="text-indigo-500" />
                                </div>
                                <select
                                    value={selectedPerfUser || ""}
                                    onChange={(e) => setSelectedPerfUser(e.target.value || null)}
                                    className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-black uppercase rounded-2xl pl-11 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shadow-sm hover:bg-white hover:border-indigo-200"
                                >
                                    <option value="">Bütün İstifadəçilər</option>
                                    {allUsers.map((u) => (
                                        <option key={u} value={u}>{u.split('@')[0]}</option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                    <ChevronDown size={14} className="text-slate-400 group-hover/select:text-indigo-500 transition-colors" />
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-8 relative">
                            {stats.statusDwellTimes.map((dwell, i) => (
                                <div key={i} className="group/dwell">
                                    <div className="flex justify-between items-end mb-3">
                                        <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight group-hover/dwell:text-indigo-600 transition-colors">{dwell.label}</span>
                                        <div className={cn(
                                            "text-[10px] font-black px-3 py-1 rounded-lg border flex items-center gap-2",
                                            dwell.riskLevel === 'high' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                                dwell.riskLevel === 'medium' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                                    "bg-emerald-50 text-emerald-600 border-emerald-100"
                                        )}>
                                            <Clock size={12} />
                                            {formatDetailedTime(dwell.avgHours)}
                                        </div>
                                    </div>
                                    <div className="h-6 w-full bg-slate-50 rounded-2xl overflow-hidden border border-slate-300 p-1.5 shadow-inner">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, (dwell.avgHours / 72) * 100)}%` }}
                                            transition={{ duration: 1.5, delay: i * 0.1 }}
                                            className={cn("h-full rounded-xl shadow-lg relative",
                                                dwell.riskLevel === 'high' ? "bg-gradient-to-r from-rose-400 to-rose-600" :
                                                    dwell.riskLevel === 'medium' ? "bg-gradient-to-r from-amber-400 to-amber-600" :
                                                        "bg-gradient-to-r from-emerald-400 to-emerald-600"
                                            )}
                                        >
                                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                        </motion.div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {(() => {
                            const totalHours = stats.statusDwellTimes.reduce((acc, curr) => acc + curr.avgHours, 0);
                            return (
                                <div className=" mt-8 border-t border-slate-100 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cəmi Orta Müddət</p>
                                        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Toplam İcraat Müddəti</h4>
                                    </div>
                                    <div className="bg-indigo-50 px-6 py-3 rounded-2xl border border-indigo-100 flex items-center gap-3">
                                        <Clock size={20} className="text-indigo-600" />
                                        <div className="text-right">
                                            <span className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">Ümumi Gözləmə</span>
                                            <span className="text-lg font-black text-indigo-700 tracking-tight">
                                                {formatDetailedTime(totalHours)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    <div className="lg:col-span-5 bg-white p-10 rounded-[3rem] border border-slate-300 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                                <Users size={20} className="text-indigo-600" />
                                Müştəri Profili
                            </h3>
                        </div>
                        <div className="space-y-12">
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center justify-between">
                                    Cins üzrə paylanma <span>{stats.totalCases} İş</span>
                                </p>
                                <div className="flex h-12 w-full rounded-3xl overflow-hidden border border-slate-300 shadow-sm p-1.5 bg-slate-50/50">
                                    {stats.demographics.gender.male > 0 && (
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(stats.demographics.gender.male / (stats.demographics.gender.male + stats.demographics.gender.female)) * 100}%` }}
                                            className="bg-indigo-500 h-full flex items-center justify-center text-white text-[10px] font-black rounded-2xl hover:opacity-90 transition-opacity cursor-pointer"
                                            onClick={() => setDrillDown({ title: "Cins: Kişi", customers: stats.groups["gender:male"] || [] })}
                                        >
                                            KİŞİ
                                        </motion.div>
                                    )}
                                    {stats.demographics.gender.female > 0 && (
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(stats.demographics.gender.female / (stats.demographics.gender.male + stats.demographics.gender.female)) * 100}%` }}
                                            className="bg-rose-400 h-full flex items-center justify-center text-white text-[10px] font-black rounded-2xl hover:opacity-90 transition-opacity cursor-pointer ml-1.5"
                                            onClick={() => setDrillDown({ title: "Cins: Qadın", customers: stats.groups["gender:female"] || [] })}
                                        >
                                            QADIN
                                        </motion.div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Yaş qrupları</p>
                                {[
                                    { label: "Gənc (<35)", count: stats.demographics.ageGroups.young, color: "bg-emerald-400", key: "age:young" },
                                    { label: "Orta (35-55)", count: stats.demographics.ageGroups.mid, color: "bg-amber-400", key: "age:mid" },
                                    { label: "Yaşlı (>55)", count: stats.demographics.ageGroups.senior, color: "bg-rose-400", key: "age:senior" }
                                ].map((group, i) => (
                                    <div key={i}
                                        onClick={() => setDrillDown({ title: group.label, customers: stats.groups[group.key] || [] })}
                                        className="flex items-center justify-between cursor-pointer hover:bg-slate-50 p-4 rounded-2xl transition-all border border-transparent hover:border-slate-300"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn("h-3 w-3 rounded-full shadow-sm", group.color)} />
                                            <span className="text-xs font-black text-slate-600 uppercase">{group.label}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg font-black text-slate-900">{group.count}</span>
                                            <div className="h-1 w-12 bg-slate-300 rounded-full overflow-hidden">
                                                <div className={cn("h-full", group.color)} style={{ width: `${(group.count / stats.totalCases) * 100}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Courts & Financial Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-10">
                    <div className="lg:col-span-8 bg-white p-10 rounded-[3rem] border border-slate-300 shadow-sm relative group overflow-hidden">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                                    <Gavel size={20} className="text-indigo-600" />
                                    Məhkəmələr üzrə İş Bölgüsü
                                </h3>
                            </div>
                        </div>
                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.topBadCourts} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 8, fontWeight: 800, fill: '#94a3b8' }}
                                        interval={stats.topBadCourts.length > 10 ? 'preserveStartEnd' : 0}
                                        tickFormatter={(v) => v.length > 12 ? v.substring(0, 10) + '...' : v}
                                    />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }} />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl">
                                                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">{payload[0].payload.name}</p>
                                                        <p className="text-base font-black text-white">{payload[0].value} İş</p>
                                                        <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase">Cəmi Borc: {formatAZN(payload[0].payload.amount)}</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar
                                        dataKey="count"
                                        fill="#4f46e5"
                                        radius={[6, 6, 0, 0]}
                                        maxBarSize={40}
                                        onClick={(data) => setDrillDown({ title: `Məhkəmə: ${data.name}`, customers: stats.groups[`court:${data.name}`] || [] })}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="lg:col-span-4 bg-white p-10 rounded-[3rem] border border-slate-300 shadow-sm relative overflow-hidden group">
                        <div className="flex items-center justify-between mb-8 relative z-10">
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                                <StoreIcon size={18} className="text-indigo-600" />
                                Mağazalar üzrə bölgü
                            </h3>
                        </div>
                        <div className="space-y-6 relative z-10 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                            {stats.topBadStores.map((store, i) => (
                                <div key={i}
                                    onClick={() => setDrillDown({ title: `Mağaza: ${store.name}`, customers: stats.groups[`store:${store.name}`] || [] })}
                                    className="p-4 rounded-2xl bg-slate-50/50 border border-slate-300 hover:border-indigo-100 hover:bg-white transition-all cursor-pointer group/store mb-3"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[11px] font-black text-slate-700 uppercase truncate pr-4 group-hover/store:text-indigo-600 transition-colors">{store.name}</span>
                                        <span className="text-[11px] font-black text-slate-900">{formatAZN(store.amount)}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-300/50 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(store.amount / (stats.topBadStores[0]?.amount || 1)) * 100}%` }}
                                            className="h-full bg-indigo-600 rounded-full"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>


                <DrillDownModal
                    isOpen={!!drillDown}
                    onClose={() => setDrillDown(null)}
                    title={drillDown?.title || ""}
                    customers={drillDown?.customers || []}
                />
            </div>
        </AuthGuard>
    );
}

function DrillDownModal({ isOpen, onClose, title, customers }: { isOpen: boolean, onClose: () => void, title: string, customers: any[] }) {
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [title, customers]);

    if (!isOpen) return null;

    const totalPages = Math.ceil(customers.length / itemsPerPage);
    const paginatedCustomers = customers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const statusLabels: Record<string, string> = {
        'COMPLETED': 'TAMAMLANIB',
        'ARCHIVE_UPLOADED': 'ARXİV SƏNƏDİ YÜKLƏNİB',
        'WAITING_FOR_ARCHIVE': 'ARXİVDƏN SƏNƏD GÖZLƏNİLİR',
        'ASSIGNED_BY_MANAGER': 'İSTİFADƏÇİ TƏYİN EDİLDİ',
        'FILLED_BY_ADMIN': 'MƏLUMATLAR DOLUDUR',
        'INSPECTOR_ENTERED': 'YENİ (Daxil edildi)',
        'ASSIGN_WAITING': 'TƏYİNAT GÖZLƏNİLİR',
        'INSPECTOR_FILL': 'MƏLUMATLAR DOLDURUR',
        'FINAL_DOC_PREP': 'YEKUN HAZIRLIQ'
    };

    return (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-white w-full max-w-5xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                {/* Modal Header */}
                <div className="p-8 border-b border-slate-300 flex items-center justify-between shrink-0 bg-slate-50/50">
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">{title}</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Cəmi {customers.length} nəticə tapıldı • Səhifə {currentPage}/{Math.max(1, totalPages)}</p>
                    </div>
                    <button onClick={onClose} className="h-12 w-12 bg-white hover:bg-slate-300 rounded-2xl flex items-center justify-center transition-all border border-slate-300 text-slate-500 hover:text-slate-900 shadow-sm hover:shadow-md active:scale-95">
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
                    <div className="grid grid-cols-1 gap-4">
                        {paginatedCustomers.map((c, i) => (
                            <div key={i} className="bg-white border border-slate-300 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-lg hover:border-indigo-100 transition-all group">
                                <div className="flex items-center gap-5">
                                    <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                        <FileText size={24} />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-base font-black text-slate-900 uppercase tracking-tight truncate max-w-[200px] md:max-w-md">{c.fullName}</h4>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-300">KOD: {c.customerCode || '---'}</span>
                                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100/50">
                                                {statusLabels[c.process_status] || c.process_status || 'YENİ'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col md:items-end md:text-right">
                                    <p className="text-xl font-black text-slate-900">{Math.floor(parseFloat(c.details?.totalUnpaid || c.debtAmount || "0")).toLocaleString()} ₼</p>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 truncate max-w-[200px]">{c.store || 'Məlum deyil'}</p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => window.open(`/reports/generate?id=${c.id}`, '_blank')}
                                        className="h-12 px-6 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center gap-3 active:scale-95 shadow-md shadow-slate-300 hover:shadow-indigo-200"
                                    >
                                        Detala Bax <ExternalLink size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {totalPages > 1 && (
                            <div className="flex justify-center items-center gap-2 mt-8 pt-4 border-t border-slate-50">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => prev - 1)}
                                    className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                                >
                                    <ChevronRight size={18} className="rotate-180" />
                                </button>

                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                    .map((p, i, arr) => (
                                        <React.Fragment key={p}>
                                            {i > 0 && arr[i - 1] !== p - 1 && <span className="text-slate-400">...</span>}
                                            <button
                                                onClick={() => setCurrentPage(p)}
                                                className={cn(
                                                    "h-10 w-10 rounded-xl text-[10px] font-black transition-all",
                                                    currentPage === p
                                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                                                        : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                                                )}
                                            >
                                                {p}
                                            </button>
                                        </React.Fragment>
                                    ))
                                }

                                <button
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                    className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}

                        {customers.length === 0 && (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                                <Inbox size={48} className="mb-4 opacity-20" />
                                <p className="text-sm font-black uppercase tracking-widest">Məlumat Tapılmadı</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Loader() {
    return (
        <div className="relative">
            <div className="h-24 w-24 rounded-full border-[8px] border-slate-300 border-t-indigo-600 animate-spin" />
            <Scale className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={32} />
        </div>
    );
}

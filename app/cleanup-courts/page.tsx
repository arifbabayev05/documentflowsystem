"use client";

import { useState } from "react";
import { getCourts, updateCourt } from "@/lib/db";

export default function CleanupCourtsPage() {
    const [status, setStatus] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const cleanup = async () => {
        setLoading(true);
        setStatus("Fetching courts...");
        try {
            const courts = await getCourts() as any[];
            setStatus(`Found ${courts.length} courts. Starting cleanup...`);

            let updatedCount = 0;
            for (const court of courts) {
                let needsUpdate = false;
                let newPhone = court.phone || "";
                let newFax = court.fax || "";

                // Fix "efon:" prefix in phone
                if (newPhone.includes("efon:")) {
                    newPhone = newPhone.replace(/efon\s*:\s*/gi, "").trim();
                    needsUpdate = true;
                }

                // Fix "efon:" prefix in fax (just in case)
                if (newFax.includes("efon:")) {
                    newFax = newFax.replace(/efon\s*:\s*/gi, "").trim();
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    await updateCourt(court.id, {
                        phone: newPhone,
                        fax: newFax
                    });
                    updatedCount++;
                    setStatus(`Updated (${updatedCount}): ${court.name}`);
                }
            }

            setStatus(`Done! Cleaned up ${updatedCount} courts.`);
        } catch (e: any) {
            console.error(e);
            setStatus(`Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-10 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Cleanup Courts Data</h1>
            <p className="mb-4 text-sm text-gray-600">
                This will remove "efon:" prefixes from court phone and fax numbers.
            </p>

            <button
                onClick={cleanup}
                disabled={loading}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
            >
                {loading ? "Processing..." : "Start Cleanup"}
            </button>

            <div className="mt-6 p-4 border rounded bg-gray-50 font-mono text-sm h-64 overflow-auto">
                {status || "Ready..."}
            </div>
        </div>
    );
}

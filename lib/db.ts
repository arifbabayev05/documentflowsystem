import { db, storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    limit,
    serverTimestamp,
    deleteDoc,
    writeBatch,
    orderBy,
    increment
} from "firebase/firestore";
import { AVAILABLE_PERMISSIONS } from "./permissions";

const USERS_COLLECTION = "Users";
const PERMISSIONS_COLLECTION = "Permissions";
const CUSTOMERS_COLLECTION = "Customers";
const AUDIT_COLLECTION = "AuditLogs";
const SETTINGS_COLLECTION = "GlobalSettings";
const COURTS_COLLECTION = "Courts";
const STORES_COLLECTION = "Stores";
const TEMPLATES_COLLECTION = "Templates";
const ERRORS_COLLECTION = "SystemErrors";

// --- Helpers ---
/**
 * Recursively removes undefined values from an object or array.
 * Firebase doesn't allow 'undefined' as a value.
 */
function sanitizeFirebaseData(data: any): any {
    if (data === undefined) return null;
    if (data === null || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
        return data.map(v => sanitizeFirebaseData(v));
    }

    const cleaned: any = {};
    Object.keys(data).forEach(key => {
        const value = data[key];
        if (value !== undefined) {
            cleaned[key] = sanitizeFirebaseData(value);
        }
    });
    return cleaned;
}

// Permissions Logic
export async function getRolePermissions(role: string) {
    try {
        const docRef = doc(db, PERMISSIONS_COLLECTION, role);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().allowedPaths || [];
        }
    } catch (e) {
        console.error("getRolePermissions error:", e);
    }

    if (role === "SUPERADMIN") return AVAILABLE_PERMISSIONS.map((p: any) => p.id);
    if (role === "MANAGER") return ["page_customers", "page_archive_customers", "page_parameters", "page_users", "action_assignment", "page_letter_list"];
    if (role === "INSPECTOR_LEAD") return ["page_inspector", "page_inspectors", "page_users"];
    if (role === "ADMIN") return ["page_customers", "page_archive_customers"];
    if (role === "INSPECTOR") return ["page_inspector"];
    if (role === "ARCHIVER") return ["page_archiver"];
    if (role === "ARCHIVE_MANAGER") return ["page_archiver", "page_archive_manager", "page_archive_customers", "page_users"];
    if (role === "DEP_HEAD") return ["page_customers", "page_analytics", "page_parameters"];
    if (role === "AUDIT_LEAD") return ["page_analytics", "page_audit_logs", "page_parameters", "page_users"];
    return []; // PENDING or others have no default permissions
}

export async function updateRolePermissions(role: string, paths: string[]) {
    const docRef = doc(db, PERMISSIONS_COLLECTION, role);
    return await setDoc(docRef, sanitizeFirebaseData({
        id: role,
        role,
        allowedPaths: paths,
        updatedAt: serverTimestamp()
    }), { merge: true });
}

// User Logic
export async function syncUser(user: { email: string; displayName?: string }) {
    const normalizedEmail = user.email.toLowerCase().trim();
    try {
        const userRef = doc(db, USERS_COLLECTION, normalizedEmail);
        const userSnap = await getDoc(userRef);

        let userDoc: any;
        if (userSnap.exists()) {
            userDoc = {
                ...userSnap.data(),
                lastLogin: new Date().toISOString(),
                displayName: userSnap.data().displayName || user.displayName || normalizedEmail.split('@')[0]
            };
            await updateDoc(userRef, sanitizeFirebaseData(userDoc));
        } else {
            const usersRef = collection(db, USERS_COLLECTION);
            const q = query(usersRef, limit(1));
            const querySnap = await getDocs(q);
            const isFirstUser = querySnap.empty;

            userDoc = {
                id: normalizedEmail,
                email: normalizedEmail,
                displayName: user.displayName || normalizedEmail.split('@')[0],
                role: isFirstUser ? "SUPERADMIN" : "PENDING",
                lastLogin: new Date().toISOString(),
                status: isFirstUser ? "ACTIVE" : "PENDING",
                permissions: []
            };
            await setDoc(userRef, sanitizeFirebaseData(userDoc));
        }

        if (!userDoc.permissions || userDoc.permissions.length === 0) {
            userDoc.permissions = await getRolePermissions(userDoc.role);
        }
        return userDoc;
    } catch (e) {
        console.error("syncUser error:", e);
        throw e;
    }
}

export async function getAllUsers() {
    try {
        const querySnap = await getDocs(collection(db, USERS_COLLECTION));
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("getAllUsers error:", e);
        return [];
    }
}

export async function updateUserRole(email: string, role: string, permissions?: string[], userEmail: string = "system") {
    try {
        const userRef = doc(db, USERS_COLLECTION, email);
        const finalPermissions = permissions || await getRolePermissions(role);
        await updateDoc(userRef, { role, permissions: finalPermissions });
        await addAuditLog("UPDATE_ROLE", `${email} rolü ${role} olaraq dəyişdirildi`, userEmail, "USER", { targetUser: email, newRole: role });
        return true;
    } catch (e) {
        console.error("updateUserRole error:", e);
        throw e;
    }
}

export async function updateUserData(email: string, data: any, userEmail: string = "system") {
    try {
        const userRef = doc(db, USERS_COLLECTION, email);
        await updateDoc(userRef, sanitizeFirebaseData({ ...data, updatedAt: serverTimestamp() }));
        return true;
    } catch (e) {
        console.error("updateUserData error:", e);
        throw e;
    }
}

export async function deleteUser(email: string, userEmail: string = "system") {
    try {
        const userRef = doc(db, USERS_COLLECTION, email);
        await deleteDoc(userRef);
        await addAuditLog("USER_DELETE", `${email} istifadəçisi silindi`, userEmail, "USER", { targetUser: email });
        return true;
    } catch (e) {
        console.error("deleteUser error:", e);
        throw e;
    }
}



// Customer Logic
export async function bulkAddCustomers(customers: any[], userEmail: string = "system") {
    try {
        const batch = writeBatch(db);
        const results = [];
        const timestamp = new Date().toISOString();
        for (const customer of customers) {
            const cleanCode = customer.customerCode?.toString().trim();
            const customerId = cleanCode || Math.random().toString(36).substring(7);
            const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
            const data = {
                ...customer,
                customerCode: cleanCode,
                id: customerId,
                createdBy: userEmail,
                updatedAt: serverTimestamp(),
                statusHistory: [
                    {
                        label: "Müştəri qeydə alındı",
                        action: "CREATE",
                        timestamp,
                        user: userEmail
                    }
                ]
            };
            batch.set(customerRef, sanitizeFirebaseData(data), { merge: true });
            results.push(data);
        }
        await batch.commit();
        await addAuditLog("BULK_ADD", `Bulk əlavə: ${customers.length} müştəri sistemi daxil edildi`, userEmail, "CUSTOMER", { count: customers.length });
        return results;
    } catch (e) {
        console.error("bulkAddCustomers error:", e);
        throw e;
    }
}

export async function getCustomers() {
    try {
        const querySnap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
        return querySnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    } catch (e) {
        return [];
    }
}

export async function getInspectorCustomers(email: string) {
    try {
        const q = query(collection(db, CUSTOMERS_COLLECTION), where("createdBy", "==", email));
        const querySnap = await getDocs(q);
        return querySnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    } catch (e) {
        return [];
    }
}

export async function deleteCustomer(id: string, userEmail: string = "system") {
    try {
        await deleteDoc(doc(db, CUSTOMERS_COLLECTION, id));
        await addAuditLog("DELETE", `Müştəri silindi`, userEmail, "CUSTOMER", { targetId: id });
        return true;
    } catch (e) {
        throw e;
    }
}

export async function getCustomer(id: string) {
    try {
        if (!id) return null;
        const cleanId = id.toString().trim();
        const docRef = doc(db, CUSTOMERS_COLLECTION, cleanId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };

        // If not found by ID, try querying by customerCode field as fallback
        return await findCustomerByCode(cleanId);
    } catch (e) {
        return null;
    }
}

/** 
 * Find a customer by the customerCode field (case insensitive/trimmed)
 */
export async function findCustomerByCode(code: string) {
    try {
        if (!code) return null;
        const cleanCode = code.trim();
        const q = query(
            collection(db, CUSTOMERS_COLLECTION),
            where("customerCode", "==", cleanCode),
            limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
            const d = snap.docs[0];
            return { id: d.id, ...d.data() };
        }
        return null;
    } catch (e) {
        return null;
    }
}

export async function updateCustomer(id: string, data: any, userEmail: string = "system") {
    try {
        const customerRef = doc(db, CUSTOMERS_COLLECTION, id);
        const oldDoc = await getDoc(customerRef);
        const oldData = oldDoc.exists() ? oldDoc.data() : null;

        // Mantain status history
        let statusHistory = [...(oldData?.statusHistory || [])];
        const timestamp = new Date().toISOString();

        if (!oldDoc.exists() && statusHistory.length === 0) {
            statusHistory.push({
                label: "Müştəri qeydə alındı",
                action: "CREATE",
                timestamp,
                user: userEmail
            });
        }

        const cleanedData = { ...data, statusHistory };

        let action = "UPDATE";
        let detail = `Müştəri məlumatı yeniləndi`;
        let category: "CUSTOMER" | "ARCHIVE" | "DOCUMENT" | "SYSTEM" | "USER" = "CUSTOMER";

        const oldFiles = oldData?.details?.invoices?.filter((i: any) => !!i.archiveUrl)?.length || 0;
        const newFiles = data.details?.invoices?.filter((i: any) => !!i.archiveUrl)?.length || 0;
        const oldReq = oldData?.details?.invoices?.filter((i: any) => (i as any).archiveRequested)?.length || 0;
        const newReq = data.details?.invoices?.filter((i: any) => (i as any).archiveRequested)?.length || 0;

        // --- ENHANCED AUDIT LOGGING ---
        const changes: string[] = [];
        const auditMeta: any = { targetId: id, targetName: data.fullName };

        // 1. Core Fields
        const coreFields = ['fullName', 'customerCode', 'debtAmount', 'assignedTo', 'archiveAssignedTo', 'process_status', 'isArchived', 'store', 'courtName'];
        coreFields.forEach(f => {
            if (data[f] !== oldData?.[f]) {
                changes.push(`${f}: ${oldData?.[f] || 'N/A'} -> ${data[f] || 'N/A'}`);
                auditMeta[`old_${f}`] = oldData?.[f] || null;
                auditMeta[`new_${f}`] = data[f] || null;
            }
        });

        // 2. Details Fields
        const detailsToTrack = ['fin', 'phone', 'address', 'actualAddress', 'totalPrice', 'paidAmount', 'totalUnpaid', 'fee', 'penalty', 'warningDate'];
        detailsToTrack.forEach(f => {
            if (data.details?.[f] !== oldData?.details?.[f]) {
                changes.push(`details.${f}: ${oldData?.details?.[f] || 'N/A'} -> ${data.details?.[f] || 'N/A'}`);
                auditMeta[`old_details_${f}`] = oldData?.details?.[f] || null;
                auditMeta[`new_details_${f}`] = data.details?.[f] || null;
            }
        });

        // 3. ULTRA-DETAILED INVOICE COMPARISON
        const oldInvoices = oldData?.details?.invoices || [];
        const newInvoices = data.details?.invoices || [];

        const invoiceChanges: string[] = [];

        // Find Removed
        oldInvoices.forEach((oi: any) => {
            if (!newInvoices.some((ni: any) => ni.id === oi.id)) {
                invoiceChanges.push(`SİLİNDİ: Faktura №${oi.invoiceNumber || 'N/A'} (ID: ${oi.id})`);
            }
        });

        // Find Added
        newInvoices.forEach((ni: any) => {
            if (!oldInvoices.some((oi: any) => oi.id === ni.id)) {
                invoiceChanges.push(`ƏLAVƏ: Faktura №${ni.invoiceNumber || 'N/A'} (ID: ${ni.id})`);
            }
        });

        // Find Modified
        newInvoices.forEach((ni: any) => {
            const oi = oldInvoices.find((o: any) => o.id === ni.id);
            if (oi && JSON.stringify(oi) !== JSON.stringify(ni)) {
                const subChanges: string[] = [];
                if (oi.invoiceNumber !== ni.invoiceNumber) subChanges.push(`Nömrə: ${oi.invoiceNumber || 'N/A'} -> ${ni.invoiceNumber || 'N/A'}`);
                if (JSON.stringify(oi.orders) !== JSON.stringify(ni.orders)) subChanges.push(`Sifarişlər/Məbləğ dəyişdirildi`);
                if (oi.archiveUrl !== ni.archiveUrl) subChanges.push(`Sənəd faylı yeniləndi`);

                invoiceChanges.push(`REDAKTƏ: Faktura №${ni.invoiceNumber || 'N/A'} (${subChanges.join(', ')})`);
            }
        });

        if (invoiceChanges.length > 0) {
            changes.push(...invoiceChanges);
            auditMeta.oldInvoices = oldInvoices;
            auditMeta.newInvoices = newInvoices;
        }

        // --- ALWAYS PREPARE SNAPSHOT FOR AUDIT ---
        auditMeta.snapshot = data;
        auditMeta.changesCount = changes.length;
        auditMeta.changesList = changes;

        // Generic update log if fields changed
        if (changes.length > 0) {
            await addAuditLog("UPDATE", "Məlumatlar güncəlləndi: " + changes.join(' | '), userEmail, "CUSTOMER", auditMeta);
        }
        // --- END ENHANCED LOGGING ---

        if (data.isArchived && !oldData?.isArchived) {
            action = "ARCHIVE";
            category = "ARCHIVE";
            detail = "Müştəri arxivə göndərildi";
        } else if (oldData?.isArchived && !data.isArchived) {
            action = "RESTORE";
            category = "ARCHIVE";
            detail = "Müştəri arxivdən bərpa edildi";
        } else if (newFiles > oldFiles) {
            action = "FILE_UPLOAD";
            category = "ARCHIVE";
            detail = `Arxiv sənədi yükləndi (Cəmi: ${newFiles})`;
        } else if (oldFiles > newFiles) {
            action = "FILE_DELETE";
            category = "ARCHIVE";
            detail = "Arxiv sənədi silindi";
        } else if (newReq > oldReq) {
            action = "ARCHIVE_REQUEST";
            category = "ARCHIVE";
            detail = "Arxiv sənəd sorğusu göndərildi";
        } else if (data.details?.isWarningSent && !oldData?.details?.isWarningSent) {
            action = "WARNING_SENT";
            detail = "Xəbərdarlıq məktubu göndərildi";
            category = "DOCUMENT";
        } else if (data.process_status && oldData?.process_status !== data.process_status) {
            action = "STATUS_CHANGE";
            const oldStatus = oldData?.process_status || 'N/A';

            // Map status to nice label
            const statusLabels: any = {
                'INSPECTOR_ENTERED': 'Müştəri qeydə alındı',
                'ASSIGNED_BY_MANAGER': 'Müfəttiş təyin edildi',
                'FILLED_BY_ADMIN': 'Məlumatlar dolduruldu',
                'WAITING_FOR_ARCHIVE': 'Arxiv sorğusu göndərildi',
                'ARCHIVE_UPLOADED': 'Arxiv sənədi yükləndi',
                'COMPLETED': 'Arxiv Müştəri'
            };
            detail = statusLabels[data.process_status] || `Status dəyişdi: ${data.process_status}`;
        } else if (data.assignedTo && oldData?.assignedTo !== data.assignedTo) {
            action = "ASSIGN";
            detail = `Müfəttiş təyin edildi: ${data.assignedTo}`;
        } else if (data.archiveAssignedTo && oldData?.archiveAssignedTo !== data.archiveAssignedTo) {
            action = "ARCHIVE_ASSIGN";
            detail = `Arxivçi təyin edildi: ${data.archiveAssignedTo}`;
            category = "ARCHIVE";
        }

        if (action !== "UPDATE") {
            statusHistory.push({
                label: detail,
                action,
                timestamp,
                user: userEmail
            });
            cleanedData.statusHistory = statusHistory;
        }

        await setDoc(customerRef, sanitizeFirebaseData({ ...cleanedData, updatedAt: serverTimestamp() }), { merge: true });

        // Trigger specific action log with FULL metadata (snapshot, etc)
        if (action !== "UPDATE") {
            await addAuditLog(action, detail, userEmail, category, {
                ...auditMeta,
                oldStatus: oldData?.process_status,
                newStatus: data.process_status
            });
        }

        return cleanedData;
    } catch (e) {
        console.error("updateCustomer xətası:", e);
        throw e;
    }
}

// Audit & Global Settings
export async function addAuditLog(action: string, details: string, userEmail: string, category: "CUSTOMER" | "ARCHIVE" | "DOCUMENT" | "SYSTEM" | "USER" = "SYSTEM", metadata: any = {}) {
    try {
        const logRef = doc(collection(db, AUDIT_COLLECTION));
        await setDoc(logRef, {
            id: logRef.id,
            action,
            category,
            details,
            userEmail,
            metadata,
            createdAt: serverTimestamp()
        });
    } catch (e) { }
}

export async function logError(error: any, context: string = "CLIENT", userEmail: string = "anonymous") {
    try {
        const logRef = doc(collection(db, ERRORS_COLLECTION));
        await setDoc(logRef, sanitizeFirebaseData({
            id: logRef.id,
            message: error.message || String(error),
            stack: error.stack || null,
            context,
            userEmail,
            url: typeof window !== 'undefined' ? window.location.href : null,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            createdAt: serverTimestamp()
        }));
    } catch (e) {
        console.error("Critical: Could not log error to Firestore", e);
    }
}

export async function getAuditLogs(limitCount: number = 200) {
    try {
        const q = query(collection(db, AUDIT_COLLECTION), orderBy("createdAt", "desc"), limit(limitCount));
        const querySnap = await getDocs(q);
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        return [];
    }
}

export async function deleteAuditLogsBeforeDate(date: Date, userEmail: string = "system") {
    try {
        const q = query(collection(db, AUDIT_COLLECTION), where("createdAt", "<=", date));
        const querySnap = await getDocs(q);
        const docs = querySnap.docs;

        if (docs.length === 0) return 0;

        let deletedCount = 0;
        const batchSize = 500;
        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = docs.slice(i, i + batchSize);
            chunk.forEach(d => {
                batch.delete(d.ref);
                deletedCount++;
            });
            await batch.commit();
        }

        await addAuditLog("SYSTEM_CLEANUP", `${deletedCount} köhnə loq təmizləndi (Tarix <= ${date.toLocaleDateString()})`, userEmail, "SYSTEM");
        return deletedCount;
    } catch (e) {
        console.error("deleteAuditLogsBeforeDate error:", e);
        throw e;
    }
}

export async function getSystemErrors(limitCount: number = 100) {
    try {
        const q = query(collection(db, ERRORS_COLLECTION), orderBy("createdAt", "desc"), limit(limitCount));
        const querySnap = await getDocs(q);
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        return [];
    }
}

export async function getGlobalSettings() {
    try {
        const docSnap = await getDoc(doc(db, SETTINGS_COLLECTION, "current"));
        return docSnap.exists() ? docSnap.data() : null;
    } catch (e) { return null; }
}

export async function updateGlobalSettings(data: any, userEmail: string = "system") {
    try {
        await setDoc(doc(db, SETTINGS_COLLECTION, "current"), sanitizeFirebaseData({ ...data, updatedAt: serverTimestamp() }), { merge: true });
        await addAuditLog("SETTINGS_UPDATE", "Qlobal tənzimləmələr yeniləndi", userEmail, "SYSTEM", { company: data.companyName });
        return true;
    } catch (e) { throw e; }
}

// Court Logic
export async function getCourts() {
    try {
        const querySnap = await getDocs(collection(db, COURTS_COLLECTION));
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { return []; }
}

export async function addCourt(courtData: any, userEmail: string = "system") {
    const docRef = doc(collection(db, COURTS_COLLECTION));
    const data = { ...courtData, id: docRef.id, createdAt: serverTimestamp() };
    await setDoc(docRef, sanitizeFirebaseData(data));
    await addAuditLog("COURT_ADD", `Yeni məhkəmə əlavə edildi: ${courtData.name}`, userEmail, "SYSTEM", { targetId: docRef.id });
    return data;
}

export async function updateCourt(id: string, courtData: any, userEmail: string = "system") {
    await updateDoc(doc(db, COURTS_COLLECTION, id), sanitizeFirebaseData({ ...courtData, updatedAt: serverTimestamp() }));
    await addAuditLog("COURT_UPDATE", `Məhkəmə məlumatı yeniləndi: ${courtData.name}`, userEmail, "SYSTEM", { targetId: id });
}

export async function deleteCourt(id: string, userEmail: string = "system") {
    await deleteDoc(doc(db, COURTS_COLLECTION, id));
    await addAuditLog("COURT_DELETE", "Məhkəmə silindi", userEmail, "SYSTEM", { targetId: id });
}

// Store Logic
export async function getStores() {
    try {
        const querySnap = await getDocs(collection(db, STORES_COLLECTION));
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { return []; }
}

export async function addStore(name: string, userEmail: string = "system") {
    const docRef = doc(collection(db, STORES_COLLECTION));
    const data = { id: docRef.id, name, createdAt: serverTimestamp() };
    await setDoc(docRef, sanitizeFirebaseData(data));
    await addAuditLog("STORE_ADD", `Yeni mağaza əlavə edildi: ${name}`, userEmail, "SYSTEM", { targetId: docRef.id });
    return data;
}

export async function updateStore(id: string, name: string, userEmail: string = "system") {
    await updateDoc(doc(db, STORES_COLLECTION, id), sanitizeFirebaseData({ name, updatedAt: serverTimestamp() }));
    await addAuditLog("STORE_UPDATE", `Mağaza nömrəsi yeniləndi: ${name}`, userEmail, "SYSTEM", { targetId: id });
}

export async function deleteStore(id: string, userEmail: string = "system") {
    await deleteDoc(doc(db, STORES_COLLECTION, id));
    await addAuditLog("STORE_DELETE", "Mağaza silindi", userEmail, "SYSTEM", { targetId: id });
}

// Templates collection logic
export async function getTemplates() {
    try {
        const querySnap = await getDocs(collection(db, TEMPLATES_COLLECTION));
        return querySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) { return []; }
}

export async function addTemplate(data: any, userEmail: string = "system") {
    const docRef = doc(collection(db, TEMPLATES_COLLECTION));
    const finalData = { ...data, id: docRef.id, createdAt: serverTimestamp() };
    await setDoc(docRef, sanitizeFirebaseData(finalData));
    await addAuditLog("TEMPLATE_ADD", `Yeni şablon əlavə edildi: ${data.name}`, userEmail, "SYSTEM", { targetId: docRef.id });
    return docRef.id;
}

export async function deleteTemplate(id: string, userEmail: string = "system") {
    await deleteDoc(doc(db, TEMPLATES_COLLECTION, id));
    await addAuditLog("TEMPLATE_DELETE", "Şablon silindi", userEmail, "SYSTEM", { targetId: id });
}

export async function updateTemplate(id: string, data: any, userEmail: string = "system") {
    await updateDoc(doc(db, TEMPLATES_COLLECTION, id), sanitizeFirebaseData({ ...data, updatedAt: serverTimestamp() }));
    await addAuditLog("TEMPLATE_UPDATE", `Şablon yeniləndi: ${data.name}`, userEmail, "SYSTEM", { targetId: id });
}

/**
 * "Moves" a customer record to a new ID.
 * Creates a new document with the new ID/code and deletes the old one.
 */
export async function moveCustomer(oldId: string, newCode: string, userEmail: string) {
    try {
        const oldDocRef = doc(db, CUSTOMERS_COLLECTION, oldId);
        const docSnap = await getDoc(oldDocRef);
        if (!docSnap.exists()) throw new Error("Müştəri tapılmadı");

        const data = docSnap.data();
        const cleanNewCode = newCode.trim();
        const newDocRef = doc(db, CUSTOMERS_COLLECTION, cleanNewCode);

        // Check if new code already exists
        const checkNew = await getDoc(newDocRef);
        if (checkNew.exists()) throw new Error("Bu kodlu müştəri artıq mövcuddur");

        // Start a batch or just consecutive calls
        await setDoc(newDocRef, {
            ...data,
            id: cleanNewCode,
            customerCode: cleanNewCode,
            updatedAt: serverTimestamp(),
            updatedBy: userEmail
        });

        await deleteDoc(oldDocRef);
        return true;
    } catch (e: any) {
        console.error("Move error:", e);
        throw e;
    }
}

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
    if (role === "MANAGER") return ["page_customers", "page_archive_customers", "page_parameters", "action_assignment"];
    if (role === "ADMIN") return ["page_customers"];
    if (role === "INSPECTOR") return ["page_inspector"];
    if (role === "ARCHIVER") return ["page_archiver"];
    return []; // PENDING or others have no default permissions
}

export async function updateRolePermissions(role: string, paths: string[]) {
    const docRef = doc(db, PERMISSIONS_COLLECTION, role);
    return await setDoc(docRef, {
        id: role,
        role,
        allowedPaths: paths,
        updatedAt: serverTimestamp()
    }, { merge: true });
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
            await updateDoc(userRef, userDoc);
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
            await setDoc(userRef, userDoc);
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



// Customer Logic
export async function bulkAddCustomers(customers: any[], userEmail: string = "system") {
    try {
        const batch = writeBatch(db);
        const results = [];
        const timestamp = new Date().toISOString();
        for (const customer of customers) {
            const customerId = customer.customerCode || Math.random().toString(36).substring(7);
            const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
            const data = {
                ...customer,
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
            batch.set(customerRef, data, { merge: true });
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
        return querySnap.docs.map(doc => ({ ...doc.data() }));
    } catch (e) {
        return [];
    }
}

export async function getInspectorCustomers(email: string) {
    try {
        const q = query(collection(db, CUSTOMERS_COLLECTION), where("createdBy", "==", email));
        const querySnap = await getDocs(q);
        return querySnap.docs.map(doc => ({ ...doc.data() }));
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
        const docRef = doc(db, CUSTOMERS_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
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

        await updateDoc(customerRef, { ...cleanedData, updatedAt: serverTimestamp() });

        await addAuditLog(action, detail, userEmail, category, {
            targetId: id,
            targetName: data.fullName,
            oldStatus: oldData?.process_status,
            newStatus: data.process_status
        });

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

export async function getAuditLogs(limitCount: number = 200) {
    try {
        const q = query(collection(db, AUDIT_COLLECTION), orderBy("createdAt", "desc"), limit(limitCount));
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
        await setDoc(doc(db, SETTINGS_COLLECTION, "current"), { ...data, updatedAt: serverTimestamp() }, { merge: true });
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
    await setDoc(docRef, data);
    await addAuditLog("COURT_ADD", `Yeni məhkəmə əlavə edildi: ${courtData.name}`, userEmail, "SYSTEM", { targetId: docRef.id });
    return data;
}

export async function updateCourt(id: string, courtData: any, userEmail: string = "system") {
    await updateDoc(doc(db, COURTS_COLLECTION, id), { ...courtData, updatedAt: serverTimestamp() });
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
    await setDoc(docRef, data);
    await addAuditLog("STORE_ADD", `Yeni mağaza əlavə edildi: ${name}`, userEmail, "SYSTEM", { targetId: docRef.id });
    return data;
}

export async function updateStore(id: string, name: string, userEmail: string = "system") {
    await updateDoc(doc(db, STORES_COLLECTION, id), { name, updatedAt: serverTimestamp() });
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
    await setDoc(docRef, finalData);
    await addAuditLog("TEMPLATE_ADD", `Yeni şablon əlavə edildi: ${data.name}`, userEmail, "SYSTEM", { targetId: docRef.id });
    return docRef.id;
}

export async function deleteTemplate(id: string, userEmail: string = "system") {
    await deleteDoc(doc(db, TEMPLATES_COLLECTION, id));
    await addAuditLog("TEMPLATE_DELETE", "Şablon silindi", userEmail, "SYSTEM", { targetId: id });
}

export async function updateTemplate(id: string, data: any, userEmail: string = "system") {
    await updateDoc(doc(db, TEMPLATES_COLLECTION, id), { ...data, updatedAt: serverTimestamp() });
    await addAuditLog("TEMPLATE_UPDATE", `Şablon yeniləndi: ${data.name}`, userEmail, "SYSTEM", { targetId: id });
}

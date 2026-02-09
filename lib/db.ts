import { db } from "./firebase";
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
    writeBatch
} from "firebase/firestore";

const USERS_COLLECTION = "Users";
const PERMISSIONS_COLLECTION = "Permissions";
const CUSTOMERS_COLLECTION = "Customers";

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

    // Default fallback if not found in Firestore
    if (role === "SUPERADMIN") return ["customers_read", "customers_create", "customers_update", "customers_delete", "reports_read", "reports_audit", "users_manage"];
    if (role === "ADMIN") return ["customers_read", "reports_read", "users_manage"];
    return ["customers_read"];
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
    console.log("DB: syncUser starting for", normalizedEmail);

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
            console.log("DB: syncUser existing user found. Role:", userDoc.role);
            await updateDoc(userRef, userDoc);
        } else {
            console.log("DB: syncUser user not found, checking if it's the first ever user...");
            // Check if this is the first user
            const usersRef = collection(db, USERS_COLLECTION);
            const q = query(usersRef, limit(1));
            const querySnap = await getDocs(q);
            const isFirstUser = querySnap.empty;

            userDoc = {
                id: normalizedEmail,
                email: normalizedEmail,
                displayName: user.displayName || normalizedEmail.split('@')[0],
                role: isFirstUser ? "SUPERADMIN" : "USER",
                lastLogin: new Date().toISOString(),
                status: "ACTIVE",
                permissions: []
            };
            console.log("DB: syncUser creating new user. Role:", userDoc.role);
            await setDoc(userRef, userDoc);
        }

        // Attach default permissions if none set
        if (!userDoc.permissions || userDoc.permissions.length === 0) {
            console.log("DB: syncUser permissions empty, fetching defaults for role", userDoc.role);
            userDoc.permissions = await getRolePermissions(userDoc.role);
        } else {
            console.log("DB: syncUser has", userDoc.permissions.length, "custom permissions");
        }

        return userDoc;
    } catch (e) {
        console.error("DB: syncUser error:", e);
        throw e;
    }
}

export async function getUser(email: string) {
    try {
        const docRef = doc(db, USERS_COLLECTION, email);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    } catch (e) {
        console.error("getUser error:", e);
        return null;
    }
}

export async function getAllUsers() {
    try {
        const querySnap = await getDocs(collection(db, USERS_COLLECTION));
        return querySnap.docs.map(doc => ({ ...doc.data() }));
    } catch (e) {
        console.error("getAllUsers error:", e);
        return [];
    }
}

export async function updateUserRole(userId: string, role: string, permissions: string[] = []) {
    try {
        const userRef = doc(db, USERS_COLLECTION, userId);
        const updateData = { role, permissions };
        await updateDoc(userRef, updateData);
        return { id: userId, ...updateData };
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

        for (const customer of customers) {
            const customerId = customer.customerCode || Math.random().toString(36).substring(7);
            const customerRef = doc(db, CUSTOMERS_COLLECTION, customerId);
            const data = {
                ...customer,
                id: customerId,
                updatedAt: serverTimestamp()
            };
            batch.set(customerRef, data, { merge: true });
            results.push(data);
        }

        await batch.commit();
        await addAuditLog("BULK_ADD", `${customers.length} müştəri əlavə edildi`, userEmail);
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
        console.error("getCustomers error:", e);
        return [];
    }
}

export async function deleteCustomer(id: string, userEmail: string = "system") {
    try {
        await deleteDoc(doc(db, CUSTOMERS_COLLECTION, id));
        await addAuditLog("DELETE", `Müştəri silindi: ${id}`, userEmail);
        return true;
    } catch (e) {
        console.error("deleteCustomer error:", e);
        throw e;
    }
}

export async function getCustomer(id: string) {
    try {
        const docSnap = await getDoc(doc(db, CUSTOMERS_COLLECTION, id));
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        }
        return null;
    } catch (e) {
        console.error("getCustomer error:", e);
        return null;
    }
}

export async function updateCustomer(id: string, data: any, userEmail: string = "system") {
    try {
        const customerRef = doc(db, CUSTOMERS_COLLECTION, id);
        await updateDoc(customerRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
        await addAuditLog("UPDATE", `Müştəri məlumatı yeniləndi: ${id}`, userEmail);
        return true;
    } catch (e) {
        console.error("updateCustomer error:", e);
        throw e;
    }
}
// Template Logic
const TEMPLATES_COLLECTION = "Templates";

export async function getTemplates() {
    try {
        const querySnap = await getDocs(collection(db, TEMPLATES_COLLECTION));
        return querySnap.docs.map(doc => ({ ...doc.data() }));
    } catch (e) {
        console.error("getTemplates error:", e);
        return [];
    }
}

export async function addTemplate(template: { name: string; content: string }) {
    try {
        const id = Math.random().toString(36).substring(7);
        const docRef = doc(db, TEMPLATES_COLLECTION, id);
        const data = { id, ...template, updatedAt: serverTimestamp() };
        await setDoc(docRef, data);
        return data;
    } catch (e) {
        console.error("addTemplate error:", e);
        throw e;
    }
}

export async function deleteTemplate(id: string) {
    try {
        await deleteDoc(doc(db, TEMPLATES_COLLECTION, id));
        return true;
    } catch (e) {
        console.error("deleteTemplate error:", e);
        throw e;
    }
}

// Court Logic
const COURTS_COLLECTION = "Courts";

export async function getCourts() {
    try {
        const querySnap = await getDocs(collection(db, COURTS_COLLECTION));
        return querySnap.docs.map(doc => ({ ...doc.data() }));
    } catch (e) {
        console.error("getCourts error:", e);
        return [];
    }
}

export async function addCourt(court: { name: string; address: string; phone: string; fax: string }) {
    try {
        const id = Math.random().toString(36).substring(7);
        const docRef = doc(db, COURTS_COLLECTION, id);
        const data = { id, ...court, updatedAt: serverTimestamp() };
        await setDoc(docRef, data);
        return data;
    } catch (e) {
        console.error("addCourt error:", e);
        throw e;
    }
}

export async function updateCourt(id: string, data: any) {
    try {
        const courtRef = doc(db, COURTS_COLLECTION, id);
        await updateDoc(courtRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (e) {
        console.error("updateCourt error:", e);
        throw e;
    }
}

export async function deleteCourt(id: string) {
    try {
        await deleteDoc(doc(db, COURTS_COLLECTION, id));
        return true;
    } catch (e) {
        console.error("deleteCourt error:", e);
        throw e;
    }
}

// Global Settings Logic
const SETTINGS_COLLECTION = "Settings";

export async function getGlobalSettings() {
    try {
        const docRef = doc(db, SETTINGS_COLLECTION, "companyInfo");
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : {
            companyName: "",
            address: "",
            phone: "",
            fax: "",
            representative: ""
        };
    } catch (e) {
        console.error("getGlobalSettings error:", e);
        return null;
    }
}

export async function updateGlobalSettings(data: any) {
    try {
        const docRef = doc(db, SETTINGS_COLLECTION, "companyInfo");
        await setDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (e) {
        console.error("updateGlobalSettings error:", e);
        throw e;
    }
}

// Audit Log Logic
const AUDIT_COLLECTION = "AuditLogs";

export async function addAuditLog(action: string, details: string, userEmail: string) {
    try {
        const docRef = doc(collection(db, AUDIT_COLLECTION));
        await setDoc(docRef, {
            id: docRef.id,
            action,
            details,
            userEmail,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("addAuditLog error:", e);
    }
}

export async function getAuditLogs(limitCount = 50) {
    try {
        const q = query(collection(db, AUDIT_COLLECTION), limit(limitCount));
        const querySnap = await getDocs(q);
        return querySnap.docs.map(doc => ({ ...doc.data() }));
    } catch (e) {
        console.error("getAuditLogs error:", e);
        return [];
    }
}

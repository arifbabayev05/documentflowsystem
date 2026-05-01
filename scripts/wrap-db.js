const fs = require('fs');
const path = require('path');

const dbTsPath = path.join(__dirname, '../lib/db.ts');
const firebaseDbTsPath = path.join(__dirname, '../lib/firebase-db.ts');
const mysqlDbTsPath = path.join(__dirname, '../lib/mysql.ts');

if (!fs.existsSync(firebaseDbTsPath)) {
    fs.renameSync(dbTsPath, firebaseDbTsPath);
}

const dbCode = `import * as fb from './firebase-db';
import * as my from './mysql';
import { db } from './firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

let currentDBMode: "firebase" | "mysql" = "firebase";
let modeInitialized = false;

if (typeof window !== "undefined") {
    onSnapshot(doc(db, "GlobalSettings", "current"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().dbMode) {
            currentDBMode = docSnap.data().dbMode;
        }
        modeInitialized = true;
    });
}

export async function getDBMode() {
    if (typeof window === "undefined") {
        const snap = await getDoc(doc(db, "GlobalSettings", "current"));
        return snap.exists() ? snap.data().dbMode || "firebase" : "firebase";
    }
    if (!modeInitialized) {
        const snap = await getDoc(doc(db, "GlobalSettings", "current"));
        if (snap.exists() && snap.data().dbMode) {
            currentDBMode = snap.data().dbMode;
        }
        modeInitialized = true;
    }
    return currentDBMode;
}

export async function getRolePermissions(role: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetRolePermissions(role);
    return await fb.getRolePermissions(role);
}

export async function updateRolePermissions(role: string, paths: string[]) {
    const mode = await getDBMode();
    if (mode === "mysql") await my.mysqlUpdateRolePermissions(role, paths);
    return await fb.updateRolePermissions(role, paths);
}

export async function syncUser(user: { email: string; displayName?: string }) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlSyncUser(user);
    return await fb.syncUser(user);
}

export async function getAllUsers() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetAllUsers();
    return await fb.getAllUsers();
}

export async function updateUserRole(email: string, role: string, permissions?: string[], userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") await my.mysqlUpdateUserRole(email, role, permissions || null);
    return await fb.updateUserRole(email, role, permissions, userEmail);
}

export async function updateUserData(email: string, data: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") await my.mysqlUpdateUserData(email, data);
    return await fb.updateUserData(email, data, userEmail);
}

export async function deleteUser(email: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") await my.mysqlDeleteUser(email);
    return await fb.deleteUser(email, userEmail);
}

export async function bulkAddCustomers(customers: any[], userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlBulkAddCustomers(customers, userEmail);
    return await fb.bulkAddCustomers(customers, userEmail);
}

export async function getCustomers() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetCustomers();
    return await fb.getCustomers();
}

export async function getInspectorCustomers(email: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetInspectorCustomers(email);
    return await fb.getInspectorCustomers(email);
}

export async function deleteCustomer(id: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") await my.mysqlDeleteCustomer(id);
    return await fb.deleteCustomer(id, userEmail);
}

export async function getCustomer(id: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetCustomer(id);
    return await fb.getCustomer(id);
}

export async function findCustomerByCode(code: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlFindCustomerByCode(code);
    return await fb.findCustomerByCode(code);
}

export async function updateCustomer(id: string, data: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateCustomer(id, data, userEmail);
    return await fb.updateCustomer(id, data, userEmail);
}

export async function addAuditLog(action: string, details: string, userEmail: string, category: "CUSTOMER" | "ARCHIVE" | "DOCUMENT" | "SYSTEM" | "USER" = "SYSTEM", metadata: any = {}) {
    // Audit logs should ideally be duplicated to both, or only current db mode? Let's write to active.
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlAddAuditLog({ id: Math.random().toString(36).substring(7), action, details, userEmail, category, metadata, createdAt: new Date().toISOString() });
    return await fb.addAuditLog(action, details, userEmail, category, metadata);
}

export async function logError(error: any, context: string = "CLIENT", userEmail: string = "anonymous") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlLogError({ message: String(error), stack: error.stack, context, userEmail });
    return await fb.logError(error, context, userEmail);
}

export async function getAuditLogs(limitCount: number = 200) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetAuditLogs(limitCount);
    return await fb.getAuditLogs(limitCount);
}

export async function deleteAuditLogsBeforeDate(date: Date, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteAuditLogsBeforeDate(date.toISOString());
    return await fb.deleteAuditLogsBeforeDate(date, userEmail);
}

export async function getSystemErrors(limitCount: number = 100) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetSystemErrors(limitCount);
    return await fb.getSystemErrors(limitCount);
}

export async function getGlobalSettings() {
    const mode = await getDBMode();
    let fbSettings = await fb.getGlobalSettings() || {};
    if (mode === "mysql") {
        const mySettings = await my.mysqlGetGlobalSettings();
        if (mySettings) fbSettings = { ...fbSettings, ...mySettings, dbMode: fbSettings.dbMode };
    }
    return fbSettings;
}

export async function updateGlobalSettings(data: any, userEmail: string = "system") {
    // ALWAYS update firebase to persist dbMode!
    await fb.updateGlobalSettings(data, userEmail);
    const mode = await getDBMode();
    if (mode === "mysql") {
        await my.mysqlUpdateGlobalSettings(data);
    }
    return true;
}

export async function getCourts() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetCourts();
    return await fb.getCourts();
}

export async function addCourt(courtData: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") {
        const id = Math.random().toString(36).substring(7);
        await my.mysqlAddCourt({ ...courtData, id, createdAt: new Date().toISOString() });
        return { ...courtData, id };
    }
    return await fb.addCourt(courtData, userEmail);
}

export async function updateCourt(id: string, courtData: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateCourt(id, courtData);
    return await fb.updateCourt(id, courtData, userEmail);
}

export async function deleteCourt(id: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteCourt(id);
    return await fb.deleteCourt(id, userEmail);
}

export async function getStores() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetStores();
    return await fb.getStores();
}

export async function addStore(name: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") {
        const id = Math.random().toString(36).substring(7);
        await my.mysqlAddStore({ id, name, createdAt: new Date().toISOString() });
        return { id, name };
    }
    return await fb.addStore(name, userEmail);
}

export async function updateStore(id: string, name: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateStore(id, name, new Date().toISOString());
    return await fb.updateStore(id, name, userEmail);
}

export async function deleteStore(id: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteStore(id);
    return await fb.deleteStore(id, userEmail);
}

export async function getTemplates() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetTemplates();
    return await fb.getTemplates();
}

export async function addTemplate(data: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") {
        const id = Math.random().toString(36).substring(7);
        await my.mysqlAddTemplate({ ...data, id, createdAt: new Date().toISOString() });
        return id;
    }
    return await fb.addTemplate(data, userEmail);
}

export async function updateTemplate(id: string, data: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateTemplate(id, { ...data, updatedAt: new Date().toISOString() });
    return await fb.updateTemplate(id, data, userEmail);
}

export async function deleteTemplate(id: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteTemplate(id);
    return await fb.deleteTemplate(id, userEmail);
}

export async function moveCustomer(oldId: string, newCode: string, userEmail: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlMoveCustomer(oldId, newCode, userEmail);
    return await fb.moveCustomer(oldId, newCode, userEmail);
}
`;

fs.writeFileSync(dbTsPath, dbCode);
console.log('Successfully wrapped db.ts!');

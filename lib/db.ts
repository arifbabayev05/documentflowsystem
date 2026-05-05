import * as my from './mysql';

type DBMode = "firebase" | "mysql";

const DB_MODE_STORAGE_KEY = "legal12_db_mode";

let currentDBMode: DBMode = "firebase";
let modeInitialized = false;

async function firebaseDb() {
    return await import('./firebase-db');
}

function normalizeMode(value: any): DBMode | null {
    return value === "mysql" || value === "firebase" ? value : null;
}

function getClientStoredMode(): DBMode | null {
    if (typeof window === "undefined") return null;
    try {
        return normalizeMode(window.localStorage.getItem(DB_MODE_STORAGE_KEY));
    } catch {
        return null;
    }
}

function setClientStoredMode(mode: DBMode) {
    currentDBMode = mode;
    modeInitialized = true;

    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(DB_MODE_STORAGE_KEY, mode);
    } catch { }
}

async function getMySQLMode(): Promise<DBMode | null> {
    try {
        const settings = await my.mysqlGetGlobalSettings();
        return normalizeMode(settings?.dbMode);
    } catch {
        return null;
    }
}

async function getFirebaseMode(): Promise<DBMode | null> {
    try {
        const fb = await firebaseDb();
        const settings = await fb.getGlobalSettings();
        return normalizeMode(settings?.dbMode);
    } catch {
        return null;
    }
}

export async function getDBMode(): Promise<DBMode> {
    if (typeof window !== "undefined" && modeInitialized && currentDBMode === "mysql") {
        return currentDBMode;
    }

    // MySQL is authoritative after cutover. This avoids any Firestore read when
    // MySQL already stores dbMode='mysql'.
    const mysqlMode = await getMySQLMode();
    if (mysqlMode) {
        setClientStoredMode(mysqlMode);
        return mysqlMode;
    }

    const storedMode = getClientStoredMode();
    if (storedMode) {
        currentDBMode = storedMode;
        modeInitialized = true;
        return storedMode;
    }

    const firebaseMode = await getFirebaseMode();
    currentDBMode = firebaseMode || "firebase";
    modeInitialized = true;
    return currentDBMode;
}

export async function getRolePermissions(role: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetRolePermissions(role);
    const fb = await firebaseDb();
    return await fb.getRolePermissions(role);
}

export async function updateRolePermissions(role: string, paths: string[]) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateRolePermissions(role, paths);
    const fb = await firebaseDb();
    return await fb.updateRolePermissions(role, paths);
}

export async function syncUser(user: { email: string; displayName?: string }) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlSyncUser(user);
    const fb = await firebaseDb();
    return await fb.syncUser(user);
}

export async function getAllUsers() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetAllUsers();
    const fb = await firebaseDb();
    return await fb.getAllUsers();
}

export async function updateUserRole(email: string, role: string, permissions?: string[], userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateUserRole(email, role, permissions || null);
    const fb = await firebaseDb();
    return await fb.updateUserRole(email, role, permissions, userEmail);
}

export async function updateUserData(email: string, data: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateUserData(email, data);
    const fb = await firebaseDb();
    return await fb.updateUserData(email, data, userEmail);
}

export async function deleteUser(email: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteUser(email);
    const fb = await firebaseDb();
    return await fb.deleteUser(email, userEmail);
}

export async function bulkAddCustomers(customers: any[], userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlBulkAddCustomers(customers, userEmail);
    const fb = await firebaseDb();
    return await fb.bulkAddCustomers(customers, userEmail);
}

export async function getCustomers() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetCustomers();
    const fb = await firebaseDb();
    return await fb.getCustomers();
}

export async function getInspectorCustomers(email: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetInspectorCustomers(email);
    const fb = await firebaseDb();
    return await fb.getInspectorCustomers(email);
}

export async function deleteCustomer(id: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteCustomer(id);
    const fb = await firebaseDb();
    return await fb.deleteCustomer(id, userEmail);
}

export async function getCustomer(id: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetCustomer(id);
    const fb = await firebaseDb();
    return await fb.getCustomer(id);
}

export async function findCustomerByCode(code: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlFindCustomerByCode(code);
    const fb = await firebaseDb();
    return await fb.findCustomerByCode(code);
}

export async function updateCustomer(id: string, data: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateCustomer(id, data, userEmail);
    const fb = await firebaseDb();
    return await fb.updateCustomer(id, data, userEmail);
}

export async function addAuditLog(action: string, details: string, userEmail: string, category: "CUSTOMER" | "ARCHIVE" | "DOCUMENT" | "SYSTEM" | "USER" = "SYSTEM", metadata: any = {}) {
    const mode = await getDBMode();
    if (mode === "mysql") {
        return await my.mysqlAddAuditLog({ id: Math.random().toString(36).substring(7), action, details, userEmail, category, metadata, createdAt: new Date().toISOString() });
    }
    const fb = await firebaseDb();
    return await fb.addAuditLog(action, details, userEmail, category, metadata);
}

export async function logError(error: any, context: string = "CLIENT", userEmail: string = "anonymous") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlLogError({ message: String(error), stack: error.stack, context, userEmail });
    const fb = await firebaseDb();
    return await fb.logError(error, context, userEmail);
}

export async function getAuditLogs(limitCount: number = 200) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetAuditLogs(limitCount);
    const fb = await firebaseDb();
    return await fb.getAuditLogs(limitCount);
}

export async function deleteAuditLogsBeforeDate(date: Date, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteAuditLogsBeforeDate(date.toISOString());
    const fb = await firebaseDb();
    return await fb.deleteAuditLogsBeforeDate(date, userEmail);
}

export async function getSystemErrors(limitCount: number = 100) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetSystemErrors(limitCount);
    const fb = await firebaseDb();
    return await fb.getSystemErrors(limitCount);
}

export async function getGlobalSettings() {
    const mode = await getDBMode();
    if (mode === "mysql") {
        return await my.mysqlGetGlobalSettings();
    }

    const fb = await firebaseDb();
    return await fb.getGlobalSettings();
}

export async function updateGlobalSettings(data: any, userEmail: string = "system") {
    const mode = await getDBMode();
    const targetMode = data.dbMode || mode;

    if (targetMode === "mysql") {
        await my.mysqlUpdateGlobalSettings({ ...data, dbMode: "mysql" });
        setClientStoredMode("mysql");
        return true;
    }

    await my.mysqlUpdateGlobalSettings({ dbMode: "firebase" });
    setClientStoredMode("firebase");
    const fb = await firebaseDb();
    await fb.updateGlobalSettings(data, userEmail);
    return true;
}

export async function getCourts() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetCourts();
    const fb = await firebaseDb();
    return await fb.getCourts();
}

export async function addCourt(courtData: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") {
        const id = Math.random().toString(36).substring(7);
        await my.mysqlAddCourt({ ...courtData, id, createdAt: new Date().toISOString() });
        return { ...courtData, id };
    }
    const fb = await firebaseDb();
    return await fb.addCourt(courtData, userEmail);
}

export async function updateCourt(id: string, courtData: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateCourt(id, courtData);
    const fb = await firebaseDb();
    return await fb.updateCourt(id, courtData, userEmail);
}

export async function deleteCourt(id: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteCourt(id);
    const fb = await firebaseDb();
    return await fb.deleteCourt(id, userEmail);
}

export async function getStores() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetStores();
    const fb = await firebaseDb();
    return await fb.getStores();
}

export async function addStore(name: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") {
        const id = Math.random().toString(36).substring(7);
        await my.mysqlAddStore({ id, name, createdAt: new Date().toISOString() });
        return { id, name };
    }
    const fb = await firebaseDb();
    return await fb.addStore(name, userEmail);
}

export async function updateStore(id: string, name: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateStore(id, name, new Date().toISOString());
    const fb = await firebaseDb();
    return await fb.updateStore(id, name, userEmail);
}

export async function deleteStore(id: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteStore(id);
    const fb = await firebaseDb();
    return await fb.deleteStore(id, userEmail);
}

export async function getTemplates() {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlGetTemplates();
    const fb = await firebaseDb();
    return await fb.getTemplates();
}

export async function addTemplate(data: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") {
        const id = Math.random().toString(36).substring(7);
        await my.mysqlAddTemplate({ ...data, id, createdAt: new Date().toISOString() });
        return id;
    }
    const fb = await firebaseDb();
    return await fb.addTemplate(data, userEmail);
}

export async function updateTemplate(id: string, data: any, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlUpdateTemplate(id, { ...data, updatedAt: new Date().toISOString() });
    const fb = await firebaseDb();
    return await fb.updateTemplate(id, data, userEmail);
}

export async function deleteTemplate(id: string, userEmail: string = "system") {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlDeleteTemplate(id);
    const fb = await firebaseDb();
    return await fb.deleteTemplate(id, userEmail);
}

export async function moveCustomer(oldId: string, newCode: string, userEmail: string) {
    const mode = await getDBMode();
    if (mode === "mysql") return await my.mysqlMoveCustomer(oldId, newCode, userEmail);
    const fb = await firebaseDb();
    return await fb.moveCustomer(oldId, newCode, userEmail);
}

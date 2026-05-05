import * as my from './mysql';

type DBMode = "mysql";

export async function getDBMode(): Promise<DBMode> {
    return "mysql";
}

export async function getRolePermissions(role: string) {
    return await my.mysqlGetRolePermissions(role);
}

export async function updateRolePermissions(role: string, paths: string[]) {
    return await my.mysqlUpdateRolePermissions(role, paths);
}

export async function syncUser(user: { email: string; displayName?: string }) {
    return await my.mysqlSyncUser(user);
}

export async function getAllUsers() {
    return await my.mysqlGetAllUsers();
}

export async function updateUserRole(email: string, role: string, permissions?: string[], userEmail: string = "system") {
    return await my.mysqlUpdateUserRole(email, role, permissions || null);
}

export async function updateUserData(email: string, data: any, userEmail: string = "system") {
    return await my.mysqlUpdateUserData(email, data);
}

export async function deleteUser(email: string, userEmail: string = "system") {
    return await my.mysqlDeleteUser(email);
}

export async function bulkAddCustomers(customers: any[], userEmail: string = "system") {
    return await my.mysqlBulkAddCustomers(customers, userEmail);
}

export async function getCustomers() {
    return await my.mysqlGetCustomers();
}

export async function getInspectorCustomers(email: string) {
    return await my.mysqlGetInspectorCustomers(email);
}

export async function deleteCustomer(id: string, userEmail: string = "system") {
    return await my.mysqlDeleteCustomer(id);
}

export async function getCustomer(id: string) {
    return await my.mysqlGetCustomer(id);
}

export async function findCustomerByCode(code: string) {
    return await my.mysqlFindCustomerByCode(code);
}

export async function updateCustomer(id: string, data: any, userEmail: string = "system") {
    return await my.mysqlUpdateCustomer(id, data, userEmail);
}

export async function addAuditLog(action: string, details: string, userEmail: string, category: "CUSTOMER" | "ARCHIVE" | "DOCUMENT" | "SYSTEM" | "USER" = "SYSTEM", metadata: any = {}) {
    return await my.mysqlAddAuditLog({
        id: Math.random().toString(36).substring(7),
        action,
        details,
        userEmail,
        category,
        metadata,
        createdAt: new Date().toISOString()
    });
}

export async function logError(error: any, context: string = "CLIENT", userEmail: string = "anonymous") {
    return await my.mysqlLogError({ message: String(error), stack: error.stack, context, userEmail });
}

export async function getAuditLogs(limitCount: number = 200) {
    return await my.mysqlGetAuditLogs(limitCount);
}

export async function deleteAuditLogsBeforeDate(date: Date, userEmail: string = "system") {
    return await my.mysqlDeleteAuditLogsBeforeDate(date.toISOString());
}

export async function getSystemErrors(limitCount: number = 100) {
    return await my.mysqlGetSystemErrors(limitCount);
}

export async function getGlobalSettings() {
    const settings = await my.mysqlGetGlobalSettings();
    return settings ? { ...settings, dbMode: "mysql" } : { dbMode: "mysql" };
}

export async function updateGlobalSettings(data: any) {
    await my.mysqlUpdateGlobalSettings({ ...data, dbMode: "mysql" });
    return true;
}

export async function getCourts() {
    return await my.mysqlGetCourts();
}

export async function addCourt(courtData: any, userEmail: string = "system") {
    const id = Math.random().toString(36).substring(7);
    await my.mysqlAddCourt({ ...courtData, id, createdAt: new Date().toISOString() });
    return { ...courtData, id };
}

export async function updateCourt(id: string, courtData: any, userEmail: string = "system") {
    return await my.mysqlUpdateCourt(id, courtData);
}

export async function deleteCourt(id: string, userEmail: string = "system") {
    return await my.mysqlDeleteCourt(id);
}

export async function getStores() {
    return await my.mysqlGetStores();
}

export async function addStore(name: string, userEmail: string = "system") {
    const id = Math.random().toString(36).substring(7);
    await my.mysqlAddStore({ id, name, createdAt: new Date().toISOString() });
    return { id, name };
}

export async function updateStore(id: string, name: string, userEmail: string = "system") {
    return await my.mysqlUpdateStore(id, name, new Date().toISOString());
}

export async function deleteStore(id: string, userEmail: string = "system") {
    return await my.mysqlDeleteStore(id);
}

export async function getTemplates() {
    return await my.mysqlGetTemplates();
}

export async function addTemplate(data: any, userEmail: string = "system") {
    const id = Math.random().toString(36).substring(7);
    await my.mysqlAddTemplate({ ...data, id, createdAt: new Date().toISOString() });
    return id;
}

export async function updateTemplate(id: string, data: any, userEmail: string = "system") {
    return await my.mysqlUpdateTemplate(id, { ...data, updatedAt: new Date().toISOString() });
}

export async function deleteTemplate(id: string, userEmail: string = "system") {
    return await my.mysqlDeleteTemplate(id);
}

export async function moveCustomer(oldId: string, newCode: string, userEmail: string) {
    return await my.mysqlMoveCustomer(oldId, newCode, userEmail);
}

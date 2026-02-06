import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT || "";
const key = process.env.COSMOS_KEY || "";
const databaseId = process.env.COSMOS_DB_ID || "Legal12Ecosystem";
const customersContainerId = process.env.COSMOS_CONTAINER || "Customers";
const usersContainerId = "Users";
const permissionsContainerId = "Permissions";

let client: CosmosClient | null = null;
let dbCache: any = null;
const containerCache: Record<string, any> = {};

if (endpoint && key) {
    client = new CosmosClient({
        endpoint,
        key,
        connectionPolicy: { enableEndpointDiscovery: true }
    });
}

export async function getContainer(id: string, partitionKey: string = "/id") {
    if (!client) throw new Error("Azure Cosmos DB configuration is missing");

    // Cache the container reference to avoid redundant 'createIfNotExists' calls
    if (containerCache[id]) return containerCache[id];

    if (!dbCache) {
        const { database } = await client.databases.createIfNotExists({ id: databaseId });
        dbCache = database;
    }

    const { container } = await dbCache.containers.createIfNotExists({
        id,
        partitionKey: { paths: [partitionKey] }
    });

    containerCache[id] = container;
    return container;
}

// Permissions Logic
export async function getRolePermissions(role: string) {
    const container = await getContainer(permissionsContainerId);
    try {
        const { resource } = await container.item(role, role).read();
        return resource?.allowedPaths || [];
    } catch (e) {
        if (role === "SUPERADMIN") return ["/dashboard", "/reports", "/settings"];
        if (role === "ADMIN") return ["/dashboard", "/settings"];
        return ["/dashboard"];
    }
}

export async function updateRolePermissions(role: string, paths: string[]) {
    const container = await getContainer(permissionsContainerId);
    return await container.items.upsert({
        id: role,
        role,
        allowedPaths: paths,
        updatedAt: new Date().toISOString()
    });
}

// User Logic
export async function syncUser(user: any) {
    const container = await getContainer(usersContainerId);
    try {
        const { resource: existing } = await container.item(user.email, user.email).read();
        let userDoc;
        if (existing) {
            userDoc = {
                ...existing,
                lastLogin: new Date().toISOString(),
                displayName: existing.displayName || user.displayName || user.email.split('@')[0]
            };
            await container.item(user.email, user.email).replace(userDoc);
        } else {
            const { resources: existingUsers } = await container.items.query("SELECT * FROM c OFFSET 0 LIMIT 1").fetchAll();
            const isFirstUser = existingUsers.length === 0;

            userDoc = {
                id: user.email,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                role: isFirstUser ? "SUPERADMIN" : "USER",
                lastLogin: new Date().toISOString(),
                status: "ACTIVE"
            };
            const { resource } = await container.items.upsert(userDoc);
            userDoc = resource;
        }

        // Attach permissions to the synced object for faster auth
        if (!userDoc.permissions || userDoc.permissions.length === 0) {
            userDoc.permissions = await getRolePermissions(userDoc.role);
        }
        return userDoc;
    } catch (e) {
        console.error("syncUser error:", e);
        throw e;
    }
}

export async function getUser(email: string) {
    const container = await getContainer(usersContainerId);
    try {
        const { resource } = await container.item(email, email).read();
        return resource;
    } catch (e) {
        return null;
    }
}

export async function getAllUsers() {
    const container = await getContainer(usersContainerId);
    const { resources } = await container.items.query("SELECT * FROM c").fetchAll();
    return resources;
}

export async function updateUserRole(userId: string, role: string, permissions: string[] = []) {
    const container = await getContainer(usersContainerId);
    const { resource: existing } = await container.item(userId, userId).read();
    if (existing) {
        const updated = { ...existing, role, permissions };
        await container.item(userId, userId).replace(updated);
        return updated;
    }
}

// Customer Logic
export async function bulkAddCustomers(customers: any[]) {
    const container = await getContainer(customersContainerId, "/customerCode");
    const results = [];
    for (const customer of customers) {
        const item = {
            ...customer,
            id: customer.customerCode || Math.random().toString(36).substring(7),
        };
        const { resource } = await container.items.upsert(item);
        results.push(resource);
    }
    return results;
}

export async function getCustomers() {
    const container = await getContainer(customersContainerId, "/customerCode");
    const { resources } = await container.items.query("SELECT * FROM c").fetchAll();
    return resources;
}

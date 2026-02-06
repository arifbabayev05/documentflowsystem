import axios from "axios";

export const customerService = {
    async getAll() {
        // const response = await axios.get("/api/customers");
        // return response.data;
        return [];
    },

    async create(data: any) {
        // const response = await axios.post("/api/customers", data);
        // return response.data;
        return { success: true };
    },

    async bulkCreate(data: any[]) {
        // const response = await axios.post("/api/customers/bulk", data);
        // return response.data;
        return { success: true, count: data.length };
    }
};

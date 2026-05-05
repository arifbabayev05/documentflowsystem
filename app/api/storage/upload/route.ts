import { NextResponse } from 'next/server';
import { uploadToStorageApi } from '@/lib/storage-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STORAGE_ROUTE_VERSION = 'storage-upload-null-directory-2026-05-05';
const STORAGE_HEADERS = {
    'Cache-Control': 'no-store',
    'x-legal12-storage-route': STORAGE_ROUTE_VERSION
};

export async function POST(req: Request) {
    try {
        const form = await req.formData();
        const file = form.get('file');
        const fileName = form.get('fileName')?.toString();

        if (!(file instanceof Blob)) {
            return NextResponse.json({ error: 'file is required', version: STORAGE_ROUTE_VERSION }, { status: 400, headers: STORAGE_HEADERS });
        }

        const result = await uploadToStorageApi(file, fileName || (file as File).name || 'file', 'null');
        return NextResponse.json({ ...result, version: STORAGE_ROUTE_VERSION }, { headers: STORAGE_HEADERS });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Storage upload failed', version: STORAGE_ROUTE_VERSION }, { status: 500, headers: STORAGE_HEADERS });
    }
}

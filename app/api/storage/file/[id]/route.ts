import { NextResponse } from 'next/server';
import { deleteFromStorageApi, downloadFromStorageApi, getStorageFileInfo } from '@/lib/storage-service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const response = await downloadFromStorageApi(id);
        const headers = new Headers();
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        if (contentType) headers.set('content-type', contentType);
        if (contentLength) headers.set('content-length', contentLength);

        try {
            const info = await getStorageFileInfo(id);
            if (info?.originalFileName) {
                headers.set('content-disposition', `inline; filename="${encodeURIComponent(info.originalFileName)}"`);
            }
        } catch { }

        return new Response(response.body, { status: 200, headers });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Storage download failed' }, { status: 404 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await deleteFromStorageApi(id);
        return new Response(null, { status: 204 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Storage delete failed' }, { status: 500 });
    }
}

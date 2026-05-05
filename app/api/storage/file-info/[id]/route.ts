import { NextResponse } from 'next/server';
import { getStorageFileInfo } from '@/lib/storage-service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const info = await getStorageFileInfo(id);
        return NextResponse.json(info);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Storage FileInfo failed' }, { status: 404 });
    }
}

import { NextResponse } from 'next/server';
import { uploadToStorageApi } from '@/lib/storage-service';

export async function POST(req: Request) {
    try {
        const form = await req.formData();
        const file = form.get('file');
        const directory = form.get('directory')?.toString() || 'Legal12';
        const fileName = form.get('fileName')?.toString();

        if (!(file instanceof Blob)) {
            return NextResponse.json({ error: 'file is required' }, { status: 400 });
        }

        const result = await uploadToStorageApi(file, fileName || (file as File).name || 'file', directory);
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Storage upload failed' }, { status: 500 });
    }
}

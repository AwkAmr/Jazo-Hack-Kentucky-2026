import { NextResponse } from 'next/server';

// Simple in-memory "face state" store.
//
// The browser (page.tsx) POSTs Jazo's current mood/speaking state here on an
// interval while the app is open. The physical MatrixPortal S3 polls this
// same endpoint over WiFi and draws matching eyes on the LED matrix.
//
// This resets whenever the dev server restarts, and only tracks one active
// session at a time -- that's fine for a hackathon demo with one laptop
// driving one physical face.

type FaceState = {
  mood: 'default' | 'happy' | 'angry' | 'tired' | 'confused' | 'empathetic';
  isSpeaking: boolean;
  speakVolume: number;
  updatedAt: number;
};

let currentState: FaceState = {
  mood: 'default',
  isSpeaking: false,
  speakVolume: 0,
  updatedAt: Date.now(),
};

export async function GET() {
  return NextResponse.json(currentState);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.mood) currentState.mood = body.mood;
    if (typeof body.isSpeaking === 'boolean') currentState.isSpeaking = body.isSpeaking;
    if (typeof body.speakVolume === 'number') currentState.speakVolume = body.speakVolume;
    currentState.updatedAt = Date.now();

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid body' }, { status: 400 });
  }
}
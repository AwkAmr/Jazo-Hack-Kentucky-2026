import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'API keys are missing' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as Blob | null;

    if (!file) {
      return NextResponse.json({ error: 'No audio file uploaded' }, { status: 400 });
    }

    // Construct the payload for ElevenLabs
    const elevenLabsFormData = new FormData();
    elevenLabsFormData.append('file', file, 'audio.webm');
    elevenLabsFormData.append('model_id', 'scribe_v1');
    
    // Call ElevenLabs STT API
    const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        // Don't set Content-Type header manually here; fetch will automatically 
        // set the correct boundary for multipart/form-data when passing FormData.
      },
      body: elevenLabsFormData,
    });

    if (!sttResponse.ok) {
      const errorText = await sttResponse.text();
      console.error("ElevenLabs STT Error:", errorText);
      return NextResponse.json({ error: "Failed to transcribe audio" }, { status: sttResponse.status });
    }

    const sttData = await sttResponse.json();
    
    // ElevenLabs returns { "text": "transcribed text..." }
    return NextResponse.json({ text: sttData.text });
    
  } catch (error: any) {
    console.error('STT Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

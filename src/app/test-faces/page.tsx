"use client";

import React from 'react';
import JazoFace from '@/components/JazoFace';

export default function TestFacesPage() {
  const moods = ['default', 'happy', 'angry', 'tired', 'confused', 'empathetic'] as const;

  return (
    <div style={{ padding: '40px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '40px', fontFamily: 'sans-serif', color: '#333' }}>
        Jazo Facial Expressions Test
      </h1>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '40px', justifyContent: 'center' }}>
        {moods.map((mood) => (
          <div key={mood} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Scale down the JazoFace to fit multiple on screen */}
            <div style={{ transform: 'scale(0.4)', transformOrigin: 'top center', height: '220px', width: '300px' }}>
              <JazoFace mood={mood} isSpeaking={false} speakVolume={0} />
            </div>
            <h2 style={{ marginTop: '10px', fontSize: '24px', fontFamily: 'monospace', color: '#555', textTransform: 'capitalize' }}>
              {mood}
            </h2>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useRef } from 'react';
import JazoFace from '@/components/JazoFace';

const MOCK_INTERVIEW_SEQUENCE = [
  {
    internal_thought: "Greeting the user and establishing a warm baseline.",
    jazo_facial_expression: "happy",
    elevenlabs_spoken_text: "Hi there! I'm Jazo. Thanks for taking the time to chat. I heard you've had quite the journey at the university so far. How are you doing today?",
    interview_progress: "intro"
  },
  {
    internal_thought: "The user mentioned they almost dropped out. This is the emotional core of the story. I need to abandon my planned questions and pivot to this.",
    jazo_facial_expression: "empathetic",
    elevenlabs_spoken_text: "Wait, you almost dropped out? That must have been terrifying. What made you stay?",
    interview_progress: "uncovered_conflict"
  },
  {
    internal_thought: "They stayed because of a mentor. That's a great positive note.",
    jazo_facial_expression: "happy",
    elevenlabs_spoken_text: "It sounds like finding the right mentor really changed everything for you. That's a powerful story.",
    interview_progress: "resolution"
  }
];

export default function Home() {
  const [mood, setMood] = useState<'default' | 'happy' | 'angry' | 'tired' | 'confused' | 'empathetic'>('default');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakVolume, setSpeakVolume] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const processAudioStream = (arrayBuffer: ArrayBuffer) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const actx = audioContextRef.current;
    
    actx.decodeAudioData(arrayBuffer, (buffer) => {
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      
      const source = actx.createBufferSource();
      source.buffer = buffer;
      
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      source.connect(analyser);
      analyser.connect(actx.destination);
      
      sourceRef.current = source;
      
      source.onended = () => {
        setIsSpeaking(false);
        setSpeakVolume(0);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
      
      setIsSpeaking(true);
      source.start(0);
      monitorVolume();
    });
  };

  const monitorVolume = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    // Normalize to 0.0 - 1.0 (max is roughly 255 but average usually peaks around 100-150 for speech)
    const normalized = Math.min(average / 100, 1.0);
    setSpeakVolume(normalized);
    
    animationFrameRef.current = requestAnimationFrame(monitorVolume);
  };

  const handleNextStep = async () => {
    if (stepIndex >= MOCK_INTERVIEW_SEQUENCE.length) return;
    
    const step = MOCK_INTERVIEW_SEQUENCE[stepIndex];
    
    // Set mood instantly
    setMood(step.jazo_facial_expression as any);
    setLoadingAudio(true);
    
    try {
      // Call ElevenLabs endpoint
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: step.elevenlabs_spoken_text })
      });
      
      if (!response.ok) {
        console.error("Failed to fetch audio");
        setLoadingAudio(false);
        return;
      }
      
      const arrayBuffer = await response.arrayBuffer();
      setLoadingAudio(false);
      processAudioStream(arrayBuffer);
      
      setStepIndex(prev => prev + 1);
    } catch (err) {
      console.error(err);
      setLoadingAudio(false);
    }
  };

  return (
    <main style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      
      <JazoFace mood={mood} isSpeaking={isSpeaking} speakVolume={speakVolume} />
      
      <div style={{ marginTop: '40px', padding: '20px', background: '#f5f5f5', borderRadius: '12px', maxWidth: '600px', width: '100%', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', zIndex: 10 }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#333', fontFamily: 'sans-serif' }}>Interview Controls (Mock)</h3>
        
        {stepIndex < MOCK_INTERVIEW_SEQUENCE.length ? (
          <div>
            <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '14px', fontFamily: 'sans-serif' }}>
              <strong>Internal Thought:</strong> {MOCK_INTERVIEW_SEQUENCE[stepIndex].internal_thought}
            </p>
            <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '14px', fontFamily: 'sans-serif' }}>
              <strong>Jazo will say:</strong> "{MOCK_INTERVIEW_SEQUENCE[stepIndex].elevenlabs_spoken_text}"
            </p>
            <button 
              onClick={handleNextStep}
              disabled={loadingAudio || isSpeaking}
              style={{
                background: loadingAudio || isSpeaking ? '#ccc' : '#00e5ff',
                color: '#000',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                cursor: loadingAudio || isSpeaking ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '16px',
                transition: 'background 0.2s',
                width: '100%'
              }}
            >
              {loadingAudio ? 'Generating Voice...' : isSpeaking ? 'Jazo is speaking...' : `Trigger Step ${stepIndex + 1}`}
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, color: '#27ae60', fontWeight: 'bold', fontFamily: 'sans-serif' }}>Mock sequence complete!</p>
        )}
      </div>
      
    </main>
  );
}

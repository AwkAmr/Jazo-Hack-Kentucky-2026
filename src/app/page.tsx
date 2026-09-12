'use client';

import React, { useState, useRef, useEffect } from 'react';
import JazoFace from '@/components/JazoFace';

type Message = { role: 'user' | 'model'; parts: { text: string }[] };
type JazoResponse = {
  internal_thought: string;
  jazo_facial_expression: 'default' | 'happy' | 'angry' | 'tired' | 'confused' | 'empathetic';
  elevenlabs_spoken_text: string;
  interview_progress: string;
  audioBase64?: string;
};

export default function Home() {
  const [mood, setMood] = useState<'default' | 'happy' | 'angry' | 'tired' | 'confused' | 'empathetic'>('default');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakVolume, setSpeakVolume] = useState(0);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastJazoResponse, setLastJazoResponse] = useState<JazoResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'visual' | 'transcript'>('visual');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, lastJazoResponse]);

  // Push-to-talk Spacebar logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default scrolling when hitting spacebar
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
      }
      
      // Only start recording if we have started the interview and are not loading/already recording
      if (e.code === 'Space' && !e.repeat && messages.length > 0 && !isLoading && !isTranscribing && !isRecording) {
        startRecording();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        stopRecording();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLoading, isTranscribing, isRecording, messages.length]);

  const startRecording = async () => {
    try {
      // Request low-spec audio for faster upload/processing
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 16000, channelCount: 1 } 
      });
      
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 16000 };
      }
      
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
        await processAudioUpload(audioBlob);
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic error", err);
      alert("Microphone access denied or not available.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudioUpload = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('file', blob);

      const sttRes = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!sttRes.ok) {
        const err = await sttRes.json();
        throw new Error(err.error || 'Speech-to-Text failed');
      }

      const sttData = await sttRes.json();
      const transcribedText = sttData.text;

      if (!transcribedText || transcribedText.trim() === '') {
        throw new Error('No speech detected. Please hold spacebar and try again.');
      }

      // Append transcribed user message
      const userMsg: Message = { role: 'user', parts: [{ text: transcribedText }] };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setIsTranscribing(false);

      // Trigger the standard chat flow
      await fetchTurn(updatedMessages);

    } catch (err: any) {
      console.error(err);
      alert('Error: ' + err.message);
      setIsTranscribing(false);
    }
  };

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
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    const normalized = Math.min(average / 100, 1.0);
    setSpeakVolume(normalized);
    
    animationFrameRef.current = requestAnimationFrame(monitorVolume);
  };

  const startInterview = async () => {
    setIsLoading(true);
    // Send an initial hidden prompt to kick off the conversation based on the brief
    const initialMessages: Message[] = [{ role: 'user', parts: [{ text: "Hello Jazo! Let's start the interview." }] }];
    await fetchTurn(initialMessages);
  };

  const fetchTurn = async (currentMessages: Message[]) => {
    setIsLoading(true);
    try {
      // 1. Get Gemini Response
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: currentMessages })
      });
      
      if (!chatRes.ok) {
        const errorData = await chatRes.json();
        throw new Error(errorData.error || 'Failed to get chat response');
      }
      
      const jazoData: JazoResponse = await chatRes.json();
      setLastJazoResponse(jazoData);
      setMood(jazoData.jazo_facial_expression);

      // Append model response to history
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: jazoData.elevenlabs_spoken_text }] }]);

      // 2. Play ElevenLabs TTS from Base64
      if (jazoData.audioBase64) {
        const binaryString = window.atob(jazoData.audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        processAudioStream(bytes.buffer);
      }

    } catch (error: any) {
      console.error(error);
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', boxSizing: 'border-box' }}>
      
      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #eee', padding: '10px 20px', gap: '15px' }}>
        <button 
          onClick={() => setActiveTab('visual')}
          style={{ padding: '8px 16px', background: activeTab === 'visual' ? '#00e5ff' : 'transparent', color: activeTab === 'visual' ? '#000' : '#666', border: 'none', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Visual
        </button>
        <button 
          onClick={() => setActiveTab('transcript')}
          style={{ padding: '8px 16px', background: activeTab === 'transcript' ? '#00e5ff' : 'transparent', color: activeTab === 'transcript' ? '#000' : '#666', border: 'none', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Transcript
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <button 
              onClick={startInterview}
              disabled={isLoading}
              style={{ background: '#00e5ff', border: 'none', padding: '16px 32px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '20px', boxShadow: '0 4px 15px rgba(0, 229, 255, 0.4)' }}
            >
              {isLoading ? 'Waking Jazo up...' : 'Start Interview'}
            </button>
          </div>
        ) : activeTab === 'visual' ? (
          // VISUAL TAB
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
            
            <div style={{ transform: 'scale(1.2)', transformOrigin: 'center' }}>
              <JazoFace mood={mood} isSpeaking={isSpeaking} speakVolume={speakVolume} />
            </div>

            {/* Brain Status Overlay */}
            {lastJazoResponse && (
              <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(224, 247, 250, 0.9)', padding: '15px', borderRadius: '12px', fontSize: '13px', fontFamily: 'monospace', color: '#006064', maxWidth: '300px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                <strong>[Jazo's Brain]</strong><br/><br/>
                Progress: {lastJazoResponse.interview_progress}<br/><br/>
                Emotion: {lastJazoResponse.jazo_facial_expression}<br/><br/>
                Thought: <em>{lastJazoResponse.internal_thought}</em>
              </div>
            )}

            {/* Mic Indicator Overlay */}
            <div style={{ position: 'absolute', bottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{ 
                width: '60px', height: '60px', borderRadius: '50%', 
                background: isRecording ? '#ff3b30' : (isLoading || isTranscribing ? '#ccc' : '#f0f0f0'),
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                boxShadow: isRecording ? '0 0 20px rgba(255, 59, 48, 0.5)' : '0 2px 10px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease'
              }}>
                <span style={{ fontSize: '24px' }}>🎙️</span>
              </div>
              <span style={{ color: '#666', fontWeight: 'bold', fontFamily: 'sans-serif' }}>
                {isTranscribing ? 'Transcribing...' : (isLoading ? 'Jazo is thinking...' : (isRecording ? 'Listening...' : 'Hold SPACE to speak'))}
              </span>
            </div>

          </div>
        ) : (
          // TRANSCRIPT TAB
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '40px', background: '#f9f9f9', overflowY: 'auto' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {messages.map((msg, i) => {
                // Skip the hidden system prompt
                if (i === 0 && msg.role === 'user') return null;
                
                return (
                  <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', background: msg.role === 'user' ? '#007bff' : '#fff', color: msg.role === 'user' ? '#fff' : '#333', padding: '15px 20px', borderRadius: '15px', border: msg.role === 'user' ? 'none' : '1px solid #ccc', fontFamily: 'sans-serif', fontSize: '16px', lineHeight: '1.5', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                    {msg.role === 'model' && <strong style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Jazo:</strong>}
                    {msg.parts[0].text}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

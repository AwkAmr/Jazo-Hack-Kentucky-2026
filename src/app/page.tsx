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
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastJazoResponse, setLastJazoResponse] = useState<JazoResponse | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, lastJazoResponse]);

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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', parts: [{ text: inputValue }] };
    const updatedMessages = [...messages, userMsg];
    
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    await fetchTurn(updatedMessages);
  };

  const fetchTurn = async (currentMessages: Message[]) => {
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
        // Convert base64 to ArrayBuffer
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
    <main style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', backgroundColor: '#fff', paddingTop: '40px', boxSizing: 'border-box' }}>
      
      {/* Visual Component */}
      <div style={{ transform: 'scale(0.8)', transformOrigin: 'top center', marginBottom: '-80px' }}>
        <JazoFace mood={mood} isSpeaking={isSpeaking} speakVolume={speakVolume} />
      </div>
      
      {/* Chat Interface */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '20px', background: '#f5f5f5', borderRadius: '12px', maxWidth: '800px', width: '100%', height: 'calc(100vh - 450px)', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', zIndex: 10 }}>
        
        {/* Header Options */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #ddd' }}>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#333', fontFamily: 'sans-serif' }}>Live Interview Loop</h3>
          <span style={{ fontSize: '14px', color: '#666' }}>Voice: EVE (Default)</span>
        </div>
        
        {/* Jazo's Internal Brain Viewer */}
        {lastJazoResponse && (
          <div style={{ background: '#e0f7fa', padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px', fontFamily: 'monospace', color: '#006064' }}>
            <strong>[Jazo's Brain]</strong><br/>
            Progress: {lastJazoResponse.interview_progress}<br/>
            Emotion: {lastJazoResponse.jazo_facial_expression}<br/>
            Thought: <em>{lastJazoResponse.internal_thought}</em>
          </div>
        )}

        {/* Chat History */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {messages.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <button 
                onClick={startInterview}
                disabled={isLoading}
                style={{ background: '#00e5ff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
              >
                {isLoading ? 'Waking Jazo up...' : 'Start Interview'}
              </button>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', background: msg.role === 'user' ? '#007bff' : '#fff', color: msg.role === 'user' ? '#fff' : '#333', padding: '10px 15px', borderRadius: '15px', border: msg.role === 'user' ? 'none' : '1px solid #ccc', fontFamily: 'sans-serif', fontSize: '15px', lineHeight: '1.4' }}>
                {msg.role === 'model' && <strong style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Jazo:</strong>}
                {msg.parts[0].text}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading || messages.length === 0}
            placeholder={isLoading ? "Jazo is thinking..." : "Type your answer..."}
            style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '15px' }}
          />
          <button 
            type="submit"
            disabled={isLoading || !inputValue.trim() || messages.length === 0}
            style={{ background: isLoading || !inputValue.trim() ? '#ccc' : '#00e5ff', color: '#000', border: 'none', padding: '0 20px', borderRadius: '8px', cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
          >
            Send
          </button>
        </form>

      </div>
    </main>
  );
}

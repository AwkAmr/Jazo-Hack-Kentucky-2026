'use client';

import React, { useState, useRef, useEffect } from 'react';
import JazoFace from '@/components/JazoFace';

type Message = { role: 'user' | 'model'; parts: { text: string }[] };

// Fixed height shared by the transcript composer's text box and Send button, so
// the two sit flush. 20px line + 15px padding + 1px border, top and bottom.
const COMPOSER_HEIGHT = 52;

// True when keystrokes belong to a form field, so global shortcuts should stay out of the way.
const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
};

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
  const [activeTab, setActiveTab] = useState<'visual' | 'transcript' | 'assignment' | 'story'>('assignment');
  
  // Assignment Fields
  const [who, setWho] = useState('A participant at Hack Kentucky 2026');
  const [topic, setTopic] = useState('Their experience at the hackathon, what they are building, and their thoughts on the event');
  const [contentType, setContentType] = useState('A short, engaging social media post highlighting their project and hackathon experience');
  
  // Progress States
  const [isWrappingUp, setIsWrappingUp] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [finalStory, setFinalStory] = useState<{story: string, pull_quotes: string[]} | null>(null);
  
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);

  // Typed answers from the transcript tab, as an alternative to push-to-talk
  const [textInput, setTextInput] = useState('');
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Keys this interview in the JAZO MCP server. Generated lazily on the client
  // so it never differs between the server render and the hydrated one.
  const interviewIdRef = useRef<string | null>(null);
  const getInterviewId = () => (interviewIdRef.current ??= crypto.randomUUID());

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, lastJazoResponse]);

  // Trigger generation when Jazo is finished speaking a completed interview
  useEffect(() => {
    if (!isSpeaking && lastJazoResponse && (lastJazoResponse.interview_progress === 'complete' || lastJazoResponse.interview_progress === 'completed') && !finalStory && !isGeneratingStory) {
      const fullAssignment = `Who is being interviewed: ${who}\nTopic: ${topic}\nContent Needed: ${contentType}`;
      generateFinalStory(messages, fullAssignment);
    }
  }, [isSpeaking, lastJazoResponse, messages, finalStory, isGeneratingStory, who, topic, contentType]);

  // Push-to-talk Spacebar logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // A space typed into the transcript composer (or an assignment field) is
      // a space, not a push-to-talk trigger.
      if (isTypingTarget(e.target)) return;

      // Prevent default scrolling when hitting spacebar
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
      }

      // Only start recording if we have started the interview and are not loading/already recording/speaking
      if (e.code === 'Space' && !e.repeat && messages.length > 0 && !isLoading && !isTranscribing && !isRecording && !isSpeaking) {
        startRecording();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Guarded on the ref rather than the event target so a recording always
      // gets stopped, even if focus moved into a text field mid-hold.
      if (e.code === 'Space' && isRecordingRef.current) {
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLoading, isTranscribing, isRecording, isSpeaking, isWrappingUp, messages.length]);

  const startRecording = async () => {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;
    setIsRecording(true);

    try {
      // Request low-spec audio for faster upload/processing
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { sampleRate: 16000, channelCount: 1 } 
      });
      
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 16000 };
      }
      
      // If user released spacebar while we were waiting for mic permissions/stream
      if (!isRecordingRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
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
    } catch (err) {
      console.error("Mic error", err);
      isRecordingRef.current = false;
      setIsRecording(false);
      alert("Microphone access denied or not available.");
    }
  };

  const stopRecording = () => {
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
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
        console.warn('No speech detected. Please hold spacebar and try again.');
        setIsTranscribing(false);
        return;
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
      setIsTranscribing(false);
    }
  };

  const processAudioStream = async (text: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const actx = audioContextRef.current;
    
    // Resume context if suspended
    if (actx.state === 'suspended') {
      await actx.resume();
    }

    if (!analyserRef.current) {
      analyserRef.current = actx.createAnalyser();
      analyserRef.current.fftSize = 256;
    }
    const analyser = analyserRef.current;

    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    
    const audioEl = new Audio(`/api/tts?voice=eve&text=${encodeURIComponent(text)}`);
    audioEl.crossOrigin = "anonymous";
    
    const source = actx.createMediaElementSource(audioEl);
    source.connect(analyser);
    analyser.connect(actx.destination);
    
    sourceRef.current = source as any;
    audioElRef.current = audioEl;

    audioEl.onended = () => {
      setIsSpeaking(false);
      setSpeakVolume(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };

    setIsSpeaking(true);
    audioEl.play().catch(e => console.error("Audio playback error:", e));
    monitorVolume();
  };

  // Cuts Jazo off mid-sentence. `onended` never fires on a pause, so this has
  // to clear the speaking state itself.
  const stopSpeaking = () => {
    audioElRef.current?.pause();
    audioElRef.current = null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsSpeaking(false);
    setSpeakVolume(0);
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

  // Deliberately ignores `isSpeaking` — you can type over Jazo and send while
  // he's still talking. Only a turn actually in flight blocks a send.
  const isTurnInFlight = isLoading || isTranscribing || isRecording;
  const canSendText =
    messages.length > 0 && !isTurnInFlight && !isWrappingUp && !isGeneratingStory && !finalStory;

  // Typed equivalent of processAudioUpload: skips STT and goes straight to the chat turn.
  const sendTextMessage = async () => {
    const text = textInput.trim();
    if (!text || !canSendText) return;

    // Interrupt the current reply so it can't talk over the next one.
    if (isSpeaking) stopSpeaking();

    const userMsg: Message = { role: 'user', parts: [{ text }] };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setTextInput('');
    // Clicking Send moves focus to the button; put it back so the next answer
    // can be typed straight away (and so SPACE doesn't re-trigger the button).
    textInputRef.current?.focus();

    await fetchTurn(updatedMessages);
  };

  const generateFinalStory = async (transcriptMessages: Message[], assignmentContext: string) => {
    setIsGeneratingStory(true);
    setActiveTab('story'); // Switch to story tab immediately
    
    try {
      const res = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: transcriptMessages,
          assignment: assignmentContext,
          interviewId: getInterviewId()
        })
      });
      
      if (!res.ok) throw new Error("Failed to generate story");
      
      const data = await res.json();
      setFinalStory(data);
    } catch (err) {
      console.error(err);
      alert("Error generating story. Check console.");
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const handleWrapUp = async () => {
    setIsWrappingUp(true);
    await fetchTurn(messages, true);
  };

  const startInterview = async () => {
    setIsLoading(true);
    interviewIdRef.current = null; // fresh MCP record per interview
    // Send an initial hidden prompt to kick off the conversation based on the brief
    const initialMessages: Message[] = [{ role: 'user', parts: [{ text: "Hello Jazo! Let's start the interview." }] }];
    await fetchTurn(initialMessages);
  };

  const resetInterview = () => {
    setMessages([]);
    setFinalStory(null);
    setIsWrappingUp(false);
    setIsGeneratingStory(false);
    setActiveTab('visual');
    setLastJazoResponse(null);
    setMood('default');
    interviewIdRef.current = null;
  };

  // `wrapUp` is passed explicitly rather than read from state: the wrap-up
  // button calls this in the same tick it flips `isWrappingUp`, and the state
  // update wouldn't be visible in this closure yet.
  const fetchTurn = async (currentMessages: Message[], wrapUp = isWrappingUp) => {
    setIsLoading(true);
    try {
      const fullAssignment = `Who is being interviewed: ${who}\nTopic: ${topic}\nContent Needed: ${contentType}`;

      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages,
          assignment: fullAssignment,
          wrapUp
        })
      });
      
      if (!chatRes.ok) {
        const errorData = await chatRes.json();
        throw new Error(errorData.error || 'Failed to get chat response');
      }
      
      const jazoData: JazoResponse = await chatRes.json();
      if (wrapUp) {
        jazoData.interview_progress = 'complete';
      }
      
      setLastJazoResponse(jazoData);
      setMood(jazoData.jazo_facial_expression);

      // Append model response to history
      const jazoTurn: Message = { role: 'model', parts: [{ text: jazoData.elevenlabs_spoken_text }] };
      const finalMessages = [...currentMessages, jazoTurn];
      setMessages(finalMessages);

      // 2. Play ElevenLabs TTS Natively Streamed
      if (jazoData.elevenlabs_spoken_text) {
        processAudioStream(jazoData.elevenlabs_spoken_text);
      }


    } catch (error: any) {
      console.error(error);
      alert('Error: ' + error.message);
      setIsWrappingUp(false); // let the user retry the wrap-up
    } finally {
      setIsLoading(false);
    }
  };

  // Asks Jazo for a closing turn right away. Once that turn comes back,
  // fetchTurn kicks off story generation.
  const wrapUpInterview = async () => {
    if (isWrappingUp || isLoading || isTranscribing || messages.length === 0) return;
    setIsWrappingUp(true);
    await fetchTurn(messages, true);
  };

  // Shared by the Visual and Transcript tabs so the control looks and behaves
  // identically in both. Positioning is left to whichever tab renders it.
  const wrapUpControl = !finalStory && !isGeneratingStory && messages.length > 0
    ? isWrappingUp
      ? (
        <div style={{ background: '#34c759', color: '#fff', padding: '10px 20px', borderRadius: '20px', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(52, 199, 89, 0.3)' }}>
          Wrapping up...
        </div>
      )
      : (
        <button
          onClick={wrapUpInterview}
          disabled={isLoading || isTranscribing}
          style={{ background: isLoading || isTranscribing ? '#ccc' : '#ff3b30', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '20px', fontWeight: 'bold', cursor: isLoading || isTranscribing ? 'not-allowed' : 'pointer', boxShadow: '0 4px 10px rgba(255, 59, 48, 0.3)' }}
        >
          Wrap Up Interview
        </button>
      )
    : null;

  return (
    <main style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', boxSizing: 'border-box' }}>
      
      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #eee', padding: '10px 20px', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '15px' }}>
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
          <button 
            onClick={() => setActiveTab('assignment')}
            style={{ padding: '8px 16px', background: activeTab === 'assignment' ? '#00e5ff' : 'transparent', color: activeTab === 'assignment' ? '#000' : '#666', border: 'none', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Assignment
          </button>
          <button 
            onClick={() => setActiveTab('story')}
            style={{ padding: '8px 16px', background: activeTab === 'story' ? '#00e5ff' : 'transparent', color: activeTab === 'story' ? '#000' : '#666', border: 'none', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Final Story
          </button>
        </div>

        {/* Wrap Up & Reset Action Buttons */}
        <div>
          {!isWrappingUp && !finalStory && !isGeneratingStory && messages.length > 0 && (
            <button
              onClick={wrapUpInterview}
              disabled={isLoading || isTranscribing}
              style={{ 
                background: isLoading || isTranscribing ? '#ccc' : '#ff3b30', 
                color: '#fff', 
                border: 'none', 
                width: '32px', 
                height: '32px', 
                borderRadius: '50%', 
                fontWeight: 'bold', 
                cursor: isLoading || isTranscribing ? 'not-allowed' : 'pointer', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                boxShadow: '0 4px 10px rgba(255, 59, 48, 0.3)' 
              }}
              title="Wrap Up Interview"
            >
              ✕
            </button>
          )}
          {isWrappingUp && !finalStory && !isGeneratingStory && (
            <span style={{ color: '#34c759', fontWeight: 'bold', fontSize: '14px', marginRight: '10px' }}>Wrapping up...</span>
          )}
          {(finalStory || isWrappingUp || isGeneratingStory) && (
            <button
              onClick={resetInterview}
              style={{ 
                background: '#00e5ff', 
                color: '#000', 
                border: 'none', 
                padding: '8px 16px',
                borderRadius: '16px', 
                fontWeight: 'bold', 
                cursor: 'pointer', 
                boxShadow: '0 2px 8px rgba(0, 229, 255, 0.4)' 
              }}
              title="Start New Interview"
            >
              Reset Interview
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTab === 'assignment' ? (
          <div style={{ padding: '40px', flex: 1, backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ maxWidth: '800px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h2 style={{ margin: 0, color: '#333', fontFamily: 'sans-serif' }}>Jazo's Assignment Brief</h2>
              <p style={{ color: '#666', margin: 0 }}>Define exactly who Jazo is interviewing and what content you need.</p>
              
              <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Who is being interviewed? (Name, Title, Role)</label>
                <input 
                  type="text" value={who} onChange={e => setWho(e.target.value)}
                  style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #ccc', fontSize: '16px' }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>What is the topic of the interview?</label>
                <input 
                  type="text" value={topic} onChange={e => setTopic(e.target.value)}
                  style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #ccc', fontSize: '16px' }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>What content is needed? (e.g. Founder Story, Case Study)</label>
                <textarea 
                  value={contentType} onChange={e => setContentType(e.target.value)}
                  style={{ width: '100%', height: '100px', padding: '15px', borderRadius: '12px', border: '1px solid #ccc', fontSize: '16px', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>
        ) : messages.length === 0 ? (
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

            {/* Brain Status Overlay (Temporarily Hidden)
            {lastJazoResponse && (
              <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(224, 247, 250, 0.9)', padding: '15px', borderRadius: '12px', fontSize: '13px', fontFamily: 'monospace', color: '#006064', maxWidth: '300px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                <strong>[Jazo's Brain]</strong><br/><br/>
                Progress: {lastJazoResponse.interview_progress}<br/><br/>
                Emotion: {lastJazoResponse.jazo_facial_expression}<br/><br/>
                Thought: <em>{lastJazoResponse.internal_thought}</em>
              </div>
            )}
            */}

            {/* Wrap Up Button */}
            {wrapUpControl && (
              <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
                {wrapUpControl}
              </div>
            )}

            {/* Mic Indicator Overlay */}
            <div style={{ position: 'absolute', bottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{ 
                width: '60px', height: '60px', borderRadius: '50%', 
                background: isRecording ? '#ff3b30' : (isLoading || isTranscribing || isWrappingUp ? '#ccc' : '#f0f0f0'),
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                boxShadow: isRecording ? '0 0 20px rgba(255, 59, 48, 0.5)' : '0 2px 10px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease'
              }}>
                <span style={{ fontSize: '24px' }}>🎙️</span>
              </div>
              <span style={{ color: '#666', fontWeight: 'bold', fontFamily: 'sans-serif' }}>
                {isTranscribing ? 'Transcribing...' : (isLoading ? 'Jazo is thinking...' : (isRecording ? 'Listening...' : (isWrappingUp ? 'Interview complete' : 'Hold SPACE to speak')))}
              </span>
            </div>

          </div>
        ) : activeTab === 'transcript' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#fafafa' }}>
            {/* Same wrap-up control as the Visual tab. In flow rather than
                absolute here, so it can't sit on top of the message list. */}
            {wrapUpControl && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '20px 20px 0' }}>
                {wrapUpControl}
              </div>
            )}

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ padding: '15px 20px', borderRadius: '15px', background: msg.role === 'user' ? '#00e5ff' : '#fff', color: msg.role === 'user' ? '#000' : '#333', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.parts[0].text}</p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Type an answer instead of holding SPACE to speak it */}
            <div style={{ borderTop: '1px solid #eee', background: '#fff', padding: '15px 20px' }}>
              <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <textarea
                    ref={textInputRef}
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendTextMessage();
                      }
                    }}
                    placeholder="Type your answer to Jazo..."
                    style={{
                      flex: 1, minWidth: 0,
                      height: `${COMPOSER_HEIGHT}px`,
                      boxSizing: 'border-box', padding: '15px 18px',
                      borderRadius: '12px', border: '1px solid #ccc',
                      fontSize: '16px', fontFamily: 'inherit', lineHeight: '20px',
                      resize: 'none', overflowY: 'auto', display: 'block'
                    }}
                  />
                  <button
                    onClick={sendTextMessage}
                    disabled={!canSendText || textInput.trim() === ''}
                    style={{
                      flexShrink: 0, width: '96px', height: `${COMPOSER_HEIGHT}px`,
                      boxSizing: 'border-box', padding: 0,
                      background: !canSendText || textInput.trim() === '' ? '#ccc' : '#00e5ff',
                      color: '#000', border: 'none', borderRadius: '12px',
                      fontWeight: 'bold', fontSize: '16px', lineHeight: '20px',
                      cursor: !canSendText || textInput.trim() === '' ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Send
                  </button>
                </div>
                <span style={{ color: '#999', fontSize: '13px', fontFamily: 'sans-serif' }}>
                  {isTranscribing
                    ? 'Transcribing your voice...'
                    : isLoading
                      ? 'Jazo is thinking...'
                      : isRecording
                        ? 'Listening...'
                        : isWrappingUp || isGeneratingStory || finalStory
                          ? 'Interview complete.'
                          : isSpeaking
                            ? 'Jazo is speaking — send anyway to cut him off.'
                            : 'Enter to send, Shift+Enter for a new line — or click outside this box and hold SPACE to speak.'}
                </span>
              </div>
            </div>
          </div>
        ) : activeTab === 'story' ? (
          <div style={{ padding: '40px', overflowY: 'auto', flex: 1, backgroundColor: '#fafafa' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              {isGeneratingStory ? (
                <div style={{ textAlign: 'center', marginTop: '100px' }}>
                  <h2>Generating your final asset...</h2>
                  <p style={{ color: '#666' }}>Jazo is reviewing the transcript and writing the story.</p>
                </div>
              ) : finalStory ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                  <div style={{ background: '#fff', padding: '30px', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                    <h2 style={{ marginTop: 0, color: '#333' }}>Final Marketing Story</h2>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#444' }}>{finalStory.story}</div>
                  </div>
                  
                  <div style={{ background: '#fff', padding: '30px', borderRadius: '15px', borderLeft: '5px solid #00e5ff', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                    <h2 style={{ marginTop: 0, color: '#333' }}>Pull Quotes</h2>
                    <ul style={{ paddingLeft: '20px', color: '#555', margin: 0, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {finalStory.pull_quotes.map((quote, idx) => (
                        <li key={idx} style={{ fontSize: '18px', fontStyle: 'italic', fontWeight: '500' }}>"{quote}"</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', marginTop: '100px', color: '#666' }}>
                  <h2>No story generated yet.</h2>
                  <p>Complete an interview to generate the final marketing asset.</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

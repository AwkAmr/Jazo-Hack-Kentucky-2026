'use client';

import React, { useEffect, useState, useRef } from 'react';
import styles from './JazoFace.module.css';

interface JazoFaceProps {
  mood?: 'default' | 'happy' | 'angry' | 'tired' | 'confused' | 'empathetic';
  isSpeaking?: boolean;
  speakVolume?: number; // 0.0 to 1.0
}

export default function JazoFace({ mood = 'default', isSpeaking = false, speakVolume = 0 }: JazoFaceProps) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const blinkTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-blinker logic
  useEffect(() => {
    const triggerBlink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150); // Blink duration
      
      // Schedule next blink
      const nextBlink = Math.random() * 3000 + 2000; // 2 to 5 seconds
      blinkTimerRef.current = setTimeout(triggerBlink, nextBlink);
    };

    blinkTimerRef.current = setTimeout(triggerBlink, 2000);

    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    };
  }, []);

  // Map the container class based on mood
  const moodClass = mood !== 'default' ? styles[mood] : '';
  const containerClassName = `${styles.faceContainer} ${moodClass}`.trim();

  // Combine classes for eyes
  const leftEyeClasses = `${styles.eye} ${styles.left} ${isBlinking ? styles.blink : ''} ${isSpeaking ? styles.speaking : ''}`.trim();
  const rightEyeClasses = `${styles.eye} ${styles.right} ${isBlinking ? styles.blink : ''} ${isSpeaking ? styles.speaking : ''}`.trim();

  // Map volume (0-1) to a CSS scale value (1.0 to ~1.3)
  // When speaking, we want the eye to pulse vertically slightly based on volume
  const speakScale = isSpeaking ? 1 + (speakVolume * 0.3) : 1;

  return (
    <div className={containerClassName}>
      <div 
        className={styles.eyesWrapper} 
        style={{ transform: `translate(${gaze.x}px, ${gaze.y}px)` }}
      >
        <div 
          className={leftEyeClasses} 
          style={{ '--speak-scale': speakScale } as React.CSSProperties}
        />
        <div 
          className={rightEyeClasses} 
          style={{ '--speak-scale': speakScale } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

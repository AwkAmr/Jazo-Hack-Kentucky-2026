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

  // Idle look-around logic
  useEffect(() => {
    let gazeTimer: NodeJS.Timeout;

    const triggerLook = () => {
      // If speaking, prefer making "eye contact" (stay near 0,0)
      if (isSpeaking) {
        setGaze({ 
          x: (Math.random() - 0.5) * 10, // tiny movements
          y: (Math.random() - 0.5) * 5 
        });
        gazeTimer = setTimeout(triggerLook, Math.random() * 2000 + 1000);
      } else {
        // Idle looking around (larger movements)
        // x between -40 and 40, y between -20 and 20
        const newX = (Math.random() - 0.5) * 80;
        const newY = (Math.random() - 0.5) * 40;
        
        // 30% chance to just look straight ahead
        if (Math.random() < 0.3) {
          setGaze({ x: 0, y: 0 });
        } else {
          setGaze({ x: newX, y: newY });
        }
        
        // Look again in 2 to 6 seconds
        gazeTimer = setTimeout(triggerLook, Math.random() * 4000 + 2000);
      }
    };

    gazeTimer = setTimeout(triggerLook, 3000);

    return () => {
      clearTimeout(gazeTimer);
    };
  }, [isSpeaking]);


  // Map the container class based on mood
  const moodClass = mood !== 'default' ? styles[mood] : '';
  const containerClassName = `${styles.faceContainer} ${moodClass}`.trim();

  // Combine classes for eyes
  const leftEyeClasses = `${styles.eye} ${styles.left} ${isBlinking ? styles.blink : ''} ${isSpeaking ? styles.speaking : ''}`.trim();
  const rightEyeClasses = `${styles.eye} ${styles.right} ${isBlinking ? styles.blink : ''} ${isSpeaking ? styles.speaking : ''}`.trim();

  // Map volume (0-1) to a CSS scale value (lower fluctuation: max 1.1x)
  const speakScale = isSpeaking ? 1 + (speakVolume * 0.1) : 1;
  // Map volume to a slight vertical bounce (up to -15px)
  const speakTranslateY = isSpeaking ? -(speakVolume * 15) : 0;

  return (
    <div className={containerClassName}>
      <div 
        className={styles.eyesWrapper} 
        style={{ transform: `translate(${gaze.x}px, ${gaze.y}px)` }}
      >
        <div 
          className={leftEyeClasses} 
          style={{ '--speak-scale': speakScale, '--speak-translate-y': `${speakTranslateY}px` } as React.CSSProperties}
        />
        <div 
          className={rightEyeClasses} 
          style={{ '--speak-scale': speakScale, '--speak-translate-y': `${speakTranslateY}px` } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

"use client";
import React, { useState, useEffect } from 'react';
import styles from './pitch.module.css';

export default function PitchDeck() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const container = e.target as HTMLElement;
      const slideHeight = window.innerHeight;
      const current = Math.round(container.scrollTop / slideHeight);
      setActiveSlide(current);
    };

    const container = document.getElementById('deck-container');
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const scrollToSlide = (index: number) => {
    const container = document.getElementById('deck-container');
    if (container) {
      container.scrollTo({
        top: index * window.innerHeight,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div id="deck-container" className={styles.deckContainer}>
      
      {/* Slide 1: Title */}
      <section className={styles.slide}>
        <h1 className={styles.slideTitle}>JAZO</h1>
        <h2 className={styles.slideSubtitle}>An Interviewer Worth Talking To</h2>
        <p className={styles.slideBody} style={{ marginTop: '3rem' }}>
          An expressive, hardware-embodied AI reporter that turns friendly conversations into published marketing assets.
        </p>
        <div className={styles.scrollHint}>↓ Scroll to advance</div>
      </section>

      {/* Slide 2: The Problem */}
      <section className={styles.slide}>
        <h1 className={styles.slideTitle}>The Problem</h1>
        <h2 className={styles.slideSubtitle}>Capturing authentic marketing stories is like pulling teeth.</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Blank Page Syndrome</div>
            <p>Customers and founders hate staring at blank pages. Writing case studies is tedious and heavily procrastinated.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Sterile Chatbots</div>
            <p>Standard AI bots feel like interrogations. They lack warmth, and people don't naturally open up to a text box.</p>
          </div>
        </div>
      </section>

      {/* Slide 3: The Solution */}
      <section className={styles.slide}>
        <h1 className={styles.slideTitle}>The Solution: Embodiment</h1>
        <h2 className={styles.slideSubtitle}>We built a character, not just a tool.</h2>
        <p className={styles.slideBody}>
          Jazo is a fully agentic hardware/software interviewer. With a dynamic, expressive LCD face that reacts 
          with empathy and joy, Jazo breaks down walls and makes people actually <i>want</i> to share their stories.
        </p>
      </section>

      {/* Slide 4: The Tech */}
      <section className={styles.slide}>
        <h1 className={styles.slideTitle}>Zero-Hallucination MCP</h1>
        <h2 className={styles.slideSubtitle}>Powered by the Claude Model Context Protocol</h2>
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Live Synced Transcripts</div>
            <p>Voice interviews are instantly transcribed and synced to disk, granting Claude real-time access to the conversation.</p>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Verbatim Pull Quotes</div>
            <p>Instead of relying on AI memory, our custom MCP tools force Claude to extract and verify word-for-word quotes directly from the source.</p>
          </div>
        </div>
      </section>

      {/* Slide 5: What's Next */}
      <section className={styles.slide}>
        <h1 className={styles.slideTitle}>What's Next</h1>
        <h2 className={styles.slideSubtitle}>Scaling Authentic Story Collection</h2>
        <p className={styles.slideBody}>
          Integrating JAZO directly into Prologue's "Premise" software to help businesses everywhere 
          scale their marketing content through genuine, human-like conversations.
        </p>
        <p className={styles.slideBody} style={{ color: '#38bdf8', marginTop: '3rem', fontWeight: 600 }}>
          Thank you!
        </p>
      </section>

      {/* Navigation Dots */}
      <div className={styles.navigation}>
        {[0, 1, 2, 3, 4].map((index) => (
          <div 
            key={index}
            onClick={() => scrollToSlide(index)}
            className={`${styles.navDot} ${activeSlide === index ? styles.active : ''}`}
          />
        ))}
      </div>

    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  // UI and input states
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  
  // Content states
  const [storyText, setStoryText] = useState('');
  const [slides, setSlides] = useState([]); // Now holds { imageUrl, caption, audioUrl, audioBlob }

  // Player states
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Refs for direct element control
  const audioRef = useRef(null);
  const playerRef = useRef(null); // Ref to the player screen for recording

  // Function to generate the initial story text
  const handleGenerateStory = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setStoryText('');
    setSlides([]);
    
    try {
      const response = await axios.get(`/api/v1/generate/story`, { params: { prompt } });
      setStoryText(response.data);
      await generateVideoContent(response.data);
    } catch (err) {
      console.error("Error generating story text:", err);
      setError("Failed to generate the story. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Function to generate images and audio based on text
  const generateVideoContent = async (text) => {
    setIsGenerating(true);
    setError(null);
    setSlides([]);
    setCurrentSlide(0);
    setIsPlaying(false);

    try {
      const parts = text.split('.').filter(sentence => sentence.trim().length > 0);
      const slidePromises = parts.map(async (part) => {
        const caption = part.trim() + '.';
        try {
          // Fetch image and audio for each part in parallel
          const [imageRes, audioRes] = await Promise.all([
            axios.get(`/api/v1/generate/images`, { params: { story: caption } }),
            axios.get(`/api/v1/generate/audio`, { params: { text: caption }, responseType: 'blob' }),
          ]);
          
          const audioBlob = new Blob([audioRes.data], { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(audioBlob);
          const imageUrl = imageRes.data[0]?.image_url; // Assuming the API returns an array

          if (!imageUrl) return null; // Skip if image generation failed for a part

          return { imageUrl, caption, audioUrl, audioBlob };
        } catch (partError) {
          console.error(`Failed to generate content for part: "${caption}"`, partError);
          return null; // Return null if any part fails
        }
      });
      
      const generatedSlides = (await Promise.all(slidePromises)).filter(Boolean); // Filter out any nulls
      
      if (generatedSlides.length === 0) {
        throw new Error("Could not generate any slides for the story.");
      }

      setSlides(generatedSlides);
    } catch (err) {
      console.error("Error generating video content:", err);
      setError("Failed to generate images or audio. The AI might be busy, please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Effect to play the audio for the current slide
  useEffect(() => {
    if (isPlaying && slides.length > 0 && audioRef.current) {
      audioRef.current.src = slides[currentSlide].audioUrl;
      audioRef.current.play().catch(e => console.error("Audio play failed:", e));
    }
  }, [currentSlide, isPlaying, slides]);

  const togglePlayPause = () => {
    if (!slides.length) return;
    const isNowPlaying = !isPlaying;
    setIsPlaying(isNowPlaying);

    if (isNowPlaying) {
      audioRef.current.play().catch(e => console.error("Audio play failed:", e));
    } else {
      audioRef.current.pause();
    }
  };

  // Automatically advance to the next slide when audio finishes
  const handleAudioEnded = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      // Story finished, reset to the beginning
      setIsPlaying(false);
      setCurrentSlide(0);
    }
  };
  
  // --- DOWNLOAD HANDLERS ---
  const handleDownloadStory = () => {
    const blob = new Blob([storyText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'story.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleDownloadAudio = async () => {
    const audioBlobs = slides.map(slide => slide.audioBlob);
    const combinedBlob = new Blob(audioBlobs, { type: 'audio/wav' });
    const url = URL.createObjectURL(combinedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'full_story_audio.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleDownloadVideo = () => {
    alert("Video recording will start. The final video will not include audio. Please stay on this tab until the story finishes playing.");

    const stream = playerRef.current.captureStream(30); // 30 FPS
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'story_video.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    recorder.start();
    // Start playback from beginning to record it
    setCurrentSlide(0);
    setIsPlaying(true);
    
    // Custom logic to stop recorder when playback finishes
    let slideIndex = 0;
    const audio = new Audio();
    audio.onended = () => {
        slideIndex++;
        if (slideIndex < slides.length) {
            audio.src = slides[slideIndex].audioUrl;
            audio.play();
        } else {
            recorder.stop();
        }
    };
    audio.src = slides[0].audioUrl;
    audio.play();
  };

  return (
    <div className="app-container">
      <header><h1>AI Story Video Generator 🎥</h1></header>
      
      <main>
        <div className="chatbox">
          <form onSubmit={handleGenerateStory}>
            <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A fox who wanted to fly..." disabled={isLoading}/>
            <button type="submit" disabled={isLoading}>{isLoading ? 'Generating...' : '✨ Create Story'}</button>
          </form>
        </div>

        {(isLoading || isGenerating) && (
            <div className="loading-indicator">
                <div className="spinner"></div>
                <p>{isLoading ? 'Writing your story...' : 'Creating visuals and audio...'}</p>
            </div>
        )}
        {error && <div className="error-message">{error}</div>}

        {storyText && !isGenerating && (
          <div className="story-editor">
            <h3>Your Generated Story</h3>
            <textarea value={storyText} onChange={(e) => setStoryText(e.target.value)} rows="6"></textarea>
            <div className='button-group'>
              <button onClick={() => generateVideoContent(storyText)}>🔄 Regenerate Video</button>
              <button onClick={handleDownloadStory}>📄 Download Story</button>
            </div>
          </div>
        )}

        {slides.length > 0 && !isGenerating && (
          <>
            <div className="video-player" ref={playerRef}>
              <div className="screen">
                <img key={currentSlide} src={slides[currentSlide].imageUrl} alt={slides[currentSlide].caption} />
                <div className="caption">{slides[currentSlide].caption}</div>
              </div>
            </div>
            
            <audio ref={audioRef} onEnded={handleAudioEnded} />

            <div className="controls-bar">
              <button onClick={togglePlayPause} className="play-pause-btn">{isPlaying ? '❚❚' : '▶'}</button>
              <button onClick={handleDownloadAudio}>🎵 Download Audio</button>
              <button onClick={handleDownloadVideo}>💾 Download Video (No Audio)</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
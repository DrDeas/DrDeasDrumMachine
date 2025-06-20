import React, { useState, useEffect, useRef } from "react";
import { useFireproof } from "use-fireproof";
import { callAI } from "call-ai";

export default function DrDeasDrumMachine() {
  const { database, useLiveQuery, useDocument } = useFireproof("drdeas-drum-patterns");
  
  // Current pattern being edited
  const { doc: currentPattern, merge: updatePattern, submit: savePattern } = useDocument({
    name: "New Pattern",
    tempo: 120,
    tracks: {
      kick: Array(16).fill(false),
      snare: Array(16).fill(false),
      openhat: Array(16).fill(false),
      closedhat: Array(16).fill(false),
      clap: Array(16).fill(false),
      crash: Array(16).fill(false),
      cowbell: Array(16).fill(false),
      clave: Array(16).fill(false)
    },
    levels: {
      kick: 80,
      snare: 70,
      openhat: 60,
      closedhat: 55,
      clap: 65,
      crash: 70,
      cowbell: 50,
      clave: 45
    },
    tune: {
      kick: 0,
      snare: 0,
      openhat: 0,
      closedhat: 0,
      clap: 0,
      crash: 0,
      cowbell: 0,
      clave: 0
    },
    decay: {
      kick: 50,
      snare: 30,
      openhat: 70,
      closedhat: 20,
      clap: 40,
      crash: 80,
      cowbell: 30,
      clave: 15
    },
    _files: {}
  });

  // Sample library document for storing user samples
  const { doc: sampleLibrary, merge: updateSampleLibrary } = useDocument({
    _id: "sample-library",
    type: "samples",
    _files: {}
  });

  // Get all saved patterns with type filter to avoid duplicates
  const { docs: allPatterns } = useLiveQuery("name");
  
  // Filter out duplicates and non-pattern documents
  const savedPatterns = allPatterns.filter(doc => 
    doc.name && 
    doc.tracks && 
    doc.type !== "samples"
  ).reduce((unique, pattern) => {
    // Remove duplicates based on name and tempo combination
    const key = `${pattern.name}-${pattern.tempo}`;
    if (!unique.some(p => `${p.name}-${p.tempo}` === key)) {
      unique.push(pattern);
    }
    return unique;
  }, []);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState("kick");
  const [playbackStep, setPlaybackStep] = useState(-1);
  const [audioContext, setAudioContext] = useState(null);
  const [audioBuffers, setAudioBuffers] = useState({});
  const [trackSampleMapping, setTrackSampleMapping] = useState({});
  const [dragOverTrack, setDragOverTrack] = useState(null);
  const [loadingBuffers, setLoadingBuffers] = useState(false);
  const [demoPatternsLoaded, setDemoPatternsLoaded] = useState(false);
  
  const sequencerRef = useRef(null);
  const currentPatternRef = useRef(currentPattern);
  const fileInputRef = useRef(null);
  
  // Track configuration
  const trackConfig = {
    kick: { name: "KICK", color: "bg-[#ff70a6]", border: "border-[#ff70a6]" },
    snare: { name: "SNARE", color: "bg-[#70d6ff]", border: "border-[#70d6ff]" },
    openhat: { name: "OPEN HAT", color: "bg-[#ffd670]", border: "border-[#ffd670]" },
    closedhat: { name: "CLOSED HAT", color: "bg-[#e9ff70]", border: "border-[#e9ff70]" },
    clap: { name: "HAND CLAP", color: "bg-[#ff9770]", border: "border-[#ff9770]" },
    crash: { name: "CRASH", color: "bg-[#ff70a6]", border: "border-[#ff70a6]" },
    cowbell: { name: "COWBELL", color: "bg-[#70d6ff]", border: "border-[#70d6ff]" },
    clave: { name: "CLAVE", color: "bg-[#ffd670]", border: "border-[#ffd670]" }
  };
  
  // Keep the currentPatternRef updated
  useEffect(() => {
    currentPatternRef.current = currentPattern;
  }, [currentPattern]);
  
  // Load audio buffers and create track mapping whenever files change
  useEffect(() => {
    if (audioContext) {
      loadAudioBuffersAndCreateMapping();
    }
  }, [audioContext, sampleLibrary._files, currentPattern._files]);
  
  const loadAudioBuffersAndCreateMapping = async () => {
    if (!audioContext) return;
    
    setLoadingBuffers(true);
    console.log("=== Loading Audio Buffers ===");
    
    const buffers = {};
    const mapping = {};
    
    try {
      // First, load all files and create buffers
      const allFiles = {
        ...sampleLibrary._files,
        ...currentPattern._files
      };
      
      console.log("All available files:", Object.keys(allFiles));
      
      for (const [fileName, fileData] of Object.entries(allFiles)) {
        if (fileData && typeof fileData.file === 'function') {
          try {
            console.log(`Loading: ${fileName}`);
            const file = await fileData.file();
            console.log(`File size: ${file.size}, type: ${file.type}`);
            
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            buffers[fileName] = audioBuffer;
            console.log(`✓ Successfully loaded: ${fileName}`);
          } catch (error) {
            console.error(`✗ Error loading ${fileName}:`, error);
          }
        } else {
          console.log(`Skipping ${fileName} - no file() method available`);
        }
      }
      
      // Then create track mapping - prioritize pattern-specific files
      const trackNames = Object.keys(trackConfig);
      
      for (const trackName of trackNames) {
        let assignedSample = null;
        
        // First check for exact track name in pattern files
        if (currentPattern._files && currentPattern._files[trackName]) {
          assignedSample = trackName;
          console.log(`Direct assignment: ${trackName} -> ${assignedSample}`);
        }
        // Then check for track name in any filename (pattern files first)
        else {
          // Check pattern files first
          for (const fileName of Object.keys(currentPattern._files || {})) {
            if (fileName.toLowerCase().includes(trackName.toLowerCase()) && buffers[fileName]) {
              assignedSample = fileName;
              console.log(`Pattern match: ${trackName} -> ${assignedSample}`);
              break;
            }
          }
          
          // If not found in pattern files, check library files
          if (!assignedSample) {
            for (const fileName of Object.keys(sampleLibrary._files || {})) {
              if (fileName.toLowerCase().includes(trackName.toLowerCase()) && buffers[fileName]) {
                assignedSample = fileName;
                console.log(`Library match: ${trackName} -> ${assignedSample}`);
                break;
              }
            }
          }
        }
        
        if (assignedSample) {
          mapping[trackName] = assignedSample;
        }
      }
      
      console.log("Final buffers:", Object.keys(buffers));
      console.log("Final mapping:", mapping);
      
      setAudioBuffers(buffers);
      setTrackSampleMapping(mapping);
      
    } catch (error) {
      console.error('Error in loadAudioBuffersAndCreateMapping:', error);
    }
    
    setLoadingBuffers(false);
  };
  
  // Update tempo immediately when changed
  useEffect(() => {
    if (isPlaying && sequencerRef.current) {
      // Clear the current interval
      clearInterval(sequencerRef.current);
      
      // Restart with new tempo
      const interval = 60000 / (currentPattern.tempo * 4); // 16th notes
      let stepIndex = playbackStep === -1 ? 0 : (playbackStep + 1) % 16;
      
      const playStep = () => {
        setPlaybackStep(stepIndex);
        
        // Play each track that has a step active - with safety checks
        if (currentPatternRef.current && currentPatternRef.current.tracks) {
          Object.entries(currentPatternRef.current.tracks).forEach(([trackName, steps]) => {
            if (steps && Array.isArray(steps) && steps[stepIndex]) {
              const levels = currentPatternRef.current.levels || {};
              const tune = currentPatternRef.current.tune || {};
              const decay = currentPatternRef.current.decay || {};
              
              const level = (levels[trackName] || 70) / 100;
              const tuneValue = tune[trackName] || 0;
              const decayValue = decay[trackName] || 50;
              
              try {
                playSample(trackName, audioContext.currentTime, level, tuneValue, decayValue);
              } catch (error) {
                console.log(`Error playing ${trackName}:`, error);
              }
            }
          });
        }
        
        stepIndex = (stepIndex + 1) % 16;
      };
      
      sequencerRef.current = setInterval(playStep, interval);
    }
  }, [currentPattern.tempo, isPlaying]);
  
  // Initialize audio context
  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    setAudioContext(ctx);
  }, []);
  
  // Play sample (either uploaded or synthesized) - SIMPLIFIED VERSION
  const playSample = (trackName, time, velocity = 0.8, tune = 0, decay = 50) => {
    console.log(`=== Playing ${trackName} ===`);
    console.log(`Velocity: ${velocity}, Tune: ${tune}, Decay: ${decay}`);
    console.log(`Track mapping:`, trackSampleMapping);
    console.log(`Available buffers:`, Object.keys(audioBuffers));
    
    // Check if we have a sample mapped to this track
    const sampleFileName = trackSampleMapping[trackName];
    
    if (sampleFileName && audioBuffers[sampleFileName]) {
      console.log(`🎵 Playing CUSTOM sample: ${sampleFileName} for track ${trackName}`);
      playAudioBuffer(audioBuffers[sampleFileName], time, velocity, tune, decay);
    } else {
      console.log(`🔊 Playing SYNTHESIZED sound for track ${trackName}`);
      // Fall back to synthesized sound
      const sounds = createDrumSounds(audioContext);
      if (sounds[trackName]) {
        sounds[trackName](time, velocity, tune, decay);
      } else {
        console.warn(`No synthesized sound available for ${trackName}`);
      }
    }
  };
  
  // Play audio buffer with effects
  const playAudioBuffer = (buffer, time, velocity, tune, decay) => {
    try {
      const source = audioContext.createBufferSource();
      const gainNode = audioContext.createGain();
      
      source.buffer = buffer;
      
      // Apply pitch shifting (tune)
      const playbackRate = Math.pow(2, tune / 12);
      source.playbackRate.setValueAtTime(playbackRate, time);
      
      // Apply volume and decay
      const duration = Math.max(0.1, (decay / 100) * 3); // Min 0.1s, max 3s decay
      gainNode.gain.setValueAtTime(velocity * 0.8, time); // Scale down a bit to avoid clipping
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
      
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      source.start(time);
      source.stop(time + duration);
      
      console.log(`✓ Audio buffer played successfully, duration: ${duration}s`);
    } catch (error) {
      console.error('✗ Error playing audio buffer:', error);
    }
  };
  
  // Handle file upload
  const handleFileUpload = async (files, trackName = null) => {
    const supportedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/aiff', 'audio/x-aiff', 'audio/flac', 'audio/ogg'];
    
    for (const file of Array.from(files)) {
      const isSupported = supportedTypes.includes(file.type) || 
                         file.name.match(/\.(wav|mp3|aiff|flac|ogg)$/i);
      
      if (isSupported) {
        console.log(`📁 Uploading file: ${file.name}, type: ${file.type}, size: ${file.size}`);
        
        if (trackName) {
          // Assign to specific track in current pattern
          console.log(`🎯 Assigning ${file.name} to track ${trackName}`);
          await updatePattern({
            _files: {
              ...currentPattern._files,
              [trackName]: file
            }
          });
        } else {
          // Add to global sample library with original filename
          console.log(`📚 Adding ${file.name} to global library`);
          await updateSampleLibrary({
            _files: {
              ...sampleLibrary._files,
              [file.name]: file
            }
          });
        }
      } else {
        console.warn(`⚠️ Unsupported file type: ${file.type} for file: ${file.name}`);
        alert(`Unsupported file type: ${file.name}. Please use WAV, MP3, AIFF, FLAC, or OGG files.`);
      }
    }
  };
  
  // Handle drag and drop
  const handleDragOver = (e, trackName = null) => {
    e.preventDefault();
    setDragOverTrack(trackName);
  };
  
  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOverTrack(null);
  };
  
  const handleDrop = async (e, trackName = null) => {
    e.preventDefault();
    setDragOverTrack(null);
    
    const files = e.dataTransfer.files;
    await handleFileUpload(files, trackName);
  };
  
  // Remove sample from track
  const removeSample = async (trackName) => {
    const newFiles = { ...currentPattern._files };
    delete newFiles[trackName];
    await updatePattern({ _files: newFiles });
  };
  
  // Get sample info for track (simplified)
  const getSampleForTrack = (trackName) => {
    return trackSampleMapping[trackName] || null;
  };
  
  // Create authentic drum sounds using Web Audio API (fallback for when no samples are loaded)
  const createDrumSounds = (audioContext) => {
    if (!audioContext) return {};
    
    return {
      kick: (time, velocity = 0.8, tune = 0, decay = 50) => {
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        
        // Two oscillators for that classic kick punch
        osc1.type = "sine";
        osc2.type = "triangle";
        
        const baseFreq = 60 * Math.pow(2, tune / 12);
        osc1.frequency.setValueAtTime(baseFreq, time);
        osc2.frequency.setValueAtTime(baseFreq * 0.5, time);
        
        // Pitch sweep down for punch
        osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.1, time + 0.1);
        osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.05, time + 0.1);
        
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(200, time);
        filter.Q.setValueAtTime(1, time);
        
        // Volume envelope
        const duration = (decay / 100) * 1.5;
        gain.gain.setValueAtTime(velocity, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(audioContext.destination);
        
        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);
      },
      
      snare: (time, velocity = 0.7, tune = 0, decay = 30) => {
        // Noise component
        const bufferSize = audioContext.sampleRate * 0.2;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate noise
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        
        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;
        
        // Tonal component (for that classic snare ring)
        const osc = audioContext.createOscillator();
        osc.type = "triangle";
        const oscFreq = 200 * Math.pow(2, tune / 12);
        osc.frequency.setValueAtTime(oscFreq, time);
        
        // Filters
        const noiseFilter = audioContext.createBiquadFilter();
        noiseFilter.type = "highpass";
        noiseFilter.frequency.setValueAtTime(1000, time);
        
        const oscFilter = audioContext.createBiquadFilter();
        oscFilter.type = "bandpass";
        oscFilter.frequency.setValueAtTime(200, time);
        oscFilter.Q.setValueAtTime(5, time);
        
        // Gains
        const noiseGain = audioContext.createGain();
        const oscGain = audioContext.createGain();
        const masterGain = audioContext.createGain();
        
        const duration = (decay / 100) * 0.3;
        
        // Noise envelope (quick attack/decay)
        noiseGain.gain.setValueAtTime(velocity * 0.8, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        // Tonal envelope (longer ring)
        oscGain.gain.setValueAtTime(velocity * 0.4, time);
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + duration * 2);
        
        masterGain.gain.setValueAtTime(1, time);
        
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        
        osc.connect(oscFilter);
        oscFilter.connect(oscGain);
        
        noiseGain.connect(masterGain);
        oscGain.connect(masterGain);
        masterGain.connect(audioContext.destination);
        
        noise.start(time);
        osc.start(time);
        noise.stop(time + duration);
        osc.stop(time + duration * 2);
      },
      
      openhat: (time, velocity = 0.6, tune = 0, decay = 70) => {
        // Multiple oscillators for metallic sound
        const oscs = [];
        const gains = [];
        const freqs = [8372, 9956, 11850, 14134].map(f => f * Math.pow(2, tune / 12));
        
        freqs.forEach((freq, i) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          
          osc.type = "square";
          osc.frequency.setValueAtTime(freq, time);
          
          const duration = (decay / 100) * 0.8;
          gain.gain.setValueAtTime(velocity * 0.1 * (1 - i * 0.1), time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
          
          osc.connect(gain);
          gain.connect(audioContext.destination);
          
          oscs.push(osc);
          gains.push(gain);
          
          osc.start(time);
          osc.stop(time + duration);
        });
      },
      
      closedhat: (time, velocity = 0.5, tune = 0, decay = 20) => {
        // Similar to open hat but much shorter and higher pitched
        const oscs = [];
        const gains = [];
        const freqs = [10000, 12000, 14000, 16000].map(f => f * Math.pow(2, tune / 12));
        
        freqs.forEach((freq, i) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          
          osc.type = "square";
          osc.frequency.setValueAtTime(freq, time);
          
          const duration = (decay / 100) * 0.1;
          gain.gain.setValueAtTime(velocity * 0.05 * (1 - i * 0.1), time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
          
          osc.connect(gain);
          gain.connect(audioContext.destination);
          
          oscs.push(osc);
          gains.push(gain);
          
          osc.start(time);
          osc.stop(time + duration);
        });
      },
      
      clap: (time, velocity = 0.6, tune = 0, decay = 40) => {
        // Multiple short noise bursts with slight delays
        const delays = [0, 0.01, 0.02, 0.04];
        
        delays.forEach(delay => {
          const bufferSize = audioContext.sampleRate * 0.05;
          const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
          const data = buffer.getChannelData(0);
          
          for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
          }
          
          const noise = audioContext.createBufferSource();
          noise.buffer = buffer;
          
          const filter = audioContext.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(1000 * Math.pow(2, tune / 12), time);
          filter.Q.setValueAtTime(3, time);
          
          const gain = audioContext.createGain();
          const duration = (decay / 100) * 0.2;
          
          gain.gain.setValueAtTime(velocity * 0.6, time + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, time + delay + duration);
          
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(audioContext.destination);
          
          noise.start(time + delay);
          noise.stop(time + delay + duration);
        });
      },
      
      crash: (time, velocity = 0.7, tune = 0, decay = 80) => {
        // Complex metallic crash with multiple frequencies
        const oscs = [];
        const freqs = [4186, 5274, 6645, 8372, 10548].map(f => f * Math.pow(2, tune / 12));
        
        freqs.forEach((freq, i) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freq, time);
          
          const duration = (decay / 100) * 2;
          gain.gain.setValueAtTime(velocity * 0.08 * (1 - i * 0.15), time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
          
          osc.connect(gain);
          gain.connect(audioContext.destination);
          
          oscs.push(osc);
          
          osc.start(time);
          osc.stop(time + duration);
        });
      },
      
      cowbell: (time, velocity = 0.5, tune = 0, decay = 30) => {
        // Two sine waves for that classic cowbell tone
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc1.type = "triangle";
        osc2.type = "triangle";
        
        const freq1 = 562 * Math.pow(2, tune / 12);
        const freq2 = 845 * Math.pow(2, tune / 12);
        
        osc1.frequency.setValueAtTime(freq1, time);
        osc2.frequency.setValueAtTime(freq2, time);
        
        const duration = (decay / 100) * 0.4;
        gain.gain.setValueAtTime(velocity * 0.6, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioContext.destination);
        
        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);
      },
      
      clave: (time, velocity = 0.4, tune = 0, decay = 15) => {
        // Sharp, short wooden sound
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        
        osc.type = "triangle";
        const freq = 2500 * Math.pow(2, tune / 12);
        osc.frequency.setValueAtTime(freq, time);
        
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(2500, time);
        filter.Q.setValueAtTime(10, time);
        
        const duration = (decay / 100) * 0.15;
        gain.gain.setValueAtTime(velocity * 0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioContext.destination);
        
        osc.start(time);
        osc.stop(time + duration);
      }
    };
  };
  
  // Start/stop sequencer
  const togglePlay = () => {
    if (!isPlaying && audioContext) {
      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      let stepIndex = 0;
      const interval = 60000 / (currentPattern.tempo * 4); // 16th notes
      
      const playStep = () => {
        setPlaybackStep(stepIndex);
        
        // Play each track that has a step active - WITH SAFETY CHECKS
        if (currentPatternRef.current && currentPatternRef.current.tracks) {
          Object.entries(currentPatternRef.current.tracks).forEach(([trackName, steps]) => {
            if (steps && Array.isArray(steps) && steps[stepIndex]) {
              const levels = currentPatternRef.current.levels || {};
              const tune = currentPatternRef.current.tune || {};
              const decay = currentPatternRef.current.decay || {};
              
              const level = (levels[trackName] || 70) / 100;
              const tuneValue = tune[trackName] || 0;
              const decayValue = decay[trackName] || 50;
              
              try {
                // Play with current audio context time for precise timing
                playSample(trackName, audioContext.currentTime, level, tuneValue, decayValue);
              } catch (error) {
                console.log(`Error playing ${trackName}:`, error);
              }
            }
          });
        }
        
        stepIndex = (stepIndex + 1) % 16;
      };
      
      // Start the sequencer
      playStep(); // Play first step immediately
      sequencerRef.current = setInterval(playStep, interval);
      setIsPlaying(true);
    } else {
      // Stop the sequencer
      if (sequencerRef.current) {
        clearInterval(sequencerRef.current);
        sequencerRef.current = null;
      }
      setPlaybackStep(-1);
      setIsPlaying(false);
    }
  };
  
  // Toggle step for selected track
  const toggleStep = (stepIndex) => {
    // Safety check for tracks
    const currentTracks = currentPattern.tracks || {};
    const newTracks = { ...currentTracks };
    
    if (!newTracks[selectedTrack]) {
      newTracks[selectedTrack] = Array(16).fill(false);
    }
    
    newTracks[selectedTrack] = [...(newTracks[selectedTrack] || Array(16).fill(false))];
    newTracks[selectedTrack][stepIndex] = !newTracks[selectedTrack][stepIndex];
    updatePattern({ tracks: newTracks });
    
    // Preview the sound if not playing and step is now active
    if (!isPlaying && newTracks[selectedTrack][stepIndex] && audioContext) {
      const levels = currentPattern.levels || {};
      const tune = currentPattern.tune || {};
      const decay = currentPattern.decay || {};
      
      const level = (levels[selectedTrack] || 70) / 100;
      const tuneValue = tune[selectedTrack] || 0;
      const decayValue = decay[selectedTrack] || 50;
      
      try {
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        playSample(selectedTrack, audioContext.currentTime, level, tuneValue, decayValue);
      } catch (error) {
        console.log(`Error previewing ${selectedTrack}:`, error);
      }
    }
  };
  
  // Update track parameter
  const updateTrackParam = (track, param, value) => {
    const currentParam = currentPattern[param] || {};
    const newParam = { ...currentParam };
    newParam[track] = value;
    updatePattern({ [param]: newParam });
  };
  
  // Load pattern with safety checks
  const loadPattern = (pattern) => {
    updatePattern({
      _id: pattern._id,
      name: pattern.name,
      tempo: pattern.tempo || 120,
      tracks: pattern.tracks || {
        kick: Array(16).fill(false),
        snare: Array(16).fill(false),
        openhat: Array(16).fill(false),
        closedhat: Array(16).fill(false),
        clap: Array(16).fill(false),
        crash: Array(16).fill(false),
        cowbell: Array(16).fill(false),
        clave: Array(16).fill(false)
      },
      levels: pattern.levels || {
        kick: 80, snare: 70, openhat: 60, closedhat: 55,
        clap: 65, crash: 70, cowbell: 50, clave: 45
      },
      tune: pattern.tune || {
        kick: 0, snare: 0, openhat: 0, closedhat: 0,
        clap: 0, crash: 0, cowbell: 0, clave: 0
      },
      decay: pattern.decay || {
        kick: 50, snare: 30, openhat: 70, closedhat: 20,
        clap: 40, crash: 80, cowbell: 30, clave: 15
      },
      _files: pattern._files || {}
    });
    
    setSelectedPattern(pattern._id);
  };
  
  // Create new pattern
  const createNewPattern = () => {
    updatePattern({
      name: "New Pattern",
      tempo: 120,
      tracks: {
        kick: Array(16).fill(false),
        snare: Array(16).fill(false),
        openhat: Array(16).fill(false),
        closedhat: Array(16).fill(false),
        clap: Array(16).fill(false),
        crash: Array(16).fill(false),
        cowbell: Array(16).fill(false),
        clave: Array(16).fill(false)
      },
      levels: {
        kick: 80, snare: 70, openhat: 60, closedhat: 55,
        clap: 65, crash: 70, cowbell: 50, clave: 45
      },
      tune: {
        kick: 0, snare: 0, openhat: 0, closedhat: 0,
        clap: 0, crash: 0, cowbell: 0, clave: 0
      },
      decay: {
        kick: 50, snare: 30, openhat: 70, closedhat: 20,
        clap: 40, crash: 80, cowbell: 30, clave: 15
      },
      _files: {}
    });
    setSelectedPattern(null);
  };
  
  // Generate pattern with AI
  const generatePattern = async () => {
    try {
      const result = await callAI("Create a drum pattern with 16 steps. Include kick, snare, hi-hats (open and closed), claps, crash, cowbell, and clave. Make it sound like a classic hip-hop or electronic beat with good groove and dynamics.", {
        schema: {
          properties: {
            tracks: {
              type: "object",
              properties: {
                kick: { type: "array", items: { type: "boolean" } },
                snare: { type: "array", items: { type: "boolean" } },
                openhat: { type: "array", items: { type: "boolean" } },
                closedhat: { type: "array", items: { type: "boolean" } },
                clap: { type: "array", items: { type: "boolean" } },
                crash: { type: "array", items: { type: "boolean" } },
                cowbell: { type: "array", items: { type: "boolean" } },
                clave: { type: "array", items: { type: "boolean" } }
              }
            },
            description: { type: "string" }
          }
        }
      });
      
      const patternData = JSON.parse(result);
      
      // Ensure we have exactly 16 steps for each track
      const tracks = {};
      Object.entries(patternData.tracks).forEach(([track, steps]) => {
        tracks[track] = steps ? steps.slice(0, 16) : Array(16).fill(false);
        while (tracks[track].length < 16) {
          tracks[track].push(false);
        }
      });
      
      updatePattern({
        name: "AI Generated Pattern",
        tracks: tracks,
        tempo: currentPattern.tempo,
        levels: currentPattern.levels,
        tune: currentPattern.tune,
        decay: currentPattern.decay,
        _files: currentPattern._files,
        description: patternData.description
      });
    } catch (error) {
      console.error("Error generating pattern:", error);
    }
  };
  
  // Demo pattern examples with duplicate prevention
  const loadDemoPatterns = async () => {
    if (demoPatternsLoaded) {
      console.log("Demo patterns already loaded, skipping...");
      return;
    }
    
    const demoPatterns = [
      {
        name: "Classic Hip-Hop",
        tempo: 90,
        tracks: {
          kick: [true, false, false, false, false, false, true, false, false, true, false, false, false, false, false, false],
          snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
          openhat: [false, false, true, false, false, false, false, false, false, false, true, false, false, false, false, false],
          closedhat: [false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true],
          clap: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
          crash: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
          cowbell: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
          clave: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]
        }
      },
      {
        name: "Electro Funk",
        tempo: 120,
        tracks: {
          kick: [true, false, false, true, false, false, true, false, true, false, false, false, false, false, false, false],
          snare: [false, false, false, false, true, false, false, true, false, false, false, false, true, false, false, false],
          openhat: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, false],
          closedhat: [false, true, true, false, false, true, false, false, false, true, true, false, false, true, false, true],
          clap: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
          crash: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
          cowbell: [false, false, true, false, false, false, false, false, false, false, true, false, false, false, false, false],
          clave: [true, false, false, true, false, true, false, false, true, false, false, true, false, true, false, false]
        }
      }
    ];
    
    // Check if patterns already exist before adding
    for (const pattern of demoPatterns) {
      const existingPattern = savedPatterns.find(p => p.name === pattern.name && p.tempo === pattern.tempo);
      if (!existingPattern) {
        console.log(`Adding demo pattern: ${pattern.name}`);
        await database.put(pattern);
      } else {
        console.log(`Demo pattern ${pattern.name} already exists, skipping...`);
      }
    }
    
    setDemoPatternsLoaded(true);
  };
  
  // Clear selected track
  const clearTrack = () => {
    const currentTracks = currentPattern.tracks || {};
    const newTracks = { ...currentTracks };
    newTracks[selectedTrack] = Array(16).fill(false);
    updatePattern({ tracks: newTracks });
  };
  
  // Test sample playback
  const testSample = (trackName) => {
    if (audioContext) {
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      const levels = currentPattern.levels || {};
      const tune = currentPattern.tune || {};
      const decay = currentPattern.decay || {};
      
      const level = (levels[trackName] || 70) / 100;
      const tuneValue = tune[trackName] || 0;
      const decayValue = decay[trackName] || 50;
      
      playSample(trackName, audioContext.currentTime, level, tuneValue, decayValue);
    }
  };
  
  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
      {/* Background pattern */}
      <div className="fixed inset-0 opacity-5">
        <div className="w-full h-full" style={{
          backgroundImage: `radial-gradient(circle at 20px 20px, #ffd670 2px, transparent 2px)`,
          backgroundSize: '40px 40px'
        }}></div>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".wav,.mp3,.aiff,.flac,.ogg,audio/*"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />
      
      <div className="relative max-w-6xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-5xl font-bold mb-2 text-[#ffd670]">Dr. Deas Drum Machine</h1>
          <p className="text-lg italic text-gray-300 mb-4">
            *Program legendary drum patterns with a classic step sequencer workflow. Select tracks, trigger steps, and **drag & drop your own audio samples** to replace the synthesized sounds.*
          </p>
          <p className="text-md italic text-gray-400">
            **Supports WAV, MP3, AIFF, FLAC, and OGG files. Drag samples onto track buttons or use the upload area below to load your own sounds!**
          </p>
          {loadingBuffers && (
            <p className="text-sm text-[#ff70a6] animate-pulse">
              Loading audio samples...
            </p>
          )}
        </div>
        
        <div className="bg-[#242424] rounded-lg border-4 border-[#ffd670] p-6 mb-6 shadow-2xl">
          {/* Transport and Pattern Controls */}
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="flex-1 bg-black border-4 border-[#70d6ff] rounded-md p-4 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl font-bold text-[#e9ff70] mb-2">
                  {currentPattern.tempo} BPM
                </div>
                <div className="font-mono text-lg">
                  {isPlaying && <span className="animate-pulse text-[#ff70a6]">● PLAYING</span>}
                  {!isPlaying && <span className="text-gray-400">STOPPED</span>}
                </div>
                <div className="mt-2 text-lg text-[#ffd670]">
                  TRACK: {trackConfig[selectedTrack] ? trackConfig[selectedTrack].name : selectedTrack.toUpperCase()}
                </div>
                {/* Show if track has custom sample */}
                {getSampleForTrack(selectedTrack) && (
                  <div className="mt-1 text-xs text-[#ff70a6]">
                    📁 {getSampleForTrack(selectedTrack)}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex-1 flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentPattern.name}
                  onChange={(e) => updatePattern({ name: e.target.value })}
                  className="flex-grow px-3 py-2 bg-black text-white border-2 border-[#70d6ff] rounded font-mono"
                  placeholder="Pattern Name"
                />
                <button
                  onClick={() => savePattern()}
                  className="px-6 py-2 bg-[#70d6ff] text-black rounded font-bold hover:bg-blue-400 transition"
                >
                  SAVE
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={togglePlay}
                  className={`flex-1 py-3 px-4 text-white rounded font-bold text-xl transition ${
                    isPlaying ? "bg-[#ff9770] hover:bg-orange-500" : "bg-[#ff70a6] hover:bg-pink-600"
                  }`}
                >
                  {isPlaying ? "■ STOP" : "▶ PLAY"}
                </button>
                <button
                  onClick={createNewPattern}
                  className="px-6 py-3 bg-[#e9ff70] text-black rounded font-bold hover:bg-lime-300 transition"
                >
                  NEW
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={generatePattern}
                  className="flex-1 px-4 py-2 bg-[#ffd670] text-black rounded font-bold hover:bg-yellow-400 transition"
                >
                  AI GENERATE
                </button>
                <button
                  onClick={loadDemoPatterns}
                  className="flex-1 px-4 py-2 bg-[#ff9770] text-black rounded font-bold hover:bg-orange-400 transition"
                >
                  DEMO PATTERNS
                </button>
              </div>
            </div>
            
            <div className="flex-1">
              <div className="mb-3">
                <label className="block text-sm font-bold mb-1 text-[#ffd670]">TEMPO</label>
                <input
                  type="range"
                  min="60"
                  max="200"
                  value={currentPattern.tempo}
                  onChange={(e) => updatePattern({ tempo: parseInt(e.target.value) })}
                  className="w-full mb-1"
                />
                <span className="text-sm text-center block">{currentPattern.tempo} BPM</span>
              </div>
              
              <button
                onClick={clearTrack}
                className="w-full py-2 bg-red-600 text-white rounded font-bold hover:bg-red-500 transition mb-2"
              >
                CLEAR {trackConfig[selectedTrack] ? trackConfig[selectedTrack].name : selectedTrack.toUpperCase()}
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 bg-[#ff70a6] text-white rounded font-bold hover:bg-pink-500 transition"
              >
                📁 UPLOAD SAMPLES
              </button>
            </div>
          </div>
          
          {/* Sample Upload Area */}
          <div 
            className="mb-6 p-4 border-2 border-dashed border-[#ffd670] rounded-lg text-center bg-black"
            onDragOver={(e) => handleDragOver(e)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e)}
          >
            <div className="text-[#ffd670] mb-2">
              <span className="text-2xl">📁</span>
            </div>
            <p className="text-sm italic">
              **Drag & drop audio files here** (WAV, MP3, AIFF, FLAC, OGG) to add to sample library
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Or drag directly onto track buttons to assign samples to specific drums
            </p>
            
            {/* Show uploaded samples with test buttons */}
            {Object.keys(sampleLibrary._files || {}).length > 0 && (
              <div className="mt-3 text-left">
                <div className="text-xs font-bold text-[#70d6ff] mb-1">GLOBAL SAMPLE LIBRARY:</div>
                <div className="text-xs text-gray-300 space-y-1 max-h-20 overflow-y-auto">
                  {Object.keys(sampleLibrary._files).map(fileName => (
                    <div key={fileName} className="flex justify-between items-center">
                      <span className="truncate">{fileName}</span>
                      <button
                        onClick={() => {
                          // Test global library sample
                          if (audioBuffers[fileName]) {
                            playAudioBuffer(audioBuffers[fileName], audioContext.currentTime, 0.7, 0, 50);
                          }
                        }}
                        className="text-[#ff70a6] hover:text-[#ff9770] text-xs"
                        title="Test sample"
                      >
                        ▶
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Track Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-bold mb-3 text-[#ffd670]">SELECT INSTRUMENT (Drag samples here)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(trackConfig).map(([track, config]) => {
                const sampleFile = getSampleForTrack(track);
                return (
                  <div
                    key={track}
                    className={`relative transition-all duration-200 ${
                      dragOverTrack === track ? 'scale-105 shadow-lg' : ''
                    }`}
                    onDragOver={(e) => handleDragOver(e, track)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, track)}
                  >
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSelectedTrack(track)}
                        className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition border-2 relative ${
                          selectedTrack === track 
                            ? `${config.color} ${config.border} text-black` 
                            : `bg-gray-700 border-gray-600 hover:bg-gray-600 text-white ${
                                dragOverTrack === track ? 'border-[#ffd670] bg-gray-600' : ''
                              }`
                        }`}
                      >
                        {config.name}
                        {sampleFile && (
                          <span className="absolute -top-1 -right-1 text-xs">📁</span>
                        )}
                      </button>
                      <button
                        onClick={() => testSample(track)}
                        className="w-10 py-3 bg-[#ff70a6] hover:bg-[#ff9770] text-white rounded font-bold text-sm transition"
                        title="Test sound"
                      >
                        ▶
                      </button>
                    </div>
                    {sampleFile && currentPattern._files && currentPattern._files[track] && (
                      <button
                        onClick={() => removeSample(track)}
                        className="absolute -top-2 -left-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full hover:bg-red-600 transition"
                        title="Remove sample"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Step Sequencer */}
          <div className="mb-6">
            <h3 className="text-lg font-bold mb-3 text-[#ff70a6]">STEP SEQUENCER</h3>
            <div className="bg-black p-4 rounded-lg border-2 border-[#ff70a6]">
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-sm">STEPS 1-8</span>
                <span className="font-bold text-sm">STEPS 9-16</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {/* First 8 steps */}
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({ length: 8 }, (_, i) => {
                    const tracks = currentPattern.tracks || {};
                    const selectedTrackSteps = tracks[selectedTrack] || Array(16).fill(false);
                    const isActive = selectedTrackSteps[i];
                    return (
                      <button
                        key={i}
                        onClick={() => toggleStep(i)}
                        className={`aspect-square rounded font-bold text-xs transition border-2 ${
                          isActive
                            ? `${trackConfig[selectedTrack].color} ${trackConfig[selectedTrack].border} text-black`
                            : playbackStep === i
                            ? "bg-white border-white text-black"
                            : "bg-gray-700 border-gray-600 hover:bg-gray-600 text-white"
                        }`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                
                {/* Last 8 steps */}
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({ length: 8 }, (_, i) => {
                    const stepIndex = i + 8;
                    const tracks = currentPattern.tracks || {};
                    const selectedTrackSteps = tracks[selectedTrack] || Array(16).fill(false);
                    const isActive = selectedTrackSteps[stepIndex];
                    return (
                      <button
                        key={stepIndex}
                        onClick={() => toggleStep(stepIndex)}
                        className={`aspect-square rounded font-bold text-xs transition border-2 ${
                          isActive
                            ? `${trackConfig[selectedTrack].color} ${trackConfig[selectedTrack].border} text-black`
                            : playbackStep === stepIndex
                            ? "bg-white border-white text-black"
                            : "bg-gray-700 border-gray-600 hover:bg-gray-600 text-white"
                        }`}
                      >
                        {stepIndex + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Track pattern overview */}
              <div className="mt-4 text-center text-sm">
                <span className="text-gray-400">Pattern for {trackConfig[selectedTrack].name}:</span>
                <div className="font-mono mt-1 text-xs">
                  {(() => {
                    const tracks = currentPattern.tracks || {};
                    const selectedTrackSteps = tracks[selectedTrack] || Array(16).fill(false);
                    return selectedTrackSteps.map((step, i) => step ? "●" : "○").join(" ");
                  })()}
                </div>
              </div>
            </div>
          </div>
          
          {/* Sound Parameters */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Level Control */}
            <div className="bg-black p-4 rounded-lg border-2 border-[#70d6ff]">
              <h4 className="text-lg font-bold mb-3 text-[#70d6ff]">LEVEL</h4>
              <div className="space-y-3">
                {Object.entries(trackConfig).map(([track, config]) => {
                  const levels = currentPattern.levels || {};
                  return (
                    <div key={track} className="flex items-center gap-3">
                      <label className="text-xs font-bold w-16 text-right">{config.name.split(" ")[0]}</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={levels[track] || 50}
                        onChange={(e) => updateTrackParam(track, "levels", parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-xs w-8">{levels[track] || 50}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Tune Control */}
            <div className="bg-black p-4 rounded-lg border-2 border-[#ffd670]">
              <h4 className="text-lg font-bold mb-3 text-[#ffd670]">TUNE</h4>
              <div className="space-y-3">
                {Object.entries(trackConfig).map(([track, config]) => {
                  const tune = currentPattern.tune || {};
                  return (
                    <div key={track} className="flex items-center gap-3">
                      <label className="text-xs font-bold w-16 text-right">{config.name.split(" ")[0]}</label>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        value={tune[track] || 0}
                        onChange={(e) => updateTrackParam(track, "tune", parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-xs w-8">{(tune[track] || 0) > 0 ? '+' : ''}{tune[track] || 0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Decay Control */}
            <div className="bg-black p-4 rounded-lg border-2 border-[#ff9770]">
              <h4 className="text-lg font-bold mb-3 text-[#ff9770]">DECAY</h4>
              <div className="space-y-3">
                {Object.entries(trackConfig).map(([track, config]) => {
                  const decay = currentPattern.decay || {};
                  return (
                    <div key={track} className="flex items-center gap-3">
                      <label className="text-xs font-bold w-16 text-right">{config.name.split(" ")[0]}</label>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={decay[track] || 50}
                        onChange={(e) => updateTrackParam(track, "decay", parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-xs w-8">{decay[track] || 50}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        
        {/* Saved Patterns and Instructions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#242424] rounded-lg border-4 border-[#70d6ff] p-4 shadow-xl">
            <h3 className="text-xl font-bold mb-3 text-[#70d6ff]">Saved Patterns ({savedPatterns.length})</h3>
            <div className="max-h-60 overflow-y-auto p-3 bg-black rounded border-2 border-[#ff70a6]">
              {savedPatterns.length === 0 ? (
                <p className="text-gray-400 italic">No saved patterns yet...</p>
              ) : (
                <ul className="space-y-1">
                  {savedPatterns.map((pattern) => (
                    <li key={pattern._id}>
                      <button
                        onClick={() => loadPattern(pattern)}
                        className={`w-full text-left px-3 py-2 rounded transition font-mono text-sm ${
                          selectedPattern === pattern._id
                            ? "bg-[#ff70a6] text-white"
                            : "hover:bg-gray-700"
                        }`}
                      >
                        {pattern.name} ({pattern.tempo || 120} BPM)
                        {pattern._files && Object.keys(pattern._files).length > 0 && (
                          <span className="float-right text-xs">📁</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          
          <div className="bg-[#242424] rounded-lg border-4 border-[#ff70a6] p-4 shadow-xl">
            <h3 className="text-xl font-bold mb-3 text-[#ff70a6]">How to Use</h3>
            <div className="text-sm text-gray-300 space-y-2">
              <p className="italic">
                **Select a Track:** Click track buttons to choose which drum sound to program. Each track has independent level, tune, and decay controls.
              </p>
              <p className="italic">
                **Program Steps:** Click numbered step buttons (1-16) to trigger that drum on that beat. Active steps light up with the track's color.
              </p>
              <p className="italic">
                **Add Samples:** Drag audio files onto track buttons or the upload area. Your samples will replace the synthesized sounds with full pitch and decay control.
              </p>
              <p className="italic">
                **Save & Load:** Name your patterns and save them. Load demo patterns to get started, or use AI generation for inspiration!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

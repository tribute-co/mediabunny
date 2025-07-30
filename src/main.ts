import './style.css'

// Demo media URLs for sequential playbook (videos and images)
const demoMediaUrls: MediaItem[] = [
  { url: 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Brian.mp4', type: 'video' },
  { url: 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/pexels-noelace-32608050.jpg', type: 'image', duration: 5 },
  { url: 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Vaibhav.mp4', type: 'video' },
  { url: 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/abbey_bradley (720p).mp4', type: 'video' }
]

type MediaItem = {
  url: string
  type: 'video' | 'image'
  duration?: number // For images, in seconds
}

type MediaElement = HTMLVideoElement | HTMLImageElement

class MediabunnyPlayer {
  private container!: HTMLElement
  private videoContainer!: HTMLElement
  private playButton!: HTMLButtonElement
  private muteButton!: HTMLButtonElement
  private progressBar!: HTMLInputElement
  private timeDisplay!: HTMLDivElement
  private statusDisplay!: HTMLDivElement
  private playlistElement!: HTMLElement
  
  private currentIndex = 0
  private isPlaying = false
  private isMuted = true // Start muted by default for better Safari compatibility
  private isSwitchingMedia = false // Flag to prevent event interference during media switches
  private hasUserInteracted = false // Track if user has interacted (for master video)
  private currentTime = 0
  private duration = 0
  private currentMedia: MediaElement | null = null
  private persistentVideo: HTMLVideoElement | null = null // Single reusable video element
  private currentMediaEventListeners: { [key: string]: EventListener } = {}
  private imageTimer: number | null = null
  private imageStartTime: number = 0
  private backgroundMusic: HTMLAudioElement | null = null
  private musicVolumes = { video: 0.1, image: 0.9 } // 10% for videos, 90% for images
  private masterVideo: HTMLVideoElement | null = null // Single master video for Safari autoplay context
  private audioContext: AudioContext | null = null // Web Audio API context for mobile volume control
  private musicSource: MediaElementAudioSourceNode | null = null // Web Audio source
  private musicGain: GainNode | null = null // Web Audio gain node for volume control

  constructor(container: HTMLElement) {
    this.container = container
    this.setupUI()
    this.setupEventListeners()
    this.setupBackgroundMusic()
    this.setupMasterVideo()
    this.setupPersistentVideo()
    this.loadCurrentMedia(false) // Don't auto-play initial media
  }

  private setupUI() {
    this.container.innerHTML = `
      <div class="mediabunny-player">
        <div class="player-header">
          <h1>🎬 Mediabunny Player</h1>
          <p>Sequential media playback with mobile-optimized audio ducking</p>
        </div>

        <div class="video-container">
          <div class="media-display"></div>
          <div class="video-overlay">
            <div class="play-overlay">
              <button class="play-overlay-btn">▶</button>
            </div>
          </div>
        </div>

        <div class="controls">
          <button id="playBtn" class="control-btn">▶</button>
          <button id="muteBtn" class="control-btn">🔇</button>
          <input type="range" id="progress" class="progress-bar" min="0" max="100" value="0">
          <div id="timeDisplay" class="time-display">0:00 / 0:00</div>
        </div>

        <div class="playlist">
          <h3>Playlist</h3>
          <div id="playlistItems" class="playlist-items"></div>
        </div>

        <div id="status" class="status"></div>
      </div>
    `

    // Get references to elements
    this.videoContainer = this.container.querySelector('.media-display') as HTMLElement
    this.playButton = this.container.querySelector('#playBtn') as HTMLButtonElement
    this.muteButton = this.container.querySelector('#muteBtn') as HTMLButtonElement
    this.progressBar = this.container.querySelector('#progress') as HTMLInputElement
    this.timeDisplay = this.container.querySelector('#timeDisplay') as HTMLDivElement
    this.statusDisplay = this.container.querySelector('#status') as HTMLDivElement
    this.playlistElement = this.container.querySelector('#playlistItems') as HTMLElement

    // Initialize basic player
    this.updateStatus('Basic media player initialized')

    this.setupPlaylist()
  }

  private setupPlaylist() {
    this.playlistElement.innerHTML = demoMediaUrls.map((item, index) => {
      const filename = item.url.split('/').pop() || `Media ${index + 1}`
      return `
        <div class="playlist-item ${index === this.currentIndex ? 'active' : ''}" data-index="${index}">
          <span class="playlist-number">${index + 1}</span>
          <span class="playlist-title">${filename.replace('.mp4', '').replace('.jpg', '')}</span>
        </div>
      `
    }).join('')
  }

  private setupEventListeners() {
    // Play button
    this.playButton.addEventListener('click', () => this.togglePlay())

    // Play overlay
    const playOverlay = this.container.querySelector('.play-overlay-btn') as HTMLButtonElement
    playOverlay.addEventListener('click', () => this.togglePlay())

    // Mute button
    this.muteButton.addEventListener('click', () => this.toggleMute())

    // Progress bar
    this.progressBar.addEventListener('input', () => this.seek())

    // Playlist items
    this.playlistElement.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.playlist-item') as HTMLElement
      if (item) {
        const index = parseInt(item.dataset.index!)
        if (index !== this.currentIndex) { // Only switch if different video
          console.log(`Switching to media ${index + 1}`)
          // Always auto-play when clicking playlist items for better UX
          this.switchToMedia(index, true)
        }
      }
    })

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          this.togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          this.seek(Math.max(0, this.currentTime - 10))
          break
        case 'ArrowRight':
          e.preventDefault()
          this.seek(Math.min(this.duration, this.currentTime + 10))
          break
        case 'ArrowUp':
          e.preventDefault()
          this.goToPreviousMedia()
          break
        case 'ArrowDown':
          e.preventDefault()
          this.goToNextMedia()
          break
      }
    })

    // Window resize handler
    window.addEventListener('resize', () => {
      this.resizeCanvasToMedia()
    })
  }

  private async loadCurrentMedia(autoPlay: boolean = false) {
    try {
      this.updateStatus('Loading media...')
      
      // Clean up previous media
      if (this.currentMedia) {
        // Remove event listeners before switching media
        this.removeMediaEventListeners()
        this.clearImageTimer()
        
        if (this.currentMedia instanceof HTMLVideoElement) {
          // For videos, just pause - don't remove the persistent video
          this.currentMedia.pause()
          this.currentMedia.style.display = 'none'
        } else if (this.currentMedia instanceof HTMLImageElement) {
          // For images, remove from DOM as usual
          this.currentMedia.remove()
        }
        
        this.currentMedia = null
      }

      const mediaItem = demoMediaUrls[this.currentIndex]
      
      if (mediaItem.type === 'video') {
        await this.loadVideo(mediaItem, autoPlay)
      } else if (mediaItem.type === 'image') {
        await this.loadImage(mediaItem, autoPlay)
      }
      
      // Set up event listeners for the loaded media
      this.setupMediaEventListeners()
      
      // Adjust music volume based on media type
      this.adjustMusicVolume(mediaItem.type)
      
      // Sync master video with current state
      this.syncMasterVideo()
      
      // Start background music sync - but only if not auto-playing videos
      // (videos that autoplay will sync music after successful play)
      const willAutoPlay = autoPlay && mediaItem.type === 'video' && this.hasUserInteracted
      if (!willAutoPlay) {
        console.log('Syncing music for non-autoplay scenario')
        this.syncMusicPlayback()
      } else {
        console.log('Skipping music sync - will sync after video autoplay succeeds')
      }
      
      this.updatePlaylist()
      
    } catch (error) {
      console.error('Error loading media:', error)
      this.updateStatus(`Error loading media: ${error}`)
    }
  }

  private async loadVideo(mediaItem: MediaItem, autoPlay: boolean): Promise<void> {
    return new Promise((resolve) => {
      if (!this.persistentVideo) {
        console.error('No persistent video element available')
        return
      }

      // Clear any existing event listeners from persistent video
      this.removeMediaEventListeners()

      // Update the persistent video with new source
      const video = this.persistentVideo
      video.muted = this.isMuted // Respect current mute state
      
      // Set up video event listeners for the new source
      const loadedHandler = () => {
        this.duration = video.duration
        this.currentMedia = video
        this.displayCurrentMedia()
        this.updateTimeDisplay()
        this.updateStatus('Video loaded. Ready to play.')
        video.removeEventListener('loadedmetadata', loadedHandler) // Clean up this specific listener
        resolve()
      }
      
      video.addEventListener('loadedmetadata', loadedHandler)
      
      // Set new source - this will trigger loading
      console.log(`🎬 Switching persistent video to: ${mediaItem.url}`)
      video.src = mediaItem.url
      
      // Auto-play if requested and user has interacted
      if (autoPlay && this.hasUserInteracted) {
        setTimeout(async () => {
          try {
            console.log('Attempting video autoplay with persistent element + master video context')
            await video.play()
            this.isPlaying = true
            this.updatePlayButton()
            this.updateStatus('Auto-playing video...')
            this.syncMasterVideo() // Sync master video
            // Sync music AFTER successful autoplay
            console.log('Syncing music after successful autoplay')
            this.syncMusicPlayback()
          } catch (error) {
            console.warn('Auto-play blocked by browser:', error)
            this.updateStatus('Click play to continue - auto-play blocked by browser')
            // Sync music even when autoplay fails to keep state consistent
            console.log('Syncing music after autoplay failed')
            this.syncMusicPlayback()
          } finally {
            // Re-enable event handling after autoplay attempt completes
            console.log('Re-enabling event handling after autoplay attempt')
            this.isSwitchingMedia = false
          }
        }, 100) // Short delay to ensure video is ready
      }
    })
  }

  private async loadImage(mediaItem: MediaItem, autoPlay: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create new image element
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.style.display = 'none'

      image.addEventListener('load', () => {
        this.duration = mediaItem.duration || 5 // Default 5 seconds
        this.currentTime = 0
        this.currentMedia = image
        this.displayCurrentMedia()
        this.updateTimeDisplay()
        this.updateStatus('Image loaded. Ready to display.')
        
        // Auto-start if requested
        if (autoPlay) {
          this.startImageDisplay()
        }
        
        resolve()
      })

      image.addEventListener('error', (error) => {
        reject(error)
      })

      image.src = mediaItem.url
    })
  }

  private startImageDisplay() {
    this.isPlaying = true
    this.updatePlayButton()
    this.imageStartTime = Date.now()
    this.startImageTimer()
    
    // Ensure background music plays for images
    console.log('Starting image display - syncing music playback')
    this.syncMusicPlayback()
  }

  private startImageTimer() {
    this.clearImageTimer()
    
    const updateTimer = () => {
      if (this.isPlaying && this.currentMedia instanceof HTMLImageElement) {
        const elapsed = (Date.now() - this.imageStartTime) / 1000
        this.currentTime = Math.min(elapsed, this.duration)
        this.updateProgress()
        this.updateTimeDisplay()
        
        // Go to next media when duration is reached
        if (this.currentTime >= this.duration) {
          this.goToNextMedia(true)
        } else {
          this.imageTimer = requestAnimationFrame(updateTimer)
        }
      }
    }
    
    this.imageTimer = requestAnimationFrame(updateTimer)
  }

  private clearImageTimer() {
    if (this.imageTimer) {
      cancelAnimationFrame(this.imageTimer)
      this.imageTimer = null
    }
    // Note: Don't stop blank video here - let controlBlankVideo handle it based on next media type
  }



  private resizeCanvasToMedia() {
    if (!this.currentMedia) return

    let videoWidth: number, videoHeight: number
    
    if (this.currentMedia instanceof HTMLVideoElement) {
      videoWidth = this.currentMedia.videoWidth
      videoHeight = this.currentMedia.videoHeight
    } else if (this.currentMedia instanceof HTMLImageElement) {
      videoWidth = this.currentMedia.naturalWidth
      videoHeight = this.currentMedia.naturalHeight
    } else {
      return
    }
    
    // Calculate the aspect ratio
    const aspectRatio = videoWidth / videoHeight
    
    // Set maximum dimensions
    const maxHeight = 500
    const maxWidth = 800
    
    let canvasWidth = videoWidth
    let canvasHeight = videoHeight
    
    // Scale down if video is too tall
    if (canvasHeight > maxHeight) {
      canvasHeight = maxHeight
      canvasWidth = canvasHeight * aspectRatio
    }
    
    // Scale down if video is too wide
    if (canvasWidth > maxWidth) {
      canvasWidth = maxWidth
      canvasHeight = canvasWidth / aspectRatio
    }
    
    // Update media element dimensions
    this.currentMedia.style.width = `${canvasWidth}px`
    this.currentMedia.style.height = `${canvasHeight}px`
    this.currentMedia.style.display = 'block'
    this.currentMedia.style.borderRadius = '12px'
    
    console.log(`Media dimensions: ${videoWidth}x${videoHeight}, Display: ${canvasWidth}x${canvasHeight}`)
  }

  private displayCurrentMedia() {
    if (!this.currentMedia || !this.videoContainer) return

    // Clear container first
    this.videoContainer.innerHTML = ''
    
    if (this.currentMedia instanceof HTMLVideoElement) {
      // For videos, move the persistent video into the container
      this.videoContainer.appendChild(this.currentMedia)
      this.currentMedia.style.display = 'block'
    } else if (this.currentMedia instanceof HTMLImageElement) {
      // For images, add them normally
      this.videoContainer.appendChild(this.currentMedia)
    }
    
    // Resize and position media
    this.resizeCanvasToMedia()
  }

  private async togglePlay() {
    if (!this.currentMedia) return

    // Start master video on first user interaction
    if (!this.hasUserInteracted) {
      await this.startMasterVideo()
    }

    try {
      if (this.isPlaying) {
        if (this.currentMedia instanceof HTMLVideoElement) {
          this.currentMedia.pause()
        } else if (this.currentMedia instanceof HTMLImageElement) {
          this.isPlaying = false
          this.updatePlayButton()
          this.clearImageTimer()
        }
      } else {
        if (this.currentMedia instanceof HTMLVideoElement) {
          await this.currentMedia.play()
          this.isPlaying = true
          this.updatePlayButton()
        } else if (this.currentMedia instanceof HTMLImageElement) {
          this.startImageDisplay()
        }
      }
      
      // Sync master video and background music with play/pause state
      this.syncMasterVideo()
      this.syncMusicPlayback()
      
    } catch (error) {
      console.error('Error toggling playback:', error)
      this.updateStatus(`Playback error: ${error}`)
    }
  }

  private async toggleMute() {
    // Start master video on first user interaction
    if (!this.hasUserInteracted) {
      await this.startMasterVideo()
    }

    this.isMuted = !this.isMuted
    this.muteButton.textContent = this.isMuted ? '🔇' : '🔊'
    
    // Resume AudioContext if suspended and unmuting (mobile Safari requirement)
    if (!this.isMuted && this.audioContext && this.audioContext.state === 'suspended') {
      console.log('🎵 Resuming Web Audio API context on unmute')
      try {
        await this.audioContext.resume()
      } catch (error) {
        console.warn('Failed to resume audio context:', error)
      }
    }
    
    // Mute/unmute background music
    if (this.backgroundMusic) {
      this.backgroundMusic.muted = this.isMuted
    }
    
    // Mute/unmute current video if it's a video element
    if (this.currentMedia instanceof HTMLVideoElement) {
      this.currentMedia.muted = this.isMuted
    }
    
    console.log(`Audio ${this.isMuted ? 'muted' : 'unmuted'}`)
    this.updateStatus(`Audio ${this.isMuted ? 'muted' : 'unmuted'}`)
  }

  private seek(time?: number) {
    if (!this.currentMedia) return

    if (this.currentMedia instanceof HTMLVideoElement) {
    if (time !== undefined) {
        this.currentMedia.currentTime = time
    } else {
      const seekTime = (parseFloat(this.progressBar.value) / 100) * this.duration
        this.currentMedia.currentTime = seekTime
      }
    } else if (this.currentMedia instanceof HTMLImageElement) {
      // For images, seeking changes the display time
      if (time !== undefined) {
        this.currentTime = Math.min(time, this.duration)
      } else {
        this.currentTime = (parseFloat(this.progressBar.value) / 100) * this.duration
      }
      this.imageStartTime = Date.now() - (this.currentTime * 1000)
      this.updateTimeDisplay()
    }
  }

  private async switchToMedia(index: number, autoPlay: boolean = false) {
    if (index >= 0 && index < demoMediaUrls.length && index !== this.currentIndex) {
      try {
        this.isSwitchingMedia = true // Prevent event interference
        this.updateStatus('Loading media...')

        // Sync master video for upcoming transition
        if (this.hasUserInteracted) {
          this.syncMasterVideo()
        }

        // Stop current media cleanly
        if (this.currentMedia && this.isPlaying) {
          if (this.currentMedia instanceof HTMLVideoElement) {
            this.currentMedia.pause()
          } else if (this.currentMedia instanceof HTMLImageElement) {
            this.clearImageTimer()
          }
          this.isPlaying = false
        }

        // Update index and load new media
        this.currentIndex = index
        await this.loadCurrentMedia(autoPlay)

        this.updatePlaylist()
        this.updatePlayButton()
        this.updateTimeDisplay()
        this.updateStatus('Media switched successfully!')

        // Only clear switching flag if not auto-playing, otherwise let loadVideo clear it
        if (!autoPlay || !this.hasUserInteracted || demoMediaUrls[index].type !== 'video') {
          this.isSwitchingMedia = false // Re-enable event handling
        }

      } catch (error) {
        console.error('Error during media switch:', error)
        this.updateStatus(`Switch error: ${error}`)
        this.isSwitchingMedia = false // Re-enable event handling on error
      }
    }
  }

  private setupMediaEventListeners() {
    if (!this.currentMedia) return

    // Remove any existing event listeners first
    this.removeMediaEventListeners()

    // For persistent video, add a play event listener to sync with master video
    if (this.currentMedia instanceof HTMLVideoElement) {
      const playHandler = () => {
        console.log('Persistent video started playing')
      }
      this.currentMedia.addEventListener('play', playHandler, { once: true })
    }

    // Create new event listeners
    const timeUpdateListener = () => {
      if (this.currentMedia && this.currentMedia instanceof HTMLVideoElement) { // Only for videos
        this.currentTime = this.currentMedia.currentTime
        this.updateProgress()
        this.updateTimeDisplay()
      }
    }

    const endedListener = () => {
      if (this.currentMedia) { // Only trigger if this is still the current media
        console.log('Media ended - going to next media')
        this.goToNextMedia(true)
      }
    }

    const playListener = () => {
      if (this.currentMedia && !this.isSwitchingMedia) {
        console.log('Media play event triggered')
        this.isPlaying = true
        this.updatePlayButton()
        this.syncMusicPlayback()
      } else if (this.isSwitchingMedia) {
        console.log('Media play event during switch - ignoring to prevent interference')
      }
    }

    const pauseListener = () => {
      if (this.currentMedia && !this.isSwitchingMedia) {
        console.log('Media pause event triggered')
        this.isPlaying = false
        this.updatePlayButton()
        this.syncMusicPlayback()
      } else if (this.isSwitchingMedia) {
        console.log('Media pause event during switch - ignoring to prevent interference')
      }
    }

    // Store references for later cleanup
    this.currentMediaEventListeners = {
      timeupdate: timeUpdateListener,
      ended: endedListener,
      play: playListener,
      pause: pauseListener
    }

    // Add event listeners
    this.currentMedia.addEventListener('timeupdate', timeUpdateListener)
    this.currentMedia.addEventListener('ended', endedListener)
    this.currentMedia.addEventListener('play', playListener)
    this.currentMedia.addEventListener('pause', pauseListener)
  }

  private removeMediaEventListeners() {
    if (this.currentMedia && Object.keys(this.currentMediaEventListeners).length > 0) {
      // Remove all stored event listeners
      Object.entries(this.currentMediaEventListeners).forEach(([event, listener]) => {
        this.currentMedia!.removeEventListener(event, listener)
      })
      this.currentMediaEventListeners = {}
    }
  }

  private goToNextMedia(autoPlay: boolean = false) {
    const nextIndex = (this.currentIndex + 1) % demoMediaUrls.length
    this.switchToMedia(nextIndex, autoPlay)
  }

  private goToPreviousMedia(autoPlay: boolean = false) {
    const prevIndex = this.currentIndex === 0 ? demoMediaUrls.length - 1 : this.currentIndex - 1
    this.switchToMedia(prevIndex, autoPlay)
  }

  private updatePlayButton() {
    this.playButton.textContent = this.isPlaying ? '⏸' : '▶'
    const overlay = this.container.querySelector('.play-overlay-btn') as HTMLButtonElement
    overlay.textContent = this.isPlaying ? '⏸' : '▶'
  }

  private updateProgress() {
    if (this.duration > 0) {
      const progress = (this.currentTime / this.duration) * 100
      this.progressBar.value = progress.toString()
    }
  }

  private updateTimeDisplay() {
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    this.timeDisplay.textContent = `${formatTime(this.currentTime)} / ${formatTime(this.duration)}`
  }

  private updatePlaylist() {
    const items = this.playlistElement.querySelectorAll('.playlist-item')
    items.forEach((item, index) => {
      item.classList.toggle('active', index === this.currentIndex)
    })
  }

  private updateStatus(message: string) {
    this.statusDisplay.textContent = message
    console.log('Mediabunny Player:', message)
  }

  private setupBackgroundMusic() {
    this.backgroundMusic = document.createElement('audio')
    this.backgroundMusic.src = 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/embrace-364091.mp3'
    this.backgroundMusic.loop = true
    this.backgroundMusic.volume = 1.0 // Keep at max, control via Web Audio API
    this.backgroundMusic.muted = this.isMuted // Start muted by default
    document.body.appendChild(this.backgroundMusic)
    
    // Set up Web Audio API for mobile-compatible volume control
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      this.musicSource = this.audioContext.createMediaElementSource(this.backgroundMusic)
      this.musicGain = this.audioContext.createGain()
      
      // Connect: source → gain → destination
      this.musicSource.connect(this.musicGain)
      this.musicGain.connect(this.audioContext.destination)
      
      // Set initial volume via gain node
      this.musicGain.gain.value = this.musicVolumes.video
      
      console.log('🎵 Web Audio API setup complete for mobile volume control')
      console.log(`🎵 Initial volume set to ${this.musicGain.gain.value * 100}%`)
      console.log(`🎵 AudioContext state: ${this.audioContext.state}`)
    } catch (error) {
      console.warn('Web Audio API not available, falling back to element volume:', error)
    }
    
    this.backgroundMusic.addEventListener('loadeddata', () => {
      this.updateStatus('Background music loaded')
    })
    
    this.backgroundMusic.addEventListener('error', (e) => {
      console.warn('Background music failed to load:', e)
      this.updateStatus('Background music unavailable')
    })
  }

  private setupMasterVideo() {
    this.masterVideo = document.createElement('video')
    this.masterVideo.src = 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/blank.mp4'
    this.masterVideo.loop = true
    this.masterVideo.muted = true // Must be muted for autoplay
    this.masterVideo.playsInline = true
    this.masterVideo.style.display = 'none'
    this.masterVideo.style.position = 'absolute'
    this.masterVideo.style.width = '1px'
    this.masterVideo.style.height = '1px'
    this.masterVideo.style.opacity = '0'
    this.masterVideo.style.pointerEvents = 'none'
    document.body.appendChild(this.masterVideo)
    
    console.log('🎬 Master video created - will start on first user interaction')
  }

  private setupPersistentVideo() {
    // Create a single video element that we'll reuse for all video content
    this.persistentVideo = document.createElement('video')
    this.persistentVideo.crossOrigin = 'anonymous'
    this.persistentVideo.playsInline = true
    this.persistentVideo.controls = false
    this.persistentVideo.muted = this.isMuted
    this.persistentVideo.style.display = 'none' // Hidden initially
    document.body.appendChild(this.persistentVideo)
    
    console.log('🎬 Persistent video element created for reuse')
  }

  private async startMasterVideo() {
    if (!this.masterVideo || this.hasUserInteracted) return
    
    try {
      console.log('🎬 Starting master video for Safari autoplay context')
      await this.masterVideo.play()
      this.hasUserInteracted = true
      
      // Resume AudioContext if suspended (required on mobile Safari)
      if (this.audioContext && this.audioContext.state === 'suspended') {
        console.log('🎵 Resuming Web Audio API context for mobile compatibility')
        await this.audioContext.resume()
      }
      
      console.log('✅ Master video started successfully - autoplay context established')
    } catch (error) {
      console.warn('❌ Master video failed to start:', error)
    }
  }

  private syncMasterVideo() {
    if (!this.masterVideo || !this.hasUserInteracted) return
    
    if (this.isPlaying) {
      if (this.masterVideo.paused) {
        this.masterVideo.play().catch(e => 
          console.warn('Master video sync play failed:', e)
        )
      }
    } else {
      if (!this.masterVideo.paused) {
        this.masterVideo.pause()
      }
    }
  }



  private adjustMusicVolume(mediaType: 'video' | 'image') {
    if (!this.backgroundMusic) return
    
    const targetVolume = this.musicVolumes[mediaType]
    console.log(`Adjusting music volume to ${targetVolume * 100}% for ${mediaType}`)
    
    // Use Web Audio API gain node if available (mobile-compatible)
    if (this.musicGain && this.audioContext) {
      console.log('🎵 Using Web Audio API gain node for volume control (mobile-compatible)')
      console.log(`🎵 AudioContext state: ${this.audioContext.state}`)
      console.log(`🎵 Current gain: ${this.musicGain.gain.value * 100}% → Target: ${targetVolume * 100}%`)
      
      // Smooth volume transition using Web Audio API
      const currentTime = this.audioContext.currentTime
      const duration = 0.5 // 500ms
      
      // Cancel any existing volume changes
      this.musicGain.gain.cancelScheduledValues(currentTime)
      
      // Smooth transition to target volume
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, currentTime)
      this.musicGain.gain.linearRampToValueAtTime(targetVolume, currentTime + duration)
      
    } else {
      // Fallback to HTMLAudioElement volume (desktop)
      console.log('🎵 Using HTMLAudioElement volume (desktop fallback)')
      
      const startVolume = this.backgroundMusic.volume
      const duration = 500 // 500ms
      const startTime = Date.now()
      
      const animateVolume = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // Ease in-out function
        const easeProgress = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2
        
        this.backgroundMusic!.volume = startVolume + (targetVolume - startVolume) * easeProgress
        
        if (progress < 1) {
          requestAnimationFrame(animateVolume)
        }
      }
      
      animateVolume()
    }
  }

  private syncMusicPlayback() {
    if (!this.backgroundMusic) {
      console.log('No background music element found')
      return
    }
    
    console.log(`Syncing music: isPlaying=${this.isPlaying}, musicPaused=${this.backgroundMusic.paused}`)
    
    if (this.isPlaying) {
      this.backgroundMusic.play().catch(e => 
        console.warn('Background music play failed:', e)
      )
    } else {
      this.backgroundMusic.pause()
    }

    // Also sync master video
    this.syncMasterVideo()
  }
}

// Initialize the app
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="player-container"></div>
`

// Create player instance
const container = document.querySelector('#player-container') as HTMLElement
new MediabunnyPlayer(container)

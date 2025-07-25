import './style.css'

// Demo video URLs for sequential playback
const demoVideoUrls = [
  'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Brian.mp4',
  'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Vaibhav.mp4',
  'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/abbey_bradley (720p).mp4'
]

class MediabunnyPlayer {
  private container!: HTMLElement
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private playButton!: HTMLButtonElement
  private progressBar!: HTMLInputElement
  private timeDisplay!: HTMLDivElement
  private statusDisplay!: HTMLDivElement
  private playlistElement!: HTMLElement
  
  private currentIndex = 0
  private isPlaying = false
  private currentTime = 0
  private duration = 0
  private currentVideo: HTMLVideoElement | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.setupUI()
    this.setupEventListeners()
    this.loadCurrentVideo(false) // Don't auto-play initial video
  }

  private setupUI() {
    this.container.innerHTML = `
      <div class="mediabunny-player">
        <div class="player-header">
          <h1>🎬 Mediabunny Player</h1>
          <p>Sequential video playback demo</p>
        </div>

        <div class="video-container">
          <canvas id="canvas"></canvas>
          <div class="video-overlay">
            <div class="play-overlay">
              <button class="play-overlay-btn">▶</button>
            </div>
          </div>
        </div>

        <div class="controls">
          <button id="playBtn" class="control-btn">▶</button>
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
    this.canvas = this.container.querySelector('#canvas') as HTMLCanvasElement
    this.ctx = this.canvas.getContext('2d')!
    this.playButton = this.container.querySelector('#playBtn') as HTMLButtonElement
    this.progressBar = this.container.querySelector('#progress') as HTMLInputElement
    this.timeDisplay = this.container.querySelector('#timeDisplay') as HTMLDivElement
    this.statusDisplay = this.container.querySelector('#status') as HTMLDivElement
    this.playlistElement = this.container.querySelector('#playlistItems') as HTMLElement

    this.setupPlaylist()
  }

  private setupPlaylist() {
    this.playlistElement.innerHTML = demoVideoUrls.map((url, index) => {
      const filename = url.split('/').pop() || `Video ${index + 1}`
      return `
        <div class="playlist-item ${index === this.currentIndex ? 'active' : ''}" data-index="${index}">
          <span class="playlist-number">${index + 1}</span>
          <span class="playlist-title">${filename.replace('.mp4', '')}</span>
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

    // Progress bar
    this.progressBar.addEventListener('input', () => this.seek())

    // Playlist items
    this.playlistElement.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.playlist-item') as HTMLElement
      if (item) {
        const index = parseInt(item.dataset.index!)
        this.switchToVideo(index)
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
          this.previousVideo()
          break
        case 'ArrowDown':
          e.preventDefault()
          this.nextVideo()
          break
      }
    })

    // Window resize handler
    window.addEventListener('resize', () => {
      this.resizeCanvasToVideo()
    })
  }

  private async loadCurrentVideo(autoPlay: boolean = false) {
    try {
      this.updateStatus('Loading video...')
      
      // Clean up previous video
      if (this.currentVideo) {
        this.currentVideo.remove()
        this.currentVideo = null
      }

      // Create new video element
      this.currentVideo = document.createElement('video')
      this.currentVideo.style.display = 'none'
      this.currentVideo.crossOrigin = 'anonymous'
      this.currentVideo.playsInline = true
      document.body.appendChild(this.currentVideo)

      // Set up video event listeners
      this.currentVideo.addEventListener('loadedmetadata', () => {
        this.duration = this.currentVideo!.duration
        this.resizeCanvasToVideo()
        this.updateTimeDisplay()
        this.updateStatus('Video loaded. Ready to play.')
      })

      this.currentVideo.addEventListener('timeupdate', () => {
        this.currentTime = this.currentVideo!.currentTime
        this.updateProgress()
        this.updateTimeDisplay()
      })

      this.currentVideo.addEventListener('ended', () => {
        this.nextVideo(true) // Auto-play next video
      })

      this.currentVideo.addEventListener('play', () => {
        this.isPlaying = true
        this.updatePlayButton()
        this.startVideoRender()
      })

      this.currentVideo.addEventListener('pause', () => {
        this.isPlaying = false
        this.updatePlayButton()
      })

      // Load the video
      this.currentVideo.src = demoVideoUrls[this.currentIndex]
      this.updatePlaylist()
      
      // Auto-play if requested
      if (autoPlay) {
        // Small delay to ensure video is ready
        setTimeout(async () => {
          try {
            await this.currentVideo!.play()
            this.updateStatus('Auto-playing next video...')
          } catch (error) {
            console.warn('Auto-play blocked by browser:', error)
            this.updateStatus('Click play to continue - auto-play blocked by browser')
          }
        }, 100)
      }
      
    } catch (error) {
      console.error('Error loading video:', error)
      this.updateStatus(`Error loading video: ${error}`)
    }
  }

  private resizeCanvasToVideo() {
    if (!this.currentVideo) return

    const videoWidth = this.currentVideo.videoWidth
    const videoHeight = this.currentVideo.videoHeight
    
    // Calculate the aspect ratio
    const aspectRatio = videoWidth / videoHeight
    
    // Set maximum dimensions
    const maxHeight = 700
    const maxWidth = 1000
    
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
    
    // Update canvas dimensions
    this.canvas.width = canvasWidth
    this.canvas.height = canvasHeight
    this.canvas.style.width = `${canvasWidth}px`
    this.canvas.style.height = `${canvasHeight}px`
    
    console.log(`Video dimensions: ${videoWidth}x${videoHeight}, Canvas: ${canvasWidth}x${canvasHeight}`)
  }

  private startVideoRender() {
    const renderFrame = () => {
      if (this.currentVideo && this.isPlaying) {
        // Draw video frame to canvas
        this.ctx.drawImage(this.currentVideo, 0, 0, this.canvas.width, this.canvas.height)
        requestAnimationFrame(renderFrame)
      }
    }
    renderFrame()
  }

  private async togglePlay() {
    if (!this.currentVideo) return

    try {
      if (this.isPlaying) {
        this.currentVideo.pause()
      } else {
        await this.currentVideo.play()
      }
    } catch (error) {
      console.error('Error toggling playback:', error)
      this.updateStatus(`Playback error: ${error}`)
    }
  }

  private seek(time?: number) {
    if (!this.currentVideo) return

    if (time !== undefined) {
      this.currentVideo.currentTime = time
    } else {
      const seekTime = (parseFloat(this.progressBar.value) / 100) * this.duration
      this.currentVideo.currentTime = seekTime
    }
  }

  private switchToVideo(index: number, autoPlay: boolean = false) {
    if (index >= 0 && index < demoVideoUrls.length && index !== this.currentIndex) {
      const wasPlaying = this.isPlaying
      this.currentIndex = index
      this.loadCurrentVideo(autoPlay || wasPlaying)
    }
  }

  private nextVideo(autoPlay: boolean = false) {
    const nextIndex = (this.currentIndex + 1) % demoVideoUrls.length
    this.switchToVideo(nextIndex, autoPlay)
  }

  private previousVideo(autoPlay: boolean = false) {
    const prevIndex = this.currentIndex === 0 ? demoVideoUrls.length - 1 : this.currentIndex - 1
    this.switchToVideo(prevIndex, autoPlay)
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
}

// Initialize the app
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="player-container"></div>
`

// Create player instance
const container = document.querySelector('#player-container') as HTMLElement
new MediabunnyPlayer(container)

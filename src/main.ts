import './style.css'

// Video URLs - the 3 videos to play sequentially
const videoUrls = [
  'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Brian.mp4',
  'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Vaibhav.mp4',
  'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/abbey_bradley (720p).mp4'
]

class SequentialVideoPlayer {
  private currentVideoIndex = 0
  private videoElement: HTMLVideoElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private isPlaying = false
  private playButton: HTMLButtonElement
  private nextButton: HTMLButtonElement
  private prevButton: HTMLButtonElement
  private progressElement: HTMLDivElement

  constructor() {
    this.setupUI()
    this.videoElement = document.getElementById('video') as HTMLVideoElement
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement
    this.ctx = this.canvas.getContext('2d')!
    this.playButton = document.getElementById('playBtn') as HTMLButtonElement
    this.nextButton = document.getElementById('nextBtn') as HTMLButtonElement
    this.prevButton = document.getElementById('prevBtn') as HTMLButtonElement
    this.progressElement = document.getElementById('progress') as HTMLDivElement
    
    this.setupEventListeners()
    this.updateUI()
  }

  private setupUI() {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="player-container">
        <h1>Mediabunny Sequential Video Player</h1>
        
        <div class="video-container">
          <canvas id="canvas" width="640" height="360"></canvas>
          <video id="video" style="display: none;" crossorigin="anonymous"></video>
        </div>
        
        <div class="controls">
          <button id="playBtn" class="control-btn">▶️ Play</button>
          <button id="prevBtn" class="control-btn">⏮️ Previous</button>
          <button id="nextBtn" class="control-btn">⏭️ Next</button>
        </div>
        
        <div class="info">
          <div id="progress">Video 1 of 3</div>
          <div id="status">Ready to play</div>
        </div>
        
        <div class="video-list">
          <h3>Playlist:</h3>
          <ol>
            <li class="active">Brian.mp4</li>
            <li>Vaibhav.mp4</li>
            <li>abbey_bradley (720p).mp4</li>
          </ol>
        </div>
      </div>
    `
  }

  private setupEventListeners() {
    this.playButton.addEventListener('click', () => this.togglePlay())
    this.nextButton.addEventListener('click', () => this.nextVideo())
    this.prevButton.addEventListener('click', () => this.previousVideo())
  }

  private async loadCurrentVideo() {
    try {
      const currentUrl = videoUrls[this.currentVideoIndex]
      this.updateStatus(`Loading ${this.getVideoName(currentUrl)}...`)
      
      // Set up video element with the URL directly
      this.videoElement.src = currentUrl
      
      // Set up video event listeners
      this.videoElement.onloadedmetadata = () => {
        // Calculate dimensions to maintain aspect ratio within our 640x360 canvas
        const videoAspect = this.videoElement.videoWidth / this.videoElement.videoHeight
        const canvasAspect = 640 / 360
        
        if (videoAspect > canvasAspect) {
          // Video is wider - fit to width
          this.canvas.width = 640
          this.canvas.height = Math.round(640 / videoAspect)
        } else {
          // Video is taller - fit to height
          this.canvas.height = 360
          this.canvas.width = Math.round(360 * videoAspect)
        }
        
        this.updateStatus(`Loaded ${this.getVideoName(currentUrl)}`)
      }
      
      this.videoElement.onended = () => {
        this.onVideoEnded()
      }
      
      this.videoElement.ontimeupdate = () => {
        this.drawVideoToCanvas()
      }
      
      this.videoElement.onerror = (e) => {
        console.error('Video error:', e)
        this.updateStatus(`Error loading video: ${currentUrl}`)
      }
      
      this.updateUI()
      
    } catch (error) {
      console.error('Error loading video:', error)
      this.updateStatus(`Error loading video: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private drawVideoToCanvas() {
    if (this.videoElement.readyState >= 2) {
      this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height)
    }
  }

  private async togglePlay() {
    if (this.isPlaying) {
      this.pause()
    } else {
      await this.play()
    }
  }

  private async play() {
    if (!this.videoElement.src) {
      await this.loadCurrentVideo()
    }
    
    try {
      await this.videoElement.play()
      this.isPlaying = true
      this.playButton.textContent = '⏸️ Pause'
      this.updateStatus('Playing...')
      
      // Start drawing frames to canvas
      this.drawLoop()
    } catch (error) {
      console.error('Error playing video:', error)
      this.updateStatus(`Error playing video: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private pause() {
    this.videoElement.pause()
    this.isPlaying = false
    this.playButton.textContent = '▶️ Play'
    this.updateStatus('Paused')
  }

  private drawLoop() {
    if (this.isPlaying && !this.videoElement.paused && !this.videoElement.ended) {
      this.drawVideoToCanvas()
      requestAnimationFrame(() => this.drawLoop())
    }
  }

  private async nextVideo() {
    if (this.currentVideoIndex < videoUrls.length - 1) {
      this.currentVideoIndex++
      await this.switchVideo()
    }
  }

  private async previousVideo() {
    if (this.currentVideoIndex > 0) {
      this.currentVideoIndex--
      await this.switchVideo()
    }
  }

  private async switchVideo() {
    const wasPlaying = this.isPlaying
    this.pause()
    this.videoElement.src = ''
    
    await this.loadCurrentVideo()
    this.updateUI()
    
    if (wasPlaying) {
      await this.play()
    }
  }

  private onVideoEnded() {
    this.updateStatus('Video ended')
    
    // Auto-advance to next video
    if (this.currentVideoIndex < videoUrls.length - 1) {
      setTimeout(async () => {
        await this.nextVideo()
        if (this.isPlaying) {
          await this.play()
        }
      }, 1000) // 1 second delay before next video
    } else {
      // All videos finished
      this.isPlaying = false
      this.playButton.textContent = '▶️ Play'
      this.updateStatus('All videos completed!')
    }
  }

  private updateUI() {
    this.progressElement.textContent = `Video ${this.currentVideoIndex + 1} of ${videoUrls.length}`
    
    // Update playlist highlighting
    const listItems = document.querySelectorAll('.video-list li')
    listItems.forEach((item, index) => {
      if (index === this.currentVideoIndex) {
        item.classList.add('active')
      } else {
        item.classList.remove('active')
      }
    })
    
    // Update button states
    this.prevButton.disabled = this.currentVideoIndex === 0
    this.nextButton.disabled = this.currentVideoIndex === videoUrls.length - 1
  }

  private updateStatus(message: string) {
    const statusElement = document.getElementById('status')
    if (statusElement) {
      statusElement.textContent = message
    }
  }

  private getVideoName(url: string): string {
    return url.split('/').pop() || 'Unknown'
  }

  // Public method to start the player
  async initialize() {
    await this.loadCurrentVideo()
    this.updateStatus('Ready to play')
  }
}

// Initialize the player when the page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const player = new SequentialVideoPlayer()
    await player.initialize()
  } catch (error) {
    console.error('Failed to initialize player:', error)
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div class="error">
        <h1>Error</h1>
        <p>Failed to initialize the video player: ${error instanceof Error ? error.message : 'Unknown error'}</p>
        <p>Please check the console for more details.</p>
      </div>
    `
  }
})

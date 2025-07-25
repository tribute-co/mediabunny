import './style.css'

// SimpleZoom transition shader from gl-transitions
const simpleZoomShader = `
// Simple zoom transition
// Creates a zoom-in effect on the from texture while transitioning to the to texture

vec4 transition (vec2 uv) {
  vec2 center = vec2(0.5, 0.5);
  
  // Calculate zoom factor - starts at 1.0, zooms to zoom parameter value
  float zoomFactor = 1.0 + (zoom - 1.0) * progress;
  
  // Calculate UV coordinates for zoomed from texture
  vec2 zoomedUV = center + (uv - center) / zoomFactor;
  
  // Sample colors
  vec4 fromColor = getFromColor(zoomedUV);
  vec4 toColor = getToColor(uv);
  
  // Mix based on progress, with a slight bias towards the zoom effect
  float mixFactor = smoothstep(0.0, 1.0, progress);
  
  return mix(fromColor, toColor, mixFactor);
}
`

// Demo video URLs for sequential playback
const demoVideoUrls = [
  'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Brian.mp4',
  'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Vaibhav.mp4',
  'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/abbey_bradley (720p).mp4'
]

class GLTransitionRenderer {
  private gl: WebGLRenderingContext
  private program!: WebGLProgram
  private positionBuffer!: WebGLBuffer
  private fromTexture!: WebGLTexture
  private toTexture!: WebGLTexture
  private locations: any = {}
  
  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl')
    if (!gl) {
      throw new Error('WebGL not supported')
    }
    this.gl = gl
    this.setupShaders()
    this.setupGeometry()
    this.setupTextures()
  }

  private setupShaders() {
    const gl = this.gl

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `

    // Fragment shader with SimpleZoom transition
    const fragmentShaderSource = `
      precision mediump float;
      uniform sampler2D from, to;
      uniform float progress;
      uniform float ratio;
      uniform float zoom; // SimpleZoom parameter
      
      varying vec2 v_uv;
      
      vec4 getFromColor(vec2 uv) {
        return texture2D(from, uv);
      }
      
      vec4 getToColor(vec2 uv) {
        return texture2D(to, uv);
      }
      
             // SimpleZoom transition shader
       ${simpleZoomShader}
      
      void main() {
        gl_FragColor = transition(v_uv);
      }
    `

    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource)
    
    this.program = this.createProgram(vertexShader, fragmentShader)
    
    // Get uniform and attribute locations
    this.locations = {
      position: gl.getAttribLocation(this.program, 'a_position'),
      from: gl.getUniformLocation(this.program, 'from'),
      to: gl.getUniformLocation(this.program, 'to'),
      progress: gl.getUniformLocation(this.program, 'progress'),
      ratio: gl.getUniformLocation(this.program, 'ratio'),
      zoom: gl.getUniformLocation(this.program, 'zoom')
    }
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`Shader compilation error: ${error}`)
    }
    
    return shader
  }

  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const gl = this.gl
    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`Program linking error: ${error}`)
    }
    
    return program
  }

  private setupGeometry() {
    const gl = this.gl
    
    // Create a quad (two triangles)
    const positions = new Float32Array([
      -1, -1,  // bottom left
       1, -1,  // bottom right
      -1,  1,  // top left
       1,  1,  // top right
    ])
    
    this.positionBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
  }

  private setupTextures() {
    const gl = this.gl
    
    this.fromTexture = gl.createTexture()!
    this.toTexture = gl.createTexture()!
    
    // Setup texture parameters for both textures
    const textures = [this.fromTexture, this.toTexture]
    textures.forEach((texture: WebGLTexture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    })
  }

  updateFromTexture(video: HTMLVideoElement) {
    const gl = this.gl
    // Check if video is ready to be used as texture (readyState >= 2 = HAVE_CURRENT_DATA)
    if (video.readyState >= 2 && video.videoWidth > 0) {
      gl.bindTexture(gl.TEXTURE_2D, this.fromTexture)
      // Flip Y coordinate to fix upside-down video
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    }
  }

  updateToTexture(video: HTMLVideoElement) {
    const gl = this.gl
    // Check if video is ready to be used as texture (readyState >= 2 = HAVE_CURRENT_DATA)
    if (video.readyState >= 2 && video.videoWidth > 0) {
      gl.bindTexture(gl.TEXTURE_2D, this.toTexture)
      // Flip Y coordinate to fix upside-down video
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    }
  }

  render(progress: number, canvasWidth: number, canvasHeight: number, zoom: number = 0.9) {
    const gl = this.gl
    
    // Set viewport
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    
    // Clear canvas
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    
    // Use our shader program
    gl.useProgram(this.program)
    
    // Bind position buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.enableVertexAttribArray(this.locations.position)
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0)
    
    // Set uniforms
    gl.uniform1f(this.locations.progress, progress)
    gl.uniform1f(this.locations.ratio, canvasWidth / canvasHeight)
    gl.uniform1f(this.locations.zoom, zoom)
    
    // Bind textures
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fromTexture)
    gl.uniform1i(this.locations.from, 0)
    
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.toTexture)
    gl.uniform1i(this.locations.to, 1)
    
    // Draw quad
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

class MediabunnyPlayer {
  private container!: HTMLElement
  private canvas!: HTMLCanvasElement
  private glRenderer!: GLTransitionRenderer
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
  private nextVideo: HTMLVideoElement | null = null
  private isTransitioning = false
  private transitionProgress = 0
  private animationId: number | null = null
  private currentVideoEventListeners: { [key: string]: EventListener } = {}

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
          <p>Sequential video playback with GL Transitions (SimpleZoom)</p>
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
    this.playButton = this.container.querySelector('#playBtn') as HTMLButtonElement
    this.progressBar = this.container.querySelector('#progress') as HTMLInputElement
    this.timeDisplay = this.container.querySelector('#timeDisplay') as HTMLDivElement
    this.statusDisplay = this.container.querySelector('#status') as HTMLDivElement
    this.playlistElement = this.container.querySelector('#playlistItems') as HTMLElement

    // Initialize WebGL renderer
    try {
      this.glRenderer = new GLTransitionRenderer(this.canvas)
      this.updateStatus('WebGL renderer initialized')
    } catch (error) {
      this.updateStatus(`WebGL error: ${error}`)
      console.error('WebGL initialization failed:', error)
    }

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
        if (index !== this.currentIndex) { // Only switch if different video
          console.log(`Switching to video ${index + 1}`)
          // Always auto-play when clicking playlist items for better UX
          this.switchToVideo(index, true)
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
          this.goToPreviousVideo()
          break
        case 'ArrowDown':
          e.preventDefault()
          this.goToNextVideo()
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
        // Remove event listeners before removing the video
        this.removeVideoEventListeners()
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
        this.goToNextVideo(true) // Auto-play next video
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

  private async loadNextVideo(index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Clean up previous next video
        if (this.nextVideo) {
          this.nextVideo.remove()
        }

        // Create next video element
        this.nextVideo = document.createElement('video')
        this.nextVideo.style.display = 'none'
        this.nextVideo.crossOrigin = 'anonymous'
        this.nextVideo.playsInline = true
        document.body.appendChild(this.nextVideo)

        this.nextVideo.addEventListener('loadedmetadata', () => {
          resolve()
        })

        this.nextVideo.addEventListener('error', (error) => {
          reject(error)
        })

        this.nextVideo.src = demoVideoUrls[index]
      } catch (error) {
        reject(error)
      }
    })
  }

  private resizeCanvasToVideo() {
    if (!this.currentVideo) return

    const videoWidth = this.currentVideo.videoWidth
    const videoHeight = this.currentVideo.videoHeight
    
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
    
    // Update canvas dimensions
    this.canvas.width = canvasWidth
    this.canvas.height = canvasHeight
    this.canvas.style.width = `${canvasWidth}px`
    this.canvas.style.height = `${canvasHeight}px`
    
    console.log(`Video dimensions: ${videoWidth}x${videoHeight}, Canvas: ${canvasWidth}x${canvasHeight}`)
  }

  private startVideoRender() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
    }

    const renderFrame = () => {
      if (this.isTransitioning && this.currentVideo && this.nextVideo && this.glRenderer) {
        // Update textures for transition
        this.glRenderer.updateFromTexture(this.currentVideo)
        this.glRenderer.updateToTexture(this.nextVideo)
        
        // Render transition
        this.glRenderer.render(
          this.transitionProgress,
          this.canvas.width,
          this.canvas.height
        )
      } else if (this.currentVideo && this.glRenderer) {
        // Regular playback - just show current video
        // We need to render it as the "from" texture with progress = 0
        try {
          this.glRenderer.updateFromTexture(this.currentVideo)
          // For non-transition rendering, we still need a "to" texture
          // Use the same video for both textures with progress = 0
          this.glRenderer.updateToTexture(this.currentVideo)
          this.glRenderer.render(0, this.canvas.width, this.canvas.height)
        } catch (error) {
          console.warn('WebGL render error:', error)
        }
      }

      // Continue the render loop if playing or transitioning
      // Also continue for a few frames after to ensure proper rendering
      if (this.isPlaying || this.isTransitioning) {
        this.animationId = requestAnimationFrame(renderFrame)
      } else if (this.currentVideo) {
        // Render one more frame when paused to ensure the video is visible
        this.animationId = requestAnimationFrame(() => {
          this.renderSingleFrame()
        })
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
        // Ensure rendering starts when we play
        this.ensureRendering()
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

  private async switchToVideo(index: number, autoPlay: boolean = false) {
    if (index >= 0 && index < demoVideoUrls.length && index !== this.currentIndex && !this.isTransitioning) {
      try {
        this.isTransitioning = true
        const wasPlaying = this.isPlaying

        // First, stop current playback cleanly
        if (this.currentVideo && this.isPlaying) {
          this.currentVideo.pause()
          this.isPlaying = false
          this.updatePlayButton()
        }

        this.updateStatus('Loading next video for transition...')

        // Load the next video
        await this.loadNextVideo(index)

        // Start playing the next video if we should auto-play
        const shouldPlay = autoPlay || wasPlaying
        if (shouldPlay && this.nextVideo) {
          await this.nextVideo.play()
        }

        // Perform GL transition
        await this.performGLTransition()

        // Swap videos: next becomes current
        if (this.currentVideo) {
          this.currentVideo.pause()
          // Clean up event listeners from the old video
          this.removeVideoEventListeners()
          this.currentVideo.remove()
        }

        this.currentVideo = this.nextVideo
        this.nextVideo = null
        this.currentIndex = index

        // Update states
        this.duration = this.currentVideo!.duration
        this.currentTime = this.currentVideo!.currentTime
        this.isPlaying = shouldPlay

        // Set up event listeners for the new current video
        this.setupVideoEventListeners()

        this.updatePlaylist()
        this.updatePlayButton()
        this.updateTimeDisplay()
        this.updateStatus('GL Transition complete!')

        this.isTransitioning = false

        // Make sure rendering continues if we should be playing
        if (this.isPlaying) {
          this.startVideoRender()
        } else {
          // Even if paused, we need to render one frame to show the video
          this.renderSingleFrame()
        }

      } catch (error) {
        console.error('Error during video transition:', error)
        this.updateStatus(`Transition error: ${error}`)
        this.isTransitioning = false
        // Try to recover by ensuring we have a render frame
        this.renderSingleFrame()
      }
    }
  }

  private setupVideoEventListeners() {
    if (!this.currentVideo) return

    // Remove any existing event listeners first
    this.removeVideoEventListeners()

    // Create new event listeners
    const timeUpdateListener = () => {
      if (this.currentVideo) { // Safety check to ensure this is still the current video
        this.currentTime = this.currentVideo.currentTime
        this.updateProgress()
        this.updateTimeDisplay()
      }
    }

    const endedListener = () => {
      if (this.currentVideo && !this.isTransitioning) { // Only trigger if this is still the current video
        this.goToNextVideo(true)
      }
    }

    const playListener = () => {
      if (this.currentVideo) { // Safety check
        this.isPlaying = true
        this.updatePlayButton()
        this.startVideoRender()
      }
    }

    const pauseListener = () => {
      if (this.currentVideo) { // Safety check
        this.isPlaying = false
        this.updatePlayButton()
      }
    }

    // Store references for later cleanup
    this.currentVideoEventListeners = {
      timeupdate: timeUpdateListener,
      ended: endedListener,
      play: playListener,
      pause: pauseListener
    }

    // Add event listeners
    this.currentVideo.addEventListener('timeupdate', timeUpdateListener)
    this.currentVideo.addEventListener('ended', endedListener)
    this.currentVideo.addEventListener('play', playListener)
    this.currentVideo.addEventListener('pause', pauseListener)
  }

  private removeVideoEventListeners() {
    if (this.currentVideo && Object.keys(this.currentVideoEventListeners).length > 0) {
      // Remove all stored event listeners
      Object.entries(this.currentVideoEventListeners).forEach(([event, listener]) => {
        this.currentVideo!.removeEventListener(event, listener)
      })
      this.currentVideoEventListeners = {}
    }
  }

  private async performGLTransition(): Promise<void> {
    return new Promise((resolve) => {
      this.transitionProgress = 0
      const duration = 1500 // 1.5 seconds
      const startTime = Date.now()

      this.startVideoRender() // Start rendering during transition

      const animateTransition = () => {
        const elapsed = Date.now() - startTime
        this.transitionProgress = Math.min(elapsed / duration, 1)

        if (this.transitionProgress < 1) {
          requestAnimationFrame(animateTransition)
        } else {
          this.transitionProgress = 0
          resolve()
        }
      }

      animateTransition()
    })
  }

  private goToNextVideo(autoPlay: boolean = false) {
    const nextIndex = (this.currentIndex + 1) % demoVideoUrls.length
    this.switchToVideo(nextIndex, autoPlay)
  }

  private goToPreviousVideo(autoPlay: boolean = false) {
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

  private renderSingleFrame() {
    if (this.currentVideo && this.glRenderer) {
      try {
        this.glRenderer.updateFromTexture(this.currentVideo)
        this.glRenderer.updateToTexture(this.currentVideo)
        this.glRenderer.render(0, this.canvas.width, this.canvas.height)
      } catch (error) {
        console.warn('Single frame render error:', error)
      }
    }
  }

  private ensureRendering() {
    // Force restart rendering if it's not running
    if (!this.animationId && this.currentVideo) {
      console.log('Restarting video rendering...')
      if (this.isPlaying) {
        this.startVideoRender()
      } else {
        this.renderSingleFrame()
      }
    }
  }
}

// Initialize the app
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="player-container"></div>
`

// Create player instance
const container = document.querySelector('#player-container') as HTMLElement
new MediabunnyPlayer(container)

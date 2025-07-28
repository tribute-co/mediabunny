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

// Demo media URLs for sequential playback (videos and images)
const demoMediaUrls: MediaItem[] = [
  { url: 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Brian.mp4', type: 'video' },
  { url: 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/pexels-noelace-32608050.jpg', type: 'image', duration: 5 },
  { url: 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/Vaibhav.mp4', type: 'video' },
  { url: 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/abbey_bradley (720p).mp4', type: 'video' }
]

// Blank video to maintain Safari autoplay context during images
const blankVideoUrl = 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/blank.mp4'

type MediaItem = {
  url: string
  type: 'video' | 'image'
  duration?: number // For images, in seconds
}

type MediaElement = HTMLVideoElement | HTMLImageElement

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

  updateFromTexture(element: HTMLVideoElement | HTMLImageElement) {
    const gl = this.gl
    
    // Check if element is ready to be used as texture
    let isReady = false
    if (element instanceof HTMLVideoElement) {
      isReady = element.readyState >= 2 && element.videoWidth > 0
    } else if (element instanceof HTMLImageElement) {
      isReady = element.complete && element.naturalWidth > 0
    }
    
    if (isReady) {
      gl.bindTexture(gl.TEXTURE_2D, this.fromTexture)
      // Flip Y coordinate to fix upside-down video
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element)
    }
  }

  updateToTexture(element: HTMLVideoElement | HTMLImageElement) {
    const gl = this.gl
    
    // Check if element is ready to be used as texture
    let isReady = false
    if (element instanceof HTMLVideoElement) {
      isReady = element.readyState >= 2 && element.videoWidth > 0
    } else if (element instanceof HTMLImageElement) {
      isReady = element.complete && element.naturalWidth > 0
    }
    
    if (isReady) {
      gl.bindTexture(gl.TEXTURE_2D, this.toTexture)
      // Flip Y coordinate to fix upside-down video
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element)
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
  private currentMedia: MediaElement | null = null
  private nextMedia: MediaElement | null = null
  private isTransitioning = false
  private transitionProgress = 0
  private animationId: number | null = null
  private currentVideoEventListeners: { [key: string]: EventListener } = {}
  private imageTimer: number | null = null
  private imageStartTime: number = 0
  private transitionDuration = 250 // 250ms transition
  private transitionLeadTime = 250 // Start transition 250ms before end
  private hasTriggeredEarlyTransition = false // Flag to prevent multiple early transitions
  private enableEarlyTransitions = false // Temporarily disable early transitions for debugging
  private backgroundMusic: HTMLAudioElement | null = null
  private musicVolumes = { video: 0.1, image: 0.9 } // 10% for videos, 90% for images
  private blankVideo: HTMLVideoElement | null = null // Blank video for Safari autoplay context

  constructor(container: HTMLElement) {
    this.container = container
    this.setupUI()
    this.setupEventListeners()
    this.setupBackgroundMusic()
    this.setupBlankVideo()
    this.loadCurrentMedia(false) // Don't auto-play initial media
  }

  private setupUI() {
    this.container.innerHTML = `
      <div class="mediabunny-player">
        <div class="player-header">
          <h1>🎬 Mediabunny Player</h1>
          <p>Sequential media playback with GL Transitions + adaptive music (Safari compatible)</p>
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
        // Remove event listeners before removing the media
        this.removeMediaEventListeners()
        this.clearImageTimer()
        this.currentMedia.remove()
        this.currentMedia = null
      }

      const mediaItem = demoMediaUrls[this.currentIndex]
      
      if (mediaItem.type === 'video') {
        await this.loadVideo(mediaItem, autoPlay)
      } else if (mediaItem.type === 'image') {
        await this.loadImage(mediaItem, autoPlay)
      }
      
      // Reset early transition flag for new media
      this.hasTriggeredEarlyTransition = false
      
      // Set up event listeners for the loaded media
      this.setupMediaEventListeners()
      
      // Adjust music volume based on media type
      this.adjustMusicVolume(mediaItem.type)
      
      // Control blank video based on media type
      this.controlBlankVideo(mediaItem.type)
      
      // Start background music if auto-playing
      if (autoPlay) {
        this.syncMusicPlayback()
      }
      
      this.updatePlaylist()
      
    } catch (error) {
      console.error('Error loading media:', error)
      this.updateStatus(`Error loading media: ${error}`)
    }
  }

  private async loadVideo(mediaItem: MediaItem, autoPlay: boolean): Promise<void> {
    return new Promise((resolve) => {
      // Create new video element
      const video = document.createElement('video')
      video.style.display = 'none'
      video.crossOrigin = 'anonymous'
      video.playsInline = true
      document.body.appendChild(video)

      // Set up video event listeners
      video.addEventListener('loadedmetadata', () => {
        this.duration = video.duration
        this.resizeCanvasToMedia()
        this.updateTimeDisplay()
        this.updateStatus('Video loaded. Ready to play.')
        resolve()
      })

      // Note: timeupdate, ended, play, pause listeners are set up in setupMediaEventListeners()

      this.currentMedia = video
      video.src = mediaItem.url
      
      // Auto-play if requested
      if (autoPlay) {
        setTimeout(async () => {
          try {
            await video.play()
            this.updateStatus('Auto-playing video...')
          } catch (error) {
            console.warn('Auto-play blocked by browser:', error)
            this.updateStatus('Click play to continue - auto-play blocked by browser')
          }
        }, 100)
      }
    })
  }

  private async loadImage(mediaItem: MediaItem, autoPlay: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create new image element
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.style.display = 'none'
      document.body.appendChild(image)

      image.addEventListener('load', () => {
        this.duration = mediaItem.duration || 5 // Default 5 seconds
        this.currentTime = 0
        this.resizeCanvasToMedia()
        this.updateTimeDisplay()
        this.updateStatus('Image loaded. Ready to display.')
        
        this.currentMedia = image
        
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
    this.startVideoRender() // Start rendering the image
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
        
        // Only check for early transitions if we're in normal playback mode and have enough duration
        if (!this.isTransitioning && this.duration > 1 && this.enableEarlyTransitions) {
          // Check if we're approaching the end and should start transition
          const timeRemaining = this.duration - this.currentTime
          const shouldStartTransition = timeRemaining <= (this.transitionLeadTime / 1000) && timeRemaining > 0
          
          if (shouldStartTransition && !this.hasTriggeredEarlyTransition) {
            console.log(`Starting early image transition with ${timeRemaining.toFixed(2)}s remaining`)
            this.hasTriggeredEarlyTransition = true
            this.startEarlyTransition()
          } else if (this.currentTime >= this.duration) {
            // Fallback: if we somehow miss the early transition, go to next
            if (!this.isTransitioning) {
              this.goToNextMedia(true)
            }
          } else {
            this.imageTimer = requestAnimationFrame(updateTimer)
          }
        } else if (this.currentTime >= this.duration) {
          // Simple fallback for short images or when transitions are disabled
          if (!this.isTransitioning) {
            this.goToNextMedia(true)
          }
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
    
    // Stop blank video when not displaying images
    if (this.blankVideo) {
      console.log('Stopping blank video - no longer displaying image')
      this.blankVideo.pause()
    }
  }

  private controlBlankVideo(mediaType: 'video' | 'image') {
    if (!this.blankVideo) return
    
    if (mediaType === 'image' && this.isPlaying) {
      console.log('Starting blank video for image display')
      this.blankVideo.play().catch(e => 
        console.warn('Blank video play failed:', e)
      )
    } else {
      console.log('Pausing blank video for video display')
      this.blankVideo.pause()
    }
  }

  private async loadNextMedia(index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Clean up previous next media
        if (this.nextMedia) {
          this.nextMedia.remove()
        }

        // Create next media element
        const mediaItem = demoMediaUrls[index]
        let nextMedia: MediaElement
        
        if (mediaItem.type === 'video') {
          const video = document.createElement('video')
          video.style.display = 'none'
          video.crossOrigin = 'anonymous'
          video.playsInline = true
          document.body.appendChild(video)
          
          video.addEventListener('loadedmetadata', () => {
            resolve()
          })
          
          video.addEventListener('error', (error) => {
            reject(error)
          })
          
          video.src = mediaItem.url
          nextMedia = video
        } else if (mediaItem.type === 'image') {
          const image = new Image()
          image.style.display = 'none'
          image.crossOrigin = 'anonymous'
          document.body.appendChild(image)
          
          image.addEventListener('load', () => {
            resolve()
          })
          
          image.addEventListener('error', (error) => {
            reject(error)
          })
          
          image.src = mediaItem.url
          nextMedia = image
        } else {
          reject(new Error('Unknown media type'))
          return
        }

        this.nextMedia = nextMedia
      } catch (error) {
        reject(error)
      }
    })
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
        if (this.isTransitioning && this.currentMedia && this.nextMedia && this.glRenderer) {
          // Update textures for transition
          this.glRenderer.updateFromTexture(this.currentMedia)
          this.glRenderer.updateToTexture(this.nextMedia)
          
          // Render transition
          this.glRenderer.render(
            this.transitionProgress,
            this.canvas.width,
            this.canvas.height
          )
        } else if (this.currentMedia && this.glRenderer) {
          // Regular playback - just show current media
          // We need to render it as the "from" texture with progress = 0
          try {
            this.glRenderer.updateFromTexture(this.currentMedia)
            // For non-transition rendering, we still need a "to" texture
            // Use the same media for both textures with progress = 0
            this.glRenderer.updateToTexture(this.currentMedia)
            this.glRenderer.render(0, this.canvas.width, this.canvas.height)
          } catch (error) {
            console.warn('WebGL render error:', error)
          }
        }

      // Continue the render loop if playing or transitioning
      // Also continue for a few frames after to ensure proper rendering
      if (this.isPlaying || this.isTransitioning) {
        this.animationId = requestAnimationFrame(renderFrame)
      } else if (this.currentMedia) {
        // Render one more frame when paused to ensure the video is visible
        this.animationId = requestAnimationFrame(() => {
          this.renderSingleFrame()
        })
      }
    }
    renderFrame()
  }

  private async togglePlay() {
    if (!this.currentMedia) return

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
        } else if (this.currentMedia instanceof HTMLImageElement) {
          this.startImageDisplay()
        }
        // Ensure rendering starts when we play
        this.ensureRendering()
      }
      
      // Control blank video based on current media type and play state
      if (this.currentMedia instanceof HTMLImageElement) {
        this.controlBlankVideo('image')
      } else {
        this.controlBlankVideo('video')
      }
      
      // Sync background music with play/pause state
      this.syncMusicPlayback()
      
    } catch (error) {
      console.error('Error toggling playback:', error)
      this.updateStatus(`Playback error: ${error}`)
    }
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
    if (index >= 0 && index < demoMediaUrls.length && index !== this.currentIndex && !this.isTransitioning) {
      try {
        this.isTransitioning = true
      const wasPlaying = this.isPlaying

        // First, stop current playback cleanly
        if (this.currentMedia && this.isPlaying) {
          if (this.currentMedia instanceof HTMLVideoElement) {
            this.currentMedia.pause()
          } else if (this.currentMedia instanceof HTMLImageElement) {
            this.clearImageTimer()
          }
          this.isPlaying = false
          this.updatePlayButton()
        }

        this.updateStatus('Loading next media for transition...')

        // Load the next media
        await this.loadNextMedia(index)

        // Start playing the next media if we should auto-play
        const shouldPlay = autoPlay || wasPlaying
        if (shouldPlay && this.nextMedia) {
          if (this.nextMedia instanceof HTMLVideoElement) {
            await this.nextMedia.play()
          }
          // Note: Image auto-play will be handled after media swap
        }

        // Perform GL transition
        await this.performGLTransition()

        // Swap media: next becomes current
        if (this.currentMedia) {
          if (this.currentMedia instanceof HTMLVideoElement) {
            this.currentMedia.pause()
          } else if (this.currentMedia instanceof HTMLImageElement) {
            this.clearImageTimer()
          }
          // Clean up event listeners from the old media
          this.removeMediaEventListeners()
          this.currentMedia.remove()
        }

        this.currentMedia = this.nextMedia
        this.nextMedia = null
      this.currentIndex = index

        // Update states
        if (this.currentMedia instanceof HTMLVideoElement) {
          this.duration = this.currentMedia.duration
          this.currentTime = this.currentMedia.currentTime
          // Adjust music volume for video
          this.adjustMusicVolume('video')
          // Control blank video for Safari autoplay context
          this.controlBlankVideo('video')
        } else if (this.currentMedia instanceof HTMLImageElement) {
          const mediaItem = demoMediaUrls[this.currentIndex]
          this.duration = mediaItem.duration || 5
          this.currentTime = 0
          // Adjust music volume for image
          this.adjustMusicVolume('image')
          // Control blank video for Safari autoplay context
          this.controlBlankVideo('image')
        }
        this.isPlaying = shouldPlay
        
        // Reset early transition flag for new media
        this.hasTriggeredEarlyTransition = false

        // Set up event listeners for the new current media
        this.setupMediaEventListeners()

        this.updatePlaylist()
        this.updatePlayButton()
        this.updateTimeDisplay()
        this.updateStatus('GL Transition complete!')

        this.isTransitioning = false

        // Make sure rendering continues if we should be playing
        if (this.isPlaying) {
          if (this.currentMedia instanceof HTMLImageElement) {
            // For images, start display if not already started
            if (!this.imageTimer) {
              console.log('Starting image display after transition')
              this.startImageDisplay()
            } else {
              console.log('Image display already running')
              this.syncMusicPlayback()
            }
          } else {
            this.startVideoRender()
            this.syncMusicPlayback()
          }
        } else {
          // Even if paused, we need to render one frame to show the media
          this.renderSingleFrame()
          this.syncMusicPlayback()
        }

      } catch (error) {
        console.error('Error during media transition:', error)
        this.updateStatus(`Transition error: ${error}`)
        this.isTransitioning = false
        // Try to recover by ensuring we have a render frame
        this.renderSingleFrame()
      }
    }
  }

  private setupMediaEventListeners() {
    if (!this.currentMedia) return

    // Remove any existing event listeners first
    this.removeMediaEventListeners()

    // Create new event listeners
    const timeUpdateListener = () => {
      if (this.currentMedia && this.currentMedia instanceof HTMLVideoElement) { // Only for videos
        this.currentTime = this.currentMedia.currentTime
        this.updateProgress()
        this.updateTimeDisplay()
        
        // Only check for early transitions if we're in normal playback mode (not already transitioning)
        if (!this.isTransitioning && this.duration > 1 && this.enableEarlyTransitions) { // Only for videos longer than 1 second
          // Check if we're approaching the end and should start transition
          const timeRemaining = this.duration - this.currentTime
          const shouldStartTransition = timeRemaining <= (this.transitionLeadTime / 1000) && timeRemaining > 0
          
          if (shouldStartTransition && !this.hasTriggeredEarlyTransition) {
            console.log(`Starting early transition with ${timeRemaining.toFixed(2)}s remaining`)
            this.hasTriggeredEarlyTransition = true
            this.startEarlyTransition()
          }
        }
      }
    }

    const endedListener = () => {
      if (this.currentMedia && !this.isTransitioning) { // Only trigger if this is still the current media and no transition in progress
        console.log('Video ended - fallback transition (early transition may have been missed)')
        this.goToNextMedia(true)
      }
    }

    const playListener = () => {
      if (this.currentMedia && !this.isTransitioning) { // Don't sync music during transitions
        console.log('Media play event triggered')
        this.isPlaying = true
        this.updatePlayButton()
        this.startVideoRender()
        // Sync background music only if not transitioning
        this.syncMusicPlayback()
        // Force ensure rendering as backup
        setTimeout(() => this.ensureRendering(), 100)
      } else if (this.isTransitioning) {
        console.log('Media play event during transition - ignoring for music sync')
      }
    }

    const pauseListener = () => {
      if (this.currentMedia && !this.isTransitioning) { // Don't sync music during transitions
        console.log('Media pause event triggered')
        this.isPlaying = false
        this.updatePlayButton()
        // Sync background music only if not transitioning
        this.syncMusicPlayback()
      } else if (this.isTransitioning) {
        console.log('Media pause event during transition - ignoring for music sync')
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
    this.currentMedia.addEventListener('timeupdate', timeUpdateListener)
    this.currentMedia.addEventListener('ended', endedListener)
    this.currentMedia.addEventListener('play', playListener)
    this.currentMedia.addEventListener('pause', pauseListener)
  }

  private removeMediaEventListeners() {
    if (this.currentMedia && Object.keys(this.currentVideoEventListeners).length > 0) {
      // Remove all stored event listeners
      Object.entries(this.currentVideoEventListeners).forEach(([event, listener]) => {
        this.currentMedia!.removeEventListener(event, listener)
      })
      this.currentVideoEventListeners = {}
    }
  }

  private async performGLTransition(): Promise<void> {
    return new Promise((resolve) => {
      this.transitionProgress = 0
      const startTime = Date.now()

      this.startVideoRender() // Start rendering during transition

      const animateTransition = () => {
        const elapsed = Date.now() - startTime
        this.transitionProgress = Math.min(elapsed / this.transitionDuration, 1)

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

  private async startEarlyTransition() {
    if (this.isTransitioning) return
    
    const nextIndex = (this.currentIndex + 1) % demoMediaUrls.length
    console.log(`Early transition: ${this.currentIndex} → ${nextIndex}`)
    
    // Start the transition with auto-play
    this.switchToMedia(nextIndex, true)
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

  private renderSingleFrame() {
    if (this.currentMedia && this.glRenderer) {
      try {
        this.glRenderer.updateFromTexture(this.currentMedia)
        this.glRenderer.updateToTexture(this.currentMedia)
        this.glRenderer.render(0, this.canvas.width, this.canvas.height)
      } catch (error) {
        console.warn('Single frame render error:', error)
      }
    }
  }

  private ensureRendering() {
    // Force restart rendering if it's not running
    if (!this.animationId && this.currentMedia) {
      console.log('Restarting video rendering...')
      if (this.isPlaying) {
        this.startVideoRender()
      } else {
        this.renderSingleFrame()
      }
    }
  }

  private setupBackgroundMusic() {
    this.backgroundMusic = document.createElement('audio')
    this.backgroundMusic.src = 'https://pub-bc00aeb1aeab4b7480c2d94365bb62a9.r2.dev/embrace-364091.mp3'
    this.backgroundMusic.loop = true
    this.backgroundMusic.volume = this.musicVolumes.video // Start with video volume
    document.body.appendChild(this.backgroundMusic)
    
    this.backgroundMusic.addEventListener('loadeddata', () => {
      this.updateStatus('Background music loaded')
    })
    
    this.backgroundMusic.addEventListener('error', (e) => {
      console.warn('Background music failed to load:', e)
      this.updateStatus('Background music unavailable')
    })
  }

  private setupBlankVideo() {
    this.blankVideo = document.createElement('video')
    this.blankVideo.src = blankVideoUrl
    this.blankVideo.loop = true
    this.blankVideo.muted = true // Must be muted for autoplay
    this.blankVideo.playsInline = true
    this.blankVideo.style.display = 'none' // Hidden
    this.blankVideo.style.position = 'absolute'
    this.blankVideo.style.width = '1px'
    this.blankVideo.style.height = '1px'
    this.blankVideo.style.opacity = '0'
    document.body.appendChild(this.blankVideo)
    
    this.blankVideo.addEventListener('loadeddata', () => {
      console.log('Blank video loaded for Safari autoplay context')
    })
    
    this.blankVideo.addEventListener('error', (e) => {
      console.warn('Blank video failed to load:', e)
    })
  }

  private adjustMusicVolume(mediaType: 'video' | 'image') {
    if (!this.backgroundMusic) return
    
    const targetVolume = this.musicVolumes[mediaType]
    console.log(`Adjusting music volume to ${targetVolume * 100}% for ${mediaType}`)
    
    // Smooth volume transition using native animation
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
  }
}

// Initialize the app
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="player-container"></div>
`

// Create player instance
const container = document.querySelector('#player-container') as HTMLElement
new MediabunnyPlayer(container)

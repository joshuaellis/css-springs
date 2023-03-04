export interface Spring {
  toEasingFunction: () => [
    easingFunction: (t: number) => number,
    duration: number
  ]
  toKeyframes: (key: string) => [frames: string, duration: number]
}

export interface SpringConfig {
  /**
   * @default 1
   */
  mass: number
  /**
   * @default 170
   */
  tension: number
  /**
   * @default 26
   */
  friction: number
  /**
   * @default 0.001
   */
  precision: number
}

const INFINITE_LOOP_LIMIT = 100_000

const SpringCache = new Map<string, SpringValue>()
const FrameCache = new Map<
  string,
  {
    duration: number
    frames: number[]
  }
>()

class SpringValue {
  lastPosition!: number
  lastVelocity?: number | null
  v0?: number | null
  done = false

  from: number
  to: number
  config: SpringConfig

  constructor(from: number, to: number, config: SpringConfig) {
    this.lastPosition = from
    this.from = from
    this.to = to
    this.config = config
  }

  advance = (dt: number) => {
    const to = this.to
    const config = this.config

    let finished = this.done
    let position = to

    if (!finished) {
      position = this.lastPosition

      // Loose springs never move.
      if (config.tension <= 0) {
        this.done = true
        return position
      }

      const from = this.from

      const v0 = this.v0 != null ? this.v0 : 0

      let velocity: number

      /** The smallest distance from a value before being treated like said value. */
      const precision =
        config.precision ||
        (from == to ? 0.005 : Math.min(1, Math.abs(to - from) * 0.001))

      // Spring easing
      velocity = this.lastVelocity == null ? v0 : this.lastVelocity

      /** The velocity at which movement is essentially none */
      const restVelocity = precision / 10

      /** When `true`, the velocity is considered moving */
      let isMoving!: boolean

      const step = 1 // 1ms
      const numSteps = Math.ceil(dt / step)

      for (let n = 0; n < numSteps; ++n) {
        isMoving = Math.abs(velocity) > restVelocity

        if (!isMoving) {
          finished = Math.abs(to - position) <= precision
          if (finished) {
            break
          }
        }

        const springForce = -config.tension * 0.000001 * (position - to)
        const dampingForce = -config.friction * 0.001 * velocity
        const acceleration = (springForce + dampingForce) / config.mass // pt/ms^2

        velocity = velocity + acceleration * step // pt/ms
        position = position + velocity * step
      }

      this.lastVelocity = velocity
      this.lastPosition = position

      if (Number.isNaN(position)) {
        console.warn(`Got NaN while animating:`, this)
        finished = true
      }
    }

    if (finished) {
      this.done = true
    }

    return position
  }

  getFrames = (cacheKey: string) => {
    if (FrameCache.has(cacheKey)) {
      return FrameCache.get(cacheKey)!
    }

    const frames: number[] = []

    const frame = 1 / 6
    let elapsed = 0
    let count = 0

    // Add a loop limit, to avoid situations with infinite loops
    while (++count < INFINITE_LOOP_LIMIT) {
      elapsed += frame
      if (!this.done) {
        const position = this.advance(elapsed)
        frames.push(position)
      }
    }

    const duration = elapsed * frame * 1000

    FrameCache.set(cacheKey, { duration, frames })

    return { duration, frames }
  }
}

export const spring = (
  from: number,
  to: number,
  config?: SpringConfig
): Spring => {
  const actualConfig = assignConfigDefaults(config ?? {})
  const cacheKey = `${from}-${to}-${Object.values(actualConfig)}`

  let value: SpringValue

  if (SpringCache.has(cacheKey)) {
    value = SpringCache.get(cacheKey)!
  } else {
    value = new SpringValue(from, to, actualConfig)
    SpringCache.set(cacheKey, value)
  }

  const { duration, frames } = value.getFrames(cacheKey)

  return {
    toEasingFunction: () => [(t: number) => value.advance(t), duration],
    toKeyframes: (key: string) => ['', duration],
  }
}

const defaults: any = {
  tension: 170,
  friction: 26,
  mass: 1,
  precision: 0.001,
}

export function assignConfigDefaults(
  config: Partial<SpringConfig>
): SpringConfig
export function assignConfigDefaults(config: any) {
  for (const key in defaults) {
    if (config[key] == null) {
      config[key] = defaults[key]
    }
  }

  return config
}

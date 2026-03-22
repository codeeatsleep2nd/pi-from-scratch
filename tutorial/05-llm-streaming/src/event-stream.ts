/**
 * Step 05 — EventStream
 *
 * A push-based async iterable that also exposes a .result() promise.
 * Producers call .push(event) to emit events.
 * Consumers use `for await (const event of stream)` or `await stream.result()`.
 */

type Resolver<T> = {
	resolve: (value: IteratorResult<T>) => void
	reject: (err: unknown) => void
}

export class EventStream<T, R> implements AsyncIterable<T> {
	private queue: T[] = []
	private waiters: Resolver<T>[] = []
	private done = false
	private error: Error | null = null
	private resultResolve!: (value: R) => void
	private resultReject!: (err: unknown) => void
	private resultPromise: Promise<R>

	constructor(
		private readonly isDone: (event: T) => boolean,
		private readonly getResult: (event: T) => R,
	) {
		this.resultPromise = new Promise((resolve, reject) => {
			this.resultResolve = resolve
			this.resultReject = reject
		})
	}

	/**
	 * Push a new event into the stream.
	 * If the event is a terminal event (isDone returns true), the stream closes.
	 */
	push(event: T): void {
		if (this.done) throw new Error("Cannot push to a closed stream")

		if (this.isDone(event)) {
			this.done = true
			this.resultResolve(this.getResult(event))

			// Deliver to a waiting consumer, or queue it
			const waiter = this.waiters.shift()
			if (waiter) {
				waiter.resolve({ value: event, done: false })
				// Drain remaining waiters with done
				for (const w of this.waiters) {
					w.resolve({ value: undefined as any, done: true })
				}
				this.waiters = []
			} else {
				this.queue.push(event)
			}
			return
		}

		const waiter = this.waiters.shift()
		if (waiter) {
			waiter.resolve({ value: event, done: false })
		} else {
			this.queue.push(event)
		}
	}

	/**
	 * Signal an error — the stream closes and result() rejects.
	 */
	fail(error: Error): void {
		if (this.done) return
		this.done = true
		this.error = error
		this.resultReject(error)

		// Wake up any waiting consumers with the error
		for (const waiter of this.waiters) {
			waiter.reject(error)
		}
		this.waiters = []
	}

	/**
	 * Get the final result (resolves when stream ends, rejects on error).
	 */
	result(): Promise<R> {
		return this.resultPromise
	}

	[Symbol.asyncIterator](): AsyncIterator<T> {
		return {
			next: () => {
				// Deliver a queued event immediately
				if (this.queue.length > 0) {
					const event = this.queue.shift()!
					if (this.isDone(event)) {
						return Promise.resolve({ value: event, done: false }).then(async (v) => {
							return v
						})
					}
					return Promise.resolve({ value: event, done: false })
				}

				// If already done and queue empty, end iteration
				if (this.done) {
					return Promise.resolve({ value: undefined as any, done: true })
				}

				// If there was an error, reject
				if (this.error) {
					return Promise.reject(this.error)
				}

				// Wait for the next push
				return new Promise<IteratorResult<T>>((resolve, reject) => {
					this.waiters.push({ resolve, reject })
				})
			},
		}
	}
}

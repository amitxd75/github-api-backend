/**
 * High-Performance LRU Cache
 * 
 * A specialized cache implementation combining a Doubly-Linked List and a Map 
 * to achieve O(1) time complexity for GET, SET, and DELETE operations.
 * 
 * Key Features:
 * - TTL Support: Time-to-live based entry eviction.
 * - Capacity Management: Automatic least-recently-used eviction on overflow.
 * - Performance Metrics: Integrated tracking for hit-rate, misses, and evictions.
 * - Type Safety: Fully generic implementation supporting any data type.
 */

interface Node<T> {
	key: string;
	value: T;
	lastUpdated: number;
	hits: number;
	prev: Node<T> | null;
	next: Node<T> | null;
}

export interface CacheStats {
	size: number;
	capacity: number;
	hits: number;
	misses: number;
	evictions: number;
	keys: string[];
}

export class LRUCache<T = unknown> {
	private map = new Map<string, Node<T>>();
	private head: Node<T> | null = null; // most recently used
	private tail: Node<T> | null = null; // least recently used
	private hits = 0;
	private misses = 0;
	private evictions = 0;

	/**
	 * Creates a new LRUCache instance.
	 * 
	 * @param capacity - Maximum number of items the cache can hold
	 * @param ttlMs - Time-to-live for cache entries in milliseconds
	 */
	constructor(
		private readonly capacity: number,
		private readonly ttlMs: number
	) { }

	/**
	 * Retrieves an item from the cache and moves it to the front (MRU).
	 * Also performs a TTL check before returning.
	 * 
	 * @param key - The cache key to look up
	 * @returns The cached value or null if not found/expired
	 */
	get(key: string): T | null {
		const node = this.map.get(key);
		if (!node) { this.misses++; return null; }

		// TTL check
		if (Date.now() - node.lastUpdated > this.ttlMs) {
			this.delete(key);
			this.misses++;
			return null;
		}

		node.hits++;
		this.hits++;
		this.moveToFront(node);
		return node.value;
	}

	/**
	 * Returns the raw node data for metadata (cacheAge etc.) without counting a hit/miss.
	 * 
	 * @param key - The cache key to look up
	 * @returns Metadata object or null if not found/expired
	 */
	peek(key: string): { value: T; lastUpdated: number; hits: number } | null {
		const node = this.map.get(key);
		if (!node) return null;
		if (Date.now() - node.lastUpdated > this.ttlMs) { this.delete(key); return null; }
		return { value: node.value, lastUpdated: node.lastUpdated, hits: node.hits };
	}

	/**
	 * Sets or updates a value in the cache. 
	 * Moves the item to the front and handles eviction if capacity is reached.
	 * 
	 * @param key - The cache key
	 * @param value - The value to store
	 */
	set(key: string, value: T): void {
		if (this.map.has(key)) {
			const node = this.map.get(key);
			if (node) {
				node.value = value;
				node.lastUpdated = Date.now();
				this.moveToFront(node);
			}
			return;
		}

		const node: Node<T> = { key, value, lastUpdated: Date.now(), hits: 0, prev: null, next: this.head };
		this.map.set(key, node);
		if (this.head) this.head.prev = node;
		this.head = node;
		if (!this.tail) this.tail = node;

		if (this.map.size > this.capacity) {
			this.evictLRU();
		}
	}

	/**
	 * Manually removes an entry from the cache.
	 * 
	 * @param key - The key to delete
	 * @returns True if the item was found and removed
	 */
	delete(key: string): boolean {
		const node = this.map.get(key);
		if (!node) return false;
		this.removeNode(node);
		this.map.delete(key);
		return true;
	}

	/**
	 * Clears all entries from the cache.
	 * 
	 * @returns The number of items that were cleared
	 */
	clear(): number {
		const size = this.map.size;
		this.map.clear();
		this.head = null;
		this.tail = null;
		return size;
	}

	/**
	 * Generates performance metrics for the cache.
	 * 
	 * @returns CacheStats object containing size, hits, misses, etc.
	 */
	stats(): CacheStats {
		return {
			size: this.map.size,
			capacity: this.capacity,
			hits: this.hits,
			misses: this.misses,
			evictions: this.evictions,
			keys: Array.from(this.map.keys()),
		};
	}

	/** 
	 * Purge all expired entries proactively.
	 * This is typically called periodically via a background timer.
	 * 
	 * @returns The number of entries that were evicted
	 */
	evictExpired(): number {
		const now = Date.now();
		let count = 0;
		for (const [key, node] of this.map) {
			if (now - node.lastUpdated > this.ttlMs) {
				this.removeNode(node);
				this.map.delete(key);
				count++;
			}
		}
		return count;
	}

	/**
	 * Internal helper to evict the least recently used item (tail of the list).
	 */
	private evictLRU(): void {
		if (!this.tail) return;
		this.map.delete(this.tail.key);
		this.removeNode(this.tail);
		this.evictions++;
	}

	/**
	 * Internal helper to move a node to the front of the doubly-linked list.
	 */
	private moveToFront(node: Node<T>): void {
		if (node === this.head) return;
		this.removeNode(node);
		node.prev = null;
		node.next = this.head;
		if (this.head) this.head.prev = node;
		this.head = node;
		if (!this.tail) this.tail = node;
	}

	/**
	 * Internal helper to remove a node from its current position in the list.
	 */
	private removeNode(node: Node<T>): void {
		if (node.prev) node.prev.next = node.next;
		else this.head = node.next;
		if (node.next) node.next.prev = node.prev;
		else this.tail = node.prev;
		node.prev = null;
		node.next = null;
	}
}
